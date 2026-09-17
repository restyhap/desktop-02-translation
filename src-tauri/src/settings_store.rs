use crate::db;

pub struct SettingsStore;

impl SettingsStore {
    pub fn get_all(app: &tauri::AppHandle) -> Result<serde_json::Value, String> {
        Self::get_all_conn(&db::open_db(app)?)
    }

    fn get_all_conn(conn: &sqlite::Connection) -> Result<serde_json::Value, String> {
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
        Self::save_all_conn(&db::open_db(app)?, settings)
    }

    fn save_all_conn(
        conn: &sqlite::Connection,
        settings: serde_json::Value,
    ) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::apply_schema;

    fn test_conn() -> sqlite::Connection {
        let conn = sqlite::open(":memory:").expect("内存库应可打开");
        apply_schema(&conn).expect("建表应成功");
        conn
    }

    #[test]
    fn save_then_get_roundtrip_preserves_json_types() {
        let conn = test_conn();
        SettingsStore::save_all_conn(
            &conn,
            serde_json::json!({
                "general": { "theme": "dark", "fontSize": 14 },
                "shortcuts": { "translate": "⌘+C+C" },
                "flags": [true, false]
            }),
        )
        .unwrap();

        let got = SettingsStore::get_all_conn(&conn).unwrap();
        assert_eq!(got["general"]["theme"], "dark");
        assert_eq!(got["general"]["fontSize"], 14);
        assert_eq!(got["shortcuts"]["translate"], "⌘+C+C");
        assert_eq!(got["flags"][1], false);
    }

    #[test]
    fn save_overwrites_existing_key() {
        let conn = test_conn();
        SettingsStore::save_all_conn(&conn, serde_json::json!({ "k": "v1" })).unwrap();
        SettingsStore::save_all_conn(&conn, serde_json::json!({ "k": "v2" })).unwrap();

        let got = SettingsStore::get_all_conn(&conn).unwrap();
        assert_eq!(got["k"], "v2");
        assert_eq!(got.as_object().unwrap().len(), 1);
    }

    #[test]
    fn save_ignores_non_object_payload() {
        let conn = test_conn();
        SettingsStore::save_all_conn(&conn, serde_json::json!([1, 2, 3])).unwrap();

        assert!(SettingsStore::get_all_conn(&conn).unwrap().as_object().unwrap().is_empty());
    }
}
