use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use crate::db;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct ShortcutConfig {
    pub translate: String,
    pub show_main: String,
}

impl Default for ShortcutConfig {
    fn default() -> Self {
        Self {
            translate: "⌘+C+C".into(),
            show_main: "⌘+C+V".into(),
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct GeneralConfig {
    pub close_behavior: String,
    #[serde(default)]
    pub translate_size: Option<(u32, u32)>,
}

impl Default for GeneralConfig {
    fn default() -> Self {
        Self {
            close_behavior: "minimizeToTray".into(),
            translate_size: None,
        }
    }
}

pub fn get_config_dir(app: &tauri::AppHandle) -> PathBuf {
    let config_dir = app
        .path()
        .app_config_dir()
        .expect("failed to get app config dir");
    fs::create_dir_all(&config_dir).ok();
    config_dir
}

pub fn get_settings_path(app: &tauri::AppHandle) -> PathBuf {
    get_config_dir(app).join("settings.json")
}

pub fn load_general_config(app: &tauri::AppHandle) -> GeneralConfig {
    let path = get_settings_path(app);
    fs::read_to_string(&path)
        .ok()
        .and_then(|data| serde_json::from_str(&data).ok())
        .unwrap_or_default()
}

pub fn save_general_config(app: &tauri::AppHandle, config: &GeneralConfig) {
    let path = get_settings_path(app);
    if let Ok(data) = serde_json::to_string_pretty(config) {
        fs::write(path, data).ok();
    }
}

pub fn load_shortcuts(app: &tauri::AppHandle) -> ShortcutConfig {
    let conn = match db::open_db(app) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[shortcuts] 打开数据库失败，使用默认值: {}", e);
            return ShortcutConfig::default();
        }
    };

    let mut stmt = match conn.prepare("SELECT value_json FROM app_settings WHERE key = 'shortcuts'") {
        Ok(s) => s,
        Err(_) => return ShortcutConfig::default(),
    };

    match stmt.next() {
        Ok(sqlite::State::Row) => {
            let json_str: String = stmt.read(0).unwrap_or_default();
            serde_json::from_str(&json_str).unwrap_or_default()
        }
        _ => {
            let defaults = ShortcutConfig::default();
            save_shortcuts(app, &defaults);
            defaults
        }
    }
}

pub fn save_shortcuts(app: &tauri::AppHandle, config: &ShortcutConfig) {
    let conn = match db::open_db(app) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[shortcuts] 打开数据库失败，无法保存: {}", e);
            return;
        }
    };

    let json_str = serde_json::to_string(config).unwrap_or_default();
    let mut stmt = match conn.prepare(
        "INSERT OR REPLACE INTO app_settings (key, value_json) VALUES ('shortcuts', ?)",
    ) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[shortcuts] 准备语句失败: {}", e);
            return;
        }
    };
    stmt.bind((1, json_str.as_str())).ok();
    if let Err(e) = stmt.next() {
        eprintln!("[shortcuts] 保存到数据库失败: {:?}", e);
    }
}

/// "⌘+C+C" / "Ctrl+Shift+A" → "meta:C,C"（事件 tap 匹配用的内部格式）
///
/// 注意右半区修饰键（`MetaRight` / `ControlRight` / …）：前端录制器用 DOM
/// `event.key`，按住右 ⌘ 得到的就是这些名字，必须一并归到对应修饰键，否则会被
/// 当成普通键（「⌘+META」这样的组合永远匹配不上）。
pub fn extract_keys_from_shortcut(shortcut: &str) -> String {
    let mut modifiers = Vec::new();
    let mut keys = Vec::new();
    for part in shortcut.split('+') {
        let part = part.trim();
        if part.is_empty() {
            continue;
        }
        let modifier = match part {
            "Ctrl" | "Control" | "ControlRight" => Some("ctrl"),
            "⌘" | "Meta" | "Command" | "MetaRight" => Some("meta"),
            "⇧" | "Shift" | "ShiftRight" => Some("shift"),
            "⌥" | "Alt" | "AltRight" => Some("alt"),
            _ => None,
        };
        match modifier {
            Some(name) => {
                if !modifiers.contains(&name) {
                    modifiers.push(name);
                }
            }
            None => keys.push(part.to_uppercase()),
        }
    }
    if keys.is_empty() {
        keys.push("C".to_string());
    }
    format!("{}:{}", modifiers.join(","), keys.join(","))
}