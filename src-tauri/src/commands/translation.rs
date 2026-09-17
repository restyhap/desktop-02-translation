
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

// ==================== 更新检查 ====================

pub async fn check_update_auto(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    match app.updater() {
        Ok(updater) => {
            match updater.check().await {
                Ok(Some(update)) => {
                    println!("[updater] 发现新版本: {}", update.version);
                }
                Ok(None) => {
                    println!("[updater] 已是最新版本");
                }
                Err(e) => {
                    println!("[updater] 检查失败: {}", e);
                }
            }
        }
        Err(e) => {
            println!("[updater] 初始化失败: {}", e);
        }
    }
}

#[tauri::command]
pub async fn check_update(app: tauri::AppHandle) -> Result<String, String> {
    use tauri_plugin_updater::UpdaterExt;
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(update) => {
            update
                .download_and_install(|_, _| {}, || {})
                .await
                .map_err(|e| e.to_string())?;
            app.restart()
        }
        None => Ok("已是最新版本".into()),
    }
}
