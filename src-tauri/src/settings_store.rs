use crate::db;

pub struct SettingsStore;

impl SettingsStore {
    pub fn get_all(app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
        let conn = db::open_db(app)?;

        let mut stmt = conn
            .prepare("SELECT key, value_json FROM app_settings")
            .map_err(|e| format!("准备语句失败: {}", e))?;

        let mut settings = serde_json::Map::new();

        loop {
            match stmt.next() {
                Ok(sqlite::State::Row) => {
                    let key: String = stmt.read(0).map_err(|e| e.to_string())?;
                    let value_json: String = stmt.read(1).map_err(|e| e.to_string())?;
                    let value: serde_json::Value = serde_json::from_str(&value_json)
                        .map_err(|e| format!("解析 JSON 失败: {}", e))?;
                    settings.insert(key, value);
                }
                Ok(sqlite::State::Done) => break,
                Err(_) => break,
            }
        }

        Ok(serde_json::Value::Object(settings))
    }

    pub fn save_all(app: &tauri::AppHandle, settings: serde_json::Value) -> Result<(), String> {
        let conn = db::open_db(app)?;

        if let serde_json::Value::Object(map) = settings {
            for (key, value) in map {
                let json_str =
                    serde_json::to_string(&value).map_err(|e| format!("序列化失败: {}", e))?;
                let mut stmt = conn
                    .prepare("INSERT OR REPLACE INTO app_settings (key, value_json) VALUES (?, ?)")
                    .map_err(|e| format!("准备语句失败: {}", e))?;
                stmt.bind((1, &*key))
                    .map_err(|e| format!("绑定参数失败: {}", e))?;
                stmt.bind((2, &*json_str))
                    .map_err(|e| format!("绑定参数失败: {}", e))?;
                stmt.next().map_err(|e| format!("保存设置失败: {}", e))?;
            }
        }

        Ok(())
    }
}