use crate::db;
use crate::keys;

#[tauri::command]
pub fn get_engines_cmd(app: tauri::AppHandle) -> Result<Vec<db::TranslationEngine>, String> {
    db::EngineManager::list(&app)
}

#[tauri::command]
pub fn add_engine_cmd(
    app: tauri::AppHandle,
    service_name: String,
    display_name: String,
    url: String,
    requires_app_id: bool,
    requires_api_key: bool,
) -> Result<(), String> {
    db::EngineManager::add(
        &app,
        &service_name,
        &display_name,
        &url,
        requires_app_id,
        requires_api_key,
    )
}

#[tauri::command]
pub fn delete_engine_cmd(app: tauri::AppHandle, service_name: String) -> Result<(), String> {
    db::EngineManager::delete(&app, &service_name)
}

#[tauri::command]
pub fn add_api_key_cmd(
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
pub fn get_api_key_cmd(app: tauri::AppHandle, service: String) -> Result<Option<String>, String> {
    keys::KeyManager::get_key(&app, &service)
}

#[tauri::command]
pub fn list_api_keys_cmd(app: tauri::AppHandle) -> Result<Vec<keys::ApiKeyRecord>, String> {
    keys::KeyManager::list_keys(&app)
}

#[tauri::command]
pub fn delete_api_key_cmd(app: tauri::AppHandle, service: String) -> Result<(), String> {
    keys::KeyManager::delete_key(&app, &service)
}

#[tauri::command]
pub fn reorder_api_keys_cmd(app: tauri::AppHandle, ordered: Vec<String>) -> Result<(), String> {
    keys::KeyManager::reorder_keys(&app, &ordered)
}