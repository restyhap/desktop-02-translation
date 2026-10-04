//! 无全局监听实现的平台层（由 `app/mod.rs` 路由到这里；当前只有 Linux/Wayland）。
//!
//! 为什么不直接把 Linux 也路由到 macOS/Windows 那种实现：
//! - **Wayland 根本禁止全局按键捕获**（`wl_keyboard` 只对本窗口生效），没有等价 API；
//! - X11 理论上可以用 XRecord 扩展做，但那是新的一套 FFI + 授权面，暂不在范围内。
//!
//! 本文件因此只做两件事：
//! 1. `install_raw_sink` 返回 `false`，让核心不启动消费线程；
//! 2. 把核心的状态类型原样 re-export —— 上层（lib.rs / commands）不需要平台分支。
//!
//! **`Rule` 等类型直接用核心里的真实定义**（不是空占位 struct），这样三个平台层对
//! `HookRules` 的类型完全一致，切换平台不会出现「类型不匹配」的编译错误。
//!
//! UI 侧提示是**必须**的（项目红线：静默失败必须有可见提示）：本平台 `supported=false`，
//! 主页的 `ShortcutPermBanner` 据此显示「本平台暂不支持」，而不是静默地让快捷键无反应。

use std::sync::mpsc::Sender;
use tauri::Manager;

use super::hook_core::{
    KeyEntry, KeyLookup, RawInput, hook_status as core_hook_status, reload_rules as core_reload_rules,
    start_hook as core_start_hook,
};

// 核心的状态类型与常量，本平台没有覆盖语义差异，直接 re-export
pub use super::hook_core::{
    HookRules, HookStarted, HookStatus, HookStatusInner, HookStatusSnapshot,
};

/// 平台层入口：本平台无实现，恒返回 false → 核心不启动消费线程。
///
/// 拿不到键位查表函数（本平台没有原生事件），参数一律 `_` 丢弃。
pub fn install_raw_sink(_app: &tauri::AppHandle, _tx: Sender<RawInput>) -> bool {
    false
}

/// 本平台的「键码查表」占位：没有任何原生事件会到这里来。
///
/// 仍然要提供，是为了保持三个平台层 `start_keyboard_hook(app)` 的**签名完全一致**
/// —— 查表函数是平台私有的，不该从上层传进来。
fn key_entry(_code: u32) -> Option<KeyEntry> {
    None
}

/// 读取当前诊断状态（供 UI 展示「为什么没反应」）
pub fn hook_status(app: &tauri::AppHandle) -> HookStatusSnapshot {
    core_hook_status(app)
}

/// 启动监听（幂等）。本平台只建规则表、不起消费线程（`install_raw_sink` 返 false）。
pub fn start_keyboard_hook(app: &tauri::AppHandle) {
    core_start_hook(app, key_entry as KeyLookup);
}

/// 设置变更后热更新规则（无监听可重载，仅替换规则表）
pub fn reload_hook_rules(app: &tauri::AppHandle) {
    core_reload_rules(app, key_entry as KeyLookup);
}

/// 本平台没有「输入监控」这类可授予的授权门禁，也没有对应系统设置面板。
pub fn open_listen_event_settings() -> bool {
    false
}