//! 全局快捷键监听：rdev 事件 tap 直接跑在**主进程内的后台线程**。
//!
//! v0.1.2 重构，替换旧的 `keyboard-hook` 子进程方案，三个动因：
//!
//! 1. **授权归属**（修bug 主因）：旧方案里真正创建 CGEventTap 的是独立可执行文件
//!    `Contents/MacOS/keyboard-hook`，macOS 的 TCC 授权绑定到那个**子二进制**，
//!    主 app 授权不覆盖它；且 app 是 ad-hoc 签名（无 Developer ID），每次重新打包
//!    cdhash 都变 → 授权条目对不上，快捷键完全无反应。进程内 tap 只剩 app 一个代码身份。
//! 2. **孤儿进程**：旧方案主进程退出后子进程不会被回收（实测泄漏 PPID=1 的僵尸 hook），
//!    且看门狗只 kill 自己 tracked 的那个。进程内线程随进程一起消失。
//! 3. **规则热更新**：rdev 的 tap 一旦启动无法从外部停止（内部 `CFRunLoopRun`），
//!    所以旧方案每次改快捷键都要 kill + 重拉子进程。现在规则放在共享表里整体替换即可。
//!
//! 旧方案的 PING/PONG 心跳用于跨进程探测「进程活着但 tap 失灵」；进程内不需要跨进程
//! 保活，改为直接暴露诊断状态（是否在监听 / 是否获得输入监控授权 / 按键事件计数），
//! 由设置页展示，避免再次出现「静默失败、无人知晓」。

use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{Emitter, LogicalPosition, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::app::config::{extract_keys_from_shortcut, ShortcutConfig};

/// 连击序列的两次按键最大间隔
const SEQ_WINDOW: Duration = Duration::from_millis(500);

/// tap 创建失败后的重试间隔（授权由用户手动给，需要留出授权生效的时间）
const RELISTEN_RETRY: Duration = Duration::from_secs(5);

/// 圆角补偿：卡片 rounded-xl=12px，圆弧使可见角尖相对理想直角内退 cut = r − r/√2 ≈ 3.51px
const CUT_INSET: f64 = 12.0 * (1.0 - std::f64::consts::FRAC_1_SQRT_2);

/// 单条快捷键规则。match_index / last_press 是运行期匹配状态，仅由监听线程修改。
pub struct Rule {
    required_modifiers: Vec<rdev::Key>,
    key_sequence: Vec<rdev::Key>,
    match_index: usize,
    last_press: Instant,
}

/// managed state：tag（`TRANSLATE` / `SHOW_MAIN`）→ 规则。设置变更时整体替换。
pub struct HookRules(pub Arc<RwLock<HashMap<String, Rule>>>);

/// managed state：诊断快照数据源。
pub struct HookStatus(pub Arc<HookStatusInner>);

pub struct HookStatusInner {
    /// 监听线程是否正在运行
    pub listening: AtomicBool,
    /// macOS「输入监控」授权是否已授予；非 macOS 恒为 true
    pub listen_event: AtomicBool,
    /// 累计收到的按键事件数（判断 tap 是否真的在投递事件）
    pub key_events: AtomicU64,
}

/// managed state：保证监听线程只启动一次。
pub struct HookStarted(pub AtomicBool);

/// 传给前端的状态快照
#[derive(Serialize, Clone, Copy)]
pub struct HookStatusSnapshot {
    /// 监听线程是否在运行
    pub listening: bool,
    /// 是否已获得「输入监控」授权（未授权时系统不投递按键，快捷键必然无反应）
    pub listen_event: bool,
    /// 已接收的按键事件数
    pub key_events: u64,
}

/// 监听线程 → 消费线程的内部事件
struct HookEvent {
    tag: String,
    x: f64,
    y: f64,
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

/// 启动监听（幂等）：读当前快捷键配置填充规则表，然后拉起监听 + 消费两个线程
pub fn start_keyboard_hook(app: &tauri::AppHandle) {
    let config = app.state::<Mutex<ShortcutConfig>>().lock().unwrap().clone();
    let rules = build_rules(&config);
    let count = rules.len();
    *app.state::<HookRules>().0.write().unwrap() = rules;
    ensure_listener(app);
    eprintln!("[hook] 全局监听已启动，规则 {count} 条");
}

/// 设置变更后热更新规则：**不重启监听**（rdev 的 tap 无法从外部停止）
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

// ==================== 线程编排 ====================

/// 保证监听 + 消费线程已存在（重复调用无副作用）
fn ensure_listener(app: &tauri::AppHandle) {
    if app.state::<HookStarted>().0.swap(true, Ordering::SeqCst) {
        return;
    }

    let (tx, rx) = mpsc::channel::<HookEvent>();
    let consumer_app = app.clone();
    // 消费线程：clipboard / 窗口操作必须在主线程执行，这里只负责转发
    thread::spawn(move || {
        for ev in rx {
            handle_hook_event(consumer_app.clone(), ev);
        }
    });

    let rules = app.state::<HookRules>().0.clone();
    let status = app.state::<HookStatus>().0.clone();
    thread::spawn(move || listen_loop(rules, status, tx));
}

/// 监听线程主体：授权检查 → 建立 tap → 事件匹配。tap 建失败时按固定间隔重试，
/// 用户在系统设置里授权后无需重启应用即可恢复。
fn listen_loop(
    rules: Arc<RwLock<HashMap<String, Rule>>>,
    status: Arc<HookStatusInner>,
    tx: Sender<HookEvent>,
) {
    loop {
        let granted = listen_event_access::granted();
        status.listen_event.store(granted, Ordering::Relaxed);
        if !granted {
            eprintln!(
                "[hook] 未获得 macOS「输入监控」授权：系统不会把按键事件投递给本进程，\
                 快捷键将无反应。授权路径：系统设置 → 隐私与安全性 → 输入监控 → 勾选本应用"
            );
            // 触发系统自带授权弹窗（文案由 macOS 本地化，无需前端多语言适配）
            listen_event_access::request();
        }

        status.listening.store(true, Ordering::Relaxed);
        let callback = make_callback(rules.clone(), status.clone(), tx.clone());
        let result = rdev::listen(callback);
        status.listening.store(false, Ordering::Relaxed);

        match result {
            Ok(()) => {
                eprintln!("[hook] 监听循环意外结束，重建中");
            }
            Err(e) => {
                eprintln!("[hook] 创建事件 tap 失败: {e:?}，{RELISTEN_RETRY:?} 后重试");
            }
        }
        thread::sleep(RELISTEN_RETRY);
    }
}

/// 构造 rdev 事件回调：modifier 位 + 按键序列匹配，命中即投递事件
fn make_callback(
    rules: Arc<RwLock<HashMap<String, Rule>>>,
    status: Arc<HookStatusInner>,
    tx: Sender<HookEvent>,
) -> impl FnMut(rdev::Event) + 'static {
    // [ctrl, meta, shift, alt]
    let mut modifiers = [false; 4];
    let mut pressed_keys: HashSet<rdev::Key> = HashSet::new();
    let mut last_mouse_pos: Option<(f64, f64)> = None;

    move |event| match event.event_type {
        rdev::EventType::KeyPress(key) => {
            status.key_events.fetch_add(1, Ordering::Relaxed);

            if is_modifier_key(&key) {
                set_modifier(&mut modifiers, &key, true);
                return;
            }
            if pressed_keys.contains(&key) {
                return;
            }
            pressed_keys.insert(key);

            let now = Instant::now();
            let mut guard = match rules.write() {
                Ok(g) => g,
                Err(poisoned) => poisoned.into_inner(),
            };
            for (tag, rule) in guard.iter_mut() {
                if rule.key_sequence.is_empty() || !all_required_held(rule, &modifiers) {
                    rule.match_index = 0;
                    continue;
                }
                if rule.match_index >= 1 && now.duration_since(rule.last_press) > SEQ_WINDOW {
                    rule.match_index = 0;
                }
                if rule.match_index >= rule.key_sequence.len() {
                    rule.match_index = 0;
                }

                if key == rule.key_sequence[rule.match_index] {
                    rule.last_press = now;
                    rule.match_index += 1;

                    if rule.match_index >= rule.key_sequence.len() {
                        rule.match_index = 0;
                        let (x, y) = last_mouse_pos.unwrap_or((0.0, 0.0));
                        let _ = tx.send(HookEvent {
                            tag: tag.clone(),
                            x,
                            y,
                        });
                    }
                } else {
                    rule.match_index = 0;
                }
            }
        }
        rdev::EventType::KeyRelease(key) => {
            if is_modifier_key(&key) {
                set_modifier(&mut modifiers, &key, false);
            } else {
                pressed_keys.remove(&key);
            }
        }
        rdev::EventType::MouseMove { x, y } => {
            last_mouse_pos = Some((x, y));
        }
        _ => {}
    }
}

// ==================== 事件处理（主线程） ====================

fn handle_hook_event(app: tauri::AppHandle, ev: HookEvent) {
    let tag = ev.tag.clone();
    let (cursor_x, cursor_y) = (ev.x, ev.y);
    // macOS 的剪贴板/窗口操作必须发生在主线程；这里在后台线程，直接调会静默失效
    let task_app = app.clone();
    let _ = app.run_on_main_thread(move || {
        match tag.as_str() {
            "TRANSLATE" => handle_translate(&task_app, cursor_x, cursor_y),
            "SHOW_MAIN" => {
                if let Some(window) = task_app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        }
    });
}

fn handle_translate(app: &tauri::AppHandle, cursor_x: f64, cursor_y: f64) {
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
        show_empty_clipboard_toast(app, cursor_x, cursor_y);
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
    if let Some((px, py)) = anchor_position(app, &window, cursor_x, cursor_y, size, CUT_INSET) {
        let _ = window.set_position(LogicalPosition::new(px, py));
    }
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.emit(
        "show-translate",
        serde_json::json!({ "text": text, "cursorX": cursor_x, "cursorY": cursor_y }),
    );
}

/// 空剪贴板轻提示：与划词弹窗同款跟随生成，约 1.2 秒自动消失
fn show_empty_clipboard_toast(app: &tauri::AppHandle, cursor_x: f64, cursor_y: f64) {
    let Some(toast) = app.get_webview_window("toast") else {
        return;
    };
    let size = toast
        .inner_size()
        .unwrap_or(tauri::PhysicalSize::new(280, 64));
    if let Some((px, py)) = anchor_position(app, &toast, cursor_x, cursor_y, size, CUT_INSET) {
        let _ = toast.set_position(LogicalPosition::new(px, py));
    }
    let _ = toast.show();
    thread::spawn(move || {
        thread::sleep(Duration::from_millis(1200));
        let _ = toast.hide();
    });
}

/// 弹窗/toast 锚点定位（逻辑坐标 px,py，圆角内退 CUT_INSET + 越界按所在屏钳制）。
///
/// 光标坐标以「主进程实时读取」为准：`cursor_position()` 底层是 macOS
/// `NSEvent.mouseLocation`（物理像素、左上原点），不依赖 tap 累积的
/// `last_mouse_pos`——后者在启动后鼠标未移动过时为 None → (0,0)，
/// 会导致 toast/弹窗锚到屏幕左上角而不是跟随鼠标。
/// 实时读取失败时回退到 tap 事件携带坐标（逻辑单位，兼容旧行为）。
fn anchor_position(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    hook_x: f64,
    hook_y: f64,
    size: tauri::PhysicalSize<u32>,
    cut_inset: f64,
) -> Option<(f64, f64)> {
    // 1) 实时光标（物理像素，全局左上原点）；失败则用 tap 坐标
    let live = window.cursor_position().ok();
    let (probe_x, probe_y) = live.map(|p| (p.x, p.y)).unwrap_or((hook_x, hook_y));
    // 2) 光标所在监视器优先（隐藏窗口的 current_monitor 可能停留在旧显示器）
    let monitor = app
        .monitor_from_point(probe_x, probe_y)
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten())?;
    let scale = monitor.scale_factor();
    let mx = monitor.position().x as f64 / scale;
    let my = monitor.position().y as f64 / scale;
    let mw = monitor.size().width as f64 / scale;
    let mh = monitor.size().height as f64 / scale;
    // 3) 光标在该监视器尺度下的逻辑坐标；窗口逻辑尺寸同口径折算
    let (cxl, cyl) = live
        .map(|p| (p.x / scale, p.y / scale))
        .unwrap_or((hook_x, hook_y));
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

// ==================== 规则构建与按键解析 ====================

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

/// "meta:C,C" → ([MetaLeft], [KeyC, KeyC])
fn parse_spec(spec: &str) -> (Vec<rdev::Key>, Vec<rdev::Key>) {
    let (mod_part, key_part) = match spec.find(':') {
        Some(pos) => (&spec[..pos], &spec[pos + 1..]),
        None => ("", spec),
    };

    let mut required_modifiers: Vec<rdev::Key> = Vec::new();
    for raw in mod_part.split(',') {
        let parsed = match raw.trim().to_lowercase().as_str() {
            "" => None,
            "ctrl" | "control" => Some(rdev::Key::ControlLeft),
            "meta" | "command" => Some(rdev::Key::MetaLeft),
            "shift" => Some(rdev::Key::ShiftLeft),
            "alt" => Some(rdev::Key::Alt),
            _ => None,
        };
        // 去重：`⌘+K+⌘+K` 这类录制结果会抽出重复的 meta
        if let Some(key) = parsed {
            if !required_modifiers.contains(&key) {
                required_modifiers.push(key);
            }
        }
    }

    let key_sequence: Vec<rdev::Key> = key_part
        .split(',')
        .filter(|s| !s.trim().is_empty())
        .filter_map(|s| parse_key(s.trim()))
        .collect();

    (required_modifiers, key_sequence)
}

fn set_modifier(modifiers: &mut [bool; 4], key: &rdev::Key, pressed: bool) {
    match key {
        rdev::Key::ControlLeft | rdev::Key::ControlRight => modifiers[0] = pressed,
        rdev::Key::MetaLeft | rdev::Key::MetaRight => modifiers[1] = pressed,
        rdev::Key::ShiftLeft | rdev::Key::ShiftRight => modifiers[2] = pressed,
        rdev::Key::Alt | rdev::Key::AltGr => modifiers[3] = pressed,
        _ => {}
    }
}

fn modifier_held(modifiers: &[bool; 4], modifier: &rdev::Key) -> bool {
    // [ctrl, meta, shift, alt]
    match modifier {
        rdev::Key::ControlLeft | rdev::Key::ControlRight => modifiers[0],
        rdev::Key::MetaLeft | rdev::Key::MetaRight => modifiers[1],
        rdev::Key::ShiftLeft | rdev::Key::ShiftRight => modifiers[2],
        rdev::Key::Alt | rdev::Key::AltGr => modifiers[3],
        _ => false,
    }
}

fn all_required_held(rule: &Rule, modifiers: &[bool; 4]) -> bool {
    rule.required_modifiers
        .iter()
        .all(|m| modifier_held(modifiers, m))
}

fn is_modifier_key(key: &rdev::Key) -> bool {
    matches!(
        key,
        rdev::Key::ControlLeft
            | rdev::Key::ControlRight
            | rdev::Key::MetaLeft
            | rdev::Key::MetaRight
            | rdev::Key::ShiftLeft
            | rdev::Key::ShiftRight
            | rdev::Key::Alt
            | rdev::Key::AltGr
    )
}

fn parse_key(key_str: &str) -> Option<rdev::Key> {
    let upper = key_str.to_uppercase();
    let key = match upper.as_str() {
        "A" => rdev::Key::KeyA,
        "B" => rdev::Key::KeyB,
        "C" => rdev::Key::KeyC,
        "D" => rdev::Key::KeyD,
        "E" => rdev::Key::KeyE,
        "F" => rdev::Key::KeyF,
        "G" => rdev::Key::KeyG,
        "H" => rdev::Key::KeyH,
        "I" => rdev::Key::KeyI,
        "J" => rdev::Key::KeyJ,
        "K" => rdev::Key::KeyK,
        "L" => rdev::Key::KeyL,
        "M" => rdev::Key::KeyM,
        "N" => rdev::Key::KeyN,
        "O" => rdev::Key::KeyO,
        "P" => rdev::Key::KeyP,
        "Q" => rdev::Key::KeyQ,
        "R" => rdev::Key::KeyR,
        "S" => rdev::Key::KeyS,
        "T" => rdev::Key::KeyT,
        "U" => rdev::Key::KeyU,
        "V" => rdev::Key::KeyV,
        "W" => rdev::Key::KeyW,
        "X" => rdev::Key::KeyX,
        "Y" => rdev::Key::KeyY,
        "Z" => rdev::Key::KeyZ,
        "0" => rdev::Key::Num0,
        "1" => rdev::Key::Num1,
        "2" => rdev::Key::Num2,
        "3" => rdev::Key::Num3,
        "4" => rdev::Key::Num4,
        "5" => rdev::Key::Num5,
        "6" => rdev::Key::Num6,
        "7" => rdev::Key::Num7,
        "8" => rdev::Key::Num8,
        "9" => rdev::Key::Num9,
        "F1" => rdev::Key::F1,
        "F2" => rdev::Key::F2,
        "F3" => rdev::Key::F3,
        "F4" => rdev::Key::F4,
        "F5" => rdev::Key::F5,
        "F6" => rdev::Key::F6,
        "F7" => rdev::Key::F7,
        "F8" => rdev::Key::F8,
        "F9" => rdev::Key::F9,
        "F10" => rdev::Key::F10,
        "F11" => rdev::Key::F11,
        "F12" => rdev::Key::F12,
        "SPACE" => rdev::Key::Space,
        "ENTER" => rdev::Key::Return,
        "ESCAPE" => rdev::Key::Escape,
        "TAB" => rdev::Key::Tab,
        "BACKSPACE" => rdev::Key::Backspace,
        "DELETE" => rdev::Key::Delete,
        "UP" => rdev::Key::UpArrow,
        "DOWN" => rdev::Key::DownArrow,
        "LEFT" => rdev::Key::LeftArrow,
        "RIGHT" => rdev::Key::RightArrow,
        "PAGEUP" => rdev::Key::PageUp,
        "PAGEDOWN" => rdev::Key::PageDown,
        "HOME" => rdev::Key::Home,
        "END" => rdev::Key::End,
        _ => return None,
    };
    Some(key)
}

// ====================「输入监控」授权 ====================

/// rdev 用的是 **ListenOnly** tap，macOS 对应的门禁是 `kTCCServiceListenEvent`
/// （系统设置里的「输入监控」），不是「辅助功能」。未授权时系统会静默丢弃
/// 键盘类事件（tap 仍能建立、鼠标类事件仍可监听），表现为**快捷键完全无反应**。
#[cfg(target_os = "macos")]
mod listen_event_access {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightListenEventAccess() -> bool;
        fn CGRequestListenEventAccess();
    }

    pub fn granted() -> bool {
        unsafe { CGPreflightListenEventAccess() }
    }

    pub fn request() {
        unsafe { CGRequestListenEventAccess() }
    }
}

#[cfg(not(target_os = "macos"))]
mod listen_event_access {
    pub fn granted() -> bool {
        true
    }

    pub fn request() {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_spec_reads_modifiers_and_sequence() {
        let (mods, keys) = parse_spec("meta:C,C");
        assert_eq!(mods, vec![rdev::Key::MetaLeft]);
        assert_eq!(keys, vec![rdev::Key::KeyC, rdev::Key::KeyC]);
    }

    #[test]
    fn parse_spec_reads_multiple_modifiers() {
        let (mods, keys) = parse_spec("ctrl,shift,alt:K,K");
        assert_eq!(
            mods,
            vec![rdev::Key::ControlLeft, rdev::Key::ShiftLeft, rdev::Key::Alt]
        );
        assert_eq!(keys, vec![rdev::Key::KeyK, rdev::Key::KeyK]);
    }

    /// 录制器可能产出 `⌘+K+⌘+K`（`extract_keys_from_shortcut` 抽出 `meta,meta:K,K`），
    /// 重复 modifier 必须去重，否则序列匹配前提校验会做无意义的重复判断
    #[test]
    fn duplicated_modifiers_are_deduped() {
        let (mods, keys) = parse_spec("meta,meta:K,K");
        assert_eq!(mods, vec![rdev::Key::MetaLeft]);
        assert_eq!(keys, vec![rdev::Key::KeyK, rdev::Key::KeyK]);
    }

    #[test]
    fn parse_spec_without_modifier_part() {
        let (mods, keys) = parse_spec("F5");
        assert!(mods.is_empty());
        assert_eq!(keys, vec![rdev::Key::F5]);
    }

    #[test]
    fn unknown_key_is_dropped() {
        assert_eq!(parse_key("NOT_A_KEY"), None);
        assert_eq!(parse_key("tab"), Some(rdev::Key::Tab));
        assert_eq!(parse_key("Enter"), Some(rdev::Key::Return));
    }

    /// 设置里显示的「⌘+C+C」必须能落到 tap 上真正比对的 rdev::Key 组合
    #[test]
    fn default_shortcuts_build_expected_rules() {
        let rules = build_rules(&ShortcutConfig::default());
        assert_eq!(rules.len(), 2);

        let translate = &rules["TRANSLATE"];
        assert_eq!(translate.required_modifiers, vec![rdev::Key::MetaLeft]);
        assert_eq!(
            translate.key_sequence,
            vec![rdev::Key::KeyC, rdev::Key::KeyC]
        );

        let show_main = &rules["SHOW_MAIN"];
        assert_eq!(show_main.required_modifiers, vec![rdev::Key::MetaLeft]);
        assert_eq!(
            show_main.key_sequence,
            vec![rdev::Key::KeyC, rdev::Key::KeyV]
        );
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
    fn modifier_press_does_not_disturb_sequence_progress() {
        let mut modifiers = [false; 4];
        set_modifier(&mut modifiers, &rdev::Key::MetaLeft, true);
        assert!(modifier_held(&modifiers, &rdev::Key::MetaRight));
        set_modifier(&mut modifiers, &rdev::Key::MetaLeft, false);
        assert!(!modifier_held(&modifiers, &rdev::Key::MetaLeft));
    }
}