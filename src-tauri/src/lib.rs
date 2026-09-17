use std::fs;
use std::sync::Mutex;
use tauri::Manager;

mod app;
mod commands;
mod db;
mod dict;
mod history_store;
mod keys;
mod settings_store;
mod translation;
mod vocabulary_store;

use app::config::{GeneralConfig, load_general_config, load_shortcuts};
use app::keyboard_hook::{KeyboardHookProcess, spawn_keyboard_hook};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["translate"])
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::menu::{MenuBuilder, MenuItemBuilder};
            use tauri::tray::TrayIconBuilder;

            app.manage(KeyboardHookProcess(Mutex::new(None)));

            let initial_shortcuts = load_shortcuts(app.handle());
            app.manage(Mutex::new(initial_shortcuts));

            spawn_keyboard_hook(app.handle().clone());

            // 初始化翻译引擎表
            db::EngineManager::init(app.handle()).ok();

            let initial_general = load_general_config(app.handle());
            app.manage(Mutex::new(initial_general.clone()));

            if let Some(translate_window) = app.get_webview_window("translate") {
                // 启动时应用保存的弹窗大小（逻辑像素，跨平台/多分辨率的通用单位）
                if let Some((w, h)) = initial_general.translate_size {
                    let _ = translate_window.set_size(tauri::LogicalSize::new(w, h));
                }

                let handle = app.handle().clone();
                let last_save = std::sync::Arc::new(Mutex::new(std::time::Instant::now()));
                translate_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Resized(size) = event {
                        // 动态获取当前屏幕缩放系数（支持跨屏拖动、Retina/外接屏比例不同）
                        let scale = handle
                            .get_webview_window("translate")
                            .and_then(|w| w.scale_factor().ok())
                            .unwrap_or(1.0);
                        let logical = size.to_logical::<f64>(scale);
                        let mut guard = last_save.lock().unwrap();
                        if guard.elapsed() >= std::time::Duration::from_millis(400) {
                            *guard = std::time::Instant::now();
                            if let Ok(data) = fs::read_to_string(app::config::get_settings_path(&handle)) {
                                if let Ok(mut config) = serde_json::from_str::<GeneralConfig>(&data)
                                {
                                    config.translate_size = Some((
                                        logical.width.max(1.0) as u32,
                                        logical.height.max(1.0) as u32,
                                    ));
                                    if let Ok(json) = serde_json::to_string_pretty(&config) {
                                        let _ = fs::write(app::config::get_settings_path(&handle), json);
                                    }
                                }
                            }
                        }
                    }
                });
            }

            if let Some(main_window) = app.get_webview_window("main") {
                let cfg = initial_general.clone();
                let handle = app.handle().clone();
                main_window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        if cfg.close_behavior == "exit" {
                            std::process::exit(0);
                        } else {
                            api.prevent_close();
                            if let Some(w) = handle.get_webview_window("main") {
                                let _ = w.hide();
                            }
                        }
                    }
                });
            }

            let toggle_item = MenuItemBuilder::with_id("toggle", "显示主窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&toggle_item, &quit_item])
                .build()?;

            TrayIconBuilder::new()
                .icon(
                    tauri::image::Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
                        .expect("failed to load tray icon"),
                )
                .icon_as_template(true)
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            #[cfg(desktop)]
            let _ = app.handle().plugin(tauri_plugin_updater::Builder::new().build());

            #[cfg(desktop)]
            {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    commands::translation::check_update_auto(handle).await;
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::windows::close_translate_window,
            commands::windows::show_main_window,
            commands::shortcuts::get_shortcuts_cmd,
            commands::shortcuts::update_shortcuts_cmd,
            commands::settings::get_close_behavior_cmd,
            commands::settings::update_close_behavior_cmd,
            commands::settings::init_database_cmd,
            commands::settings::get_db_status_cmd,
            commands::engines::get_engines_cmd,
            commands::engines::add_engine_cmd,
            commands::engines::delete_engine_cmd,
            commands::engines::add_api_key_cmd,
            commands::engines::get_api_key_cmd,
            commands::engines::list_api_keys_cmd,
            commands::engines::delete_api_key_cmd,
            commands::engines::reorder_api_keys_cmd,
            commands::translation::translate_cmd,
            commands::translation::check_update,
            commands::settings::get_all_settings_cmd,
            commands::settings::save_all_settings_cmd,
            commands::history::translate_history_cmd,
            commands::history::get_translations_cmd,
            commands::history::toggle_favorite_cmd,
            commands::history::delete_translation_cmd,
            commands::vocabulary::get_vocabulary_groups_cmd,
            commands::vocabulary::get_vocabulary_words_cmd,
            commands::vocabulary::add_vocabulary_group_cmd,
            commands::vocabulary::delete_vocabulary_group_cmd,
            commands::vocabulary::add_vocabulary_word_cmd,
            commands::vocabulary::delete_vocabulary_word_cmd,
            commands::dictionary::dict_init_cmd,
            commands::dictionary::dict_build_cmd,
            commands::dictionary::dict_search_cmd,
            commands::dictionary::dict_suggest_cmd,
            commands::dictionary::dict_lookup_cmd,
            commands::dictionary::dict_load_resource_cmd,
            commands::dictionary::dict_get_resource_cmd,
            commands::dictionary::dict_has_db_cmd,
            commands::dictionary::dict_word_count_cmd,
            commands::dictionary::dict_list_cmd,
            commands::dictionary::get_dict_paths_cmd,
            commands::dictionary::save_dict_paths_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
