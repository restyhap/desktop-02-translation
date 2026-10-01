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

/// 清理过期历史（设置页「历史保存时效」改动时调用），返回删除条数。
/// days <= 0 表示永久保留，直接返回 0。
#[tauri::command]
pub fn purge_history_cmd(app: tauri::AppHandle, days: i64) -> Result<usize, String> {
    HistoryStore::purge_older_than(&app, days)
}