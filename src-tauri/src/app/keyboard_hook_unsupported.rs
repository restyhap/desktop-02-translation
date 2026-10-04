//! 非 macOS 的全局快捷键占位模块（由 `app/mod.rs` 按平台路由到这里）。
//!
//! 真正的实现在 `keyboard_hook.rs`：CGEventTap / IOKit 授权判定都是 macOS 专有 API，
//! 那里**只在 macOS 编译**，因此不需要在文件里到处打 `cfg` 门控——历史上正是因为
//! 漏打一处门控，Windows/Linux 的 `clippy -D warnings` 一直挂在 dead_code 上。
//!
//! 本模块提供**同名同签名**的公开 API，语义一律是「本平台不支持」：
//! - `HookStatusSnapshot.supported = false` —— 前端据此隐藏「输入监控」横幅，
//!   而不是误报「用户没授权」（那是 macOS 独有的门禁）；
//! - `start_keyboard_hook` / `reload_hook_rules` 不建 tap、不消费规则，但**照常读写
//!   managed state**，保持与 macOS 版一致的 state 契约（诊断面板拿到的是真状态，
//!   而不是绕过 state 的常量）；
//! - `open_listen_event_settings()` 恒为 false（非 macOS 没有这个设置面板）。

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

use serde::Serialize;
use tauri::Manager;

/// 规则表条目占位。非 macOS 没有 tap 事件要匹配，仅用于撑起 `HookRules` 的类型。
pub struct Rule;

/// managed state：规则表。与 macOS 版同名，字段保持 `pub` 以便 `lib.rs` 无差别注册。
pub struct HookRules(pub Arc<RwLock<HashMap<String, Rule>>>);

/// managed state：诊断快照数据源。
pub struct HookStatus(pub Arc<HookStatusInner>);

/// 诊断量。非 macOS 永远是 0/false。
pub struct HookStatusInner {
    pub listening: AtomicBool,
    pub listen_event: AtomicBool,
    pub key_events: AtomicU64,
}

/// managed state：监听启动幂等标记。占位实现不启动任何监听。
pub struct HookStarted(pub AtomicBool);

/// 传给前端的诊断快照，字段与 macOS 版一一对应。
#[derive(Serialize, Clone, Copy)]
pub struct HookStatusSnapshot {
    /// 本平台是否实现了全局监听。占位模块恒为 false。
    pub supported: bool,
    pub listening: bool,
    pub listen_event: bool,
    pub key_events: u64,
}

/// 本平台是否实现了全局监听（与 macOS 版同名常量，便于上层按语义引用）。
pub const HOOK_SUPPORTED: bool = false;

/// 与 macOS 版同签名。照常读 managed state，但 `supported` 恒为 false。
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

/// 与 macOS 版同签名。沿用同样的幂等标记，但不建 tap。
pub fn start_keyboard_hook(app: &tauri::AppHandle) {
    if app.state::<HookStarted>().0.swap(true, Ordering::SeqCst) {
        return;
    }
    eprintln!("[hook] 当前平台尚无全局监听实现（目前仅 macOS），跳过");
}

/// 与 macOS 版同签名。没有 tap 消费规则，但设置变更后同样清空旧规则表。
pub fn reload_hook_rules(app: &tauri::AppHandle) {
    if let Some(rules) = app.try_state::<HookRules>() {
        rules
            .0
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clear();
    }
}

/// 与 macOS 版同签名。非 macOS 没有「输入监控」这个门禁，无需打开设置面板。
pub fn open_listen_event_settings() -> bool {
    false
}
