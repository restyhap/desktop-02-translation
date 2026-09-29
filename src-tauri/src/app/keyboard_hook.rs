use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, LogicalPosition, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::app::config::{extract_keys_from_shortcut, ShortcutConfig};

static LAST_CLIPBOARD: Mutex<Option<String>> = Mutex::new(None);

/// keyboard-hook 子进程控制柄（Arc 保证看门狗线程也能访问）
pub struct KeyboardHookProcess(pub Arc<Mutex<Option<Child>>>);

/// 读取当前快捷键配置并生成 keyboard-hook 启动参数
fn hook_args(app: &tauri::AppHandle) -> Vec<String> {
    let shortcuts = app.state::<Mutex<ShortcutConfig>>();
    let config = shortcuts.lock().unwrap().clone();

    let mut args = Vec::new();
    if !config.translate.is_empty() {
        args.push(format!("TRANSLATE={}", extract_keys_from_shortcut(&config.translate)));
    }
    if !config.show_main.is_empty() {
        args.push(format!("SHOW_MAIN={}", extract_keys_from_shortcut(&config.show_main)));
    }
    args
}

/// 启动 keyboard-hook 子进程；失败返回 false 交给看门狗重试
fn launch_hook(app: &tauri::AppHandle) -> bool {
    let args = hook_args(app);
    if args.is_empty() {
        println!("ℹ 未设置快捷键，不启动 keyboard-hook");
        return false;
    }

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();

    let hook_bin = exe_dir.join("keyboard-hook");

    let mut cmd = Command::new(&hook_bin);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            eprintln!(
                "[main] keyboard-hook 启动失败: {} (路径: {:?})",
                e, hook_bin
            );
            return false;
        }
    };

    eprintln!("[main] keyboard-hook spawned, PID={}", child.id());
    let child_stderr = child.stderr.take();
    let child_stdout = child.stdout.take();

    {
        let hook_state = app.state::<KeyboardHookProcess>();
        *hook_state.0.lock().unwrap() = Some(child);
    }


    // 统一事件处理之前：stdout 事件线程需要 AppHandle 的所有权，克隆给闭包
    let ev_app = app.clone();

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
            let app = ev_app;
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let trimmed = line.trim();
                // 严格过滤：只处理以 TRANSLATE 或 SHOW_MAIN 开头的事件行，跳过所有启动/调试日志
                if !trimmed.starts_with("TRANSLATE") && !trimmed.starts_with("SHOW_MAIN") {
                    continue;
                }

                // macOS 的剪贴板/窗口操作必须发生在主线程：
                // 这里是后台 stdout 读取线程，直接调 clipboard()/window 会静默失效
                let value = app.clone();
                let event = trimmed.to_string();
                let _ = app.run_on_main_thread(move || {
                    let app = value;
                    let trimmed = event.as_str();
                    if trimmed == "TRANSLATE" || trimmed.starts_with("TRANSLATE ") {
                        // 轮询等剪贴板就绪：Cmd+C 的拷贝是异步落盘的，
                        // 单次读取会在竞态下拿到空值 → 最多重试 5 次（约 400ms）
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
                                Err(e) => {
                                    eprintln!("[main] clipboard read error: {}", e);
                                }
                            }
                            std::thread::sleep(std::time::Duration::from_millis(80));
                        }
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
                            return;
                        }
                        eprintln!("[main] display_text len={}", display_text.len());
                        if !text.trim().is_empty() {
                            let mut last = LAST_CLIPBOARD.lock().unwrap_or_else(|e| e.into_inner());
                            *last = Some(text.clone());
                        }
                        if let Some(window) = app.get_webview_window("translate") {
                            // 光标所在显示器优先（隐藏窗口的 current_monitor 可能停留在旧显示器，
                            // 造成跨屏时按错误边界钳制 → 弹窗位置偏差的根因）
                            let monitor = app
                                .monitor_from_point(cursor_x, cursor_y)
                                .ok()
                                .flatten()
                                .or_else(|| window.current_monitor().ok().flatten());
                            if let Some(monitor) = monitor {
                                let scale = monitor.scale_factor();
                                let monitor_logical_width = monitor.size().width as f64 / scale;
                                let monitor_logical_height = monitor.size().height as f64 / scale;
                                let monitor_logical_x = monitor.position().x as f64 / scale;
                                let monitor_logical_y = monitor.position().y as f64 / scale;
                                let size = window
                                    .inner_size()
                                    .unwrap_or(tauri::PhysicalSize::new(480, 360));
                                // 弹窗逻辑尺寸按「光标所在显示器」的 scale 折算，避免跨屏 scale 混算偏差
                                let popup_logical_width = size.width as f64 / scale;
                                let popup_logical_height = size.height as f64 / scale;
                                // 弹窗锚定光标左上方（弹窗右下角距光标 12px）：
                                // 圆角卡片视觉重心偏向光标，且不压住鼠标与原选区
                                let mut px = cursor_x - 12.0 - popup_logical_width;
                                let mut py = cursor_y - 12.0 - popup_logical_height;
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
                });

            }
        });
    } else {
        eprintln!("[main] keyboard-hook stdout 不可用，跳过输出监听");
    }

    println!("✓ keyboard-hook 子进程已启动");
    true
}

/// 重启 keyboard-hook（快捷键配置更新后调用）：杀掉旧进程再按新配置拉起
pub fn restart_keyboard_hook(app: &tauri::AppHandle) {
    {
        let state = app.state::<KeyboardHookProcess>();
        let mut guard = state.0.lock().unwrap();
        if let Some(mut old) = guard.take() {
            let _ = old.kill();
        }
    }
    launch_hook(app);
}

/// 看门狗：无论何种原因（spawn 失败/进程闪退/二进制半写状态被拉起后立刻死亡），
/// keyboard-hook 不在运行就重新拉起，保证快捷键热键链路自愈
fn start_hook_watchdog(app: tauri::AppHandle) {
    let state = app.state::<KeyboardHookProcess>().0.clone();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(3));
        // 每次检查都重读配置：用户在设置里新增/删除快捷键也能被接住
        let args = hook_args(&app);
        if args.is_empty() {
            continue;
        }
        let dead = {
            let mut guard = state.lock().unwrap();
            match guard.as_mut() {
                // 进程活着且未退出 → 无需处理
                Some(child) => matches!(child.try_wait(), Ok(Some(_))),
                None => true,
            }
        };
        if dead {
            if !launch_hook(&app) {
                eprintln!("[main] keyboard-hook 看门狗: 本次拉起失败，3 秒后重试");
            }
        }
    });
}

pub fn spawn_keyboard_hook(app: tauri::AppHandle) {
    start_hook_watchdog(app.clone());
    launch_hook(&app);
}