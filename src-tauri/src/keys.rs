use super::db::Database;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct ApiKeyRecord {
    pub service_name: String,
    pub display_name: String,
    pub app_id: Option<String>,
    pub api_key: String,
    pub sort: i64,
}

pub struct KeyManager;

impl KeyManager {
    /// 确保 api_keys 表存在且包含新版本字段（display_name/app_id/sort），兼容旧表迁移
    fn ensure_schema(conn: &sqlite::Connection) -> Result<(), String> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS api_keys (
            service_name TEXT PRIMARY KEY,
            display_name TEXT NOT NULL DEFAULT '',
            app_id TEXT,
            api_key TEXT NOT NULL,
            sort INTEGER NOT NULL DEFAULT 0
        )",
        )
        .map_err(|e| format!("创建 api_keys 表失败: {}", e))?;

        let cols = Self::columns(conn, "api_keys")?;
        if !cols.iter().any(|s| s.as_str() == "display_name") {
            conn.execute("ALTER TABLE api_keys ADD COLUMN display_name TEXT NOT NULL DEFAULT ''")
                .map_err(|e| format!("迁移 display_name 列失败: {}", e))?;
        }
        if !cols.iter().any(|s| s.as_str() == "app_id") {
            conn.execute("ALTER TABLE api_keys ADD COLUMN app_id TEXT")
                .map_err(|e| format!("迁移 app_id 列失败: {}", e))?;
        }
        if !cols.iter().any(|s| s.as_str() == "sort") {
            conn.execute("ALTER TABLE api_keys ADD COLUMN sort INTEGER NOT NULL DEFAULT 0")
                .map_err(|e| format!("迁移 sort 列失败: {}", e))?;
        }
        Ok(())
    }

    fn columns(conn: &sqlite::Connection, table: &str) -> Result<Vec<String>, String> {
        let mut stmt = conn
            .prepare(format!("PRAGMA table_info({})", table))
            .map_err(|e| format!("读取表结构失败: {}", e))?;
        let mut cols = Vec::new();
        loop {
            match stmt.next() {
                Ok(sqlite::State::Row) => {
                    if let Ok(name) = stmt.read::<String, _>(1) {
                        cols.push(name);
                    }
                }
                Ok(sqlite::State::Done) => break,
                Err(_) => break,
            }
        }
        Ok(cols)
    }

    pub fn save_key(
        app: &tauri::AppHandle,
        service: &str,
        display_name: &str,
        app_id: Option<&str>,
        key: &str,
        sort: i64,
    ) -> Result<(), String> {
        let conn = sqlite::open(Database::get_db_path(app)).map_err(|e| e.to_string())?;
        Self::ensure_schema(&conn)?;

        let display_name = if display_name.is_empty() {
            service
        } else {
            display_name
        };

        let mut stmt = conn.prepare(
            "INSERT INTO api_keys (service_name, display_name, app_id, api_key, sort) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(service_name) DO UPDATE SET
               display_name = excluded.display_name,
               app_id = excluded.app_id,
               api_key = excluded.api_key,
               sort = excluded.sort"
        ).map_err(|e| format!("保存 API Key 失败: {}", e))?;
        stmt.bind((1, service)).map_err(|e| e.to_string())?;
        stmt.bind((2, display_name)).map_err(|e| e.to_string())?;
        stmt.bind((3, app_id.unwrap_or("")))
            .map_err(|e| e.to_string())?;
        stmt.bind((4, key)).map_err(|e| e.to_string())?;
        stmt.bind((5, sort)).map_err(|e| e.to_string())?;
        stmt.next()
            .map_err(|e| format!("保存 API Key 失败: {}", e))?;
        Ok(())
    }

    pub fn get_key(app: &tauri::AppHandle, service: &str) -> Result<Option<String>, String> {
        let conn = sqlite::open(Database::get_db_path(app)).map_err(|e| e.to_string())?;
        Self::ensure_schema(&conn)?;
        let mut stmt = conn
            .prepare("SELECT api_key FROM api_keys WHERE service_name = ?")
            .map_err(|e| e.to_string())?;
        stmt.bind((1, service)).map_err(|e| e.to_string())?;
        match stmt.next() {
            Ok(sqlite::State::Row) => stmt
                .read::<String, _>(0)
                .map(Some)
                .map_err(|e| e.to_string()),
            Ok(_) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn get_key_with_appid(
        app: &tauri::AppHandle,
        service: &str,
    ) -> Result<Option<(String, String)>, String> {
        let conn = sqlite::open(Database::get_db_path(app)).map_err(|e| e.to_string())?;
        Self::ensure_schema(&conn)?;
        let mut stmt = conn
            .prepare("SELECT api_key, app_id FROM api_keys WHERE service_name = ?")
            .map_err(|e| e.to_string())?;
        stmt.bind((1, service)).map_err(|e| e.to_string())?;
        match stmt.next() {
            Ok(sqlite::State::Row) => {
                let api_key: String = stmt.read(0).unwrap_or_default();
                let app_id: Option<String> = stmt.read(1).ok();
                Ok(Some((api_key, app_id.unwrap_or_default())))
            }
            Ok(_) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn list_keys(app: &tauri::AppHandle) -> Result<Vec<ApiKeyRecord>, String> {
        let conn = sqlite::open(Database::get_db_path(app)).map_err(|e| e.to_string())?;
        Self::ensure_schema(&conn)?;

        let mut stmt = conn
            .prepare(
                "SELECT service_name, display_name, app_id, api_key, sort
             FROM api_keys ORDER BY sort ASC, service_name ASC",
            )
            .map_err(|e| e.to_string())?;

        let mut records = Vec::new();
        loop {
            match stmt.next() {
                Ok(sqlite::State::Row) => {
                    let service_name: String = stmt.read(0).unwrap_or_default();
                    let display_name: String = stmt.read(1).unwrap_or_default();
                    let app_id: Option<String> = stmt.read(2).ok();
                    let api_key: String = stmt.read(3).unwrap_or_default();
                    let sort: i64 = stmt.read(4).unwrap_or(0);
                    let masked_key = if api_key.len() > 8 {
                        format!("{}...{}", &api_key[..4], &api_key[api_key.len() - 4..])
                    } else if api_key.is_empty() {
                        String::new()
                    } else {
                        "***".to_string()
                    };
                    records.push(ApiKeyRecord {
                        service_name: service_name.clone(),
                        display_name: if display_name.is_empty() {
                            service_name
                        } else {
                            display_name
                        },
                        app_id,
                        api_key: masked_key,
                        sort,
                    });
                }
                Ok(sqlite::State::Done) => break,
                Err(e) => return Err(e.to_string()),
            }
        }
        Ok(records)
    }

    pub fn reorder_keys(app: &tauri::AppHandle, ordered: &[String]) -> Result<(), String> {
        let conn = sqlite::open(Database::get_db_path(app)).map_err(|e| e.to_string())?;
        Self::ensure_schema(&conn)?;
        for (i, service) in ordered.iter().enumerate() {
            let mut stmt = conn
                .prepare("UPDATE api_keys SET sort = ? WHERE service_name = ?")
                .map_err(|e| e.to_string())?;
            stmt.bind((1, i as i64)).map_err(|e| e.to_string())?;
            stmt.bind((2, service.as_str())).map_err(|e| e.to_string())?;
            stmt.next().map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn delete_key(app: &tauri::AppHandle, service: &str) -> Result<(), String> {
        let conn = sqlite::open(Database::get_db_path(app)).map_err(|e| e.to_string())?;
        Self::ensure_schema(&conn)?;
        let mut stmt = conn
            .prepare("DELETE FROM api_keys WHERE service_name = ?")
            .map_err(|e| e.to_string())?;
        stmt.bind((1, service)).map_err(|e| e.to_string())?;
        stmt.next().map_err(|e| e.to_string())?;
        Ok(())
    }
}
