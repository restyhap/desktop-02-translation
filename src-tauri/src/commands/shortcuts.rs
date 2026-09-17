use std::sync::Mutex;

use tauri::Manager;

use crate::app::config::{save_shortcuts, ShortcutConfig};
use crate::app::keyboard_hook::{spawn_keyboard_hook, KeyboardHookProcess};

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