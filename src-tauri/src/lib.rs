use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{Emitter, Manager, LogicalPosition};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

static LAST_CLIPBOARD: Mutex<Option<String>> = Mutex::new(None);

struct KeyboardHookProcess(Mutex<Option<std::process::Child>>);

#[derive(serde::Serialize, serde::Deserialize, Default, Clone)]
struct ShortcutConfig {
    translate: String,
    show_main: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct GeneralConfig {
    close_behavior: String,
    #[serde(default)]
    translate_size: Option<(u32, u32)>,
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            close_behavior: "minimizeToTray".into(),
            translate_size: None,
        }
    }
}

fn get_config_dir(app: &tauri::AppHandle) -> PathBuf {
    let config_dir = app
        .path()
        .app_config_dir()
        .expect("failed to get app config dir");
    fs::create_dir_all(&config_dir).ok();
    config_dir
}

fn get_shortcut_path(app: &tauri::AppHandle) -> PathBuf {
    get_config_dir(app).join("shortcuts.json")
}

fn get_settings_path(app: &tauri::AppHandle) -> PathBuf {
    get_config_dir(app).join("settings.json")
}

fn load_general_config(app: &tauri::AppHandle) -> GeneralConfig {
    let path = get_settings_path(app);
    fs::read_to_string(&path)
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
        .unwrap_or_default()
}

fn save_general_config(app: &tauri::AppHandle, config: &GeneralConfig) {
    let path = get_settings_path(app);
    if let Ok(data) = serde_json::to_string_pretty(config) {
        fs::write(path, data).ok();
    }
}

fn load_shortcuts(app: &tauri::AppHandle) -> ShortcutConfig {
    let path = get_shortcut_path(app);
    fs::read_to_string(&path)
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
        .unwrap_or_default()
}

fn save_shortcuts(app: &tauri::AppHandle, config: &ShortcutConfig) {
    let path = get_shortcut_path(app);
    if let Ok(data) = serde_json::to_string_pretty(config) {
        fs::write(path, data).ok();
    }
}

fn parse_shortcut(shortcut_str: &str) -> Result<Shortcut, String> {
    let parts: Vec<&str> = shortcut_str.split('+').collect();
    let mut modifiers = Modifiers::empty();
    let mut code = None;

    for part in &parts {
        match *part {
            "Ctrl" => modifiers |= Modifiers::CONTROL,
            "⌘" => modifiers |= Modifiers::SUPER,
            "⇧" => modifiers |= Modifiers::SHIFT,
            "⌥" => modifiers |= Modifiers::ALT,
            key if key.len() == 1 => {
                code = Some(match key.to_uppercase().as_str() {
                    "A" => Code::KeyA, "B" => Code::KeyB, "C" => Code::KeyC,
                    "D" => Code::KeyD, "E" => Code::KeyE, "F" => Code::KeyF,
                    "G" => Code::KeyG, "H" => Code::KeyH, "I" => Code::KeyI,
                    "J" => Code::KeyJ, "K" => Code::KeyK, "L" => Code::KeyL,
                    "M" => Code::KeyM, "N" => Code::KeyN, "O" => Code::KeyO,
                    "P" => Code::KeyP, "Q" => Code::KeyQ, "R" => Code::KeyR,
                    "S" => Code::KeyS, "T" => Code::KeyT, "U" => Code::KeyU,
                    "V" => Code::KeyV, "W" => Code::KeyW, "X" => Code::KeyX,
                    "Y" => Code::KeyY, "Z" => Code::KeyZ,
                    "0" => Code::Digit0, "1" => Code::Digit1, "2" => Code::Digit2,
                    "3" => Code::Digit3, "4" => Code::Digit4, "5" => Code::Digit5,
                    "6" => Code::Digit6, "7" => Code::Digit7, "8" => Code::Digit8,
                    "9" => Code::Digit9,
                    _ => return Err(format!("Unsupported key: {}", key)),
                });
            }
            _ => return Err(format!("Invalid shortcut part: {}", part)),
        }
    }

    let code = code.ok_or("No key specified")?;
    Ok(Shortcut::new(Some(modifiers), code))
}

fn register_shortcuts(app: &tauri::AppHandle) -> Result<(), String> {
    let shortcuts = app.state::<Mutex<ShortcutConfig>>();
    let config = shortcuts.lock().unwrap().clone();

    let gs = app.global_shortcut();
    let show_main = parse_shortcut(&config.show_main)
        .map_err(|e| format!("显示主窗口快捷键解析失败: {}", e))?;

    gs.unregister_all().map_err(|e| e.to_string())?;

    let _ = gs.on_shortcut(show_main, move |app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });

    println!("✓ 显示主窗口快捷键: {}", config.show_main);
    Ok(())
}

fn spawn_keyboard_hook(app: tauri::AppHandle) {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_default();

    let hook_bin = exe_dir.join("keyboard-hook");

    let child = match Command::new(&hook_bin)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[main] keyboard-hook 启动失败: {} (路径: {:?})", e, hook_bin);
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

    // Read stdout (TRANSLATE signals)
    let stdout = child_stdout.unwrap();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().map_while(Result::ok) {
            eprintln!("[main] received line: '{}'", line);
                    if line.trim() == "TRANSLATE" || line.trim().starts_with("TRANSLATE ") {
                        eprintln!("[main] >>> TRANSLATE received, reading clipboard via Tauri...");
                        let text = match app.clipboard().read_text() {
                            Ok(t) => t.trim().to_string(),
                            Err(e) => {
                                eprintln!("[main] clipboard read error: {}", e);
                                String::new()
                            }
                        };
                        let (cursor_x, cursor_y) = if line.trim() == "TRANSLATE" {
                            (0.0, 0.0)
                        } else {
                            let parts: Vec<&str> = line.trim().splitn(3, ' ').collect();
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
                            let last = LAST_CLIPBOARD.lock().unwrap();
                            last.clone().unwrap_or_default()
                        } else {
                            text.clone()
                        };
                        eprintln!("[main] display_text len={}", display_text.len());
                        if !text.trim().is_empty() {
                            let mut last = LAST_CLIPBOARD.lock().unwrap();
                            *last = Some(text.clone());
                        }
                        if let Some(window) = app.get_webview_window("translate") {
                             eprintln!("[main] showing translate window...");
                             // rdev cursor_x/cursor_y are in logical points (CGEventGetLocation).
                             // Tauri setPosition expects logical, but we need to clamp within screen bounds.
                             // Get monitor info for boundary clamping.
                             if let Ok(Some(monitor)) = window.current_monitor() {
                                 let scale = monitor.scale_factor();
                                 let monitor_logical_width = monitor.size().width as f64 / scale;
                                 let monitor_logical_height = monitor.size().height as f64 / scale;
                                 let monitor_logical_x = monitor.position().x as f64 / scale;
                                 let monitor_logical_y = monitor.position().y as f64 / scale;
                                 // Get actual popup size from window (physical -> logical)
                                 let size = window.inner_size().unwrap_or(tauri::PhysicalSize::new(480, 360));
                                 let popup_logical_width = size.width as f64 / scale;
                                 let popup_logical_height = size.height as f64 / scale;
                                 let mut px = cursor_x;
                                 let mut py = cursor_y;
                                 // Clamp within monitor bounds
                                 if px + popup_logical_width > monitor_logical_x + monitor_logical_width {
                                     px = monitor_logical_x + monitor_logical_width - popup_logical_width;
                                 }
                                 if py + popup_logical_height > monitor_logical_y + monitor_logical_height {
                                     py = monitor_logical_y + monitor_logical_height - popup_logical_height;
                                 }
                                 if px < monitor_logical_x { px = monitor_logical_x; }
                                 if py < monitor_logical_y { py = monitor_logical_y; }
                                 eprintln!("[main] positioning at logical ({}, {}) with size {}x{}", px, py, popup_logical_width, popup_logical_height);
                                 window.set_position(LogicalPosition::new(px, py)).unwrap_or_default();
                             } else {
                                 // Fallback: no monitor info, just position at cursor
                                 window.set_position(LogicalPosition::new(cursor_x, cursor_y)).unwrap_or_default();
                             }
                             match window.show() {
                                 Ok(_) => eprintln!("[main] window.show() ok"),
                                 Err(e) => eprintln!("[main] window.show() error: {}", e),
                             }
                             match window.set_focus() {
                                 Ok(_) => eprintln!("[main] window.set_focus() ok"),
                                 Err(e) => eprintln!("[main] window.set_focus() error: {}", e),
                             }
                             match window.emit(
                                 "show-translate",
                                 serde_json::json!({ "text": display_text, "cursorX": cursor_x, "cursorY": cursor_y }),
                             ) {
                                 Ok(_) => eprintln!("[main] window.emit() ok"),
                                 Err(e) => eprintln!("[main] window.emit() error: {}", e),
                             }
                             eprintln!("[main] done");
                        } else {
                            eprintln!("[main] translate window not found!");
                        }
                    }
        }
        eprintln!("[main] stdout reader thread EXITED");
    });

    println!("✓ keyboard-hook 子进程已启动");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::default().with_denylist(&["translate"]).build())
        .setup(|app| {
            use tauri::menu::{MenuBuilder, MenuItemBuilder};
            use tauri::tray::TrayIconBuilder;

            app.manage(KeyboardHookProcess(Mutex::new(None)));

            let initial_shortcuts = load_shortcuts(&app.handle());
            if initial_shortcuts.show_main.is_empty() {
                let defaults = ShortcutConfig {
                    translate: "⌘+C+C".into(),
                    show_main: "⌘+Shift+T".into(),
                };
                save_shortcuts(&app.handle(), &defaults);
                app.manage(Mutex::new(defaults));
            } else {
                app.manage(Mutex::new(initial_shortcuts));
            }

            register_shortcuts(app.handle()).ok();
            spawn_keyboard_hook(app.handle().clone());

            let initial_general = load_general_config(&app.handle());
            app.manage(Mutex::new(initial_general.clone()));
            if let Some(translate_window) = app.get_webview_window("translate") {
                let handle = app.handle().clone();
                let last_save = std::sync::Mutex::new(std::time::Instant::now());
                translate_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Resized(size) = event {
{
                    let state = handle.state::<Mutex<GeneralConfig>>();
                    state.lock().unwrap().translate_size = Some((size.width, size.height));
                }
                        let mut guard = last_save.lock().unwrap();
                        if guard.elapsed() >= std::time::Duration::from_millis(400) {
                            *guard = std::time::Instant::now();
                            let h = handle.clone();
                            std::thread::spawn(move || {
                                let state = h.state::<Mutex<GeneralConfig>>();
                                let cfg = state.lock().unwrap().clone();
                                save_general_config(&h, &cfg);
                            });
                        }
                    }
                });
            }

            if let Some(main_window) = app.get_webview_window("main") {
                let cfg = initial_general.clone();
                let handle = app.handle().clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        if cfg.close_behavior == "exit" {
                            std::process::exit(0);
                        } else {
                            api.prevent_close();
                            if let Some(w) = handle.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        }
                    }
                });
            }

            let toggle_item = MenuItemBuilder::with_id("toggle", "显示主窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app).items(&[&toggle_item, &quit_item]).build()?;

            TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            close_translate_window,
            show_main_window,
            get_shortcuts_cmd,
            update_shortcuts_cmd,
            get_close_behavior_cmd,
            update_close_behavior_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn close_translate_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("translate") {
        window.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_shortcuts_cmd(app: tauri::AppHandle) -> Result<ShortcutConfig, String> {
    let state = app.state::<Mutex<ShortcutConfig>>();
    let config = state.lock().unwrap().clone();
    Ok(config)
}

#[tauri::command]
fn update_shortcuts_cmd(app: tauri::AppHandle, config: ShortcutConfig) -> Result<(), String> {
    parse_shortcut(&config.show_main)
        .map_err(|e| format!("显示主窗口快捷键无效: {}", e))?;

    save_shortcuts(&app, &config);

    {
        let state = app.state::<Mutex<ShortcutConfig>>();
        *state.lock().unwrap() = config.clone();
    }

    register_shortcuts(&app)
}

#[tauri::command]
fn get_close_behavior_cmd(app: tauri::AppHandle) -> Result<String, String> {
    let state = app.state::<Mutex<GeneralConfig>>();
    let val = state.lock().unwrap().close_behavior.clone();
    Ok(val)
}

#[tauri::command]
fn update_close_behavior_cmd(app: tauri::AppHandle, behavior: String) -> Result<(), String> {
    let state = app.state::<Mutex<GeneralConfig>>();
    let mut cfg = state.lock().unwrap();
    cfg.close_behavior = behavior;
    save_general_config(&app, &cfg);
    Ok(())
}
