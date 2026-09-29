use std::sync::Mutex;

use tauri::Manager;

use crate::app::config::{save_shortcuts, ShortcutConfig};
use crate::app::keyboard_hook::restart_keyboard_hook;

#[tauri::command]
pub fn get_shortcuts_cmd(app: tauri::AppHandle) -> Result<ShortcutConfig, String> {
    let state = app.state::<Mutex<ShortcutConfig>>();
    let config = state.lock().unwrap().clone();
    Ok(config)
}

#[tauri::command]
pub fn update_shortcuts_cmd(app: tauri::AppHandle, config: ShortcutConfig) -> Result<(), String> {
    save_shortcuts(&app, &config);

    {
        let state = app.state::<Mutex<ShortcutConfig>>();
        *state.lock().unwrap() = config.clone();
    }

    restart_keyboard_hook(&app);

    Ok(())
}