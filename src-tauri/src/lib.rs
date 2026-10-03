use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex, RwLock};
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

use app::config::{load_general_config, load_shortcuts, save_general_config};
use app::keyboard_hook::{
    HookRules, HookStarted, HookStatus, HookStatusInner, start_keyboard_hook,
};

/// 读取设置里的历史保存时效（general.historyRetentionDays 天），缺失/非法一律回落默认 30 天。
/// 与前端 DEFAULT_SETTINGS.general.historyRetentionDays 保持一致。
fn history_retention_days(app: &tauri::AppHandle) -> Result<i64, String> {
    const DEFAULT_DAYS: i64 = 30;
    let all = settings_store::SettingsStore::get_all(app)?;
    let days = all
        .get("general")
        .and_then(|g| g.get("historyRetentionDays"))
        .and_then(|v| v.as_i64())
        .unwrap_or(DEFAULT_DAYS);
    Ok(if days < 0 { 0 } else { days })
}

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
            // 注意：toast 与 translate 都是运行时 show/hide 的临时小窗，
            // 必须加入 denylist —— 否则插件会把上次退出时的 visible:true 恢复，
            // 导致「程序启动后、未按快捷键，toast 就凭空显示」且永不自动隐藏
            tauri_plugin_window_state::Builder::default()
                .with_denylist(&["translate", "toast"])
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        // 开机自启动：macOS 用 LaunchAgent 注册登录项；--hidden 让自启时静默后台运行
        .plugin(
            tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, vec!["--hidden"].into()),
        )
        .setup(|app| {
            use tauri::menu::{MenuBuilder, MenuItemBuilder};
            use tauri::tray::TrayIconBuilder;

            let initial_shortcuts = load_shortcuts(app.handle());
            app.manage(Mutex::new(initial_shortcuts));

            // 全局快捷键：tap 直接跑在主进程的后台线程（v0.1.2 起不再有 keyboard-hook 子进程）。
            // HookRules 必须在 start_keyboard_hook 之前 manage —— 它读取 ShortcutConfig 并建规则表。
            app.manage(HookRules(Arc::new(RwLock::new(
                std::collections::HashMap::new(),
            ))));
            app.manage(HookStatus(Arc::new(HookStatusInner {
                listening: AtomicBool::new(false),
                listen_event: AtomicBool::new(false),
                key_events: AtomicU64::new(0),
            })));
            app.manage(HookStarted(AtomicBool::new(false)));

            // MOSS-TTS 引擎缓存（进程级单实例，避免重复加载 7 个 ONNX session）
            // 仅在编译了 moss-tts-nano 的平台上启用
            #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
            app.manage(commands::tts::TtsEngineCache::default());

            start_keyboard_hook(app.handle());

            // 初始化翻译引擎表
            db::EngineManager::init(app.handle()).ok();

            // 启动即清理过期历史（设置页「历史保存时效」，默认 30 天；收藏记录豁免）。
            // 读取失败或清理出错都只记日志，不阻断启动。
            match history_retention_days(app.handle()) {
                Ok(days) => match history_store::HistoryStore::purge_older_than(app.handle(), days)
                {
                    Ok(0) => {}
                    Ok(n) => eprintln!("[history] 已清理 {n} 条过期历史（保留 {days} 天）"),
                    Err(e) => eprintln!("[history] 清理过期历史失败: {e}"),
                },
                Err(e) => eprintln!("[history] 读取历史保存时效失败，跳过清理: {e}"),
            }

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
                            // 直接读整份配置（文件缺失时 load_general_config 返回默认值），
                            // 避免「先读文件、失败即跳过」导致首次调整尺寸永不落盘
                            let mut config = load_general_config(&handle);
                            config.translate_size = Some((
                                logical.width.max(1.0) as u32,
                                logical.height.max(1.0) as u32,
                            ));
                            save_general_config(&handle, &config);
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

            // 以 --hidden 参数自启（开机自启动）时隐藏主窗口，仅留托盘。
            //放在 setup 末尾，晚于 window-state 插件的 visible 恢复，保证真的藏住
            if std::env::args().any(|arg| arg == "--hidden") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::windows::close_translate_window,
            commands::windows::show_main_window,
            commands::shortcuts::get_shortcuts_cmd,
            commands::shortcuts::update_shortcuts_cmd,
            commands::shortcuts::get_hook_status_cmd,
            commands::shortcuts::open_input_monitoring_cmd,
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
            commands::settings::get_all_settings_cmd,
            commands::settings::save_all_settings_cmd,
            commands::history::translate_history_cmd,
            commands::history::get_translations_cmd,
            commands::history::toggle_favorite_cmd,
            commands::history::delete_translation_cmd,
            commands::history::purge_history_cmd,
            commands::vocabulary::get_vocabulary_groups_cmd,
            commands::vocabulary::get_vocabulary_words_cmd,
            commands::vocabulary::add_vocabulary_group_cmd,
            commands::vocabulary::ensure_default_vocabulary_group_cmd,
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
            #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
            commands::tts::tts_model_status_cmd,
            #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
            commands::tts::tts_model_download_cmd,
            #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
            commands::tts::tts_model_delete_cmd,
            #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
            commands::tts::tts_synthesize_cmd,
            #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
            commands::tts::tts_list_voices_cmd,
            #[cfg(not(all(target_os = "macos", target_arch = "x86_64")))]
            commands::tts::tts_set_voice_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
