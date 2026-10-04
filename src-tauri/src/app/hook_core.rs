//! 全局快捷键的**平台中立核心**：诊断状态、规则表、键码查表、序列匹配、命中后动作。
//!
//! # 分层
//!
//! | 层 | 模块 | 职责 |
//! |---|---|---|
//! | 平台层 | `keyboard_hook.rs`(macOS CGEventTap) / `keyboard_hook_windows.rs`(Windows WH_KEYBOARD_LL) / `keyboard_hook_unsupported.rs`(Linux，无实现) | 把原生按键事件转成 `RawInput` 转发进核心；回答「装好了吗」 |
//! | 核心层 | 本模块（**全平台编译**） | 规则表、键位查表、序列匹配、命中后弹窗与剪贴板读取 |
//!
//! 平台层**不做任何匹配判断**：原生回调里只读整数字段 + `send`。这是 macOS 血泪
//! 教训换来的 —— tap 回调跑在进程主线程上，碰 TIS/AppKit API 会
//! `dispatch_assert_queue` → `ud2` → SIGILL 崩溃（详见 `keyboard_hook.rs` 文件头的
//! 三代演进记录）。
//!
//! 两个平台的原生事件形态差异被压缩成同一个 `RawInput`：
//! - macOS：`FlagsChanged` 携带**当前全部**修饰键状态（`CGEventFlags` 的 `NX_*` 位）；
//! - Windows：`WH_KEYBOARD_LL` 的 `KBDLLHOOKSTRUCT` **没有**修饰键状态字段，
//!   只能由平台层自己按 VK 维护按位集合。
//!
//! 统一成 `Modifiers(u8)` 的**整体覆盖**语义（而不是增量），两侧就能共用同一套
//! 匹配代码 —— 见 `RawInput::Modifiers` 的注释。

use std::collections::{HashMap, HashSet};
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant};

use keycode::{KeyMap, KeyMapping, KeyMappingCode, KeyMappingId};
use serde::Serialize;
use tauri::{Emitter, LogicalPosition, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::app::config::ShortcutConfig;
use crate::app::keyboard_hook as platform;

/// 连击序列的两次按键最大间隔
pub const SEQ_WINDOW: Duration = Duration::from_millis(500);

/// 圆角补偿：卡片 rounded-xl=12px，圆弧使可见角尖相对理想直角内退 cut = r − r/√2 ≈ 3.51px
pub const CUT_INSET: f64 = 12.0 * (1.0 - std::f64::consts::FRAC_1_SQRT_2);

// ==================== 修饰键位掩码 ====================

/// 规则要求的修饰键位掩码。左右侧修饰键（⌘ 与 ⌘）合并到同一位：右侧 ⌘ 同样能触发
/// 「⌘+C+C」，用户在设置里也没法区分左右。
pub const MOD_CTRL: u8 = 1 << 0;
pub const MOD_META: u8 = 1 << 1;
pub const MOD_SHIFT: u8 = 1 << 2;
pub const MOD_ALT: u8 = 1 << 3;

/// 按键身份 → 它占据的修饰键位；普通键为 0。
///
/// 用 `KeyMappingId`（而不是 `KeyMap::modifier`）判定，理由是 `KeyModifiers` 是
/// 「8 个具体修饰键」组成的 bitflag 集合，位序由代码生成顺序决定、不可枚举；而
/// `KeyMappingId` 是有名字的枚举，判据可读且不随 crate 版本漂移。
///
/// CapsLock / Fn 不算：它们虽然也会改变系统修饰键状态，但与 `MOD_*` 无关，仍按普通键
/// 处理（用户若显式配置了它们就应当生效）。
pub fn modifier_bit(id: KeyMappingId) -> u8 {
    match id {
        KeyMappingId::ControlLeft | KeyMappingId::ControlRight => MOD_CTRL,
        KeyMappingId::ShiftLeft | KeyMappingId::ShiftRight => MOD_SHIFT,
        KeyMappingId::AltLeft | KeyMappingId::AltRight => MOD_ALT,
        KeyMappingId::MetaLeft | KeyMappingId::MetaRight => MOD_META,
        _ => 0,
    }
}

// ==================== 规则与状态 ====================

/// 单条快捷键规则。`match_index` / `last_press` 是运行期匹配状态，仅由消费线程修改。
pub struct Rule {
    required_modifiers: u8,
    key_sequence: Vec<KeyMappingId>,
    match_index: usize,
    last_press: Instant,
}

/// managed state：tag（`TRANSLATE` / `SHOW_MAIN`）→ 规则。设置变更时整体替换。
pub struct HookRules(pub Arc<RwLock<HashMap<String, Rule>>>);

/// managed state：诊断快照数据源。
pub struct HookStatus(pub Arc<HookStatusInner>);

pub struct HookStatusInner {
    /// 原生监听当前是否就绪（macOS = tap 挂在主线程 run loop 上；
    /// Windows = `WH_KEYBOARD_LL` 钩子装在专用线程的消息循环里）
    pub listening: AtomicBool,
    /// macOS「输入监控」授权是否已授予（未授权时系统不投递按键，快捷键必然无反应）。
    /// Windows 无对应门禁，恒为 true。
    pub listen_event: AtomicBool,
    /// 累计收到的按键按下事件数（判断监听是否真的在投递事件）
    pub key_events: AtomicU64,
}

/// managed state：保证监听只启动一次。
pub struct HookStarted(pub AtomicBool);

/// 传给前端的状态快照
#[derive(Serialize, Clone, Copy)]
pub struct HookStatusSnapshot {
    /// 本平台是否实现了全局监听。非实现平台（当前仅 Linux）恒为 false。
    ///
    /// 必须单独一个字段而不能靠 `listening` 推断：无实现的平台同样上报
    /// `listening=false`，但那代表「本平台不支持」而不是「用户没授权」——
    /// 前端拿它去弹「输入监控未授权」横幅会在 Linux 上无意义地报错。
    pub supported: bool,
    /// 原生监听是否已就绪
    pub listening: bool,
    /// 是否已获得「输入监控」授权（macOS 独有门禁；Windows 恒 true）
    pub listen_event: bool,
    /// 已接收的按键事件数
    pub key_events: u64,
}

/// 本平台是否实现了全局监听：macOS 走 CGEventTap，Windows 走 WH_KEYBOARD_LL。
/// Wayland 根本禁止全局按键捕获，Linux 无实现（见 `keyboard_hook_unsupported.rs`）。
pub const HOOK_SUPPORTED: bool = cfg!(any(target_os = "macos", windows));

/// 平台层 → 核心的原始输入。只带够匹配用的最小信息，原生回调里不做任何解析。
#[derive(Debug)]
pub enum RawInput {
    /// 普通键按下。载荷是**平台原生键码**（macOS 虚拟键码 / Windows VK）。
    KeyDown(u32),
    /// 普通键抬起。载荷同上。
    KeyUp(u32),
    /// 当前按住的修饰键位掩码（**整体覆盖**，不是增量）。
    ///
    /// 整体覆盖而非增量，是因为 macOS 的 `FlagsChanged` 携带的就是「当前全部修饰键
    /// 状态」，Windows 则由平台层按 VK 维护集合后再整体读出；统一成覆盖语义后两侧
    /// 共用同一套匹配代码，也不会出现「漏掉一次抬起导致位一直挂着」。
    ///
    /// 修饰键**自己**不再作为序列的一步（否则按一下 ⌘ 就被当成序列推进了一次）。
    Modifiers(u8),
}

// ==================== 对外接口 ====================

/// 读取当前诊断状态（供 UI 展示「为什么没反应」）
pub fn hook_status(app: &tauri::AppHandle) -> HookStatusSnapshot {
    let Some(status) = app.try_state::<HookStatus>() else {
        return HookStatusSnapshot {
            supported: HOOK_SUPPORTED,
            listening: false,
            listen_event: false,
            key_events: 0,
        };
    };
    let inner = &status.0;
    HookStatusSnapshot {
        supported: HOOK_SUPPORTED,
        listening: inner.listening.load(Ordering::Relaxed),
        listen_event: inner.listen_event.load(Ordering::Relaxed),
        key_events: inner.key_events.load(Ordering::Relaxed),
    }
}

/// 启动监听（幂等）。**必须在主线程调用**（Tauri `setup` 阶段即在主线程）：
/// macOS 的事件 tap 只能挂在主线程 run loop 上。
pub fn start_hook(app: &tauri::AppHandle, key_of: KeyLookup) {
    let config = app.state::<Mutex<ShortcutConfig>>().lock().unwrap().clone();
    let rules = build_rules(&config);
    let count = rules.len();
    *app.state::<HookRules>().0.write().unwrap() = rules;
    ensure_listener(app, key_of);
    eprintln!("[hook] 全局监听已启动，规则 {count} 条");
}

/// 设置变更后热更新规则：**不重建原生监听**（快捷键表整体替换即可）
pub fn reload_rules(app: &tauri::AppHandle, key_of: KeyLookup) {
    let config = app.state::<Mutex<ShortcutConfig>>().lock().unwrap().clone();
    let rules = build_rules(&config);
    let count = rules.len();
    ensure_listener(app, key_of);
    if let Some(state) = app.try_state::<HookRules>() {
        *state.0.write().unwrap() = rules;
    }
    eprintln!("[hook] 规则已热更新：{count} 条");
}

/// 保证监听链路已就位（重复调用无副作用）。
///
/// channel 由**核心持有**：平台层只拿到 `Sender`，负责把原生事件转发进来，
/// 看不到规则表也做不了匹配 —— 这样「回调里不做任何判断」这条约束由类型系统兜住。
///
/// `install_raw_sink` 返回 `false` 表示本平台无原生监听实现（Linux）：此时不启动消费
/// 线程，且 `supported=false`，前端据此显示「本平台暂不支持」而不是「未授权」。
pub fn ensure_listener(app: &tauri::AppHandle, key_of: KeyLookup) {
    if app.state::<HookStarted>().0.swap(true, Ordering::SeqCst) {
        return;
    }

    let (tx, rx) = mpsc::channel::<RawInput>();
    if !platform::install_raw_sink(app, tx) {
        eprintln!("[hook] 当前平台尚无全局监听实现（已实现：macOS / Windows），跳过");
        return;
    }

    let rules = app.state::<HookRules>().0.clone();
    let status = app.state::<HookStatus>().0.clone();
    let consumer_app = app.clone();
    thread::spawn(move || consumer_loop(rules, status, rx, consumer_app, key_of));
}

// ==================== 键码查表 ====================

/// 原生键码 → 按键身份
#[derive(Clone, Copy)]
pub struct KeyEntry {
    pub id: KeyMappingId,
    /// 该键是修饰键时对应的 `MOD_*` 位；普通键为 0
    pub modifier_bit: u8,
}

/// 平台层提供的「原生键码 → 按键身份」查表函数。
///
/// 用裸 `fn` 指针（而非闭包）是因为两个平台的查表都是「`OnceLock` 里一张整表」，
/// 无需捕获环境；`consumer_loop` 也因此能在 `thread::spawn` 里长期持有。
pub type KeyLookup = fn(u32) -> Option<KeyEntry>;

/// `KeyMap` → `KeyEntry`
pub fn entry_of(map: KeyMap) -> KeyEntry {
    KeyEntry {
        id: map.id,
        modifier_bit: modifier_bit(map.id),
    }
}

/// 建一张「原生键码 → 按键身份」整表（`0..len`）。
///
/// 键码数据由 `keycode` crate 编译期从 Chromium 的 `keycode_converter_data.inc` 生成，
/// **我们不硬编码任何平台的虚拟键码**：macOS 传 `KeyMapping::Mac(code)`、
/// Windows 传 `KeyMapping::Win(vk)`，两侧因此天然对齐到同一个 `KeyMappingId`。
pub fn build_key_table(
    len: usize,
    mapping: impl Fn(u32) -> KeyMapping,
) -> Vec<Option<KeyEntry>> {
    (0..len as u32)
        .map(|code| KeyMap::from_key_mapping(mapping(code)).ok().map(entry_of))
        .collect()
}

/// 具名键（大写）→ W3 `KeyboardEvent.code` 名称。
///
/// 前端录制器用的是 DOM `event.key`（`ArrowUp`、`PageUp`…），`extract_keys_from_shortcut`
/// 会 `to_uppercase()`，所以这里按大写匹配，并额外兼容 `UP` / `DOWN` 这类旧写法。
const KEY_NAME_TO_CODE: &[(&str, &str)] = &[
    ("SPACE", "Space"),
    ("ENTER", "Enter"),
    ("RETURN", "Enter"),
    ("ESCAPE", "Escape"),
    ("TAB", "Tab"),
    ("BACKSPACE", "Backspace"),
    ("DELETE", "Delete"),
    ("CAPSLOCK", "CapsLock"),
    ("ARROWUP", "ArrowUp"),
    ("ARROWDOWN", "ArrowDown"),
    ("ARROWLEFT", "ArrowLeft"),
    ("ARROWRIGHT", "ArrowRight"),
    ("UP", "ArrowUp"),
    ("DOWN", "ArrowDown"),
    ("LEFT", "ArrowLeft"),
    ("RIGHT", "ArrowRight"),
    ("PAGEUP", "PageUp"),
    ("PAGEDOWN", "PageDown"),
    ("HOME", "Home"),
    ("END", "End"),
    ("INS", "Insert"),
    ("MINSUS", "Minus"),
    ("MINUS", "Minus"),
    ("EQUAL", "Equal"),
    ("BRACKETLEFT", "BracketLeft"),
    ("BRACKETRIGHT", "BracketRight"),
    ("BACKSLASH", "Backslash"),
    ("SEMICOLON", "Semicolon"),
    ("QUOTE", "Quote"),
    ("COMMA", "Comma"),
    ("PERIOD", "Period"),
    ("SLASH", "Slash"),
    ("BACKQUOTE", "Backquote"),
];

/// 键名（已大写）→ `KeyMappingId`
pub fn parse_key(key_str: &str) -> Option<KeyMappingId> {
    let upper = key_str.trim().to_uppercase();
    if upper.is_empty() {
        return None;
    }

    // 单字符：A-Z、0-9、常见符号、空格
    if let [byte] = upper.as_bytes() {
        return match byte {
            b'A'..=b'Z' => lookup_code(&format!("Key{upper}")),
            b'0'..=b'9' => lookup_code(&format!("Digit{upper}")),
            _ => match byte {
                b' ' => lookup_code("Space"),
                b'-' => lookup_code("Minus"),
                b'=' => lookup_code("Equal"),
                b'[' => lookup_code("BracketLeft"),
                b']' => lookup_code("BracketRight"),
                b'\\' => lookup_code("Backslash"),
                b';' => lookup_code("Semicolon"),
                b'\'' => lookup_code("Quote"),
                b',' => lookup_code("Comma"),
                b'.' => lookup_code("Period"),
                b'/' => lookup_code("Slash"),
                b'`' => lookup_code("Backquote"),
                _ => None,
            },
        };
    }

    // F1..F12
    if matches!(
        upper.as_str(),
        "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7" | "F8" | "F9" | "F10" | "F11" | "F12"
    ) {
        return lookup_code(&upper);
    }

    KEY_NAME_TO_CODE
        .iter()
        .find(|(name, _)| *name == upper)
        .and_then(|(_, code)| lookup_code(code))
}

/// W3 code 名 → `KeyMappingId`。键码数据由 `keycode` crate 编译期从 Chromium 的
/// `keycode_converter_data.inc` 生成，我们不硬编码任何平台的虚拟键码。
pub fn lookup_code(code: &str) -> Option<KeyMappingId> {
    let code = KeyMappingCode::from_str(code).ok()?;
    KeyMap::from_key_mapping(KeyMapping::Code(Some(code)))
        .ok()
        .map(|map| map.id)
}

// ==================== 规则构建与快捷键解析 ====================

/// "⌘+C+C" / "Ctrl+Shift+A" → "meta:C,C"（事件匹配用的内部格式）
///
/// 注意右半区修饰键（`MetaRight` / `ControlRight` / …）：前端录制器用 DOM
/// `event.key`，按住右 ⌘ 得到的就是这些名字，必须一并归到对应修饰键，否则会被
/// 当成普通键（「⌘+META」这样的组合永远匹配不上）。
///
/// 原在 `app/config.rs`；它只被快捷键核心消费，留在 config.rs 会多出一处与配置无关的
/// 解析逻辑。
pub fn extract_keys_from_shortcut(shortcut: &str) -> String {
    let mut modifiers = Vec::new();
    let mut keys = Vec::new();
    for part in shortcut.split('+') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        let modifier = match part {
            "Ctrl" | "Control" | "ControlRight" => Some("ctrl"),
            "⌘" | "Meta" | "Command" | "MetaRight" => Some("meta"),
            "⇧" | "Shift" | "ShiftRight" => Some("shift"),
            "⌥" | "Alt" | "AltRight" => Some("alt"),
            _ => None,
        };
        match modifier {
            Some(name) => {
                if !modifiers.contains(&name) {
                    modifiers.push(name);
                }
            }
            None => keys.push(part.to_uppercase()),
        }
    }
    if keys.is_empty() {
        keys.push("C".to_string());
    }
    format!("{}:{}", modifiers.join(","), keys.join(","))
}

/// 按当前配置构建规则表；空快捷键的项直接跳过
pub fn build_rules(config: &ShortcutConfig) -> HashMap<String, Rule> {
    let mut map = HashMap::new();
    for (tag, shortcut) in [
        ("TRANSLATE", &config.translate),
        ("SHOW_MAIN", &config.show_main),
    ] {
        if shortcut.trim().is_empty() {
            continue;
        }
        let (required_modifiers, key_sequence) = parse_spec(&extract_keys_from_shortcut(shortcut));
        if key_sequence.is_empty() {
            eprintln!("[hook] 忽略无法解析的快捷键：{tag}={shortcut}");
            continue;
        }
        map.insert(
            tag.to_string(),
            Rule {
                required_modifiers,
                key_sequence,
                match_index: 0,
                last_press: Instant::now() - SEQ_WINDOW,
            },
        );
    }
    map
}

/// "meta:C,C" → (MOD_META, [KeyC, KeyC])
pub fn parse_spec(spec: &str) -> (u8, Vec<KeyMappingId>) {
    let (mod_part, key_part) = match spec.find(':') {
        Some(pos) => (&spec[..pos], &spec[pos + 1..]),
        None => ("", spec),
    };

    let mut required_modifiers: u8 = 0;
    for raw in mod_part.split(',') {
        let bit = match raw.trim().to_lowercase().as_str() {
            "" => continue,
            "ctrl" | "control" => MOD_CTRL,
            "meta" | "command" | "cmd" => MOD_META,
            "shift" => MOD_SHIFT,
            "alt" | "option" => MOD_ALT,
            _ => continue,
        };
        // 位或天然去重：录制器会产出 `⌘+K+⌘+K`，抽出来是 `meta,meta:K,K`
        required_modifiers |= bit;
    }

    let key_sequence: Vec<KeyMappingId> = key_part
        .split(',')
        .filter(|s| !s.trim().is_empty())
        .filter_map(parse_key)
        .collect();

    (required_modifiers, key_sequence)
}

// ==================== 消费线程：序列匹配 ====================

/// 消费线程主体：修饰键位 + 按键序列匹配，命中即派发到主线程。
///
/// 这是**唯一**做匹配的地方 —— 平台层的原生回调只负责把事件转发进来。
pub fn consumer_loop(
    rules: Arc<RwLock<HashMap<String, Rule>>>,
    status: Arc<HookStatusInner>,
    rx: Receiver<RawInput>,
    app: tauri::AppHandle,
    key_of: KeyLookup,
) {
    // [ctrl, meta, shift, alt] 的合并位掩码
    let mut held_modifiers: u8 = 0;
    let mut pressed: HashSet<KeyMappingId> = HashSet::new();

    for input in rx {
        match input {
            RawInput::Modifiers(mask) => {
                held_modifiers = mask;
            }
            RawInput::KeyDown(code) => {
                status.key_events.fetch_add(1, Ordering::Relaxed);
                let Some(entry) = key_of(code) else {
                    continue;
                };
                // 修饰键状态由 Modifiers 事件统一维护，它们不参与按键序列匹配
                if entry.modifier_bit != 0 {
                    continue;
                }
                // 系统自动重复会持续发 KeyDown，已按下的键不重复计入
                if !pressed.insert(entry.id) {
                    continue;
                }
                if let Some(tag) = match_key_down(&rules, entry.id, held_modifiers) {
                    handle_hook_event(app.clone(), tag);
                }
            }
            RawInput::KeyUp(code) => {
                if let Some(entry) = key_of(code) {
                    pressed.remove(&entry.id);
                }
            }
        }
    }
}

/// 按下普通键时推进各规则的匹配进度，返回命中的命令 tag。
fn match_key_down(
    rules: &Arc<RwLock<HashMap<String, Rule>>>,
    key: KeyMappingId,
    held_modifiers: u8,
) -> Option<String> {
    let now = Instant::now();
    let mut guard = match rules.write() {
        Ok(g) => g,
        Err(poisoned) => poisoned.into_inner(),
    };
    let mut fired: Option<String> = None;
    for (tag, rule) in guard.iter_mut() {
        // 修饰键不全（或根本没要求）→ 进度清零。`required_modifiers == 0` 表示
        // 「不需要修饰键」，位与判断天然满足。
        if rule.key_sequence.is_empty()
            || held_modifiers & rule.required_modifiers != rule.required_modifiers
        {
            rule.match_index = 0;
            continue;
        }
        if rule.match_index >= 1 && now.duration_since(rule.last_press) > SEQ_WINDOW {
            rule.match_index = 0;
        }
        if rule.match_index >= rule.key_sequence.len() {
            rule.match_index = 0;
        }

        if rule.key_sequence[rule.match_index] == key {
            rule.last_press = now;
            rule.match_index += 1;
            if rule.match_index >= rule.key_sequence.len() {
                rule.match_index = 0;
                if fired.is_none() {
                    fired = Some(tag.clone());
                }
            }
        } else {
            rule.match_index = 0;
        }
    }
    fired
}

// ==================== 命中后的动作（主线程） ====================

/// 命中规则 → 在主线程执行命令。
///
/// 与 macOS 的 `⌘+C+C` 同构，Windows 的 `Ctrl+C+C` 也是同一套语义：**序列里第一次
/// 按键被原生监听放行、由系统真实执行复制**（macOS 是 ⌘C、Windows 是 Ctrl+C），
/// 第二次按键命中规则时才读剪贴板。所以平台层绝不能吞掉按键。
fn handle_hook_event(app: tauri::AppHandle, tag: String) {
    let task_app = app.clone();
    let _ = app.run_on_main_thread(move || match tag.as_str() {
        "TRANSLATE" => handle_translate(&task_app),
        "SHOW_MAIN" => {
            if let Some(window) = task_app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        _ => {}
    });
}

fn handle_translate(app: &tauri::AppHandle) {
    // 轮询等剪贴板就绪：复制键（macOS ⌘C / Windows Ctrl+C）的拷贝是异步落盘的，
    // 单次读取会在竞态下拿到空值
    let mut text = String::new();
    for _ in 0..5 {
        match app.clipboard().read_text() {
            Ok(t) => {
                let t = t.trim().to_string();
                if !t.is_empty() {
                    text = t;
                    break;
                }
            }
            Err(e) => eprintln!("[main] clipboard read error: {e}"),
        }
        thread::sleep(Duration::from_millis(80));
    }

    // 剪贴板为空 → 不弹窗（系统复制键无可复制内容时同样不动作；
    // 同文本重复触发由前端 lastTextRef 直接重看上次翻译，无需后端缓存）
    if text.trim().is_empty() {
        eprintln!("[main] 剪贴板为空，跳过翻译");
        show_empty_clipboard_toast(app);
        return;
    }

    eprintln!("[main] display_text len={}", text.len());
    let Some(window) = app.get_webview_window("translate") else {
        return;
    };
    let size = window
        .inner_size()
        .unwrap_or(tauri::PhysicalSize::new(480, 360));
    // 弹窗锚定光标左上角（圆角切点内退 + 越界按光标所在屏钳制）
    if let Some((px, py)) = anchor_position(app, &window, size, CUT_INSET) {
        let _ = window.set_position(LogicalPosition::new(px, py));
    }
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit("show-translate", serde_json::json!({ "text": text }));
}

/// 空剪贴板轻提示：与划词弹窗同款跟随光标，约 1.2 秒自动消失
fn show_empty_clipboard_toast(app: &tauri::AppHandle) {
    let Some(toast) = app.get_webview_window("toast") else {
        return;
    };
    let size = toast
        .inner_size()
        .unwrap_or(tauri::PhysicalSize::new(280, 64));
    if let Some((px, py)) = anchor_position(app, &toast, size, CUT_INSET) {
        let _ = toast.set_position(LogicalPosition::new(px, py));
    }
    let _ = toast.show();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(1200));
        let _ = toast.hide();
    });
}

/// 弹窗/toast 锚点定位（逻辑坐标 px,py；圆角内退 `cut_inset` + 越界按光标所在屏钳制）。
///
/// 光标位置**只实时读取**：`window.cursor_position()` 在三个平台都可用（macOS 底层是
/// `NSEvent.mouseLocation`，Windows 是 `GetCursorPos`），返回物理像素 + 全局左上原点。
/// 早期版本靠监听鼠标移动缓存坐标，但鼠标未动过时缓存是空的 → 弹窗跑到屏幕左上角；
/// 而且鼠标事件放在原生回调里属于纯浪费的开销（每秒可达上千次）。实时读取失败才放弃定位。
fn anchor_position(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    size: tauri::PhysicalSize<u32>,
    cut_inset: f64,
) -> Option<(f64, f64)> {
    // 1) 实时光标（物理像素，全局左上原点）
    let cursor = window.cursor_position().ok()?;
    // 2) 光标所在监视器优先（隐藏窗口的 current_monitor 可能停留在旧显示器）
    let monitor = app
        .monitor_from_point(cursor.x, cursor.y)
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten())?;
    let scale = monitor.scale_factor();
    let mx = monitor.position().x as f64 / scale;
    let my = monitor.position().y as f64 / scale;
    let mw = monitor.size().width as f64 / scale;
    let mh = monitor.size().height as f64 / scale;
    // 3) 光标在该监视器尺度下的逻辑坐标；窗口逻辑尺寸同口径折算
    let (cxl, cyl) = (cursor.x / scale, cursor.y / scale);
    let w = size.width as f64 / scale;
    let h = size.height as f64 / scale;
    let mut px = cxl - cut_inset;
    let mut py = cyl - cut_inset;
    if px + w > mx + mw {
        px = mx + mw - w;
    }
    if py + h > my + mh {
        py = my + mh - h;
    }
    if px < mx {
        px = mx;
    }
    if py < my {
        py = my;
    }
    Some((px, py))
}

// ==================== 测试 ====================

#[cfg(test)]
mod tests {
    use super::*;

    /// 设置里显示的「⌘+C+C」必须能落到原生监听真正比对的按键身份上。
    /// 断言里的 `MOD_*` 用显式常量而不是平台默认值 —— 默认快捷键本身按平台不同
    /// （见 `ShortcutConfig::default`），但两条规则的**结构**必须一致。
    #[test]
    fn default_shortcuts_build_expected_rules() {
        let default = ShortcutConfig::default();
        let rules = build_rules(&default);
        assert_eq!(rules.len(), 2);

        let key_c = parse_key("C").expect("C 必须可解析");
        let key_v = parse_key("V").expect("V 必须可解析");
        assert_ne!(key_c, key_v, "C 与 V 必须映射到不同按键");

        let translate = &rules["TRANSLATE"];
        assert_eq!(translate.key_sequence, vec![key_c, key_c]);
        let show_main = &rules["SHOW_MAIN"];
        assert_eq!(show_main.key_sequence, vec![key_c, key_v]);

        // 默认必须带修饰键，否则连按两下普通键就误触发
        assert_ne!(translate.required_modifiers, 0);
        assert_eq!(translate.required_modifiers, show_main.required_modifiers);
    }

    #[test]
    fn parse_spec_reads_modifiers_and_sequence() {
        let (mods, keys) = parse_spec("meta:C,C");
        assert_eq!(mods, MOD_META);
        let key_c = parse_key("C").unwrap();
        assert_eq!(keys, vec![key_c, key_c]);
    }

    #[test]
    fn parse_spec_reads_multiple_modifiers() {
        let (mods, keys) = parse_spec("ctrl,shift,alt:K,K");
        assert_eq!(mods, MOD_CTRL | MOD_SHIFT | MOD_ALT);
        let key_k = parse_key("K").unwrap();
        assert_eq!(keys, vec![key_k, key_k]);
    }

    /// 录制器可能产出 `⌘+K+⌘+K`（`extract_keys_from_shortcut` 抽出 `meta,meta:K,K`），
    /// 重复的 modifier 必须收敛成同一位，否则「缺一个修饰键」的判断会误判
    #[test]
    fn duplicated_modifiers_are_deduped() {
        let (mods, keys) = parse_spec("meta,meta:K,K");
        assert_eq!(mods, MOD_META);
        let key_k = parse_key("K").unwrap();
        assert_eq!(keys, vec![key_k, key_k]);
    }

    #[test]
    fn parse_spec_without_modifier_part() {
        let (mods, keys) = parse_spec("F5");
        assert_eq!(mods, 0);
        assert_eq!(keys, vec![parse_key("F5").unwrap()]);
    }

    #[test]
    fn unknown_key_is_dropped() {
        assert!(parse_key("NOT_A_KEY").is_none());
        assert!(parse_key("F13").is_none(), "F13 不在支持范围");
        assert!(parse_key("").is_none());
        assert_eq!(parse_key("tab"), parse_key("TAB"));
        assert_eq!(parse_key("Enter"), parse_key("ENTER"));
    }

    /// 前端录制器产出的是 DOM `event.key`（ArrowUp），旧写法 `UP` 也要认
    #[test]
    fn arrow_key_aliases_resolve_to_same_key() {
        assert_eq!(parse_key("ARROWUP"), parse_key("UP"));
        assert_eq!(parse_key("ArrowDown"), parse_key("DOWN"));
        assert_ne!(parse_key("ARROWUP"), parse_key("ARROWDOWN"));
    }

    /// 清空某项快捷键后热更新必须真的少一条规则（否则旧规则会继续误触发）
    #[test]
    fn blank_shortcut_is_skipped() {
        let config = ShortcutConfig {
            translate: String::new(),
            show_main: "⌘+C+V".into(),
        };
        let rules = build_rules(&config);
        assert_eq!(rules.len(), 1);
        assert!(!rules.contains_key("TRANSLATE"));
        assert!(rules.contains_key("SHOW_MAIN"));
    }

    /// 修饰键判定按 `KeyMappingId` 走，左右侧必须合并到同一位
    #[test]
    fn modifier_bits_merge_left_and_right() {
        assert_eq!(
            modifier_bit(KeyMappingId::ControlLeft),
            modifier_bit(KeyMappingId::ControlRight)
        );
        assert_eq!(
            modifier_bit(KeyMappingId::ShiftLeft),
            modifier_bit(KeyMappingId::ShiftRight)
        );
        assert_eq!(
            modifier_bit(KeyMappingId::AltLeft),
            modifier_bit(KeyMappingId::AltRight)
        );
        assert_eq!(
            modifier_bit(KeyMappingId::MetaLeft),
            modifier_bit(KeyMappingId::MetaRight)
        );
        // 四类修饰键互不相同
        for (a, b) in [
            (KeyMappingId::ControlLeft, KeyMappingId::ShiftLeft),
            (KeyMappingId::ShiftLeft, KeyMappingId::AltLeft),
            (KeyMappingId::AltLeft, KeyMappingId::MetaLeft),
        ] {
            assert_ne!(modifier_bit(a), modifier_bit(b), "{a:?} 与 {b:?} 必须不同位");
        }
    }

    /// CapsLock 虽也改变系统修饰键状态，但不是 `MOD_*` 修饰键：用户在设置里显式配置
    /// 它时必须能生效。Fn 键同理。
    #[test]
    fn caps_lock_is_not_treated_as_modifier() {
        assert_eq!(modifier_bit(KeyMappingId::CapsLock), 0);
        assert_eq!(modifier_bit(parse_key("C").unwrap()), 0);
    }

    /// 「按住修饰键 + 依次 C、C」应命中 TRANSLATE；中途松开修饰键则不命中
    #[test]
    fn sequence_match_requires_all_modifiers_held() {
        let key_c = parse_key("C").unwrap();
        let rules = Arc::new(RwLock::new(build_rules(&ShortcutConfig {
            translate: "⌘+C+C".into(),
            show_main: String::new(),
        })));

        let tag = match_key_down(&rules, key_c, MOD_META);
        assert_eq!(tag, None, "第一次按下只推进一半序列");
        let tag = match_key_down(&rules, key_c, MOD_META);
        assert_eq!(tag.as_deref(), Some("TRANSLATE"));

        match_key_down(&rules, key_c, MOD_META);
        // 松开修饰键 → 前提不满足 → 进度清零
        let tag = match_key_down(&rules, key_c, 0);
        assert_eq!(tag, None, "缺修饰键时第二个 C 不应命中");
    }

    /// 不要求修饰键的规则（无 modifier 段）按键即命中
    #[test]
    fn rule_without_modifier_matches_bare_key() {
        let key_f5 = parse_key("F5").unwrap();
        let mut map = HashMap::new();
        map.insert(
            "TRANSLATE".to_string(),
            Rule {
                required_modifiers: 0,
                key_sequence: vec![key_f5],
                match_index: 0,
                last_press: Instant::now() - SEQ_WINDOW,
            },
        );
        let rules = Arc::new(RwLock::new(map));
        assert_eq!(
            match_key_down(&rules, key_f5, 0).as_deref(),
            Some("TRANSLATE")
        );
    }

    /// 两条规则共用第一个键（`C+C` 与 `C+V`）时不该互相误命中
    #[test]
    fn sibling_rules_do_not_cross_fire() {
        let rules = Arc::new(RwLock::new(build_rules(&ShortcutConfig::default())));
        let key_c = parse_key("C").unwrap();
        let key_v = parse_key("V").unwrap();
        let mods = MOD_CTRL | MOD_META; // 位与判断下任意超集都满足

        assert_eq!(match_key_down(&rules, key_c, mods), None);
        // C 之后按 V：TRANSLATE(C+C) 进度清零，SHOW_MAIN(C+V) 命中
        assert_eq!(
            match_key_down(&rules, key_v, mods).as_deref(),
            Some("SHOW_MAIN")
        );
        assert_eq!(match_key_down(&rules, key_c, mods), None);
        assert_eq!(
            match_key_down(&rules, key_c, mods).as_deref(),
            Some("TRANSLATE")
        );
    }
}