use serde::{Deserialize, Serialize};
use std::path::PathBuf;
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

pub fn open_db(app: &tauri::AppHandle) -> Result<sqlite::Connection, String> {
    sqlite::open(Database::get_db_path(app)).map_err(|e| format!("打开数据库失败: {}", e))
}

pub fn unix_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

pub struct Database;

impl Database {
    pub fn get_db_path(app: &tauri::AppHandle) -> PathBuf {
        let config_dir = app
            .path()
            .app_data_dir()
            .expect("failed to get app data dir");
        std::fs::create_dir_all(&config_dir).ok();
        config_dir.join("translation.db")
    }

    pub fn exists(app: &tauri::AppHandle) -> bool {
        Self::get_db_path(app).exists()
    }

    pub fn init(app: &tauri::AppHandle) -> Result<DbInitStatus, String> {
        let db_path = Self::get_db_path(app);
        let conn = open_db(app)?;

        let mut tables_created = Vec::new();

        // 创建版本控制表
        if conn
            .execute(
                "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
        )",
            )
            .is_ok()
        {
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
        if conn
            .execute(
                "CREATE TABLE IF NOT EXISTS vocabulary_groups (
            id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#3b82f6'
        )",
            )
            .is_ok()
        {
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

        // 创建词典路径设置表
        if conn.execute("CREATE TABLE IF NOT EXISTS dict_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)").is_ok() {
            tables_created.push("dict_settings".to_string());
        }

        // 创建翻译引擎表
        if conn.execute("CREATE TABLE IF NOT EXISTS translation_engines (
            service_name TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            url TEXT NOT NULL,
            requires_app_id INTEGER NOT NULL DEFAULT 0,
            requires_api_key INTEGER NOT NULL DEFAULT 1
        )").is_ok() {
            tables_created.push("translation_engines".to_string());
        }

        // 创建索引
        let _ = conn
            .execute("CREATE INDEX IF NOT EXISTS idx_ts ON translation_history(timestamp DESC)");
        let _ = conn.execute("CREATE INDEX IF NOT EXISTS idxfav ON translation_history(favorite DESC, timestamp DESC)");

        // 插入默认设置（如果不存在）
        let count: i64 = match conn.prepare("SELECT COUNT(*) FROM app_settings") {
            Ok(mut stmt) => match stmt.next() {
                Ok(sqlite::State::Row) => stmt.read::<i64, _>(0).unwrap_or(0),
                _ => 0,
            },
            Err(_) => 0,
        };

        if count == 0 {
            let json = serde_json::json!({"general":{},"translation":{},"appearance":{},"shortcuts":{}, "llm":{}});
            let payload = serde_json::to_string(&json).unwrap_or_else(|_| "{}".to_string());
            if let Ok(mut stmt) = conn.prepare("INSERT INTO app_settings (key, value_json) VALUES ('default', ?1)") {
                let _ = stmt.bind((1, payload.as_str()));
                let _ = stmt.next();
            }
        }

        // 更新或插入版本号
        let version_count: i64 = match conn.prepare("SELECT COUNT(*) FROM schema_version") {
            Ok(mut stmt) => match stmt.next() {
                Ok(sqlite::State::Row) => stmt.read::<i64, _>(0).unwrap_or(0),
                _ => 0,
            },
            Err(_) => 0,
        };

        if version_count == 0 {
            if let Ok(mut stmt) = conn.prepare("INSERT INTO schema_version (version) VALUES (?1)") {
                let _ = stmt.bind((1, SCHEMA_VERSION as i64));
                let _ = stmt.next();
            }
        } else {
            if let Ok(mut stmt) = conn.prepare("UPDATE schema_version SET version = ?1") {
                let _ = stmt.bind((1, SCHEMA_VERSION as i64));
                let _ = stmt.next();
            }
        }

        Ok(DbInitStatus {
            initialized: true,
            db_path: db_path.to_string_lossy().to_string(),
            tables_created,
            schema_version: SCHEMA_VERSION,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TranslationEngine {
    pub service_name: String,
    pub display_name: String,
    pub url: String,
    pub requires_app_id: bool,
    pub requires_api_key: bool,
}

pub struct EngineManager;

impl EngineManager {
    pub fn init(app: &tauri::AppHandle) -> Result<(), String> {
        let conn = open_db(app)?;
        // 预置常见引擎（仅插入不存在的；表结构由 Database::init 统一创建）
        let engines = [
            ("google", "谷歌翻译", "https://translation.googleapis.com/language/translate/v2", false, true),
            ("deepl", "DeepL", "https://api.deepl.com/v2/translate", false, true),
            ("baidu", "百度翻译", "https://fanyi-api.baidu.com/api/trans/vip/translate", true, true),
            ("youdao", "有道翻译", "https://openapi.youdao.com/api", true, true),
            ("caiyun", "彩云小译", "https://api.caiyunapp.com/v1/translator", false, true),
            ("ali", "阿里翻译", "https://mt.aliyuncs.com/", false, true),
            ("volcano", "火山翻译", "https://translate-api.volcanoengine.com/", true, true),
        ];
        for (name, display, url, app_id, api_key) in &engines {
            if let Ok(mut stmt) = conn.prepare(
                "INSERT OR IGNORE INTO translation_engines (service_name, display_name, url, requires_app_id, requires_api_key) VALUES (?1, ?2, ?3, ?4, ?5)",
            ) {
                let _ = stmt.bind((1, *name));
                let _ = stmt.bind((2, *display));
                let _ = stmt.bind((3, *url));
                let _ = stmt.bind((4, if *app_id { 1 } else { 0 }));
                let _ = stmt.bind((5, if *api_key { 1 } else { 0 }));
                let _ = stmt.next();
            }
        }
        Ok(())
    }

    pub fn list(app: &tauri::AppHandle) -> Result<Vec<TranslationEngine>, String> {
        let conn = open_db(app)?;
        let mut stmt = conn
            .prepare("SELECT service_name, display_name, url, requires_app_id, requires_api_key FROM translation_engines ORDER BY display_name")
            .map_err(|e| format!("{}", e))?;
        let mut engines = Vec::new();
        loop {
            match stmt.next() {
                Ok(sqlite::State::Row) => {
                    engines.push(TranslationEngine {
                        service_name: stmt.read(0).unwrap_or_default(),
                        display_name: stmt.read(1).unwrap_or_default(),
                        url: stmt.read(2).unwrap_or_default(),
                        requires_app_id: stmt.read::<i64, _>(3).unwrap_or(0) != 0,
                        requires_api_key: stmt.read::<i64, _>(4).unwrap_or(1) != 0,
                    });
                }
                Ok(sqlite::State::Done) => break,
                Err(_) => break,
            }
        }
        Ok(engines)
    }

    pub fn add(app: &tauri::AppHandle, service_name: &str, display_name: &str, url: &str, requires_app_id: bool, requires_api_key: bool) -> Result<(), String> {
        let conn = open_db(app)?;
        let mut stmt = conn
            .prepare(
                "INSERT OR REPLACE INTO translation_engines (service_name, display_name, url, requires_app_id, requires_api_key) VALUES (?1, ?2, ?3, ?4, ?5)",
            )
            .map_err(|e| format!("添加翻译引擎失败: {}", e))?;
        stmt.bind((1, service_name)).map_err(|e| e.to_string())?;
        stmt.bind((2, display_name)).map_err(|e| e.to_string())?;
        stmt.bind((3, url)).map_err(|e| e.to_string())?;
        stmt.bind((4, if requires_app_id { 1 } else { 0 })).map_err(|e| e.to_string())?;
        stmt.bind((5, if requires_api_key { 1 } else { 0 })).map_err(|e| e.to_string())?;
        stmt.next().map_err(|e| format!("添加翻译引擎失败: {}", e))?;
        Ok(())
    }

    pub fn delete(app: &tauri::AppHandle, service_name: &str) -> Result<(), String> {
        let conn = open_db(app)?;
        let mut stmt = conn
            .prepare("DELETE FROM translation_engines WHERE service_name = ?1")
            .map_err(|e| format!("删除翻译引擎失败: {}", e))?;
        stmt.bind((1, service_name)).map_err(|e| e.to_string())?;
        stmt.next().map_err(|e| format!("删除翻译引擎失败: {}", e))?;
        Ok(())
    }
}

pub struct DictPaths;

impl DictPaths {
    fn conn(app: &tauri::AppHandle) -> Result<sqlite::Connection, String> {
        // 表结构由 Database::init 统一创建
        open_db(app)
    }

    pub fn get(app: &tauri::AppHandle) -> Result<Vec<String>, String> {
        let conn = Self::conn(app)?;
        let mut stmt = conn
            .prepare("SELECT value FROM dict_settings WHERE key = 'paths'")
            .map_err(|e| format!("{}", e))?;
        let mut result: Vec<String> = vec![];
        while let Ok(sqlite::State::Row) = stmt.next() {
            let raw: String = stmt.read(0).unwrap_or_default();
            let parsed: Vec<String> = serde_json::from_str(&raw).unwrap_or_default();
            result = parsed;
        }
        Ok(result)
    }

    pub fn set(app: &tauri::AppHandle, paths: &[String]) -> Result<(), String> {
        let conn = Self::conn(app)?;
        let json = serde_json::to_string(paths).map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("INSERT OR REPLACE INTO dict_settings (key, value) VALUES ('paths', ?1)")
            .map_err(|e| format!("保存词典路径失败: {}", e))?;
        stmt.bind((1, json.as_str())).map_err(|e| e.to_string())?;
        stmt.next().map_err(|e| format!("保存词典路径失败: {}", e))?;
        Ok(())
    }
}
