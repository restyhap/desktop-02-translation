use std::sync::Mutex;

use tauri::Manager;

use crate::app::config::{save_general_config, GeneralConfig};
use crate::db;
use crate::settings_store::SettingsStore;

#[tauri::command]
pub fn init_database_cmd(app: tauri::AppHandle) -> Result<db::DbInitStatus, String> {
    db::Database::init(&app)
}

#[tauri::command]
pub fn get_db_status_cmd(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(db::Database::exists(&app))
}

#[tauri::command]
pub fn get_close_behavior_cmd(app: tauri::AppHandle) -> Result<String, String> {
    let state = app.state::<Mutex<GeneralConfig>>();
    let val = state.lock().unwrap().close_behavior.clone();
    Ok(val)
}

#[tauri::command]
pub fn update_close_behavior_cmd(app: tauri::AppHandle, behavior: String) -> Result<(), String> {
    let state = app.state::<Mutex<GeneralConfig>>();
    let mut cfg = state.lock().unwrap();
    cfg.close_behavior = behavior;
    save_general_config(&app, &cfg);
    Ok(())
}

#[tauri::command]
pub fn get_all_settings_cmd(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    SettingsStore::get_all(&app)
}

#[tauri::command]
pub fn save_all_settings_cmd(
    app: tauri::AppHandle,
    settings: serde_json::Value,
) -> Result<(), String> {
    SettingsStore::save_all(&app, settings)
}