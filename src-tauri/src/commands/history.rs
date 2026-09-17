use crate::history_store::{HistoryStore, TranslationRecord};

#[tauri::command]
pub fn translate_history_cmd(
    app: tauri::AppHandle,
    translation: serde_json::Value,
) -> Result<(), String> {
    HistoryStore::save(&app, translation)
}

#[tauri::command]
pub fn get_translations_cmd(app: tauri::AppHandle) -> Result<Vec<TranslationRecord>, String> {
    HistoryStore::list(&app)
}

#[tauri::command]
pub fn toggle_favorite_cmd(app: tauri::AppHandle, id: String) -> Result<(), String> {
    HistoryStore::toggle_favorite(&app, &id)
}

#[tauri::command]
pub fn delete_translation_cmd(app: tauri::AppHandle, id: String) -> Result<(), String> {
    HistoryStore::delete(&app, &id)
}