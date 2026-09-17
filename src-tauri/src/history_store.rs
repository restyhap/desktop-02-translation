use serde::{Deserialize, Serialize};

use crate::db;

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslationRecord {
    pub id: String,
    pub source_text: String,
    pub translated_text: String,
    pub source_lang: String,
    pub target_lang: String,
    pub engine: String,
    pub timestamp: i64,
    pub favorite: i32,
}

pub struct HistoryStore;

impl HistoryStore {
    pub fn save(app: &tauri::AppHandle, translation: serde_json::Value) -> Result<(), String> {
        let conn = db::open_db(app)?;

        let id = translation
            .get("id")
            .and_then(|v| v.as_str())
            .ok_or(" missing id")?;
        let source_text = translation
            .get("source_text")
            .and_then(|v| v.as_str())
            .ok_or(" missing source_text")?;
        let translated_text = translation
            .get("translated_text")
            .and_then(|v| v.as_str())
            .ok_or(" missing translated_text")?;
        let source_lang = translation
            .get("source_lang")
            .and_then(|v| v.as_str())
            .ok_or(" missing source_lang")?;
        let target_lang = translation
            .get("target_lang")
            .and_then(|v| v.as_str())
            .ok_or(" missing target_lang")?;
        let engine = translation
            .get("engine")
            .and_then(|v| v.as_str())
            .unwrap_or("google");
        let timestamp = translation.get("timestamp").and_then(|v| v.as_i64()).unwrap_or_else(db::unix_millis);
        let favorite = translation
            .get("favorite")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;

        let mut stmt = conn
            .prepare(
                "INSERT OR REPLACE INTO translation_history (id, source_text, translated_text, source_lang, target_lang, engine, timestamp, favorite) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            )
            .map_err(|e| format!("准备语句失败: {}", e))?;
        stmt.bind((1, id))
            .map_err(|e| format!("绑定参数失败: {}", e))?;
        stmt.bind((2, source_text))
            .map_err(|e| format!("绑定参数失败: {}", e))?;
        stmt.bind((3, translated_text))
            .map_err(|e| format!("绑定参数失败: {}", e))?;
        stmt.bind((4, source_lang))
            .map_err(|e| format!("绑定参数失败: {}", e))?;
        stmt.bind((5, target_lang))
            .map_err(|e| format!("绑定参数失败: {}", e))?;
        stmt.bind((6, engine))
            .map_err(|e| format!("绑定参数失败: {}", e))?;
        stmt.bind((7, timestamp))
            .map_err(|e| format!("绑定参数失败: {}", e))?;
        stmt.bind((8, favorite as i64))
            .map_err(|e| format!("绑定参数失败: {}", e))?;
        stmt.next()
            .map_err(|e| format!("写入翻译历史失败: {}", e))?;

        Ok(())
    }

    pub fn list(app: &tauri::AppHandle) -> Result<Vec<TranslationRecord>, String> {
        let conn = db::open_db(app)?;

        let mut stmt = conn
            .prepare("SELECT id, source_text, translated_text, source_lang, target_lang, engine, timestamp, favorite FROM translation_history ORDER BY timestamp DESC")
            .map_err(|e| format!("准备语句失败: {}", e))?;

        let mut records = Vec::new();
        loop {
            match stmt.next() {
                Ok(sqlite::State::Row) => {
                    let id: String = stmt.read(0).unwrap_or_default();
                    let source_text: String = stmt.read(1).unwrap_or_default();
                    let translated_text: String = stmt.read(2).unwrap_or_default();
                    let source_lang: String = stmt.read(3).unwrap_or_default();
                    let target_lang: String = stmt.read(4).unwrap_or_default();
                    let engine: String = stmt.read(5).unwrap_or_default();
                    let timestamp: i64 = stmt.read(6).unwrap_or(0);
                    let favorite: i32 = stmt.read(7).unwrap_or(0.0_f64) as i32;
                    records.push(TranslationRecord {
                        id,
                        source_text,
                        translated_text,
                        source_lang,
                        target_lang,
                        engine,
                        timestamp,
                        favorite,
                    });
                }
                Ok(sqlite::State::Done) => break,
                Err(e) => return Err(format!("读取失败: {}", e)),
            }
        }
        Ok(records)
    }

    pub fn toggle_favorite(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
        let conn = db::open_db(app)?;
        let mut stmt = conn
            .prepare("UPDATE translation_history SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END WHERE id = ?")
            .map_err(|e| format!("准备语句失败: {}", e))?;
        stmt.bind((1, id))
            .map_err(|e| format!("绑定参数失败: {}", e))?;
        stmt.next()
            .map_err(|e| format!("更新收藏失败: {}", e))?;
        Ok(())
    }

    pub fn delete(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
        let conn = db::open_db(app)?;
        let mut stmt = conn
            .prepare("DELETE FROM translation_history WHERE id = ?")
            .map_err(|e| format!("准备语句失败: {}", e))?;
        stmt.bind((1, id)).map_err(|e| format!("绑定参数失败: {}", e))?;
        stmt.next()
            .map_err(|e| format!("删除记录失败: {}", e))?;
        Ok(())
    }
}