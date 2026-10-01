
#[tauri::command]
pub async fn translate_cmd(
    app: tauri::AppHandle,
    text: String,
    source_lang: String,
    target_lang: String,
    engine: String,
) -> Result<crate::translation::TranslationResult, String> {
    crate::translation::translate_with_cache(
        &app,
        &text,
        &source_lang,
        &target_lang,
        &engine,
    )
    .await
}
