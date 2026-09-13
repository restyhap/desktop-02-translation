use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::Mutex;
use tauri::{Emitter, LogicalPosition, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

mod db;
mod keys;
mod translation;

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
                    "A" => Code::KeyA,
                    "B" => Code::KeyB,
                    "C" => Code::KeyC,
                    "D" => Code::KeyD,
                    "E" => Code::KeyE,
                    "F" => Code::KeyF,
                    "G" => Code::KeyG,
                    "H" => Code::KeyH,
                    "I" => Code::KeyI,
                    "J" => Code::KeyJ,
                    "K" => Code::KeyK,
                    "L" => Code::KeyL,
                    "M" => Code::KeyM,
                    "N" => Code::KeyN,
                    "O" => Code::KeyO,
                    "P" => Code::KeyP,
                    "Q" => Code::KeyQ,
                    "R" => Code::KeyR,
                    "S" => Code::KeyS,
                    "T" => Code::KeyT,
                    "U" => Code::KeyU,
                    "V" => Code::KeyV,
                    "W" => Code::KeyW,
                    "X" => Code::KeyX,
                    "Y" => Code::KeyY,
                    "Z" => Code::KeyZ,
                    "0" => Code::Digit0,
                    "1" => Code::Digit1,
                    "2" => Code::Digit2,
                    "3" => Code::Digit3,
                    "4" => Code::Digit4,
                    "5" => Code::Digit5,
                    "6" => Code::Digit6,
                    "7" => Code::Digit7,
                    "8" => Code::Digit8,
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

fn extract_key_from_shortcut(shortcut: &str) -> String {
    // 从快捷键字符串中提取最后一个非修饰键
    let parts: Vec<&str> = shortcut.split('+').collect();
    for part in parts.iter().rev() {
        let key = part.trim();
        if !matches!(
            key,
            "Ctrl" | "⌘" | "⇧" | "⌥" | "Command" | "Control" | "Shift" | "Alt"
        ) {
            return key.to_uppercase();
        }
    }
    "C".to_string()
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

    // 获取当前翻译快捷键配置
    let shortcuts = app.state::<Mutex<ShortcutConfig>>();
    let config = shortcuts.lock().unwrap().clone();
    let key_arg = extract_key_from_shortcut(&config.translate);

    let mut cmd = Command::new(&hook_bin);
    cmd.arg(&key_arg)
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
                eprintln!("[main] received line: '{}'", line);
                if line.trim() == "TRANSLATE" || line.trim().starts_with("TRANSLATE ") {
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
                        let last = LAST_CLIPBOARD.lock().unwrap_or_else(|e| e.into_inner());
                        last.clone().unwrap_or_default()
                    } else {
                        text.clone()
                    };
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
                }
            }
        });
    } else {
        eprintln!("[main] keyboard-hook stdout 不可用，跳过输出监听");
    }

    println!("✓ keyboard-hook 子进程已启动");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["translate"])
                .build(),
        )
        .setup(|app| {
            use tauri::menu::{MenuBuilder, MenuItemBuilder};
            use tauri::tray::TrayIconBuilder;

            app.manage(KeyboardHookProcess(Mutex::new(None)));

            let initial_shortcuts = load_shortcuts(app.handle());
            if initial_shortcuts.show_main.is_empty() {
                let defaults = ShortcutConfig {
                    translate: "⌘+C+C".into(),
                    show_main: "⌘+Shift+T".into(),
                };
                save_shortcuts(app.handle(), &defaults);
                app.manage(Mutex::new(defaults));
            } else {
                app.manage(Mutex::new(initial_shortcuts));
            }

            register_shortcuts(app.handle()).ok();
            spawn_keyboard_hook(app.handle().clone());

            let initial_general = load_general_config(app.handle());
            app.manage(Mutex::new(initial_general.clone()));

            if let Some(translate_window) = app.get_webview_window("translate") {
                // 启动时应用保存的弹窗大小（逻辑像素，跨平台/多分辨率的通用单位）
                if let Some((w, h)) = initial_general.translate_size {
                    let _ = translate_window.set_size(tauri::LogicalSize::new(w, h));
                }

                let handle = app.handle().clone();
                let last_save = std::sync::Arc::new(Mutex::new(std::time::Instant::now()));
                translate_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Resized(size) = event {
                        // 动态获取当前屏幕缩放系数（支持跨屏拖动、Retina/外接屏比例不同）
                        let scale = handle
                            .get_webview_window("translate")
                            .and_then(|w| w.scale_factor().ok())
                            .unwrap_or(1.0);
                        let logical = size.to_logical::<f64>(scale);
                        let mut guard = last_save.lock().unwrap();
                        if guard.elapsed() >= std::time::Duration::from_millis(400) {
                            *guard = std::time::Instant::now();
                            if let Ok(data) = fs::read_to_string(get_settings_path(&handle)) {
                                if let Ok(mut config) = serde_json::from_str::<GeneralConfig>(&data)
                                {
                                    config.translate_size = Some((
                                        logical.width.max(1.0) as u32,
                                        logical.height.max(1.0) as u32,
                                    ));
                                    if let Ok(json) = serde_json::to_string_pretty(&config) {
                                        let _ = fs::write(get_settings_path(&handle), json);
                                    }
                                }
                            }
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
            let menu = MenuBuilder::new(app)
                .items(&[&toggle_item, &quit_item])
                .build()?;

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
            init_database_cmd,
            get_db_status_cmd,
            add_api_key_cmd,
            get_api_key_cmd,
            list_api_keys_cmd,
            delete_api_key_cmd,
            translate_cmd,
            get_all_settings_cmd,
            save_all_settings_cmd,
            translate_history_cmd,
            get_translations_cmd,
            toggle_favorite_cmd,
            delete_translation_cmd,
            get_vocabulary_groups_cmd,
            get_vocabulary_words_cmd,
            add_vocabulary_group_cmd,
            delete_vocabulary_group_cmd,
            add_vocabulary_word_cmd,
            delete_vocabulary_word_cmd,
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
    parse_shortcut(&config.show_main).map_err(|e| format!("显示主窗口快捷键无效: {}", e))?;

    save_shortcuts(&app, &config);

    {
        let state = app.state::<Mutex<ShortcutConfig>>();
        *state.lock().unwrap() = config.clone();
    }

    register_shortcuts(&app)?;

    {
        let hook_state = app.state::<KeyboardHookProcess>();
        let mut guard = hook_state.0.lock().unwrap();
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    spawn_keyboard_hook(app);

    Ok(())
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

#[tauri::command]
fn init_database_cmd(app: tauri::AppHandle) -> Result<db::DbInitStatus, String> {
    db::Database::init(&app)
}

#[tauri::command]
fn get_db_status_cmd(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(db::Database::exists(&app))
}

#[tauri::command]
fn add_api_key_cmd(
    app: tauri::AppHandle,
    service: String,
    key: String,
    display_name: Option<String>,
    app_id: Option<String>,
    sort: Option<i64>,
) -> Result<(), String> {
    let display_name = display_name.unwrap_or_default();
    let app_id = app_id.as_deref();
    keys::KeyManager::save_key(
        &app,
        &service,
        &display_name,
        app_id,
        &key,
        sort.unwrap_or(0),
    )
}

#[tauri::command]
fn get_api_key_cmd(app: tauri::AppHandle, service: String) -> Result<Option<String>, String> {
    keys::KeyManager::get_key(&app, &service)
}

#[tauri::command]
fn list_api_keys_cmd(app: tauri::AppHandle) -> Result<Vec<keys::ApiKeyRecord>, String> {
    keys::KeyManager::list_keys(&app)
}

#[tauri::command]
fn delete_api_key_cmd(app: tauri::AppHandle, service: String) -> Result<(), String> {
    keys::KeyManager::delete_key(&app, &service)
}

fn find_cached_translation(
    app: &tauri::AppHandle,
    text: &str,
    source_lang: &str,
    target_lang: &str,
    engine: &str,
) -> Option<(String, String)> {
    let conn = sqlite::open(db::Database::get_db_path(app)).ok()?;
    let mut stmt = conn
        .prepare(
            "SELECT translated_text, source_lang FROM translation_history \
             WHERE source_text = ?1 AND source_lang = ?2 AND target_lang = ?3 AND engine = ?4 \
             ORDER BY timestamp DESC LIMIT 1",
        )
        .ok()?;
    stmt.bind((1, text)).ok()?;
    stmt.bind((2, source_lang)).ok()?;
    stmt.bind((3, target_lang)).ok()?;
    stmt.bind((4, engine)).ok()?;
    match stmt.next() {
        Ok(sqlite::State::Row) => {
            let translated: String = stmt.read(0).ok()?;
            let cached_source_lang: String = stmt.read(1).ok()?;
            Some((translated, cached_source_lang))
        }
        _ => None,
    }
}

#[tauri::command]
async fn translate_cmd(
    app: tauri::AppHandle,
    text: String,
    source_lang: String,
    target_lang: String,
    engine: String,
) -> Result<serde_json::Value, String> {
    // 缓存命中直接返回，跳过 API（省配额/离线可用）
    if let Some(cached) = find_cached_translation(&app, &text, &source_lang, &target_lang, &engine) {
        return Ok(serde_json::json!({
            "text": cached.0,
            "source_lang": source_lang,
            "target_lang": target_lang,
            "engine": engine,
        }));
    }

    // 获取 API Key 和 App ID
    let key_record = keys::KeyManager::get_key_with_appid(&app, &engine)
        .map_err(|e| format!("读取 API Key 失败: {}", e))?;

    let (api_key, app_id) = match key_record {
        Some((key, app_id)) if !key.is_empty() => (key, app_id),
        _ => return Err(format!("未找到 {} 的 API Key，请在设置中配置", engine)),
    };

    let result = match engine.as_str() {
        "google" => {
            translation::translate_with_google(&text, &source_lang, &target_lang, &api_key).await
        }
        "deepl" => {
            translation::translate_with_deepl(&text, &source_lang, &target_lang, &api_key).await
        }
        "baidu" => {
            translation::translate_with_baidu(&text, &source_lang, &target_lang, &app_id, &api_key)
                .await
        }
        "youdao" => {
            translation::translate_with_youdao(&text, &source_lang, &target_lang, &app_id, &api_key)
                .await
        }
        "caiyun" => {
            translation::translate_with_caiyun(&text, &source_lang, &target_lang, &api_key).await
        }
        _ => return Err(format!("不支持的翻译引擎: {}", engine)),
    }?;

    Ok(serde_json::json!({
        "text": result.text,
        "source_lang": result.source_lang,
        "target_lang": result.target_lang,
        "engine": result.engine,
    }))
}

#[tauri::command]
fn get_all_settings_cmd(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let conn = sqlite::open(db::Database::get_db_path(&app))
        .map_err(|e| format!("打开数据库失败: {}", e))?;

    let mut stmt = conn
        .prepare("SELECT key, value_json FROM app_settings")
        .map_err(|e| format!("准备语句失败: {}", e))?;

    let mut settings = serde_json::Map::new();

    loop {
        match stmt.next() {
            Ok(sqlite::State::Row) => {
                let key: String = stmt.read(0).map_err(|e| e.to_string())?;
                let value_json: String = stmt.read(1).map_err(|e| e.to_string())?;
                let value: serde_json::Value = serde_json::from_str(&value_json)
                    .map_err(|e| format!("解析 JSON 失败: {}", e))?;
                settings.insert(key, value);
            }
            Ok(sqlite::State::Done) => break,
            Err(_) => break,
        }
    }

    Ok(serde_json::Value::Object(settings))
}

#[tauri::command]
fn translate_history_cmd(
    app: tauri::AppHandle,
    translation: serde_json::Value,
) -> Result<(), String> {
    let conn = sqlite::open(db::Database::get_db_path(&app))
        .map_err(|e| format!("打开数据库失败: {}", e))?;

    conn.execute("CREATE TABLE IF NOT EXISTS translation_history (
        id TEXT PRIMARY KEY, source_text TEXT NOT NULL, translated_text TEXT NOT NULL,
        source_lang TEXT NOT NULL, target_lang TEXT NOT NULL, engine TEXT NOT NULL DEFAULT 'google',
        timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now')), favorite INTEGER NOT NULL DEFAULT 0
    )").map_err(|e| e.to_string())?;

    let id = translation
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or(" missing id")?;
    let source_text = translation
        .get("source_text")
        .and_then(|v| v.as_str())
        .ok_or(" missing source_text")?;
    let translated_text = translation
        .get("translated_text")
        .and_then(|v| v.as_str())
        .ok_or(" missing translated_text")?;
    let source_lang = translation
        .get("source_lang")
        .and_then(|v| v.as_str())
        .ok_or(" missing source_lang")?;
    let target_lang = translation
        .get("target_lang")
        .and_then(|v| v.as_str())
        .ok_or(" missing target_lang")?;
    let engine = translation
        .get("engine")
        .and_then(|v| v.as_str())
        .unwrap_or("google");
    let timestamp = translation
        .get("timestamp")
        .and_then(|v| v.as_i64())
        .unwrap_or_else(|| {
            let start = std::time::SystemTime::now();
            match start.duration_since(std::time::UNIX_EPOCH) {
                Ok(n) => n.as_secs() as i64,
                Err(_) => 0,
            }
        });
    let favorite = translation
        .get("favorite")
        .and_then(|v| v.as_i64())
        .unwrap_or(0) as i32;

    let mut stmt = conn
        .prepare(
            "INSERT OR REPLACE INTO translation_history (id, source_text, translated_text, source_lang, target_lang, engine, timestamp, favorite) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .map_err(|e| format!("准备语句失败: {}", e))?;
    stmt.bind((1, id))
        .map_err(|e| format!("绑定参数失败: {}", e))?;
    stmt.bind((2, source_text))
        .map_err(|e| format!("绑定参数失败: {}", e))?;
    stmt.bind((3, translated_text))
        .map_err(|e| format!("绑定参数失败: {}", e))?;
    stmt.bind((4, source_lang))
        .map_err(|e| format!("绑定参数失败: {}", e))?;
    stmt.bind((5, target_lang))
        .map_err(|e| format!("绑定参数失败: {}", e))?;
    stmt.bind((6, engine))
        .map_err(|e| format!("绑定参数失败: {}", e))?;
    stmt.bind((7, timestamp))
        .map_err(|e| format!("绑定参数失败: {}", e))?;
    stmt.bind((8, favorite as i64))
        .map_err(|e| format!("绑定参数失败: {}", e))?;
    stmt.next()
        .map_err(|e| format!("写入翻译历史失败: {}", e))?;

    Ok(())
}

#[tauri::command]
fn save_all_settings_cmd(app: tauri::AppHandle, settings: serde_json::Value) -> Result<(), String> {
    let conn = sqlite::open(db::Database::get_db_path(&app))
        .map_err(|e| format!("打开数据库失败: {}", e))?;

    if let serde_json::Value::Object(map) = settings {
        for (key, value) in map {
            let json_str =
                serde_json::to_string(&value).map_err(|e| format!("序列化失败: {}", e))?;
            let mut stmt = conn
                .prepare("INSERT OR REPLACE INTO app_settings (key, value_json) VALUES (?, ?)")
                .map_err(|e| format!("准备语句失败: {}", e))?;
            stmt.bind((1, &*key))
                .map_err(|e| format!("绑定参数失败: {}", e))?;
            stmt.bind((2, &*json_str))
                .map_err(|e| format!("绑定参数失败: {}", e))?;
            stmt.next().map_err(|e| format!("保存设置失败: {}", e))?;
        }
    }

    Ok(())
}

// ==================== Legacy 兼容 ====================

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
struct TranslationRecord {
    id: String,
    source_text: String,
    translated_text: String,
    source_lang: String,
    target_lang: String,
    engine: String,
    timestamp: i64,
    favorite: i32,
}

#[tauri::command]
fn get_translations_cmd(app: tauri::AppHandle) -> Result<Vec<TranslationRecord>, String> {
    let conn = sqlite::open(db::Database::get_db_path(&app))
        .map_err(|e| format!("打开数据库失败: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT id, source_text, translated_text, source_lang, target_lang, engine, timestamp, favorite FROM translation_history ORDER BY timestamp DESC"
    ).map_err(|e| format!("准备语句失败: {}", e))?;

    let mut records = Vec::new();
    loop {
        match stmt.next() {
            Ok(sqlite::State::Row) => {
                let id: String = stmt.read(0).unwrap_or_default();
                let source_text: String = stmt.read(1).unwrap_or_default();
                let translated_text: String = stmt.read(2).unwrap_or_default();
                let source_lang: String = stmt.read(3).unwrap_or_default();
                let target_lang: String = stmt.read(4).unwrap_or_default();
                let engine: String = stmt.read(5).unwrap_or_default();
                let timestamp: i64 = stmt.read(6).unwrap_or(0);
                let favorite: i32 = stmt.read(7).unwrap_or(0.0_f64) as i32;
                records.push(TranslationRecord {
                    id,
                    source_text,
                    translated_text,
                    source_lang,
                    target_lang,
                    engine,
                    timestamp,
                    favorite,
                });
            }
            Ok(sqlite::State::Done) => break,
            Err(e) => return Err(format!("读取失败: {}", e)),
        }
    }
    Ok(records)
}

#[tauri::command]
fn toggle_favorite_cmd(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = sqlite::open(db::Database::get_db_path(&app))
        .map_err(|e| format!("打开数据库失败: {}", e))?;
    let mut stmt = conn.prepare(
        "UPDATE translation_history SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?"
    ).map_err(|e| format!("准备语句失败: {}", e))?;
    stmt.bind((1, &*id))
        .map_err(|e| format!("绑定参数失败: {}", e))?;
    stmt.next().map_err(|e| format!("更新收藏失败: {}", e))?;
    Ok(())
}

#[tauri::command]
fn delete_translation_cmd(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = sqlite::open(db::Database::get_db_path(&app))
        .map_err(|e| format!("打开数据库失败: {}", e))?;
    let mut stmt = conn
        .prepare("DELETE FROM translation_history WHERE id = ?")
        .map_err(|e| format!("准备语句失败: {}", e))?;
    stmt.bind((1, &*id))
        .map_err(|e| format!("绑定参数失败: {}", e))?;
    stmt.next().map_err(|e| format!("删除记录失败: {}", e))?;
    Ok(())
}

#[tauri::command]
fn add_vocabulary_group_cmd(
    app: tauri::AppHandle,
    name: String,
    color: String,
) -> Result<String, String> {
    let conn = sqlite::open(db::Database::get_db_path(&app))
        .map_err(|e| format!("打开数据库失败: {}", e))?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let id = format!("grp_{}", ts);
    let mut stmt = conn
        .prepare("INSERT INTO vocabulary_groups (id, name, color) VALUES (?, ?, ?)")
        .map_err(|e| format!("准备语句失败: {}", e))?;
    stmt.bind((1, &*id)).map_err(|e| e.to_string())?;
    stmt.bind((2, &*name)).map_err(|e| e.to_string())?;
    stmt.bind((3, &*color)).map_err(|e| e.to_string())?;
    stmt.next().map_err(|e| format!("创建词组失败: {}", e))?;
    Ok(id)
}

#[tauri::command]
fn delete_vocabulary_group_cmd(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = sqlite::open(db::Database::get_db_path(&app))
        .map_err(|e| format!("打开数据库失败: {}", e))?;
    let mut stmt1 = conn
        .prepare("DELETE FROM vocabulary_words WHERE group_id = ?")
        .map_err(|e| format!("准备语句失败: {}", e))?;
    stmt1.bind((1, &*id)).map_err(|e| e.to_string())?;
    stmt1.next().map_err(|e| format!("删除词条失败: {}", e))?;
    let mut stmt2 = conn
        .prepare("DELETE FROM vocabulary_groups WHERE id = ?")
        .map_err(|e| format!("准备语句失败: {}", e))?;
    stmt2.bind((1, &*id)).map_err(|e| e.to_string())?;
    stmt2.next().map_err(|e| format!("删除词组失败: {}", e))?;
    Ok(())
}

#[tauri::command]
fn add_vocabulary_word_cmd(
    app: tauri::AppHandle,
    word: String,
    translation: String,
    group_id: String,
    phonetic: Option<String>,
    example: Option<String>,
) -> Result<String, String> {
    let conn = sqlite::open(db::Database::get_db_path(&app))
        .map_err(|e| format!("打开数据库失败: {}", e))?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let id = format!("wrd_{}", ts);
    let mut stmt = conn.prepare(
        "INSERT INTO vocabulary_words (id, word, translation, group_id, phonetic, example) VALUES (?, ?, ?, ?, ?, ?)"
    ).map_err(|e| format!("准备语句失败: {}", e))?;
    stmt.bind((1, &*id)).map_err(|e| e.to_string())?;
    stmt.bind((2, &*word)).map_err(|e| e.to_string())?;
    stmt.bind((3, &*translation)).map_err(|e| e.to_string())?;
    stmt.bind((4, &*group_id)).map_err(|e| e.to_string())?;
    stmt.bind((5, phonetic.as_deref().unwrap_or("")))
        .map_err(|e| e.to_string())?;
    stmt.bind((6, example.as_deref().unwrap_or("")))
        .map_err(|e| e.to_string())?;
    stmt.next().map_err(|e| format!("添加词条失败: {}", e))?;
    Ok(id)
}

#[tauri::command]
fn delete_vocabulary_word_cmd(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let conn = sqlite::open(db::Database::get_db_path(&app))
        .map_err(|e| format!("打开数据库失败: {}", e))?;
    let mut stmt = conn
        .prepare("DELETE FROM vocabulary_words WHERE id = ?")
        .map_err(|e| format!("准备语句失败: {}", e))?;
    stmt.bind((1, &*id)).map_err(|e| e.to_string())?;
    stmt.next().map_err(|e| format!("删除词条失败: {}", e))?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
struct VocabularyGroupRecord {
    id: String,
    name: String,
    color: String,
    created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct VocabularyWordRecord {
    id: String,
    word: String,
    translation: String,
    phonetic: Option<String>,
    example: Option<String>,
    group_id: String,
    created_at: i64,
    review_count: i32,
    last_reviewed_at: Option<i64>,
}

#[tauri::command]
fn get_vocabulary_groups_cmd(app: tauri::AppHandle) -> Result<Vec<VocabularyGroupRecord>, String> {
    let conn = sqlite::open(db::Database::get_db_path(&app))
        .map_err(|e| format!("打开数据库失败: {}", e))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, color, created_at FROM vocabulary_groups ORDER BY created_at DESC",
        )
        .map_err(|e| format!("准备语句失败: {}", e))?;

    let mut records = Vec::new();
    loop {
        match stmt.next() {
            Ok(sqlite::State::Row) => {
                let id: String = stmt.read(0).unwrap_or_default();
                let name: String = stmt.read(1).unwrap_or_default();
                let color: String = stmt.read(2).unwrap_or_default();
                let created_at: i64 = stmt.read(3).unwrap_or(0);
                records.push(VocabularyGroupRecord {
                    id,
                    name,
                    color,
                    created_at,
                });
            }
            Ok(sqlite::State::Done) => break,
            Err(e) => return Err(format!("读取失败: {}", e)),
        }
    }
    Ok(records)
}

#[tauri::command]
fn get_vocabulary_words_cmd(app: tauri::AppHandle) -> Result<Vec<VocabularyWordRecord>, String> {
    let conn = sqlite::open(db::Database::get_db_path(&app))
        .map_err(|e| format!("打开数据库失败: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT id, word, translation, phonetic, example, group_id, created_at, review_count, last_reviewed_at FROM vocabulary_words ORDER BY review_count ASC"
    ).map_err(|e| format!("准备语句失败: {}", e))?;

    let mut records = Vec::new();
    loop {
        match stmt.next() {
            Ok(sqlite::State::Row) => {
                let id: String = stmt.read(0).unwrap_or_default();
                let word: String = stmt.read(1).unwrap_or_default();
                let translation: String = stmt.read(2).unwrap_or_default();
                let phonetic: Option<String> = stmt.read(3).ok();
                let example: Option<String> = stmt.read(4).ok();
                let group_id: String = stmt.read(5).unwrap_or_default();
                let created_at: i64 = stmt.read(6).unwrap_or(0);
                let review_count: i32 = stmt.read(7).unwrap_or(0.0_f64) as i32;
                let last_reviewed_at: Option<i64> = stmt.read(8).ok();
                records.push(VocabularyWordRecord {
                    id,
                    word,
                    translation,
                    phonetic,
                    example,
                    group_id,
                    created_at,
                    review_count,
                    last_reviewed_at,
                });
            }
            Ok(sqlite::State::Done) => break,
            Err(e) => return Err(format!("读取失败: {}", e)),
        }
    }
    Ok(records)
}
