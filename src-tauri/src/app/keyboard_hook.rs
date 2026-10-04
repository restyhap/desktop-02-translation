//! macOS 全局快捷键平台层：自建 **ListenOnly** 事件 tap，挂在**进程主线程的 run loop** 上。
//!
//! 本文件只在 macOS 编译（见 `app/mod.rs` 的平台路由）。**平台中立**的部分 —— 规则表、
//! 键位查表、序列匹配、命中后弹窗 —— 全在 `hook_core.rs`，这里只负责「把 macOS 的原生
//! 按键事件转成 `RawInput` 转发进去」与「回答装好了吗」。
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
//! Windows 的等价实现在 `keyboard_hook_windows.rs`（`WH_KEYBOARD_LL`），两侧对核心
//! 暴露**完全同名**的 API，`app/mod.rs` 按平台路由。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use keycode::KeyMapping;
use tauri::Manager;

use super::hook_core::{
    KeyEntry, KeyLookup, MOD_ALT, MOD_CTRL, MOD_META, MOD_SHIFT, RawInput, build_key_table,
    hook_status as core_hook_status, reload_rules as core_reload_rules,
    start_hook as core_start_hook,
};

// 诊断状态类型在核心里，平台层原样 re-export —— 上层（lib.rs / commands）无需平台分支
pub use super::hook_core::{
    HookRules, HookStarted, HookStatus, HookStatusInner, HookStatusSnapshot,
};

/// tap 失效后的重建间隔（授权由用户手动给，需要留出授权生效的时间）
const RELISTEN_RETRY: Duration = Duration::from_secs(5);

/// 健康检查间隔：轮询授权状态、确认 tap 还活着
const HEALTH_INTERVAL: Duration = Duration::from_secs(3);

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

/// `CGEventFlags` 的修饰键位。取值来自 SDK `IOLLEvent.h` 的 `NX_*MASK` 定义。
const FLAG_SHIFT: u64 = 0x0002_0000;
const FLAG_CONTROL: u64 = 0x0004_0000;
/// Option 键
const FLAG_ALT: u64 = 0x0008_0000;
/// Command（⌘）
const FLAG_COMMAND: u64 = 0x0010_0000;

/// macOS 虚拟键码上界（键码表容量；实际用到的最大键码 < 128，留足余量）
const MACOS_VIRTUAL_KEY_MAX: usize = 256;

/// 把事件 flags 折算成修饰键位掩码。FlagsChanged 事件携带的是**当前全部**修饰键
/// 状态，所以直接整体覆盖即可（`RawInput::Modifiers` 正是「整体覆盖」语义），不需要
/// 跟上次比较。
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

// ==================== 键码查表 ====================

static KEY_TABLE: OnceLock<Vec<Option<KeyEntry>>> = OnceLock::new();

/// macOS 虚拟键码 → `KeyEntry`。表在首次使用时构建一次（`keycode` crate 内部是几百
/// 臂的 `match`，每个事件都走一遍没必要）。
fn key_entry(code: u32) -> Option<KeyEntry> {
    KEY_TABLE
        .get_or_init(|| build_key_table(MACOS_VIRTUAL_KEY_MAX, |c| KeyMapping::Mac(c as u16)))
        .get(usize::try_from(code).ok()?)
        .copied()
        .flatten()
}

// ==================== 对外接口 ====================

/// 读取当前诊断状态（供 UI 展示「为什么没反应」）
pub fn hook_status(app: &tauri::AppHandle) -> HookStatusSnapshot {
    core_hook_status(app)
}

/// 启动监听（幂等）。**必须在主线程调用**（Tauri `setup` 阶段即在主线程）。
pub fn start_keyboard_hook(app: &tauri::AppHandle) {
    core_start_hook(app, key_entry as KeyLookup);
}

/// 设置变更后热更新规则：**不重建 tap**
pub fn reload_hook_rules(app: &tauri::AppHandle) {
    core_reload_rules(app, key_entry as KeyLookup);
}

/// 打开 macOS「输入监控」设置面板。
///
/// 深链分两个时代。实测 macOS 26.6.2：旧 URL **不会报错**（`open` 退出码仍为 0，
/// 系统设置也会被拉起），但会落到「通用」面板而非「输入监控」——这正是 0.1.2
/// 里用户点了按钮「没反应」的原因，且无法靠返回值/异常判断成败，只能按系统版本分流：
/// - macOS 13+（System Settings）：`com.apple.settings.PrivacySecurity.extension`
/// - macOS 12 及更早（System Preferences）：`com.apple.preferences.security`
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
fn macos_major_version() -> u32 {
    std::process::Command::new("sw_vers")
        .arg("-productVersion")
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .and_then(|text| text.split('.').next()?.trim().parse::<u32>().ok())
        .unwrap_or(13)
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

/// 平台层入口：建 tap + 起健康检查线程。macOS 恒返回 true（有实现）。
///
/// **首次调用方必须在主线程** —— `CGEventTapCreate` 的事件源要加到
/// `CFRunLoopGetMain()`，只有主线程的那个 run loop 会被 tao/Cocoa 主循环驱动。
pub fn install_raw_sink(app: &tauri::AppHandle, tx: Sender<RawInput>) -> bool {
    let _ = MAIN_THREAD.set(thread::current().id());
    assert!(
        on_main_thread(),
        "事件 tap 必须挂在主线程 run loop 上，install_raw_sink 只能在 setup 阶段首次调用"
    );

    let _ = TAP_CTX.set(TapContext {
        tx: Mutex::new(tx),
    });

    let status = app.state::<HookStatus>().0.clone();
    // 当前就在主线程，且事件循环尚未启动 —— 此时挂 source 最稳妥，
    // 之后由 tao/Cocoa 主循环顺带驱动。
    install_tap(&status);

    let health_app = app.clone();
    thread::spawn(move || health_loop(health_app, status));
    true
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

// ==================== 事件 tap 安装（主线程） ====================

/// 重建事件 tap 并挂到**主线程** run loop。调用方必须在主线程。
///
/// 入口有两处：`install_raw_sink`（setup 阶段，主线程同步调用）与健康检查线程
/// 通过 `run_on_main_thread` 回调。
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
        EVENT_FLAGS_CHANGED => ctx.push(RawInput::Modifiers(modifiers_from_flags(event_flags(event)))),
        EVENT_TAP_DISABLED_BY_TIMEOUT | EVENT_TAP_DISABLED_BY_USER_INPUT => {
            // 系统禁用了 tap：Apple 要求在回调里直接重新启用
            ctx.reenable_tap();
        }
        _ => {}
    }
    event
}

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

fn keycode_of(event: *mut std::ffi::c_void) -> u32 {
    // safe：event 由系统传入，非空
    unsafe { CGEventGetIntegerValueField(event, FIELD_KEYCODE) as u32 }
}

fn event_flags(event: *mut std::ffi::c_void) -> u64 {
    // safe：event 由系统传入，非空
    unsafe { CGEventGetFlags(event) }
}

/// 当前 tap 是否存在且处于启用状态
fn tap_enabled() -> bool {
    let Some(handles) = current_tap() else {
        return false;
    };
    // safe：handles.tap 是本进程创建且尚未释放的 Mach port
    unsafe { CGEventTapIsEnabled(handles.tap as *mut std::ffi::c_void) }
}

/// 替换当前 tap 记录，返回旧值
fn set_current_tap(handles: Option<TapHandles>) -> Option<TapHandles> {
    let mut guard = match TAP_SLOT.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    std::mem::replace(&mut *guard, handles)
}

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

// ==================== 测试 ====================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::hook_core::parse_key;

    /// 默认快捷键的**结构**断言在 `hook_core::tests`（那里才有 `Rule` 字段可见性）。
    /// 本模块只测 macOS 特有的两件事：flags → 修饰键位、虚拟键码表。

    #[test]
    fn flags_map_to_modifier_bits() {
        assert_eq!(modifiers_from_flags(0), 0);
        assert_eq!(modifiers_from_flags(FLAG_COMMAND), MOD_META);
        assert_eq!(
            modifiers_from_flags(FLAG_COMMAND | FLAG_SHIFT),
            MOD_META | MOD_SHIFT
        );
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
        assert!(key_entry(8).is_some_and(|e| e.modifier_bit == 0));
    }

    /// ⌘ / ⌃ / ⇧ / ⌥ 必须被识别为修饰键（含左右两侧），否则会被当成普通键参与序列匹配
    #[test]
    fn modifier_keycodes_are_flagged_as_modifiers() {
        // ⌘ 54/55、⇧ 56/60、⌥ 58/61、⌃ 59/62
        for (code, bit) in [
            (54u32, MOD_META),
            (55, MOD_META),
            (56, MOD_SHIFT),
            (60, MOD_SHIFT),
            (58, MOD_ALT),
            (61, MOD_ALT),
            (59, MOD_CTRL),
            (62, MOD_CTRL),
        ] {
            assert_eq!(
                key_entry(code).map(|e| e.modifier_bit),
                Some(bit),
                "虚拟键码 {code} 的修饰键位不对"
            );
        }
    }

    /// CapsLock 虽也驱动 FlagsChanged，但不是 MOD_* 修饰键：用户在设置里显式配置它时
    /// 必须能生效。（Fn 键 63 在键码表里不存在，`parse_key` 会自然跳过。）
    #[test]
    fn caps_lock_is_not_treated_as_modifier() {
        assert_eq!(key_entry(57).map(|e| e.modifier_bit), Some(0));
    }

    /// 导航键（Home/End/PageUp/PageDown/Delete）在 macOS 上是有效虚拟键码，
    /// 旧实现用 rdev 自带映射表时这些键全部落到 Unknown → 设了永远不触发
    #[test]
    fn navigation_keys_resolve_to_real_virtual_keycodes() {
        for (code, name) in [
            (115u32, "HOME"),
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
}