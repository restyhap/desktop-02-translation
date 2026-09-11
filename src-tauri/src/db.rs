use std::path::PathBuf;
use serde::{Serialize, Deserialize};
use tauri::Manager;

/// 当前数据库模式版本
pub const SCHEMA_VERSION: i32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbInitStatus {
    pub initialized: bool,
    pub db_path: String,
    pub tables_created: Vec<String>,
    pub schema_version: i32,
}

pub struct Database;

impl Database {
    pub fn get_db_path(app: &tauri::AppHandle) -> PathBuf {
        let config_dir = app.path().app_data_dir().expect("failed to get app data dir");
        std::fs::create_dir_all(&config_dir).ok();
        config_dir.join("translation.db")
    }

    pub fn exists(app: &tauri::AppHandle) -> bool {
        Self::get_db_path(app).exists()
    }

    pub fn init(app: &tauri::AppHandle) -> Result<DbInitStatus, String> {
        let db_path = Self::get_db_path(app);
        let conn = sqlite::open(&db_path).map_err(|e| format!("打开数据库失败: {}", e))?;
        
        let mut tables_created = Vec::new();
        
        // 创建版本控制表
        if conn.execute("CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )").is_ok() {
            tables_created.push("schema_version".to_string());
        }
        
        // 创建翻译历史表
        if conn.execute("CREATE TABLE IF NOT EXISTS translation_history (
            id TEXT PRIMARY KEY, source_text TEXT NOT NULL, translated_text TEXT NOT NULL,
            source_lang TEXT NOT NULL, target_lang TEXT NOT NULL, engine TEXT NOT NULL DEFAULT 'google',
            timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now')), favorite INTEGER NOT NULL DEFAULT 0
        )").is_ok() {
            tables_created.push("translation_history".to_string());
        }
        
        // 创建词典表
        if conn.execute("CREATE TABLE IF NOT EXISTS dictionaries (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, format TEXT NOT NULL DEFAULT 'mdx',
            path TEXT NOT NULL, word_count INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1
        )").is_ok() {
            tables_created.push("dictionaries".to_string());
        }
        
        // 创建词组表
        if conn.execute("CREATE TABLE IF NOT EXISTS vocabulary_groups (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#3b82f6'
        )").is_ok() {
            tables_created.push("vocabulary_groups".to_string());
        }
        
        // 创建词条表
        if conn.execute("CREATE TABLE IF NOT EXISTS vocabulary_words (
            id TEXT PRIMARY KEY, word TEXT NOT NULL, translation TEXT NOT NULL, group_id TEXT NOT NULL
        )").is_ok() {
            tables_created.push("vocabulary_words".to_string());
        }
        
        // 创建用户设置表
        if conn.execute("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL)").is_ok() {
            tables_created.push("app_settings".to_string());
        }
        
        // 创建索引
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_ts ON translation_history(timestamp DESC)");
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idxfav ON translation_history(favorite DESC, timestamp DESC)");
        
        // 插入默认设置（如果不存在）
        let count: i64 = match conn.prepare("SELECT COUNT(*) FROM app_settings") {
            Ok(mut stmt) => {
                match stmt.next() {
                    Ok(sqlite::State::Row) => stmt.read::<i64, _>(0).unwrap_or(0),
                    _ => 0,
                }
            }
            Err(_) => 0,
        };
        
        if count == 0 {
            let json = serde_json::json!({"general":{},"translation":{},"appearance":{},"shortcuts":{}, "llm":{}});
            let _ = conn.execute(&format!("INSERT INTO app_settings VALUES ('default', '{}')", 
                serde_json::to_string(&json).unwrap().replace("'", "''")));
        }
        
        // 更新或插入版本号
        let version_count: i64 = match conn.prepare("SELECT COUNT(*) FROM schema_version") {
            Ok(mut stmt) => {
                match stmt.next() {
                    Ok(sqlite::State::Row) => stmt.read::<i64, _>(0).unwrap_or(0),
                    _ => 0,
                }
            }
            Err(_) => 0,
        };
        
        if version_count == 0 {
            let _ = conn.execute(&format!(
                "INSERT INTO schema_version (version) VALUES ({})", SCHEMA_VERSION
            ));
        } else {
            let _ = conn.execute(&format!(
                "UPDATE schema_version SET version = {}", SCHEMA_VERSION
            ));
        }
        
        Ok(DbInitStatus {
            initialized: true,
            db_path: db_path.to_string_lossy().to_string(),
            tables_created,
            schema_version: SCHEMA_VERSION,
        })
    }
    
    /// 获取当前数据库模式版本
    pub fn get_schema_version(conn: &sqlite::Connection) -> i32 {
        match conn.prepare("SELECT version FROM schema_version ORDER BY version DESC LIMIT 1") {
            Ok(mut stmt) => {
                match stmt.next() {
                    Ok(sqlite::State::Row) => stmt.read::<i64, _>(0).unwrap_or(0) as i32,
                    _ => 0,
                }
            }
            Err(_) => 0,
        }
    }
    
    /// 检查是否需要迁移
    pub fn needs_migration(app: &tauri::AppHandle) -> Result<bool, String> {
        let db_path = Self::get_db_path(app);
        if !db_path.exists() {
            return Ok(false);
        }
        
        let conn = sqlite::open(&db_path).map_err(|e| format!("打开数据库失败: {}", e))?;
        let current_version = Self::get_schema_version(&conn);
        
        Ok(current_version < SCHEMA_VERSION)
    }
}
