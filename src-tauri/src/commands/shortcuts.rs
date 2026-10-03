use std::sync::Mutex;

use tauri::Manager;

use crate::app::config::{save_shortcuts, ShortcutConfig};
use crate::app::keyboard_hook::{
    hook_status, open_listen_event_settings, reload_hook_rules, HookStatusSnapshot,
};

#[tauri::command]
pub fn get_shortcuts_cmd(app: tauri::AppHandle) -> Result<ShortcutConfig, String> {
    let state = app.state::<Mutex<ShortcutConfig>>();
    let config = state.lock().unwrap().clone();
    Ok(config)
}

#[tauri::command]
pub fn update_shortcuts_cmd(app: tauri::AppHandle, config: ShortcutConfig) -> Result<(), String> {
    save_shortcuts(&app, &config);

    {
        let state = app.state::<Mutex<ShortcutConfig>>();
        *state.lock().unwrap() = config;
    }

    reload_hook_rules(&app);

    Ok(())
}

/// 快捷键监听诊断状态：未获得「输入监控」授权时 listen_event=false，
/// 此时系统不投递按键事件，快捷键必然无反应——设置页据此给出可见提示。
#[tauri::command]
pub fn get_hook_status_cmd(app: tauri::AppHandle) -> Result<HookStatusSnapshot, String> {
    Ok(hook_status(&app))
}

/// 打开系统「输入监控」设置面板，让用户直接勾选授权
#[tauri::command]
pub fn open_input_monitoring_cmd() -> Result<bool, String> {
    Ok(open_listen_event_settings())
}