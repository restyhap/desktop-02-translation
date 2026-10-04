pub mod config;

// 全局快捷键核心（平台中立）：诊断状态 / 规则表 / 键位查表 / 序列匹配 / 命中后动作。
// 全平台编译；平台层（keyboard_hook*）只负责把原生事件转成 RawInput 转发进来。
pub mod hook_core;

// 全局快捷键平台层：三选一。
//   macOS   → CGEventTap（ListenOnly，挂在主线程 run loop，需「输入监控」授权）
//   Windows → WH_KEYBOARD_LL（专用线程消息循环，无需授权）
//   其他     → 无实现（Wayland 禁止全局按键捕获，X11 也未验证）
// 三个文件对上层暴露**完全同名**的 API，lib.rs / commands 无需平台分支。
#[cfg(target_os = "macos")]
pub mod keyboard_hook;
#[cfg(target_os = "windows")]
#[path = "keyboard_hook_windows.rs"]
pub mod keyboard_hook;
#[cfg(not(any(target_os = "macos", windows)))]
#[path = "keyboard_hook_unsupported.rs"]
pub mod keyboard_hook;
