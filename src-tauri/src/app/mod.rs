pub mod config;

// 全局快捷键：真正实现只在 macOS（CGEventTap 是 macOS 专有 API）。
// 非 macOS 路由到同名 API 的占位模块，让上层（lib.rs / commands）无需平台分支。
#[cfg(target_os = "macos")]
pub mod keyboard_hook;
#[cfg(not(target_os = "macos"))]
#[path = "keyboard_hook_unsupported.rs"]
pub mod keyboard_hook;
