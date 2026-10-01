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
        Self::save_conn(&db::open_db(app)?, translation)
    }

    fn save_conn(conn: &sqlite::Connection, translation: serde_json::Value) -> Result<(), String> {
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
        let timestamp = translation
            .get("timestamp")
            .and_then(|v| v.as_i64())
            .unwrap_or_else(db::unix_millis);
        let favorite = translation
            .get("favorite")
            .and_then(|v| v.as_i64())
            .unwrap_or(0) as i32;

        // 去重：同原文 + 同语向视为同一条（保留原 id/favorite，刷新译文/引擎/时间戳并置顶）
        let mut find = conn
            .prepare(
                "SELECT id FROM translation_history WHERE source_text = ? AND source_lang = ? AND target_lang = ? ORDER BY timestamp DESC LIMIT 1",
            )
            .map_err(|e| format!("准备查询失败: {}", e))?;
        find.bind((1, source_text))
            .map_err(|e| format!("绑定参数失败: {}", e))?;
        find.bind((2, source_lang))
            .map_err(|e| format!("绑定参数失败: {}", e))?;
        find.bind((3, target_lang))
            .map_err(|e| format!("绑定参数失败: {}", e))?;
        let mut existing_id: Option<String> = None;
        if let Ok(sqlite::State::Row) = find.next() {
            existing_id = Some(find.read(0).unwrap_or_default());
        }

        if let Some(existing_id) = existing_id {
            // 更新原行：译文/引擎/时间戳刷新，favorite 保留，时间戳置顶
            let mut update = conn
                .prepare(
                    "UPDATE translation_history SET translated_text = ?, engine = ?, timestamp = ? WHERE id = ?",
                )
                .map_err(|e| format!("准备语句失败: {}", e))?;
            update
                .bind((1, translated_text))
                .map_err(|e| format!("绑定参数失败: {}", e))?;
            update
                .bind((2, engine))
                .map_err(|e| format!("绑定参数失败: {}", e))?;
            update
                .bind((3, timestamp))
                .map_err(|e| format!("绑定参数失败: {}", e))?;
            update
                .bind((4, existing_id.as_str()))
                .map_err(|e| format!("绑定参数失败: {}", e))?;
            update
                .next()
                .map_err(|e| format!("更新翻译历史失败: {}", e))?;

            // 清理历史遗留的同键重复行（仅保留刚更新的最新一条）
            let mut cleanup = conn
                .prepare(
                    "DELETE FROM translation_history WHERE source_text = ? AND source_lang = ? AND target_lang = ? AND id != ?",
                )
                .map_err(|e| format!("准备语句失败: {}", e))?;
            cleanup
                .bind((1, source_text))
                .map_err(|e| format!("绑定参数失败: {}", e))?;
            cleanup
                .bind((2, source_lang))
                .map_err(|e| format!("绑定参数失败: {}", e))?;
            cleanup
                .bind((3, target_lang))
                .map_err(|e| format!("绑定参数失败: {}", e))?;
            cleanup
                .bind((4, existing_id.as_str()))
                .map_err(|e| format!("绑定参数失败: {}", e))?;
            cleanup
                .next()
                .map_err(|e| format!("清理重复历史失败: {}", e))?;
        } else {
            let mut stmt = conn
                .prepare(
                    "INSERT INTO translation_history (id, source_text, translated_text, source_lang, target_lang, engine, timestamp, favorite) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
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
        }

        Ok(())
    }

    pub fn list(app: &tauri::AppHandle) -> Result<Vec<TranslationRecord>, String> {
        Self::list_conn(&db::open_db(app)?)
    }

    fn list_conn(conn: &sqlite::Connection) -> Result<Vec<TranslationRecord>, String> {
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
        Self::toggle_favorite_conn(&db::open_db(app)?, id)
    }

    fn toggle_favorite_conn(conn: &sqlite::Connection, id: &str) -> Result<(), String> {
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
        Self::delete_conn(&db::open_db(app)?, id)
    }

    fn delete_conn(conn: &sqlite::Connection, id: &str) -> Result<(), String> {
        let mut stmt = conn
            .prepare("DELETE FROM translation_history WHERE id = ?")
            .map_err(|e| format!("准备语句失败: {}", e))?;
        stmt.bind((1, id)).map_err(|e| format!("绑定参数失败: {}", e))?;
        stmt.next()
            .map_err(|e| format!("删除记录失败: {}", e))?;
        Ok(())
    }

    /// 清理过期历史：删除 timestamp 早于 cutoff_ms 的**非收藏**记录，返回删除条数。
    ///
    /// 收藏（favorite=1）豁免：用户主动标记保留的数据不该被时效策略清掉。
    /// days <= 0 表示「永久保留」，不执行任何删除。
    pub fn purge_older_than(app: &tauri::AppHandle, days: i64) -> Result<usize, String> {
        if days <= 0 {
            return Ok(0);
        }
        let cutoff_ms = now_millis() - days * 24 * 60 * 60 * 1000;
        Self::purge_older_than_conn(&db::open_db(app)?, cutoff_ms)
    }

    fn purge_older_than_conn(
        conn: &sqlite::Connection,
        cutoff_ms: i64,
    ) -> Result<usize, String> {
        // 先数后删：sqlite crate 的 changes() 语义依赖调用方式，计数查询更确定
        let mut count_stmt = conn
            .prepare(
                "SELECT COUNT(*) FROM translation_history WHERE timestamp < ? AND favorite = 0",
            )
            .map_err(|e| format!("准备计数语句失败: {}", e))?;
        count_stmt
            .bind((1, cutoff_ms))
            .map_err(|e| format!("绑定参数失败: {}", e))?;
        let affected = match count_stmt.next() {
            Ok(sqlite::State::Row) => count_stmt.read::<i64, _>(0).unwrap_or(0),
            _ => 0,
        };
        if affected <= 0 {
            return Ok(0);
        }

        let mut stmt = conn
            .prepare("DELETE FROM translation_history WHERE timestamp < ? AND favorite = 0")
            .map_err(|e| format!("准备语句失败: {}", e))?;
        stmt.bind((1, cutoff_ms))
            .map_err(|e| format!("绑定参数失败: {}", e))?;
        stmt.next()
            .map_err(|e| format!("清理过期历史失败: {}", e))?;
        Ok(affected as usize)
    }
}

/// 当前 Unix 毫秒时间戳（与前端 Date.now() 同口径）
fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
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

    fn record(id: &str, text: &str, ts: i64) -> serde_json::Value {
        serde_json::json!({
            "id": id, "source_text": text, "translated_text": "译文",
            "source_lang": "en", "target_lang": "zh", "engine": "google", "timestamp": ts
        })
    }

    #[test]
    fn save_then_list_orders_by_timestamp_desc() {
        let conn = test_conn();
        HistoryStore::save_conn(&conn, record("a", "hello", 100)).unwrap();
        HistoryStore::save_conn(&conn, record("b", "world", 200)).unwrap();

        let list = HistoryStore::list_conn(&conn).unwrap();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].id, "b");
        assert_eq!(list[0].source_text, "world");
        assert_eq!(list[0].translated_text, "译文");
        assert_eq!(list[1].id, "a");
    }

    #[test]
    fn purge_deletes_expired_and_keeps_recent_and_favorites() {
        let conn = test_conn();
        // 旧记录（过期）、新记录（未过期）、过期但收藏（豁免）
        HistoryStore::save_conn(&conn, record("old", "old", 100)).unwrap();
        HistoryStore::save_conn(&conn, record("new", "new", 5_000)).unwrap();
        HistoryStore::save_conn(&conn, record("old_fav", "old_fav", 200)).unwrap();
        HistoryStore::toggle_favorite_conn(&conn, "old_fav").unwrap();

        let removed = HistoryStore::purge_older_than_conn(&conn, 1_000).unwrap();
        assert_eq!(removed, 1, "只应删除 1 条过期非收藏记录");

        let list = HistoryStore::list_conn(&conn).unwrap();
        let ids: Vec<&str> = list.iter().map(|r| r.id.as_str()).collect();
        assert_eq!(ids.len(), 2);
        assert!(ids.contains(&"new"), "未过期记录应保留");
        assert!(ids.contains(&"old_fav"), "收藏记录应豁免清理");
        assert!(!ids.contains(&"old"), "过期非收藏记录应被删除");
    }

    #[test]
    fn purge_is_noop_when_nothing_expired() {
        let conn = test_conn();
        HistoryStore::save_conn(&conn, record("a", "hi", 9_000)).unwrap();
        assert_eq!(HistoryStore::purge_older_than_conn(&conn, 1_000).unwrap(), 0);
        assert_eq!(HistoryStore::list_conn(&conn).unwrap().len(), 1);
    }

    #[test]
    fn save_fills_defaults_for_optional_fields() {
        let conn = test_conn();
        let mut value = record("a", "hi", 1);
        value.as_object_mut().unwrap().remove("engine");
        value.as_object_mut().unwrap().remove("timestamp");
        HistoryStore::save_conn(&conn, value).unwrap();

        let list = HistoryStore::list_conn(&conn).unwrap();
        assert_eq!(list[0].engine, "google");
        assert_eq!(list[0].favorite, 0);
        assert!(list[0].timestamp > 0, "缺 timestamp 应回退到 unix_millis");
    }

    #[test]
    fn save_dedupes_same_text_and_langs_updates_in_place() {
        let conn = test_conn();
        // 第一次保存
        HistoryStore::save_conn(&conn, record("a", "hello", 100)).unwrap();
        // 收藏该条
        HistoryStore::toggle_favorite_conn(&conn, "a").unwrap();

        // 同原文 + 同语向再次保存（新 id、更晚时间戳、译文变化）
        let mut again = record("b", "hello", 200);
        let obj = again.as_object_mut().unwrap();
        obj.insert("translated_text".into(), serde_json::json!("新译文"));
        HistoryStore::save_conn(&conn, again).unwrap();

        let list = HistoryStore::list_conn(&conn).unwrap();
        assert_eq!(list.len(), 1, "同原文同语向应去重为一条");
        assert_eq!(list[0].id, "a", "应保留原 id");
        assert_eq!(list[0].timestamp, 200, "时间戳应刷新为第二次");
        assert_eq!(list[0].translated_text, "新译文", "译文应更新");
        assert_eq!(list[0].favorite, 1, "收藏状态应保留");
    }

    #[test]
    fn save_keeps_distinct_lang_pairs_separate() {
        let conn = test_conn();
        // 同原文但不同语向 → 两条
        HistoryStore::save_conn(&conn, record("a", "hello", 100)).unwrap();
        let mut zh_en = record("b", "hello", 200);
        let obj = zh_en.as_object_mut().unwrap();
        obj.insert("source_lang".into(), serde_json::json!("zh"));
        obj.insert("target_lang".into(), serde_json::json!("en"));
        HistoryStore::save_conn(&conn, zh_en).unwrap();

        assert_eq!(HistoryStore::list_conn(&conn).unwrap().len(), 2);
    }

    #[test]
    fn save_rejects_missing_required_field() {
        let conn = test_conn();
        assert!(HistoryStore::save_conn(&conn, serde_json::json!({"id": "a"})).is_err());
    }

    #[test]
    fn toggle_favorite_flips_value_then_delete_removes_row() {
        let conn = test_conn();
        HistoryStore::save_conn(&conn, record("a", "hi", 1)).unwrap();

        HistoryStore::toggle_favorite_conn(&conn, "a").unwrap();
        assert_eq!(HistoryStore::list_conn(&conn).unwrap()[0].favorite, 1);
        HistoryStore::toggle_favorite_conn(&conn, "a").unwrap();
        assert_eq!(HistoryStore::list_conn(&conn).unwrap()[0].favorite, 0);

        HistoryStore::delete_conn(&conn, "a").unwrap();
        assert!(HistoryStore::list_conn(&conn).unwrap().is_empty());
    }
}
