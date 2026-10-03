//! 全局快捷键监听：自建 **ListenOnly** 事件 tap，挂在**进程主线程的 run loop** 上。
//!
//! 三个版本的演进，都是踩坑换来的，不要回退：
//!
//! - **v0.1.1**：`keyboard-hook` 子进程 + rdev。真正建 tap 的是子二进制，TCC 授权
//!   绑在它上面；app 是 ad-hoc 签名，每次重打包 cdhash 都变 → 授权失效。且主进程
//!   退出后子进程不会被回收（实测泄漏 PPID=1 的孤儿 hook）。
//! - **v0.1.2**：tap 收进主进程（授权归属对了），但仍用 `rdev::listen()` 且在**自建
//!   后台线程**上跑 `CFRunLoopRun` → 回调落在后台线程 → rdev 内部对每个按键都调
//!   `keyboard_state.create_string_for_key`，其首行是
//!   `TISCopyCurrentKeyboardInputSource()` / `TISGetInputSourceProperty(...)`，
//!   这些 TIS API 内部走主 dispatch queue（`islGetInputSourceListWithAdditions`
//!   带 `dispatch_assert_queue`）→ `ud2` → **SIGILL 崩溃**。实测报告
//!   `desktop-translation-2026-10-03-115051.ips`：`Triggered by Thread` 就是监听
//!   线程，栈顶 `dispatch_assert_queue` ← `islGetInputSourceListWithAdditions`
//!   ← `rdev raw_callback`。旧方案能跑通只是因为子进程的 `main()` 就是主线程。
//! - **v0.1.4（当前）**：彻底不用 rdev。手写 FFI 建 tap，把 `CFRunLoopSource` 加到
//!   `CFRunLoopGetMain()` 的 common modes，由 tao/Cocoa 主循环顺带驱动；回调里**只**
//!   读 keycode / flags，**绝不碰任何 TIS / AppKit API**，一律 `tx.send()` 丢给
//!   消费线程做匹配与派发。
//!
//! 三条必须记住的约束：
//! 1. **回调只能在主线程**：任何跨线程假设的系统调用都会 `dispatch_assert_queue` → 崩。
//! 2. **mask 必须收窄**：只申请 `KeyDown|KeyUp|FlagsChanged`（少申请一位就少一类门禁）。
//!    但注意：`CGEventTapCreate` 返回 NULL **不是**授权信号 —— 实测未授权时它照样返回
//!    非 NULL。授权判据只用 `IOHIDCheckAccess`，详见 `mod listen_event_access`。
//! 3. **静默失败必须有 UI 侧可见提示**：用户看不到后台日志，`HookStatus` 三个诊断量
//!    由**主页**的 `ShortcutPermBanner` 轮询展示（`listening` / `listen_event` / `key_events`）。
//!
//! 平台：事件 tap 是 macOS 专有 API，本模块只在 macOS 编译（见文件末尾 extern 块的
//! `cfg` 门控）；其余逻辑是纯 Rust。

use std::collections::{HashMap, HashSet};
use std::str::FromStr;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::thread;
use std::time::{Duration, Instant};

use keycode::{KeyMap, KeyMapping, KeyMappingCode, KeyMappingId};
use serde::Serialize;
use tauri::{Emitter, LogicalPosition, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::app::config::{extract_keys_from_shortcut, ShortcutConfig};

/// 连击序列的两次按键最大间隔
const SEQ_WINDOW: Duration = Duration::from_millis(500);

/// tap 失效后的重建间隔（授权由用户手动给，需要留出授权生效的时间）
const RELISTEN_RETRY: Duration = Duration::from_secs(5);

/// 健康检查间隔：轮询授权状态、确认 tap 还活着
const HEALTH_INTERVAL: Duration = Duration::from_secs(3);

/// 圆角补偿：卡片 rounded-xl=12px，圆弧使可见角尖相对理想直角内退 cut = r − r/√2 ≈ 3.51px
const CUT_INSET: f64 = 12.0 * (1.0 - std::f64::consts::FRAC_1_SQRT_2);

// ==================== 修饰键位掩码 ====================

/// 规则要求的修饰键位掩码。左右侧修饰键（⌘ 与 ⌘）合并到同一位：右侧 ⌘ 同样能触发
/// 「⌘+C+C」，用户在设置里也没法区分左右。
const MOD_CTRL: u8 = 1 << 0;
const MOD_META: u8 = 1 << 1;
const MOD_SHIFT: u8 = 1 << 2;
const MOD_ALT: u8 = 1 << 3;

/// `CGEventFlags` 的修饰键位。取值来自 SDK `IOLLEvent.h` 的 `NX_*MASK` 定义。
const FLAG_SHIFT: u64 = 0x0002_0000;
const FLAG_CONTROL: u64 = 0x0004_0000;
/// Option 键
const FLAG_ALT: u64 = 0x0008_0000;
/// Command（⌘）
const FLAG_COMMAND: u64 = 0x0010_0000;

/// 把事件 flags 折算成修饰键位掩码。FlagsChanged 事件携带的是**当前全部**修饰键
/// 状态，所以直接整体覆盖即可，不需要跟上次比较。
fn modifiers_from_flags(flags: u64) -> u8 {
    let mut modifiers = 0;
    if flags & FLAG_CONTROL != 0 {
        modifiers |= MOD_CTRL;
    }
    if flags & FLAG_COMMAND != 0 {
        modifiers |= MOD_META;
    }
    if flags & FLAG_SHIFT != 0 {
        modifiers |= MOD_SHIFT;
    }
    if flags & FLAG_ALT != 0 {
        modifiers |= MOD_ALT;
    }
    modifiers
}

// ==================== 事件类型与 tap 参数 ====================

/// `CGEventType` 取值（`CGEventTypes.h`，与 `IOLLEvent.h` 的 `NX_*` 同值）
const EVENT_KEY_DOWN: u32 = 10;
const EVENT_KEY_UP: u32 = 11;
const EVENT_FLAGS_CHANGED: u32 = 12;
/// 回调处理超时被系统禁用
const EVENT_TAP_DISABLED_BY_TIMEOUT: u32 = 0xFFFF_FFFE;
/// 用户主动禁用
const EVENT_TAP_DISABLED_BY_USER_INPUT: u32 = 0xFFFF_FFFF;

/// 只申请这三类事件。mask 位 = `1 << type`。
///
/// 刻意**不用** `kCGEventMaskForAllEvents`：未获「输入监控」授权时，系统只清掉不被
/// 允许的位，而鼠标类事件不受该权限管辖 → mask 永不为空 → 进程活着、tap 也建起来了，
/// 但键盘事件一个都收不到 —— 这正是 v0.1.1「快捷键完全没反应却毫无线索」的根因。
///
/// 注意：**不要指望靠 mask 清空来识别授权缺失**。隔离探针实测，未授权
/// （`IOHIDCheckAccess` 返回 `kIOHIDAccessTypeDenied`）时 `CGEventTapCreate` 仍返回
/// 非 NULL 且事件有投递。授权状态一律查 `listen_event_access::granted()`
/// （= `IOHIDCheckAccess`），那才是可靠信号。
const EVENT_MASK: u64 =
    (1u64 << EVENT_KEY_DOWN) | (1u64 << EVENT_KEY_UP) | (1u64 << EVENT_FLAGS_CHANGED);

/// `kCGHIDEventTap`：优先拿到 HID 层事件，键盘类事件的键码最完整
const TAP_LOCATION_HID: u32 = 0;
/// `kCGHeadInsertEventTap`
const TAP_PLACE_HEAD_INSERT: u32 = 0;
/// `kCGEventTapOptionListenOnly`：**只监听不拦截**，对应 TCC 门禁是
/// `kTCCServiceListenEvent`（「输入监控」），不需要「辅助功能」。
const TAP_OPTION_LISTEN_ONLY: u32 = 1;

/// `kCGKeyboardEventKeycode`：`CGEventGetIntegerValueField` 的字段号，取虚拟键码
const FIELD_KEYCODE: u32 = 9;

/// macOS 虚拟键码上界（键码表容量；实际用到的最大键码 < 128，留足余量）
const MACOS_VIRTUAL_KEY_MAX: usize = 256;

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
    /// 事件 tap 当前是否挂在主线程 run loop 上
    pub listening: AtomicBool,
    /// macOS「输入监控」授权是否已授予（未授权时系统不投递按键，快捷键必然无反应）
    pub listen_event: AtomicBool,
    /// 累计收到的按键按下事件数（判断 tap 是否真的在投递事件）
    pub key_events: AtomicU64,
}

/// managed state：保证监听只启动一次。
pub struct HookStarted(pub AtomicBool);

/// 传给前端的状态快照
#[derive(Serialize, Clone, Copy)]
pub struct HookStatusSnapshot {
    /// 事件 tap 是否已就绪
    pub listening: bool,
    /// 是否已获得「输入监控」授权（未授权时系统不投递按键，快捷键必然无反应）
    pub listen_event: bool,
    /// 已接收的按键事件数
    pub key_events: u64,
}

/// tap 回调 → 消费线程的原始输入。只带够匹配用的最小信息，回调里不做任何解析。
enum RawInput {
    KeyDown(u16),
    KeyUp(u16),
    Flags(u64),
}

/// 命中规则 → 主线程执行的命令
struct HookEvent {
    tag: String,
}

// ==================== 对外接口 ====================

/// 读取当前诊断状态（供设置页展示「为什么没反应」）
pub fn hook_status(app: &tauri::AppHandle) -> HookStatusSnapshot {
    let Some(status) = app.try_state::<HookStatus>() else {
        return HookStatusSnapshot {
            listening: false,
            listen_event: false,
            key_events: 0,
        };
    };
    let inner = &status.0;
    HookStatusSnapshot {
        listening: inner.listening.load(Ordering::Relaxed),
        listen_event: inner.listen_event.load(Ordering::Relaxed),
        key_events: inner.key_events.load(Ordering::Relaxed),
    }
}

/// 启动监听（幂等）。**必须在主线程调用**（Tauri `setup` 阶段即在主线程）：
/// 事件 tap 只能挂在主线程 run loop 上。
pub fn start_keyboard_hook(app: &tauri::AppHandle) {
    let _ = MAIN_THREAD.set(thread::current().id());

    let config = app.state::<Mutex<ShortcutConfig>>().lock().unwrap().clone();
    let rules = build_rules(&config);
    let count = rules.len();
    *app.state::<HookRules>().0.write().unwrap() = rules;
    ensure_listener(app);
    eprintln!("[hook] 全局监听已启动，规则 {count} 条");
}

/// 设置变更后热更新规则：**不重建 tap**（快捷键表整体替换即可）
pub fn reload_hook_rules(app: &tauri::AppHandle) {
    let config = app.state::<Mutex<ShortcutConfig>>().lock().unwrap().clone();
    let rules = build_rules(&config);
    let count = rules.len();
    ensure_listener(app);
    if let Some(state) = app.try_state::<HookRules>() {
        *state.0.write().unwrap() = rules;
    }
    eprintln!("[hook] 规则已热更新：{count} 条");
}

/// 打开 macOS「输入监控」设置面板；非 macOS 返回 false。
///
/// 深链分两个时代。实测 macOS 26.6.2：旧 URL **不会报错**（`open` 退出码仍为 0，
/// 系统设置也会被拉起），但会落到「通用」面板而非「输入监控」——这正是 0.1.2
/// 里用户点了按钮「没反应」的原因，且无法靠返回值/异常判断成败，只能按系统版本分流：
/// - macOS 13+（System Settings）：`com.apple.settings.PrivacySecurity.extension`
/// - macOS 12 及更早（System Preferences）：`com.apple.preferences.security`
#[cfg(target_os = "macos")]
pub fn open_listen_event_settings() -> bool {
    let url = if macos_major_version() >= 13 {
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_ListenEvent"
    } else {
        "x-apple.systempreferences:com.apple.preferences.security?Privacy_ListenEvent"
    };
    std::process::Command::new("open")
        .arg(url)
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

/// 读 macOS 主版本号；读不到时按 13 处理（新版系统占绝对多数，宁可落到无效面板
/// 也不能在旧系统上打开错误面板）
#[cfg(target_os = "macos")]
fn macos_major_version() -> u32 {
    std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .and_then(|text| text.split('.').next()?.trim().parse::<u32>().ok())
        .unwrap_or(13)
}

#[cfg(not(target_os = "macos"))]
pub fn open_listen_event_settings() -> bool {
    false
}

// ==================== 键码查表 ====================

/// 虚拟键码 → 按键身份的查表项
struct KeyEntry {
    id: KeyMappingId,
    /// 是否是修饰键（左右侧共用一位 flag）。修饰键的按下/抬起状态统一走
    /// `FlagsChanged` 的 flags 位推断，不从 KeyDown/KeyUp 走，所以它们不参与按键
    /// 序列匹配 —— 否则按一下 ⌘ 就会被当成序列的一步。
    ///
    /// 注意 CapsLock / Fn 不算：它们虽然也会驱动 FlagsChanged，但 flags 位与
    /// MOD_* 无关，仍按普通键处理（用户若显式配置了它们就应当生效）。
    is_modifier: bool,
}

static KEY_TABLE: OnceLock<Vec<Option<KeyEntry>>> = OnceLock::new();

/// macOS 虚拟键码 → `KeyEntry`。表在首次使用时构建一次（`keycode` crate 内部是几百
/// 臂的 `match`，每个事件都走一遍没必要）。
fn key_entry(code: u16) -> Option<&'static KeyEntry> {
    let table = KEY_TABLE.get_or_init(|| {
        (0..MACOS_VIRTUAL_KEY_MAX)
            .map(|code| {
                KeyMap::from_key_mapping(KeyMapping::Mac(code as u16)).ok().map(|map| KeyEntry {
                    id: map.id,
                    is_modifier: map.modifier.is_some(),
                })
            })
            .collect()
    });
    table.get(usize::from(code))?.as_ref()
}

/// 具名键（大写）→ W3 `KeyboardEvent.code` 名称。
///
/// 前端录制器用的是 DOM `event.key`（`ArrowUp`、`PageUp`…），后端
/// `extract_keys_from_shortcut` 会 `to_uppercase()`，所以这里按大写匹配，
/// 并额外兼容 `UP` / `DOWN` 这类旧写法。
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
fn parse_key(key_str: &str) -> Option<KeyMappingId> {
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
/// `keycode_converter_data.inc` 生成，我们不硬编码任何 macOS 虚拟键码。
fn lookup_code(code: &str) -> Option<KeyMappingId> {
    let code = KeyMappingCode::from_str(code).ok()?;
    KeyMap::from_key_mapping(KeyMapping::Code(Some(code)))
        .ok()
        .map(|map| map.id)
}

// ==================== 线程编排 ====================

/// 进程主线程 id。tap 只能挂在主线程 run loop 上，后续重建必须回到这个线程。
static MAIN_THREAD: OnceLock<thread::ThreadId> = OnceLock::new();

fn on_main_thread() -> bool {
    MAIN_THREAD
        .get()
        .is_some_and(|id| *id == thread::current().id())
}

/// tap 回调的 `user_info`。只有回调（主线程）会写 `tx`。
struct TapContext {
    tx: Mutex<Sender<RawInput>>,
}

static TAP_CTX: OnceLock<TapContext> = OnceLock::new();

/// 当前已安装的 tap / run loop source。指针以 `usize` 存放，才能放进 `static`
/// （裸指针不是 `Send`）。
struct TapHandles {
    tap: usize,
    source: usize,
}

static TAP_SLOT: Mutex<Option<TapHandles>> = Mutex::new(None);

/// 只在「问题出现」和「恢复」两个时刻打日志，避免未授权时每 5s 刷一行。
static TAP_WARNED: AtomicBool = AtomicBool::new(false);

/// 保证监听链路已就位（重复调用无副作用）。**首次调用方必须在主线程**。
fn ensure_listener(app: &tauri::AppHandle) {
    if app.state::<HookStarted>().0.swap(true, Ordering::SeqCst) {
        return;
    }
    assert!(
        on_main_thread(),
        "事件 tap 必须挂在主线程 run loop 上，ensure_listener 只能在 setup 阶段首次调用"
    );

    let (tx, rx) = mpsc::channel::<RawInput>();
    let _ = TAP_CTX.set(TapContext {
        tx: Mutex::new(tx),
    });

    // 消费线程：匹配与派发都在这里，主线程回调只做转发
    let rules = app.state::<HookRules>().0.clone();
    let status = app.state::<HookStatus>().0.clone();
    let consumer_status = status.clone();
    let consumer_app = app.clone();
    thread::spawn(move || consumer_loop(rules, consumer_status, rx, consumer_app));

    // 当前就在主线程，且事件循环尚未启动 —— 此时挂 source 最稳妥，
    // 之后由 tao/Cocoa 主循环顺带驱动。
    install_tap(&status);

    let health_app = app.clone();
    thread::spawn(move || health_loop(health_app, status));
}

/// 健康检查线程：轮询授权状态；tap 不存在或被系统禁用时回主线程重建。
/// 用户在系统设置里授权后无需重启应用即可恢复。
fn health_loop(app: tauri::AppHandle, status: Arc<HookStatusInner>) {
    loop {
        thread::sleep(HEALTH_INTERVAL);
        status
            .listen_event
            .store(listen_event_access::granted(), Ordering::Relaxed);
        if tap_enabled() {
            continue;
        }
        let rebuild_status = status.clone();
        let _ = app.run_on_main_thread(move || install_tap(&rebuild_status));
        // 重建后若仍失败（多半是没授权），退避一下再试，别空转
        thread::sleep(RELISTEN_RETRY);
    }
}

/// 消费线程主体：修饰键位 + 按键序列匹配，命中即派发到主线程。
fn consumer_loop(
    rules: Arc<RwLock<HashMap<String, Rule>>>,
    status: Arc<HookStatusInner>,
    rx: Receiver<RawInput>,
    app: tauri::AppHandle,
) {
    // [ctrl, meta, shift, alt] 的合并位掩码
    let mut held_modifiers: u8 = 0;
    let mut pressed: HashSet<KeyMappingId> = HashSet::new();

    for input in rx {
        match input {
            RawInput::Flags(flags) => {
                held_modifiers = modifiers_from_flags(flags);
            }
            RawInput::KeyDown(code) => {
                status.key_events.fetch_add(1, Ordering::Relaxed);
                let Some(entry) = key_entry(code) else {
                    continue;
                };
                // 修饰键状态由 FlagsChanged 的 flags 位统一维护
                if entry.is_modifier {
                    continue;
                }
                // 系统自动重复会持续发 KeyDown，已按下的键不重复计入
                if !pressed.insert(entry.id) {
                    continue;
                }
                if let Some(tag) = match_key_down(&rules, entry.id, held_modifiers) {
                    handle_hook_event(app.clone(), HookEvent { tag });
                }
            }
            RawInput::KeyUp(code) => {
                if let Some(entry) = key_entry(code) {
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

// ==================== 事件 tap 安装（主线程） ====================

/// 重建事件 tap 并挂到**主线程** run loop。调用方必须在主线程。
///
/// 入口有两处：`start_keyboard_hook`（setup 阶段，主线程同步调用）与健康检查线程
/// 通过 `run_on_main_thread` 回调。
#[cfg(target_os = "macos")]
fn install_tap(status: &Arc<HookStatusInner>) {
    teardown_tap();
    let Some(ctx) = TAP_CTX.get() else {
        return;
    };

    // 授权判定用 IOHIDCheckAccess —— 它是唯一会比对 csreq 的信号。
    // 另两个都不可靠（详见 `mod listen_event_access` 的文档注释）：
    // `CGEventTapCreate` 未授权时照样返回非 NULL；`CGPreflightListenEventAccess()`
    // 在 csreq 不匹配时也照样返回 true。
    let granted = listen_event_access::granted();
    status.listen_event.store(granted, Ordering::Relaxed);
    if granted {
        log_tap_recovered();
    } else {
        // 只在 TCC 里完全没有本 app 的记录时才弹窗；已有旧记录时 macOS 不会弹窗
        // （只是静默比对 csreq 失败），弹了也是白弹。
        if listen_event_access::need_request_dialog() {
            // 触发系统自带授权弹窗（文案由 macOS 本地化，无需前端多语言适配）
            listen_event_access::request();
        }
        log_tap_problem("[hook] 未获得 macOS「输入监控」授权：系统不会投递按键事件。\
             系统设置 → 隐私与安全性 → 输入监控（若已有条目，需关掉再打开才会刷新授权）");
    }

    // safe：tap 为 null 或授权未生效时系统不会调用回调
    let tap = unsafe {
        CGEventTapCreate(
            TAP_LOCATION_HID,
            TAP_PLACE_HEAD_INSERT,
            TAP_OPTION_LISTEN_ONLY,
            EVENT_MASK,
            tap_callback,
            ctx as *const TapContext as *mut std::ffi::c_void,
        )
    };
    if tap.is_null() {
        status.listening.store(false, Ordering::Relaxed);
        // 授权状态上面已单独判定并提示过了；这里只报告 tap 本身建不起来
        log_tap_problem("[hook] CGEventTapCreate 返回 NULL：事件 tap 创建失败（与授权无关）");
        return;
    }

    // safe：tap 是刚创建的非空 Mach port
    let source = unsafe { CFMachPortCreateRunLoopSource(std::ptr::null_mut(), tap, 0) };
    if source.is_null() {
        unsafe { CFRelease(tap as *const std::ffi::c_void) };
        status.listening.store(false, Ordering::Relaxed);
        log_tap_problem("[hook] CFMachPortCreateRunLoopSource 返回 NULL");
        return;
    }

    // safe：run loop / source 均来自上方成功的创建
    unsafe {
        // common modes 含 default mode，所以 tao/Cocoa 主循环会正常驱动这个 source
        CFRunLoopAddSource(CFRunLoopGetMain(), source, kCFRunLoopCommonModes);
        CGEventTapEnable(tap, true);
    }
    set_current_tap(Some(TapHandles {
        tap: tap as usize,
        source: source as usize,
    }));
    status.listening.store(true, Ordering::Relaxed);
    log_tap_recovered();
}

/// 拆掉当前 tap：先把 source 移出 run loop，再释放 source / tap。必须在主线程。
#[cfg(target_os = "macos")]
fn teardown_tap() {
    let Some(handles) = set_current_tap(None) else {
        return;
    };
    unsafe {
        let source = handles.source as *mut std::ffi::c_void;
        CFRunLoopRemoveSource(CFRunLoopGetMain(), source, kCFRunLoopCommonModes);
        CFRelease(source as *const std::ffi::c_void);
        CFRelease(handles.tap as *const std::ffi::c_void);
    }
}

/// 事件 tap 回调。
///
/// **必须极短且不碰 TIS / AppKit**：它跑在进程主线程上，而 rdev 0.5.3 正是因为在
/// 回调里调 `TISGetInputSourceProperty`（内部 `dispatch_assert_queue`）触发 `ud2`
/// 导致 SIGILL 崩溃（见文件头演进记录）。这里只读整数字段，然后 `send` 给消费线程。
#[cfg(target_os = "macos")]
unsafe extern "C" fn tap_callback(
    _proxy: *mut std::ffi::c_void,
    event_type: u32,
    event: *mut std::ffi::c_void,
    user_info: *mut std::ffi::c_void,
) -> *mut std::ffi::c_void {
    // safe：user_info 由 install_tap 传入 TAP_CTX 里的 &'static TapContext
    let ctx = unsafe { &*(user_info as *const TapContext) };
    match event_type {
        EVENT_KEY_DOWN => ctx.push(RawInput::KeyDown(keycode_of(event))),
        EVENT_KEY_UP => ctx.push(RawInput::KeyUp(keycode_of(event))),
        EVENT_FLAGS_CHANGED => ctx.push(RawInput::Flags(event_flags(event))),
        EVENT_TAP_DISABLED_BY_TIMEOUT | EVENT_TAP_DISABLED_BY_USER_INPUT => {
            // 系统禁用了 tap：Apple 要求在回调里直接重新启用
            ctx.reenable_tap();
        }
        _ => {}
    }
    event
}

#[cfg(target_os = "macos")]
impl TapContext {
    fn push(&self, input: RawInput) {
        let guard = match self.tx.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        // 消费线程只在进程退出时结束，发送失败无需处理
        let _ = guard.send(input);
    }

    fn reenable_tap(&self) {
        if let Some(handles) = current_tap() {
            // safe：handles.tap 是本进程创建且尚未释放的 Mach port
            unsafe { CGEventTapEnable(handles.tap as *mut std::ffi::c_void, true) };
        }
    }
}

#[cfg(target_os = "macos")]
fn keycode_of(event: *mut std::ffi::c_void) -> u16 {
    // safe：event 由系统传入，非空
    unsafe { CGEventGetIntegerValueField(event, FIELD_KEYCODE) as u16 }
}

#[cfg(target_os = "macos")]
fn event_flags(event: *mut std::ffi::c_void) -> u64 {
    // safe：event 由系统传入，非空
    unsafe { CGEventGetFlags(event) }
}

/// 当前 tap 是否存在且处于启用状态
#[cfg(target_os = "macos")]
fn tap_enabled() -> bool {
    let Some(handles) = current_tap() else {
        return false;
    };
    // safe：handles.tap 是本进程创建且尚未释放的 Mach port
    unsafe { CGEventTapIsEnabled(handles.tap as *mut std::ffi::c_void) }
}

/// 替换当前 tap 记录，返回旧值
#[cfg(target_os = "macos")]
fn set_current_tap(handles: Option<TapHandles>) -> Option<TapHandles> {
    let mut guard = match TAP_SLOT.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    std::mem::replace(&mut *guard, handles)
}

#[cfg(target_os = "macos")]
fn current_tap() -> Option<TapHandles> {
    let guard = match TAP_SLOT.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    guard
        .as_ref()
        .map(|handles| TapHandles {
            tap: handles.tap,
            source: handles.source,
        })
}

fn log_tap_problem(message: &str) {
    if !TAP_WARNED.swap(true, Ordering::Relaxed) {
        eprintln!("{message}");
    }
}

fn log_tap_recovered() {
    if TAP_WARNED.swap(false, Ordering::Relaxed) {
        eprintln!("[hook] 事件 tap 已挂到主线程 run loop");
    }
}

// ==================== 事件处理（主线程） ====================

fn handle_hook_event(app: tauri::AppHandle, ev: HookEvent) {
    let task_app = app.clone();
    let _ = app.run_on_main_thread(move || match ev.tag.as_str() {
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
    // 轮询等剪贴板就绪：Cmd+C 的拷贝是异步落盘的，单次读取会在竞态下拿到空值
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

    // 剪贴板为空 → 不弹窗（系统 Cmd+C 无可复制内容时同样不动作；
    // 同文本重复 Cmd+C+C 由前端 lastTextRef 直接重看上次翻译，无需后端缓存）
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
    let _ = window.emit(
        "show-translate",
        serde_json::json!({ "text": text }),
    );
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

/// 弹窗/toast 锚点定位（逻辑坐标 px,py；圆角内退 CUT_INSET + 越界按光标所在屏钳制）。
///
/// 光标位置**只从主线程实时读取**：`cursor_position()` 底层是 macOS
/// `NSEvent.mouseLocation`（物理像素、左上原点）。早期版本靠监听鼠标移动缓存坐标，
/// 但鼠标未动过时缓存是空的 → 弹窗跑到屏幕左上角；而且 MouseMoved 放在主线程
/// 回调里属于纯浪费的开销（每秒可达上千次）。实时读取失败才放弃定位。
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

// ==================== 规则构建与快捷键解析 ====================

/// 按当前配置构建规则表；空快捷键的项直接跳过
fn build_rules(config: &ShortcutConfig) -> HashMap<String, Rule> {
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
fn parse_spec(spec: &str) -> (u8, Vec<KeyMappingId>) {
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

// ====================「输入监控」授权 ====================

/// ListenOnly tap 的门禁是 `kTCCServiceListenEvent`（系统设置里的「输入监控」），
/// 不是「辅助功能」。未授权时系统会静默丢弃键盘事件；因为本模块的 mask 只申请了
/// 键盘三类事件。
///
/// # 判授权：三个信号，可靠性递增
///
/// - `CGEventTapCreate` 的返回值：**不是**授权信号。实测未授权时它照样返回
///   非 NULL，只是系统不再投递事件。
/// - `CGPreflightListenEventAccess()`：**也不是**可靠信号。TCC 只看「有没有
///   这条 app 的允许记录」，不校验该记录的 csreq 是否匹配当前二进制。实测
///   csreq 不匹配（旧版本残留的允许记录 + 重新打包后 cdhash 变了）时它照样
///   返回 true，而事件一个都收不到 —— 这正是用户「明明授权了却没反应」的成因。
/// - `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)`：**可靠**。这是 IOKit 实际
///   用的那套鉴权查询，会比对 csreq。实测在本应用进程内（lldb attach 调用），
///   授权记录绑着旧 cdhash 时它返回 `kIOHIDAccessTypeUnknown`（2）—— 正好是
///   「csreq 对不上、无法确定」的特征，与事件一个都收不到的现象吻合。
///
/// 即便如此仍保留 `HookStatusInner::key_events` 作兜底：本次会话一旦真收到过
/// 事件，就是授权有效的铁证，前端据此绝不误报故障。
///
/// 拿到授权的唯一办法是让用户在系统设置里把开关**关掉再打开**，迫使 tccd
/// 按当前二进制的签名重写授权记录。
///
/// mask 保持 `KeyDown|KeyUp|FlagsChanged` 只是为了少申请权限面，与授权判据无关。
#[cfg(target_os = "macos")]
mod listen_event_access {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightListenEventAccess() -> bool;
        fn CGRequestListenEventAccess();
    }

    // `IOHIDCheckAccess` 与相关枚举。
    //
    // 声明来源：公开 SDK 头 `IOKit.framework/Headers/hidsystem/IOHIDLib.h`
    //（`IOHIDCheckAccess` 标注 `__OSX_AVAILABLE(10.15)`，**不是**私有 API）。
    // 框架需要显式 link —— app 二进制本身没有对它的未定义引用（`nm -u` 查不到），
    // 它是被 CoreGraphics 传递依赖进来的。
    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        // 查询进程在某类访问上的授权状态。
        //
        // - `request_type`：`kIOHIDRequestTypePostEvent=0`、`kIOHIDRequestTypeListenEvent=1`
        // - 返回：`kIOHIDAccessTypeGranted=0`、`Denied=1`、`Unknown=2`
        fn IOHIDCheckAccess(request_type: i32) -> i32;
    }

    /// IOKit 的访问请求类型（见 `IOHIDLib.h` 的 `IOHIDRequestType`）
    const REQUEST_TYPE_LISTEN_EVENT: i32 = 1;

    /// IOKit 的授权状态（见 `IOHIDLib.h` 的 `IOHIDAccessType`）
    const ACCESS_TYPE_GRANTED: i32 = 0;

    /// 授权是否**确定**有效。这是唯一会比对 csreq 的信号。
    pub fn granted() -> bool {
        // safe：纯查询当前进程的授权状态，无副作用、不修改任何状态
        let raw = unsafe { IOHIDCheckAccess(REQUEST_TYPE_LISTEN_EVENT) };
        // `Unknown`（2）说明 csreq 与当前二进制不匹配、TCC 无法判定 —— 按未授权处理，
        // 否则用户会看到「有授权却没反应」且没有任何提示
        raw == ACCESS_TYPE_GRANTED
    }

    /// TCC 里**已无**本 app 的记录时才需要弹窗（`CGPreflightListenEventAccess`
    /// 答 false 才成立），否则 macOS 不会弹窗、只会静默比对 csreq 失败。
    pub fn need_request_dialog() -> bool {
        // safe：查询当前进程的授权状态，无副作用
        !unsafe { CGPreflightListenEventAccess() }
    }

    pub fn request() {
        // safe：触发系统授权弹窗
        unsafe { CGRequestListenEventAccess() }
    }
}

// ==================== CoreGraphics / CoreFoundation FFI ====================

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventTapCreate(
        tap: u32,
        place: u32,
        options: u32,
        events_of_interest: u64,
        callback: unsafe extern "C" fn(
            *mut std::ffi::c_void,
            u32,
            *mut std::ffi::c_void,
            *mut std::ffi::c_void,
        ) -> *mut std::ffi::c_void,
        user_info: *mut std::ffi::c_void,
    ) -> *mut std::ffi::c_void;
    fn CGEventTapEnable(tap: *mut std::ffi::c_void, enable: bool);
    fn CGEventTapIsEnabled(tap: *mut std::ffi::c_void) -> bool;
    fn CGEventGetIntegerValueField(event: *mut std::ffi::c_void, field: u32) -> i64;
    fn CGEventGetFlags(event: *mut std::ffi::c_void) -> u64;
}

#[cfg(target_os = "macos")]
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRunLoopGetMain() -> *mut std::ffi::c_void;
    fn CFRunLoopAddSource(
        run_loop: *mut std::ffi::c_void,
        source: *mut std::ffi::c_void,
        mode: *const std::ffi::c_void,
    );
    fn CFRunLoopRemoveSource(
        run_loop: *mut std::ffi::c_void,
        source: *mut std::ffi::c_void,
        mode: *const std::ffi::c_void,
    );
    fn CFMachPortCreateRunLoopSource(
        allocator: *mut std::ffi::c_void,
        port: *mut std::ffi::c_void,
        order: isize,
    ) -> *mut std::ffi::c_void;
    fn CFRelease(cf: *const std::ffi::c_void);
    /// 伪模式名，加入它的 source 会在所有常用模式（含 Cocoa 用的 default mode）生效
    static kCFRunLoopCommonModes: *const std::ffi::c_void;
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 设置里显示的「⌘+C+C」必须能落到 tap 上真正比对的按键身份上
    #[test]
    fn default_shortcuts_build_expected_rules() {
        let rules = build_rules(&ShortcutConfig::default());
        assert_eq!(rules.len(), 2);

        let key_c = parse_key("C").expect("C 必须可解析");
        let key_v = parse_key("V").expect("V 必须可解析");
        assert_ne!(key_c, key_v, "C 与 V 必须映射到不同按键");

        let translate = &rules["TRANSLATE"];
        assert_eq!(translate.required_modifiers, MOD_META);
        assert_eq!(translate.key_sequence, vec![key_c, key_c]);

        let show_main = &rules["SHOW_MAIN"];
        assert_eq!(show_main.required_modifiers, MOD_META);
        assert_eq!(show_main.key_sequence, vec![key_c, key_v]);
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

    #[test]
    fn flags_map_to_modifier_bits() {
        assert_eq!(modifiers_from_flags(0), 0);
        assert_eq!(modifiers_from_flags(FLAG_COMMAND), MOD_META);
        assert_eq!(modifiers_from_flags(FLAG_COMMAND | FLAG_SHIFT), MOD_META | MOD_SHIFT);
        assert_eq!(
            modifiers_from_flags(FLAG_CONTROL | FLAG_COMMAND | FLAG_SHIFT | FLAG_ALT),
            MOD_CTRL | MOD_META | MOD_SHIFT | MOD_ALT
        );
    }

    /// 虚拟键码表必须与 W3 code 名指向同一个按键身份（tap 侧与设置页侧对得上）
    #[test]
    fn virtual_keycode_table_matches_key_names() {
        assert_eq!(key_entry(0).map(|e| e.id), parse_key("A"));
        assert_eq!(key_entry(8).map(|e| e.id), parse_key("C"));
        assert_eq!(key_entry(29).map(|e| e.id), parse_key("0"));
        assert_eq!(key_entry(123).map(|e| e.id), parse_key("ARROWLEFT"));
        assert!(key_entry(8).is_some_and(|e| !e.is_modifier));
    }

    /// ⌘ / ⌃ / ⇧ / ⌥ 必须被识别为修饰键（含左右两侧），否则会被当成普通键参与序列匹配
    #[test]
    fn modifier_keycodes_are_flagged_as_modifiers() {
        // ⌘ 54/55、⇧ 56/60、⌥ 58/61、⌃ 59/62
        for code in [54, 55, 56, 60, 58, 61, 59, 62] {
            assert!(
                key_entry(code).is_some_and(|e| e.is_modifier),
                "虚拟键码 {code} 应被识别为修饰键"
            );
        }
    }

    /// CapsLock 虽也驱动 FlagsChanged，但不是 MOD_* 修饰键：用户在设置里显式配置它时
    /// 必须能生效。（Fn 键 63 在键码表里不存在，`parse_key` 会自然跳过。）
    #[test]
    fn caps_lock_is_not_treated_as_modifier() {
        assert!(key_entry(57).is_some_and(|e| !e.is_modifier));
    }

    /// 导航键（Home/End/PageUp/PageDown/Delete）在 macOS 上是有效虚拟键码，
    /// 旧实现用 rdev 自带映射表时这些键全部落到 Unknown → 设了永远不触发
    #[test]
    fn navigation_keys_resolve_to_real_virtual_keycodes() {
        for (code, name) in [
            (115u16, "HOME"),
            (119, "END"),
            (116, "PAGEUP"),
            (121, "PAGEDOWN"),
            (117, "DELETE"),
        ] {
            assert_eq!(
                key_entry(code).map(|e| e.id),
                parse_key(name),
                "{name} 应有可用的虚拟键码映射"
            );
        }
    }

    #[test]
    fn unknown_virtual_keycode_has_no_entry() {
        assert!(key_entry(999).is_none());
    }

    /// 「按住 ⌘ + 依次 C、C」应命中 TRANSLATE；中途松掉 ⌘ 则不命中
    #[test]
    fn sequence_match_requires_all_modifiers_held() {
        let key_c = parse_key("C").unwrap();
        let rules = Arc::new(RwLock::new(build_rules(&ShortcutConfig::default())));

        let tag = match_key_down(&rules, key_c, MOD_META);
        assert_eq!(tag, None, "第一次按下只推进一半序列");
        let tag = match_key_down(&rules, key_c, MOD_META);
        assert_eq!(tag.as_deref(), Some("TRANSLATE"));

        match_key_down(&rules, key_c, MOD_META);
        // 松开 ⌘ → 修饰键前提不满足 → 进度清零
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
}
