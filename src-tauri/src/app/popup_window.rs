//! 划词弹窗 / 轻提示的**窗口层级**。
//!
//! # 为什么需要它
//!
//! `tauri.conf.json` 里的 `alwaysOnTop: true` 在 macOS 上只被 tao 翻成
//! `NSFloatingWindowLevel`(3)（见 `tao/src/platform_impl/macos/window.rs`，
//! `set_always_on_top` / 创建窗口时都是这个值）。而屏幕上有三类窗口的层级比 3 高：
//!
//! | 窗口 | 层级 |
//! |---|---|
//! | Dock | `kCGDockWindowLevel` = 20 |
//! | 菜单栏 | `NSMainMenuWindowLevel` = 24 |
//! | iTerm2「浮动在最前」/ 全屏 App 上的辅助窗口 | ≥ 3 且独占 Space |
//!
//! 于是划词弹窗会被 Dock、iTerm2 盖住 —— 这是用户实测报上来的现象。这里把弹窗抬到
//! `NSStatusWindowLevel`(25)，并允许它加入所有 Space 且能与全屏窗口共存
//! （`CanJoinAllSpaces | FullScreenAuxiliary`），使它在别的 App 全屏时也看得见。
//!
//! # 调用时机：**每次 show 之后都要调**
//!
//! level 是窗口自身属性、不会被 show/hide 重置，但 tao 在建窗与 `set_always_on_top`
//! 时会写回 `NSFloatingWindowLevel`；在每次 show 之后重新覆盖一次是唯一稳定的做法。
//! 调用方（`hook_core::handle_translate` / `show_empty_clipboard_toast`）都在主线程
//! （经 `run_on_main_thread`），满足 AppKit 的主线程要求。
//!
//! 非 macOS 平台是空实现：Windows / Linux 的置顶由 `alwaysOnTop` 负责，无需抬升。

/// 把弹窗抬到 Dock / 菜单栏 / 全屏 App 之上（幂等）。
#[cfg(target_os = "macos")]
pub fn raise_popup_level(window: &tauri::WebviewWindow) {
    use objc2_app_kit::{NSStatusWindowLevel, NSWindow, NSWindowCollectionBehavior};

    let Ok(ptr) = window.ns_window() else {
        return;
    };
    if ptr.is_null() {
        return;
    }

    // safe：`ptr` 是 tao 创建并持有、此刻仍然存活的 NSWindow 指针；下面两个 setter
    // 只改窗口自身的层级与空间行为，不转移所有权、不释放任何对象。
    let ns_window: &NSWindow = unsafe { &*(ptr as *const NSWindow) };

    // 读-改-写而不是整体覆盖：tao 的 `set_visible_on_all_workspaces` 也动这个位域，
    // 先读再或可以保住它将来可能加进来的位。
    let behavior = ns_window.collectionBehavior()
        | NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::FullScreenAuxiliary;
    ns_window.setCollectionBehavior(behavior);
    ns_window.setLevel(NSStatusWindowLevel);
}

/// Windows / Linux：置顶交给 `alwaysOnTop`，无需额外抬升。
#[cfg(not(target_os = "macos"))]
pub fn raise_popup_level(_window: &tauri::WebviewWindow) {}
