use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{Emitter, LogicalPosition, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::app::config::{extract_keys_from_shortcut, ShortcutConfig};

static LAST_CLIPBOARD: Mutex<Option<String>> = Mutex::new(None);

pub struct KeyboardHookProcess(pub Mutex<Option<std::process::Child>>);

pub fn spawn_keyboard_hook(app: tauri::AppHandle) {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();

    let hook_bin = exe_dir.join("keyboard-hook");

    let shortcuts = app.state::<Mutex<ShortcutConfig>>();
    let config = shortcuts.lock().unwrap().clone();

    let mut args = Vec::new();
    if !config.translate.is_empty() {
        args.push(format!("TRANSLATE={}", extract_keys_from_shortcut(&config.translate)));
    }
    if !config.show_main.is_empty() {
        args.push(format!("SHOW_MAIN={}", extract_keys_from_shortcut(&config.show_main)));
    }

    if args.is_empty() {
        println!("ℹ 未设置快捷键，不启动 keyboard-hook");
        return;
    }

    let mut cmd = Command::new(&hook_bin);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            eprintln!(
                "[main] keyboard-hook 启动失败: {} (路径: {:?})",
                e, hook_bin
            );
            return;
        }
    };

    eprintln!("[main] keyboard-hook spawned, PID={}", child.id());

    {
        let hook_state = app.state::<KeyboardHookProcess>();
        *hook_state.0.lock().unwrap() = Some(child);
    }

    let (child_stderr, child_stdout) = {
        let hook_state = app.state::<KeyboardHookProcess>();
        let mut guard = hook_state.0.lock().unwrap();
        let child = guard.as_mut().unwrap();
        (child.stderr.take(), child.stdout.take())
    };

    if let Some(stderr) = child_stderr {
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                eprintln!("[hook stderr] {}", line);
            }
        });
    }

    if let Some(stdout) = child_stdout {
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let trimmed = line.trim();
                // 严格过滤：只处理以 TRANSLATE 或 SHOW_MAIN 开头的事件行，跳过所有启动/调试日志
                if !trimmed.starts_with("TRANSLATE") && !trimmed.starts_with("SHOW_MAIN") {
                    continue;
                }
                if trimmed == "TRANSLATE" || trimmed.starts_with("TRANSLATE ") {
                    let text = match app.clipboard().read_text() {
                        Ok(t) => t.trim().to_string(),
                        Err(e) => {
                            eprintln!("[main] clipboard read error: {}", e);
                            String::new()
                        }
                    };
                    let (cursor_x, cursor_y) = if trimmed == "TRANSLATE" {
                        (0.0, 0.0)
                    } else {
                        let parts: Vec<&str> = trimmed.splitn(3, ' ').collect();
                        if parts.len() >= 3 {
                            (
                                parts[1].trim().parse::<f64>().unwrap_or(0.0),
                                parts[2].trim().parse::<f64>().unwrap_or(0.0),
                            )
                        } else {
                            (0.0, 0.0)
                        }
                    };
                    let display_text = if text.trim().is_empty() {
                        let last = LAST_CLIPBOARD.lock().unwrap_or_else(|e| e.into_inner());
                        last.clone().unwrap_or_default()
                    } else {
                        text.clone()
                    };
                    if display_text.trim().is_empty() {
                        eprintln!("[main] 剪切板为空且无历史记录，跳过翻译");
                        continue;
                    }
                    eprintln!("[main] display_text len={}", display_text.len());
                    if !text.trim().is_empty() {
                        let mut last = LAST_CLIPBOARD.lock().unwrap_or_else(|e| e.into_inner());
                        *last = Some(text.clone());
                    }
                    if let Some(window) = app.get_webview_window("translate") {
                        if let Ok(Some(monitor)) = window.current_monitor() {
                            let scale = monitor.scale_factor();
                            let monitor_logical_width = monitor.size().width as f64 / scale;
                            let monitor_logical_height = monitor.size().height as f64 / scale;
                            let monitor_logical_x = monitor.position().x as f64 / scale;
                            let monitor_logical_y = monitor.position().y as f64 / scale;
                            let size = window
                                .inner_size()
                                .unwrap_or(tauri::PhysicalSize::new(480, 360));
                            let popup_logical_width = size.width as f64 / scale;
                            let popup_logical_height = size.height as f64 / scale;
                            let mut px = cursor_x;
                            let mut py = cursor_y;
                            if px + popup_logical_width > monitor_logical_x + monitor_logical_width
                            {
                                px =
                                    monitor_logical_x + monitor_logical_width - popup_logical_width;
                            }
                            if py + popup_logical_height
                                > monitor_logical_y + monitor_logical_height
                            {
                                py = monitor_logical_y + monitor_logical_height
                                    - popup_logical_height;
                            }
                            if px < monitor_logical_x {
                                px = monitor_logical_x;
                            }
                            if py < monitor_logical_y {
                                py = monitor_logical_y;
                            }
                            window
                                .set_position(LogicalPosition::new(px, py))
                                .unwrap_or_default();
                        }
                        let _ = window.show();
                        let _ = window.set_focus();
                        let _ = window.emit(
                            "show-translate",
                            serde_json::json!({ "text": display_text, "cursorX": cursor_x, "cursorY": cursor_y }),
                        );
                    }
                } else if trimmed == "SHOW_MAIN" || trimmed.starts_with("SHOW_MAIN ") {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        });
    } else {
        eprintln!("[main] keyboard-hook stdout 不可用，跳过输出监听");
    }

    println!("✓ keyboard-hook 子进程已启动");
}