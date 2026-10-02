use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, LogicalPosition, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::app::config::{extract_keys_from_shortcut, ShortcutConfig};


/// keyboard-hook 子进程控制柄（Arc 保证看门狗线程也能访问）
/// stdin 保留给看门狗 PING/PONG 心跳：判定「进程活着但事件 tap 失灵」这类假活
pub struct KeyboardHookProcess(pub Arc<Mutex<Option<HookChild>>>);

pub struct HookChild {
    pub child: Child,
    pub stdin: ChildStdin,
}

/// 心跳计数器：sent = 已发出的 PING 序号；seen = stdout 线程观察到的新 PONG 序号
pub struct HookPingTracker(pub Arc<AtomicU64>, pub Arc<AtomicU64>);

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

/// 弹窗/toast 锚点定位（逻辑坐标 px,py，圆角内退 CUT_INSET + 越界按所在屏钳制）。
///
/// 光标坐标以「主进程实时读取」为准：`cursor_position()` 底层是 macOS
/// `NSEvent.mouseLocation`（物理像素、左上原点），不依赖 keyboard-hook 累积的
/// `last_mouse_pos`——后者在 hook 启动后鼠标未移动过时为 None → (0,0)，
/// 会导致 toast/弹窗锚到屏幕左上角而不是跟随鼠标。
/// 实时读取失败时回退到 hook 事件携带坐标（逻辑单位，兼容旧行为）。
fn anchor_position(
    app: &tauri::AppHandle,
    window: &tauri::WebviewWindow,
    hook_x: f64,
    hook_y: f64,
    size: tauri::PhysicalSize<u32>,
    cut_inset: f64,
) -> Option<(f64, f64)> {
    // 1) 实时光标（物理像素，全局左上原点）；失败则用 hook 坐标
    let live = window.cursor_position().ok();
    let (probe_x, probe_y) = live
        .map(|p| (p.x, p.y))
        .unwrap_or((hook_x, hook_y));
    // 2) 光标所在监视器优先（隐藏窗口的 current_monitor 可能停留在旧显示器）
    let monitor = app
        .monitor_from_point(probe_x, probe_y)
        .ok()
        .flatten()
        .or_else(|| window.current_monitor().ok().flatten())?;
    let scale = monitor.scale_factor();
    let mx = monitor.position().x as f64 / scale;
    let my = monitor.position().y as f64 / scale;
    let mw = monitor.size().width as f64 / scale;
    let mh = monitor.size().height as f64 / scale;
    // 3) 光标在该监视器尺度下的逻辑坐标；窗口逻辑尺寸同口径折算
    let (cxl, cyl) = live
        .map(|p| (p.x / scale, p.y / scale))
        .unwrap_or((hook_x, hook_y));
    let w = size.width as f64 / scale;
    let h = size.height as f64 / scale;
    let mut px = cxl - cut_inset;
    let mut py = cyl - cut_inset;
    if px + w > mx + mw {
        px = mx + mw - w;
    }
    if py + h > my + mh {
        py = my + mh - h;
    }
    if px < mx {
        px = mx;
    }
    if py < my {
        py = my;
    }
    Some((px, py))
}

/// 圆角补偿：卡片 rounded-xl=12px，圆弧使可见角尖相对理想直角内退 cut = r − r/√2 ≈ 3.51px
const CUT_INSET: f64 = 12.0 * (1.0 - std::f64::consts::FRAC_1_SQRT_2);

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
        .stdin(Stdio::piped())
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
    let child_stdin = child.stdin.take();

    {
        let hook_state = app.state::<KeyboardHookProcess>();
        *hook_state.0.lock().unwrap() = child_stdin.map(|stdin| HookChild { child, stdin });
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
                // PONG 心跳应答：把 seen 计数推到已发出 PING 的最新序号
                if trimmed == "PONG" {
                    let tracker = app.state::<HookPingTracker>();
                    let sent = tracker.0.load(Ordering::Relaxed);
                    tracker.1.store(sent, Ordering::Relaxed);
                    continue;
                }
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
                        // 剪贴板为空/读失败 → 不弹窗（系统 Cmd+C 无可复制内容时同样不动作；
                        // 同文本重复 Cmd+C+C 由前端 lastTextRef 直接重看上次翻译，无需后端缓存）
                        if text.trim().is_empty() {
                            eprintln!("[main] 剪贴板为空，跳过翻译");
                            // 空剪贴板轻提示：与划词弹窗同款跟随生成——左上角锚光标
                            // （圆角切点内退补偿 CUT_INSET，越界按所在屏钳制），约 1.2 秒自动消失
                            if let Some(toast) = app.get_webview_window("toast") {
                                let size = toast
                                    .inner_size()
                                    .unwrap_or(tauri::PhysicalSize::new(280, 64));
                                if let Some((px, py)) = anchor_position(
                                    &app,
                                    &toast,
                                    cursor_x,
                                    cursor_y,
                                    size,
                                    CUT_INSET,
                                ) {
                                    let _ = toast.set_position(LogicalPosition::new(px, py));
                                }
                                let _ = toast.show();
                                let toast_bg = toast.clone();
                                std::thread::spawn(move || {
                                    std::thread::sleep(std::time::Duration::from_millis(1200));
                                    let _ = toast_bg.hide();
                                });
                            }
                            return;
                        }
                        eprintln!("[main] display_text len={}", text.len());
                        if let Some(window) = app.get_webview_window("translate") {
                            let size = window
                                .inner_size()
                                .unwrap_or(tauri::PhysicalSize::new(480, 360));
                            // 弹窗锚定光标左上角（圆角切点内退 + 越界按光标所在屏钳制），
                            // 光标坐标取主进程实时值（同 toast，见 anchor_position）
                            if let Some((px, py)) = anchor_position(
                                &app,
                                &window,
                                cursor_x,
                                cursor_y,
                                size,
                                CUT_INSET,
                            ) {
                                let _ = window.set_position(LogicalPosition::new(px, py));
                            }
                            let _ = window.show();
                            let _ = window.set_focus();
                            let _ = window.emit(
                                "show-translate",
                                serde_json::json!({ "text": text, "cursorX": cursor_x, "cursorY": cursor_y }),
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
            let _ = old.child.kill();
        }
    }
    launch_hook(app);
}

/// 看门狗：无论何种原因（spawn 失败/进程闪退/二进制半写状态被拉起后立刻死亡），
/// keyboard-hook 不在运行就重新拉起，保证快捷键热键链路自愈。
/// 另有 PING/PONG 心跳：开机自启动时事件 tap 可能创建过早而失灵——
/// 子进程活着却收不到按键（假活，try_wait 看不出来）。连续两轮 PING 无 PONG
/// 就重建子进程；重设快捷键能恢复、而现在自启动后不响应正是这个形态
fn start_hook_watchdog(app: tauri::AppHandle) {
    let state = app.state::<KeyboardHookProcess>().0.clone();
    let tracker = app.state::<HookPingTracker>();
    let (sent, seen) = (tracker.0.clone(), tracker.1.clone());
    // 连续失败次数（用于退避：反复重建仍失灵时把节奏放缓，避免疯狂建子进程）
    let mut miss_streak = 0u32;
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(3));
        // 每次检查都重读配置：用户在设置里新增/删除快捷键也能被接住
        let args = hook_args(&app);
        if args.is_empty() {
            continue;
        }

        fn kill_current(state: &Mutex<Option<HookChild>>) -> bool {
            let mut guard = state.lock().unwrap();
            if let Some(hc) = guard.as_mut() {
                let _ = hc.child.kill();
            }
            let was_alive = guard.is_some();
            *guard = None;
            was_alive
        }

        // 1) 进程级判定：None 或已退出 → 直接重建
        let exited = {
            let mut guard = state.lock().unwrap();
            match guard.as_mut() {
                Some(hc) => matches!(hc.child.try_wait(), Ok(Some(_)) | Err(_)),
                None => false, // None 属于「未设置快捷键或上次 launch 失败」，交给下方 launch 判断
            }
        };
        if exited {
            kill_current(&state);
            if !launch_hook(&app) {
                eprintln!("[main] keyboard-hook 看门狗: 重建失败，3 秒后重试");
                miss_streak = miss_streak.saturating_add(1);
            } else {
                miss_streak = 0;
            }
            // 新进程给两个心跳周期的预热
            sent.store(0, Ordering::Relaxed);
            seen.store(0, Ordering::Relaxed);
            continue;
        }

        // 2) 心跳判定：上一轮发出的 PING 至今没有 PONG → 进程假活，重建
        let last_sent = sent.load(Ordering::Relaxed);
        let last_seen = seen.load(Ordering::Relaxed);
        if last_sent > 0 && last_seen < last_sent {
            miss_streak = miss_streak.saturating_add(1);
            eprintln!(
                "[main] keyboard-hook 看门狗: 连续 {miss_streak} 轮无 PONG，判定事件 tap 失灵，重建子进程"
            );
            kill_current(&state);
            if !launch_hook(&app) {
                eprintln!("[main] keyboard-hook 看门狗: 重建失败，3 秒后重试");
            }
            sent.store(0, Ordering::Relaxed);
            seen.store(0, Ordering::Relaxed);
            // 反复重建仍失灵（如tique 权限类问题未解除）→ 每 5 次失败后额外歇 30 秒
            if miss_streak.is_multiple_of(5) {
                thread::sleep(Duration::from_secs(30));
            }
            continue;
        }

        // 3) 健康 → 发新一轮 PING
        let pinged = {
            let mut guard = state.lock().unwrap();
            match guard.as_mut() {
                Some(hc) => writeln!(hc.stdin, "PING").is_ok().then(|| hc.stdin.flush().is_ok()),
                None => None,
            }
        };
        if pinged.is_some() {
            sent.store(last_sent + 1, Ordering::Relaxed);
        }
    });
}

pub fn spawn_keyboard_hook(app: tauri::AppHandle) {
    start_hook_watchdog(app.clone());
    launch_hook(&app);
}