//! Windows 全局快捷键平台层：自建 **`WH_KEYBOARD_LL` 低级键盘钩子**，装在一条专用线程
//! 的消息循环上。
//!
//! 本文件只在 Windows 编译（见 `app/mod.rs` 的平台路由）。平台中立部分 —— 规则表、
//! 键位查表、序列匹配、命中后弹窗 —— 全在 `hook_core.rs`，这里只负责「把 Win32 原生
//! 按键事件转成 `RawInput` 转发进去」与「回答装好了吗」。
//!
//! # 为什么是 `WH_KEYBOARD_LL`，不是 `RegisterHotKey`
//!
//! `tauri-plugin-global-shortcut` 背后的 `global-hotkey` crate 用的是
//! `RegisterHotKey`，有两个致命限制：
//!
//! 1. 只能表达「**单键 + 修饰键**」的组合，表达不了 `Ctrl+C+C` 这种连击序列 ——
//!    而连击正是本应用划词的交互形态（第一次 Ctrl+C 复制、第二次命中规则读剪贴板）。
//! 2. `RegisterHotKey` 注册成功后系统**独占**该组合，其他进程再也收不到，按键被消费掉。
//!
//! `WH_KEYBOARD_LL` 是 macOS ListenOnly `CGEventTap` 的等价物：全局可见、回调里可以
//! 调 `CallNextHookEx` 放行（**不消费**），且 `KBDLLHOOKSTRUCT` 带着 `vkCode`。
//!
//! 另一个候选 `GetAsyncKeyState` 轮询被否掉了：轮询有修饰键状态竞态（按下 Ctrl 与
//! 按下 C 落在不同采样点会导致「按住了却匹配不上」），快速连击也会漏采样。
//!
//! # 三条与 macOS 对齐的约束
//!
//! 1. **只监听不拦截**：回调必须 `CallNextHookEx` 放行。吞掉按键就没有「系统真实执行
//!    第一次复制」，剪贴板永远是空的。
//! 2. **授权**：Windows 没有 macOS「输入监控」那样的 TCC 门禁，`WH_KEYBOARD_LL` 不需要
//!    任何提权，所以 `listen_event` 恒为 `true`、`open_listen_event_settings()` 恒为
//!    `false`（系统里没有对应的可授予权限面板）。
//! 3. **静默失败必须有 UI 侧可见提示**：钩子装不上 / 消息循环意外退出时
//!    `listening=false`，主页的 `ShortcutPermBanner` 会据此提示。
//!
//! # 必须知道的两个平台差异
//!
//! - **修饰键状态得自己维护**：`KBDLLHOOKSTRUCT` 里**没有**修饰键状态字段（macOS 的
//!   `FlagsChanged` 在 Windows 没有对应物），只能由钩子线程按 VK 累加，再用
//!   `RawInput::Modifiers` 的「整体覆盖」语义交给核心。
//! - **钩子线程必须自己先跑起消息循环**：`WH_KEYBOARD_LL` 的钩子回调只在**安装它的那个
//!   线程**上被调用，且要求该线程有消息泵。所以这里起一条专用线程装钩子并
//!   `GetMessageW` 循环，而不是在主线程装（主线程的 run loop 是 tao 的，不能拿来轮询）。
//! - Windows 会在钩子回调超过 `LowLevelHooksTimeout`（默认 300ms）时**静默摘掉钩子**。
//!   本实现回调只做「整表查键 + 无界 channel 非阻塞 send」，是微秒级，不会触发。

use std::sync::atomic::{AtomicBool, AtomicPtr, AtomicU8, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use tauri::Manager;

use super::hook_core::{
    KeyEntry, KeyLookup, RawInput, hook_status as core_hook_status, lookup_code, modifier_bit,
    reload_rules as core_reload_rules, start_hook as core_start_hook,
};

// 诊断状态类型在核心里，平台层原样 re-export —— 上层（lib.rs / commands）无需平台分支
pub use super::hook_core::{
    HookRules, HookStarted, HookStatus, HookStatusInner, HookStatusSnapshot,
};

/// 健康检查间隔：确认钩子线程还活着，意外退出就重建
const HEALTH_INTERVAL: Duration = Duration::from_secs(3);
/// 重建后的退避：钩子反复装不上时别空转刷日志
const RELISTEN_RETRY: Duration = Duration::from_secs(5);

// ==================== Win32 常量 ====================

/// `WH_KEYBOARD_LL`（见 `winuser.h`）：全局低级键盘钩子
const WH_KEYBOARD_LL: i32 = 13;
/// `HC_ACTION`：回调该处理这条消息
const HC_ACTION: i32 = 0;

const WM_KEYDOWN: u32 = 0x0100;
const WM_KEYUP: u32 = 0x0101;
const WM_SYSKEYDOWN: u32 = 0x0104;
const WM_SYSKEYUP: u32 = 0x0105;

/// Windows 虚拟键码上界。VK 是单字节常量（0x00..=0xFF），256 正好覆盖。
const WIN_VIRTUAL_KEY_MAX: usize = 256;

// ==================== 键码查表 ====================

static KEY_TABLE: OnceLock<Vec<Option<KeyEntry>>> = OnceLock::new();

/// Windows 虚拟键码 → W3 `KeyboardEvent.code` 键名。
///
/// **只在建表时调用**（一次分配无妨）；钩子回调里走整表索引，零分配。
fn vk_code_name(vk: u32) -> Option<String> {
    // 字母 A-Z：VK 0x41..=0x5A 与 ASCII 大写字母同值（winuser.h 文档保证）
    if (0x41..=0x5A).contains(&vk) {
        return Some(format!("Key{}", char::from_u32(vk)?));
    }
    // 主键区数字 0-9：VK 0x30..=0x39 与 ASCII 数字同值
    if (0x30..=0x39).contains(&vk) {
        return Some(format!("Digit{}", char::from_u32(vk)?));
    }
    // 小键盘数字与主键区共用同一批 DOM code
    if (0x60..=0x69).contains(&vk) {
        return Some(format!("Digit{}", char::from(b'0' + (vk - 0x60) as u8)));
    }
    // 功能键 F1-F12：VK 0x70..=0x7B
    if (0x70..=0x7B).contains(&vk) {
        return Some(format!("F{}", vk - 0x70 + 1));
    }
    let name = match vk {
        0x08 => "Backspace",
        0x09 => "Tab",
        // 小键盘 Enter 在 winuser.h 里就是 VK_RETURN（0x0D），不另设 VK，故不单列
        0x0D => "Enter",
        0x13 => "Pause",
        0x14 => "CapsLock",
        0x1B => "Escape",
        0x20 => "Space",
        0x21 => "PageUp",
        0x22 => "PageDown",
        0x23 => "End",
        0x24 => "Home",
        0x25 => "ArrowLeft",
        0x26 => "ArrowUp",
        0x27 => "ArrowRight",
        0x28 => "ArrowDown",
        0x2C => "PrintScreen",
        0x2D => "Insert",
        0x2E => "Delete",
        0x6A => "NumpadMultiply",
        0x6B => "NumpadAdd",
        0x6D => "NumpadSubtract",
        0x6E => "NumpadDecimal",
        0x6F => "NumpadDivide",

        // 修饰键：Windows 左右各一个 VK，但 `modifier_bit` 会把左右合并成同一位，
        // 所以左右映射到各自的 DOM code 后匹配结果一致。
        // 0x10/0x11/0x12 是「未分左右」的通用 VK（部分来源只给这三个），按左键处理。
        0x10 | 0xA0 => "ShiftLeft",
        0xA1 => "ShiftRight",
        0x11 | 0xA2 => "ControlLeft",
        0xA3 => "ControlRight",
        0x12 | 0xA4 => "AltLeft",
        0xA5 => "AltRight",
        0x5B => "MetaLeft", // VK_LWIN
        0x5C => "MetaRight", // VK_RWIN

        // 主键区 OEM 符号键（US 布局口径：VK 与符号本身无对应关系，按美式布局取值；
        // 其他布局下用户实际按下的仍是这些符号键）
        0xBA => "Semicolon",
        0xBB => "Equal",
        0xBC => "Comma",
        0xBD => "Minus",
        0xBE => "Period",
        0xBF => "Slash",
        0xC0 => "Backquote",
        0xDB => "BracketLeft",
        0xDC => "Backslash",
        0xDD => "BracketRight",
        0xDE => "Quote",
        _ => return None,
    };
    Some(name.to_string())
}

/// Windows 虚拟键码 → `KeyEntry`。
///
/// **刻意不用 `keycode` crate 的 `KeyMapping::Win(vk)`**，两条都实测过：
/// 1. `keycode_macro::generate` 生成的 `get_key_map` 把 `Usb` / `Evdev` / `Xkb` / `Win` /
///    `Mac` / `Id` 六个编号空间塞进**同一个 match arm 且没有任何 `if` guard**，反查必然
///    跨空间串台：`Win(0x41)` 返回 `F7`（因为 macOS 虚拟键码 0x41 恰好就是 F7）。
/// 2. 它解析出来的 `KeyMap.win` 列本身是错的：`KeyA` 的 `win`=30（那是 evdev `KEY_A`），
///    而真实 `VK_A`=0x41=65。
///
/// 改为「VK → W3 code 键名 → `hook_core::lookup_code`」：键名数据仍出自同一份 Chromium
/// `keycode_converter_data.inc`（经 `KeyMappingCode` 解析），故两端依旧对齐到同一个
/// `KeyMappingId`，而且**不硬编码任何 `KeyMappingId` 变体名**。
fn key_entry(vk: u32) -> Option<KeyEntry> {
    KEY_TABLE
        .get_or_init(|| {
            (0..WIN_VIRTUAL_KEY_MAX as u32)
                .map(|vk| {
                    let id = lookup_code(&vk_code_name(vk)?)?;
                    Some(KeyEntry {
                        id,
                        modifier_bit: modifier_bit(id),
                    })
                })
                .collect()
        })
        .get(usize::try_from(vk).ok()?)
        .copied()
        .flatten()
}

// ==================== 对外接口 ====================

/// 读取当前诊断状态（供 UI 展示「为什么没反应」）
pub fn hook_status(app: &tauri::AppHandle) -> HookStatusSnapshot {
    core_hook_status(app)
}

/// 启动监听（幂等）。
pub fn start_keyboard_hook(app: &tauri::AppHandle) {
    core_start_hook(app, key_entry as KeyLookup);
}

/// 设置变更后热更新规则：**不重建钩子**
pub fn reload_hook_rules(app: &tauri::AppHandle) {
    core_reload_rules(app, key_entry as KeyLookup);
}

/// Windows 没有 macOS「输入监控」那样的授权门禁 —— `WH_KEYBOARD_LL` 不需要任何提权，
/// 系统设置里也没有可勾选的对应项，故恒为 false。
pub fn open_listen_event_settings() -> bool {
    false
}

// ==================== 事件转发 ====================

/// 全局事件出口。只有钩子回调（钩子线程）会写 `tx`。
struct Sink {
    tx: Mutex<Sender<RawInput>>,
}

static SINK: OnceLock<Sink> = OnceLock::new();

/// 当前按住的修饰键位掩码。
///
/// `KBDLLHOOKSTRUCT` 没有修饰键状态字段，只能由钩子线程自己维护。`WH_KEYBOARD_LL` 的
/// 回调保证在安装它的线程上串行执行，这里用 `AtomicU8` 只是为了满足 `static` 的 `Sync`
/// 要求（同线程访问不需要原子性，但裸指针/可变状态不能直接进 `static`）。
static HELD_MODIFIERS: AtomicU8 = AtomicU8::new(0);

/// 钩子线程是否还活着（消息循环没退出）
static HOOK_ALIVE: AtomicBool = AtomicBool::new(false);

/// 当前安装的 HHOOK。只由钩子线程写。
static HOOK_SLOT: AtomicPtr<std::ffi::c_void> = AtomicPtr::new(std::ptr::null_mut());

fn send(input: RawInput) {
    let Some(sink) = SINK.get() else {
        return;
    };
    let guard = match sink.tx.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };
    // 消费线程只在进程退出时结束，发送失败无需处理
    let _ = guard.send(input);
}

/// 把一条原生键盘消息转成 `RawInput`。
///
/// 修饰键走「维护集合 + 整体覆盖」，普通键走按下/抬起 —— 与 macOS 侧的语义完全一致，
/// 因此 `hook_core::consumer_loop` 一份代码两平台通用。
fn forward(vk: u32, message: u32) {
    let Some(entry) = key_entry(vk) else {
        return;
    };
    let down = matches!(message, WM_KEYDOWN | WM_SYSKEYDOWN);
    let up = matches!(message, WM_KEYUP | WM_SYSKEYUP);

    if entry.modifier_bit != 0 {
        // 修饰键自身不参与序列匹配（否则按一下 Ctrl 就被当成序列推进了一次）
        let mut held = HELD_MODIFIERS.load(Ordering::Relaxed);
        if down {
            held |= entry.modifier_bit;
        } else if up {
            held &= !entry.modifier_bit;
        } else {
            return;
        }
        HELD_MODIFIERS.store(held, Ordering::Relaxed);
        send(RawInput::Modifiers(held));
        return;
    }

    if down {
        send(RawInput::KeyDown(vk));
    } else if up {
        send(RawInput::KeyUp(vk));
    }
}

/// 低级键盘钩子回调。
///
/// # 必须极短
///
/// Windows 在回调耗时超过 `LowLevelHooksTimeout`（默认 300ms）时会**静默摘掉钩子**，
/// 且不通知应用 —— 用户只会看到「快捷键突然没反应了」。本回调只做「整表查键 + 无界
/// channel 的非阻塞 send」，是微秒级。
///
/// # 必须放行
///
/// 返回 `CallNextHookEx(...)` 把事件交回系统。若返回非 0 相当于吞掉按键，「第一次
/// Ctrl+C 由系统真实执行复制」就不会发生，剪贴板永远是空的 —— 与 macOS 上
/// `kCGEventTapOptionListenOnly` 必须是同一个道理。
unsafe extern "system" fn keyboard_callback(
    ncode: i32,
    wparam: usize,
    lparam: isize,
) -> isize {
    if ncode == HC_ACTION {
        // safe：lparam 由系统传入，指向本次回调的 KBDLLHOOKSTRUCT
        let info = unsafe { &*(lparam as *const KbdLlHookStruct) };
        forward(info.vk_code, wparam as u32);
    }
    // safe：纯转发给系统的下一环，hk 参数对低级钩子必须传 NULL
    unsafe { CallNextHookEx(std::ptr::null_mut(), ncode, wparam, lparam) }
}

// ==================== 钩子线程编排 ====================

/// 平台层入口：起钩子线程 + 健康检查线程。Windows 有实现，恒返回 true。
///
/// 无主线程约束（与 macOS 相反）：`WH_KEYBOARD_LL` 装在哪条线程都行，只要那条线程自己
/// 有消息循环。
pub fn install_raw_sink(app: &tauri::AppHandle, tx: Sender<RawInput>) -> bool {
    let _ = SINK.set(Sink {
        tx: Mutex::new(tx),
    });

    let status = app.state::<HookStatus>().0.clone();
    // Windows 无「输入监控」授权门禁：只要钩子装上了就一定收得到事件
    status.listen_event.store(true, Ordering::Relaxed);

    spawn_hook_thread(status.clone());

    thread::spawn(move || health_loop(status));
    true
}

/// 起一条专用线程装 `WH_KEYBOARD_LL` 并跑消息循环。
fn spawn_hook_thread(status: Arc<HookStatusInner>) {
    thread::spawn(move || {
        // safe：查询本 exe 的 HINSTANCE，纯读取、无副作用
        let module = unsafe { GetModuleHandleW(std::ptr::null()) };

        // safe：回调是本文件里的普通 extern "system" 函数，装到本进程模块上；
        // dwThreadId = 0 表示全局钩子（低级键盘钩子**必须**为 0，否则装不上）
        let hook = unsafe {
            SetWindowsHookExW(
                WH_KEYBOARD_LL,
                keyboard_callback,
                module,
                0,
            )
        };
        if hook.is_null() {
            eprintln!(
                "[hook] SetWindowsHookExW(WH_KEYBOARD_LL) 返回 NULL：低级键盘钩子创建失败（global shortcut 无效）"
            );
            status.listening.store(false, Ordering::Relaxed);
            return;
        }
        // safe：`AtomicPtr::store` 本身是 safe 的（它只是原子写一个指针值，
        // 不解引用）；把裸 HHOOK 交给 UnhookWindowsHookEx 才需要 unsafe
        HOOK_SLOT.store(hook, Ordering::Relaxed);
        status.listening.store(true, Ordering::Relaxed);
        HOOK_ALIVE.store(true, Ordering::Relaxed);
        eprintln!("[hook] WH_KEYBOARD_LL 已装上（专用线程消息循环）");

        // 消息泵：低级钩子的回调就在这个线程上被调用，循环退出钩子即失效
        let mut msg = Msg::zeroed();
        loop {
            // safe：msg 是本线程独占的可写缓冲，hwnd/wparam/lparam 传 0 表示不过滤
            let ret = unsafe { GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) };
            if ret <= 0 {
                // -1 出错、0 = WM_QUIT，两者都结束循环
                break;
            }
            // safe：msg 由 GetMessageW 填充
            unsafe {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        }

        // safe：hook 是本线程创建、尚未释放的 HHOOK
        unsafe { UnhookWindowsHookEx(HOOK_SLOT.swap(std::ptr::null_mut(), Ordering::Relaxed)) };
        HOOK_ALIVE.store(false, Ordering::Relaxed);
        status.listening.store(false, Ordering::Relaxed);
        eprintln!("[hook] WH_KEYBOARD_LL 消息循环退出，钩子已卸载");
    });
}

/// 健康检查线程：Windows 没有可查询的「钩子是否被系统摘掉」标志，只能靠钩子线程的
/// 存活状态判断 —— 消息循环一退出（被摘钩后回调不再投递，或线程异常）就重建。
fn health_loop(status: Arc<HookStatusInner>) {
    loop {
        thread::sleep(HEALTH_INTERVAL);
        status.listen_event.store(true, Ordering::Relaxed);
        if HOOK_ALIVE.load(Ordering::Relaxed) {
            continue;
        }
        eprintln!("[hook] WH_KEYBOARD_LL 已失效，重新安装");
        spawn_hook_thread(status.clone());
        // 重建后若仍失败（多半是整个环境不允许低级钩子），退避一下再试，别空转
        thread::sleep(RELISTEN_RETRY);
    }
}

// ==================== Win32 FFI ====================

type LowLevelKeyboardProc = unsafe extern "system" fn(ncode: i32, wparam: usize, lparam: isize) -> isize;

/// `KBDLLHOOKSTRUCT`（见 `winuser.h`）。字段顺序与类型必须与 SDK 一致 —— 回调是按裸指针
/// 解引用的，布局错了会读到垃圾。
#[repr(C)]
struct KbdLlHookStruct {
    vk_code: u32,
    scan_code: u32,
    flags: u32,
    time: u32,
    dw_extra_info: usize,
}

/// `MSG`（见 `winuser.h`）。`GetMessageW` 会往里写，布局必须与 SDK 一致（x64 上 40 字节）。
#[repr(C)]
struct Msg {
    hwnd: *mut std::ffi::c_void,
    message: u32,
    w_param: usize,
    l_param: isize,
    time: u32,
    pt_x: i32,
    pt_y: i32,
}

impl Msg {
    fn zeroed() -> Self {
        Self {
            hwnd: std::ptr::null_mut(),
            message: 0,
            w_param: 0,
            l_param: 0,
            time: 0,
            pt_x: 0,
            pt_y: 0,
        }
    }
}

#[link(name = "kernel32")]
extern "system" {
    fn GetModuleHandleW(lpmodulename: *const u16) -> *mut std::ffi::c_void;
}

#[link(name = "user32")]
extern "system" {
    fn SetWindowsHookExW(
        idhook: i32,
        lpfn: LowLevelKeyboardProc,
        hmod: *mut std::ffi::c_void,
        dwthreadid: u32,
    ) -> *mut std::ffi::c_void;
    fn UnhookWindowsHookEx(hhk: *mut std::ffi::c_void) -> i32;
    fn CallNextHookEx(
        hhk: *mut std::ffi::c_void,
        ncode: i32,
        wparam: usize,
        lparam: isize,
    ) -> isize;
    fn GetMessageW(
        lpmsg: *mut Msg,
        hwnd: *mut std::ffi::c_void,
        wparamfiltermin: u32,
        wparamfiltermax: u32,
    ) -> i32;
    fn TranslateMessage(lpmsg: *const Msg) -> i32;
    fn DispatchMessageW(lpmsg: *const Msg) -> isize;
}

// ==================== 测试 ====================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::hook_core::{MOD_ALT, MOD_CTRL, MOD_META, MOD_SHIFT, parse_key};

    /// VK 表必须与 W3 code 名指向同一个按键身份（钩子侧与设置页侧对得上）。
    /// 关键：VK 0x41..=0x5A 就是 ASCII 'A'..'Z'，与 macOS 的 0/8/29 完全不同。
    #[test]
    fn virtual_key_table_matches_key_names() {
        assert_eq!(key_entry(0x41).map(|e| e.id), parse_key("A"));
        assert_eq!(key_entry(0x43).map(|e| e.id), parse_key("C"));
        assert_eq!(key_entry(0x56).map(|e| e.id), parse_key("V"));
        assert_eq!(key_entry(0x30).map(|e| e.id), parse_key("0"));
        assert_eq!(key_entry(0x25).map(|e| e.id), parse_key("ARROWLEFT"));
    }

    /// 修饰键 VK（通用位 + 左右侧）必须全部映射到对应的 MOD_* 位，否则「按住 Ctrl + C、C」
    /// 永远匹配不上。
    #[test]
    fn modifier_virtual_keys_map_to_modifier_bits() {
        for (vk, bit) in [
            (0x10u32, MOD_SHIFT), // VK_SHIFT
            (0xA0, MOD_SHIFT),   // VK_LSHIFT
            (0xA1, MOD_SHIFT),   // VK_RSHIFT
            (0x11, MOD_CTRL),    // VK_CONTROL
            (0xA2, MOD_CTRL),    // VK_LCONTROL
            (0xA3, MOD_CTRL),    // VK_RCONTROL
            (0x12, MOD_ALT),     // VK_MENU
            (0xA4, MOD_ALT),     // VK_LMENU
            (0xA5, MOD_ALT),     // VK_RMENU
            (0x5B, MOD_META),    // VK_LWIN
            (0x5C, MOD_META),    // VK_RWIN
        ] {
            assert_eq!(
                key_entry(vk).map(|e| e.modifier_bit),
                Some(bit),
                "VK 0x{vk:X} 的修饰键位不对"
            );
        }
    }

    /// 普通键不能被当成修饰键（否则按一下 C 就会被当成修饰键按下）
    #[test]
    fn ordinary_keys_are_not_modifiers() {
        assert_eq!(key_entry(0x43).map(|e| e.modifier_bit), Some(0)); // 'C'
        assert_eq!(key_entry(0x14).map(|e| e.modifier_bit), Some(0)); // VK_CAPITAL
        assert_eq!(key_entry(0x58).map(|e| e.modifier_bit), Some(0)); // VK_X
    }

    /// 表容量是 256，越界键码必须返回 None 而不是 panic
    #[test]
    fn out_of_range_virtual_key_has_no_entry() {
        assert!(key_entry(999).is_none());
    }

    /// 回归测试：`keycode` crate 的 `KeyMapping::Win(vk)` 反查会跨编号空间串台
    /// （`Win(0x41)` 曾返回 `F7`，因为 macOS 虚拟键码 0x41 就是 F7）。
    /// 本实现走「VK → W3 code 键名 → `lookup_code`」，必须给出唯一正确答案。
    #[test]
    fn virtual_key_lookup_does_not_cross_contaminate() {
        // 0x41 在 macOS 编号空间里是 F7；这里必须仍然是 A
        assert_eq!(key_entry(0x41).map(|e| e.id), parse_key("A"));
        assert_ne!(key_entry(0x41).map(|e| e.id), parse_key("F7"));
        assert_ne!(key_entry(0x43).map(|e| e.id), parse_key("F9"));
        // 0x25 在 evdev 空间里是 KEY_RIGHT；这里必须仍然是 ArrowLeft
        assert_eq!(key_entry(0x25).map(|e| e.id), parse_key("ARROWLEFT"));
        assert_ne!(key_entry(0x26).map(|e| e.id), parse_key("ARROWUP"));
    }

    /// `vk_code_name` 里出现的每个键名都必须能被 `lookup_code` 解析，
    /// 否则该 VK 会静默变成「无条目」——拼错键名要在这里炸掉，不能等到实机才发现。
    #[test]
    fn every_declared_vk_name_resolves() {
        for vk in 0..WIN_VIRTUAL_KEY_MAX as u32 {
            if let Some(name) = vk_code_name(vk) {
                assert!(
                    lookup_code(&name).is_some(),
                    "VK 0x{vk:02X} 的键名 {name} 在 keycode crate 里查不到对应 DOM code"
                );
                assert!(
                    key_entry(vk).is_some(),
                    "VK 0x{vk:02X}（{name}）建表后却没有条目"
                );
            }
        }
    }
}