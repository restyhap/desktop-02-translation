use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};

use crate::db;

static ID_SEQ: AtomicU64 = AtomicU64::new(0);

fn next_id(prefix: &str) -> String {
    format!(
        "{}_{}_{}",
        prefix,
        db::unix_millis(),
        ID_SEQ.fetch_add(1, Ordering::Relaxed)
    )
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VocabularyGroupRecord {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VocabularyWordRecord {
    pub id: String,
    pub word: String,
    pub translation: String,
    pub phonetic: Option<String>,
    pub example: Option<String>,
    pub group_id: String,
    pub created_at: i64,
    pub review_count: i32,
    pub last_reviewed_at: Option<i64>,
}

pub struct VocabularyStore;

impl VocabularyStore {
    pub fn add_group(app: &tauri::AppHandle, name: &str, color: &str) -> Result<String, String> {
        Self::add_group_conn(&db::open_db(app)?, name, color)
    }

    fn add_group_conn(conn: &sqlite::Connection, name: &str, color: &str) -> Result<String, String> {
        let id = next_id("grp");
        let mut stmt = conn
            .prepare("INSERT INTO vocabulary_groups (id, name, color, created_at) VALUES (?, ?, ?, ?)")
            .map_err(|e| format!("准备语句失败: {}", e))?;
        stmt.bind((1, &*id)).map_err(|e| e.to_string())?;
        stmt.bind((2, name)).map_err(|e| e.to_string())?;
        stmt.bind((3, color)).map_err(|e| e.to_string())?;
        stmt.bind((4, db::unix_millis())).map_err(|e| e.to_string())?;
        stmt.next().map_err(|e| format!("创建词组失败: {}", e))?;
        Ok(id)
    }

    pub fn delete_group(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
        Self::delete_group_conn(&db::open_db(app)?, id)
    }

    fn delete_group_conn(conn: &sqlite::Connection, id: &str) -> Result<(), String> {
        let mut stmt1 = conn
            .prepare("DELETE FROM vocabulary_words WHERE group_id = ?")
            .map_err(|e| format!("准备语句失败: {}", e))?;
        stmt1.bind((1, id)).map_err(|e| e.to_string())?;
        stmt1.next().map_err(|e| format!("删除词条失败: {}", e))?;
        let mut stmt2 = conn
            .prepare("DELETE FROM vocabulary_groups WHERE id = ?")
            .map_err(|e| format!("准备语句失败: {}", e))?;
        stmt2.bind((1, id)).map_err(|e| e.to_string())?;
        stmt2.next().map_err(|e| format!("删除词组失败: {}", e))?;
        Ok(())
    }

    pub fn add_word(
        app: &tauri::AppHandle,
        word: &str,
        translation: &str,
        group_id: &str,
        phonetic: Option<&str>,
        example: Option<&str>,
    ) -> Result<String, String> {
        Self::add_word_conn(&db::open_db(app)?, word, translation, group_id, phonetic, example)
    }

    fn add_word_conn(
        conn: &sqlite::Connection,
        word: &str,
        translation: &str,
        group_id: &str,
        phonetic: Option<&str>,
        example: Option<&str>,
    ) -> Result<String, String> {
        let id = next_id("wrd");
        let mut stmt = conn
            .prepare(
                "INSERT INTO vocabulary_words (id, word, translation, group_id, phonetic, example, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .map_err(|e| format!("准备语句失败: {}", e))?;
        stmt.bind((1, &*id)).map_err(|e| e.to_string())?;
        stmt.bind((2, word)).map_err(|e| e.to_string())?;
        stmt.bind((3, translation)).map_err(|e| e.to_string())?;
        stmt.bind((4, group_id)).map_err(|e| e.to_string())?;
        stmt.bind((5, phonetic.unwrap_or("")))
            .map_err(|e| e.to_string())?;
        stmt.bind((6, example.unwrap_or("")))
            .map_err(|e| e.to_string())?;
        stmt.bind((7, db::unix_millis())).map_err(|e| e.to_string())?;
        stmt.next().map_err(|e| format!("添加词条失败: {}", e))?;
        Ok(id)
    }

    pub fn delete_word(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
        Self::delete_word_conn(&db::open_db(app)?, id)
    }

    fn delete_word_conn(conn: &sqlite::Connection, id: &str) -> Result<(), String> {
        let mut stmt = conn
            .prepare("DELETE FROM vocabulary_words WHERE id = ?")
            .map_err(|e| format!("准备语句失败: {}", e))?;
        stmt.bind((1, id)).map_err(|e| e.to_string())?;
        stmt.next().map_err(|e| format!("删除词条失败: {}", e))?;
        Ok(())
    }

    pub fn list_groups(app: &tauri::AppHandle) -> Result<Vec<VocabularyGroupRecord>, String> {
        Self::list_groups_conn(&db::open_db(app)?)
    }

    fn list_groups_conn(conn: &sqlite::Connection) -> Result<Vec<VocabularyGroupRecord>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, color, created_at FROM vocabulary_groups ORDER BY created_at DESC",
            )
            .map_err(|e| format!("准备语句失败: {}", e))?;

        let mut records = Vec::new();
        loop {
            match stmt.next() {
                Ok(sqlite::State::Row) => {
                    let id: String = stmt.read(0).unwrap_or_default();
                    let name: String = stmt.read(1).unwrap_or_default();
                    let color: String = stmt.read(2).unwrap_or_default();
                    let created_at: i64 = stmt.read(3).unwrap_or(0);
                    records.push(VocabularyGroupRecord {
                        id,
                        name,
                        color,
                        created_at,
                    });
                }
                Ok(sqlite::State::Done) => break,
                Err(e) => return Err(format!("读取失败: {}", e)),
            }
        }
        Ok(records)
    }

    pub fn list_words(app: &tauri::AppHandle) -> Result<Vec<VocabularyWordRecord>, String> {
        Self::list_words_conn(&db::open_db(app)?)
    }

    fn list_words_conn(conn: &sqlite::Connection) -> Result<Vec<VocabularyWordRecord>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, word, translation, phonetic, example, group_id, created_at, review_count, last_reviewed_at FROM vocabulary_words ORDER BY review_count ASC",
            )
            .map_err(|e| format!("准备语句失败: {}", e))?;

        let mut records = Vec::new();
        loop {
            match stmt.next() {
                Ok(sqlite::State::Row) => {
                    let id: String = stmt.read(0).unwrap_or_default();
                    let word: String = stmt.read(1).unwrap_or_default();
                    let translation: String = stmt.read(2).unwrap_or_default();
                    let phonetic: Option<String> = stmt.read(3).ok();
                    let example: Option<String> = stmt.read(4).ok();
                    let group_id: String = stmt.read(5).unwrap_or_default();
                    let created_at: i64 = stmt.read(6).unwrap_or(0);
                    let review_count: i32 = stmt.read(7).unwrap_or(0.0_f64) as i32;
                    let last_reviewed_at: Option<i64> =
                        stmt.read::<i64, _>(8).ok().filter(|v| *v != 0);
                    records.push(VocabularyWordRecord {
                        id,
                        word,
                        translation,
                        phonetic,
                        example,
                        group_id,
                        created_at,
                        review_count,
                        last_reviewed_at,
                    });
                }
                Ok(sqlite::State::Done) => break,
                Err(e) => return Err(format!("读取失败: {}", e)),
            }
        }
        Ok(records)
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
    fn add_group_then_list_roundtrip() {
        let conn = test_conn();
        let id = VocabularyStore::add_group_conn(&conn, "四级核心", "#ff0000").unwrap();

        let groups = VocabularyStore::list_groups_conn(&conn).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].id, id);
        assert_eq!(groups[0].name, "四级核心");
        assert_eq!(groups[0].color, "#ff0000");
        assert!(groups[0].created_at > 0, "created_at 应写入真实时间戳");
    }

    #[test]
    fn add_word_persists_all_columns() {
        let conn = test_conn();
        let group_id = VocabularyStore::add_group_conn(&conn, "g", "#000000").unwrap();
        VocabularyStore::add_word_conn(&conn, "apple", "苹果", &group_id, Some("/ˈæpl/"), Some("an apple"))
            .unwrap();

        let words = VocabularyStore::list_words_conn(&conn).unwrap();
        assert_eq!(words.len(), 1);
        assert_eq!(words[0].word, "apple");
        assert_eq!(words[0].translation, "苹果");
        assert_eq!(words[0].group_id, group_id);
        assert_eq!(words[0].phonetic.as_deref(), Some("/ˈæpl/"));
        assert_eq!(words[0].example.as_deref(), Some("an apple"));
        assert!(words[0].created_at > 0);
        assert_eq!(words[0].review_count, 0);
        assert!(words[0].last_reviewed_at.is_none());
    }

    #[test]
    fn add_word_defaults_optional_fields_to_empty() {
        let conn = test_conn();
        VocabularyStore::add_word_conn(&conn, "book", "书", "grp_x", None, None).unwrap();

        let words = VocabularyStore::list_words_conn(&conn).unwrap();
        assert_eq!(words[0].phonetic.as_deref(), Some(""));
        assert_eq!(words[0].example.as_deref(), Some(""));
    }

    #[test]
    fn delete_group_cascades_to_its_words() {
        let conn = test_conn();
        let keep = VocabularyStore::add_group_conn(&conn, "保留", "#111111").unwrap();
        let drop = VocabularyStore::add_group_conn(&conn, "删除", "#222222").unwrap();
        VocabularyStore::add_word_conn(&conn, "apple", "苹果", &drop, None, None).unwrap();
        VocabularyStore::add_word_conn(&conn, "pear", "梨", &keep, None, None).unwrap();

        VocabularyStore::delete_group_conn(&conn, &drop).unwrap();

        assert_eq!(VocabularyStore::list_groups_conn(&conn).unwrap().len(), 1);
        let words = VocabularyStore::list_words_conn(&conn).unwrap();
        assert_eq!(words.len(), 1);
        assert_eq!(words[0].word, "pear");
    }

    #[test]
    fn delete_word_removes_only_target() {
        let conn = test_conn();
        let id_a = VocabularyStore::add_word_conn(&conn, "a", "甲", "g", None, None).unwrap();
        VocabularyStore::add_word_conn(&conn, "b", "乙", "g", None, None).unwrap();

        VocabularyStore::delete_word_conn(&conn, &id_a).unwrap();

        let words = VocabularyStore::list_words_conn(&conn).unwrap();
        assert_eq!(words.len(), 1);
        assert_eq!(words[0].word, "b");
    }
}
