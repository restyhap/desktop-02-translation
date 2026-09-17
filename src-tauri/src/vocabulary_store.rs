use serde::{Deserialize, Serialize};

use crate::db;

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
        let conn = db::open_db(app)?;
        let id = format!("grp_{}", db::unix_millis());
        let mut stmt = conn
            .prepare("INSERT INTO vocabulary_groups (id, name, color) VALUES (?, ?, ?)")
            .map_err(|e| format!("准备语句失败: {}", e))?;
        stmt.bind((1, &*id)).map_err(|e| e.to_string())?;
        stmt.bind((2, name)).map_err(|e| e.to_string())?;
        stmt.bind((3, color)).map_err(|e| e.to_string())?;
        stmt.next().map_err(|e| format!("创建词组失败: {}", e))?;
        Ok(id)
    }

    pub fn delete_group(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
        let conn = db::open_db(app)?;
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
        let conn = db::open_db(app)?;
        let id = format!("wrd_{}", db::unix_millis());
        let mut stmt = conn
            .prepare(
                "INSERT INTO vocabulary_words (id, word, translation, group_id, phonetic, example) VALUES (?, ?, ?, ?, ?, ?)",
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
        stmt.next().map_err(|e| format!("添加词条失败: {}", e))?;
        Ok(id)
    }

    pub fn delete_word(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
        let conn = db::open_db(app)?;
        let mut stmt = conn
            .prepare("DELETE FROM vocabulary_words WHERE id = ?")
            .map_err(|e| format!("准备语句失败: {}", e))?;
        stmt.bind((1, id)).map_err(|e| e.to_string())?;
        stmt.next().map_err(|e| format!("删除词条失败: {}", e))?;
        Ok(())
    }

    pub fn list_groups(app: &tauri::AppHandle) -> Result<Vec<VocabularyGroupRecord>, String> {
        let conn = db::open_db(app)?;

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
        let conn = db::open_db(app)?;

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
                    let last_reviewed_at: Option<i64> = stmt.read(8).ok();
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