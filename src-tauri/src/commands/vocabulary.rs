use crate::vocabulary_store::{VocabularyGroupRecord, VocabularyStore, VocabularyWordRecord};

#[tauri::command]
pub fn add_vocabulary_group_cmd(
    app: tauri::AppHandle,
    name: String,
    color: String,
) -> Result<String, String> {
    VocabularyStore::add_group(&app, &name, &color)
}

#[tauri::command]
pub fn delete_vocabulary_group_cmd(app: tauri::AppHandle, id: String) -> Result<(), String> {
    VocabularyStore::delete_group(&app, &id)
}

#[tauri::command]
pub fn add_vocabulary_word_cmd(
    app: tauri::AppHandle,
    word: String,
    translation: String,
    group_id: String,
    phonetic: Option<String>,
    example: Option<String>,
) -> Result<String, String> {
    VocabularyStore::add_word(
        &app,
        &word,
        &translation,
        &group_id,
        phonetic.as_deref(),
        example.as_deref(),
    )
}

#[tauri::command]
pub fn delete_vocabulary_word_cmd(app: tauri::AppHandle, id: String) -> Result<(), String> {
    VocabularyStore::delete_word(&app, &id)
}

#[tauri::command]
pub fn get_vocabulary_groups_cmd(app: tauri::AppHandle) -> Result<Vec<VocabularyGroupRecord>, String> {
    VocabularyStore::list_groups(&app)
}

#[tauri::command]
pub fn get_vocabulary_words_cmd(app: tauri::AppHandle) -> Result<Vec<VocabularyWordRecord>, String> {
    VocabularyStore::list_words(&app)
}