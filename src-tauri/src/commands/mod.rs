pub mod dictionary;
pub mod engines;
pub mod history;
pub mod settings;
pub mod shortcuts;
pub mod translation;
/// MOSS-TTS 命令层依赖 moss-tts-nano（ort/ONNX Runtime 无 x86_64-macos 预编译库），
/// Intel macOS 版整模块不编译——该分节 UI 本就注释停用
#[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
pub mod tts;
pub mod vocabulary;
pub mod windows;