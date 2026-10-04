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
        // Windows 上默认用 Ctrl 而不是 ⌘：`⌘` 在 Windows 就是 Win 键，而 `Win+C` /
        // `Win+V` 与系统内建的「小组面板 / 剪贴板历史」冲突，划词窗口会跟系统面板打架。
        // 用户仍可在设置里手动改成 Meta（对应 Win 键）—— 只要他不撞系统快捷键。
        #[cfg(target_os = "windows")]
        let (translate, show_main) = ("Ctrl+C+C", "Ctrl+C+V");
        #[cfg(not(target_os = "windows"))]
        let (translate, show_main) = ("⌘+C+C", "⌘+C+V");

        Self {
            translate: translate.into(),
            show_main: show_main.into(),
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
