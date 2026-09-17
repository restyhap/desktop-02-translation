
#[tauri::command]
pub fn dict_init_cmd(app: tauri::AppHandle) -> Result<bool, String> {
    crate::dict::Dictionary::init(&app)
}

#[tauri::command]
pub async fn dict_build_cmd(app: tauri::AppHandle) -> Result<String, String> {
    tokio::task::spawn_blocking(move || crate::dict::Dictionary::build(&app))
        .await
        .map_err(|e| format!("构建任务失败: {}", e))?
}

#[tauri::command]
pub fn dict_search_cmd(app: tauri::AppHandle, query: String) -> Result<crate::dict::DictSearchResult, String> {
    crate::dict::Dictionary::search(&app, query)
}

#[tauri::command]
pub fn dict_suggest_cmd(
    app: tauri::AppHandle,
    query: String,
    dictionary_id: Option<i64>,
) -> Result<crate::dict::DictSuggestResult, String> {
    crate::dict::Dictionary::suggest(&app, query, dictionary_id)
}

#[tauri::command]
pub fn dict_lookup_cmd(
    app: tauri::AppHandle,
    word: String,
    dictionary_id: Option<i64>,
) -> Result<crate::dict::DictLookupResult, String> {
    crate::dict::Dictionary::lookup(&app, word, dictionary_id)
}

#[tauri::command]
pub fn dict_load_resource_cmd(
    app: tauri::AppHandle,
    word: String,
) -> Result<Vec<crate::dict::DictResource>, String> {
    crate::dict::Dictionary::get_resources(&app, word)
}

#[tauri::command]
pub fn dict_get_resource_cmd(
    zip_file: String,
    filename: String,
) -> Result<crate::dict::DictResourceData, String> {
    crate::dict::Dictionary::get_resource_data(zip_file, filename)
}

#[tauri::command]
pub fn dict_has_db_cmd(app: tauri::AppHandle) -> bool {
    crate::dict::Dictionary::has_db(&app)
}

#[tauri::command]
pub fn dict_word_count_cmd(app: tauri::AppHandle) -> Result<i64, String> {
    crate::dict::Dictionary::get_word_count(&app)
}

#[tauri::command]
pub fn dict_list_cmd(app: tauri::AppHandle) -> Result<crate::dict::DictListResult, String> {
    crate::dict::Dictionary::list(&app)
}

#[tauri::command]
pub fn get_dict_paths_cmd(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    crate::db::DictPaths::get(&app)
}

#[tauri::command]
pub fn save_dict_paths_cmd(app: tauri::AppHandle, paths: Vec<String>) -> Result<(), String> {
    crate::db::DictPaths::set(&app, &paths)
}
