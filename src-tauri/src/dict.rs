use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DictInfo {
    pub id: i64,
    pub name: String,
    pub lang_from: String,
    pub lang_to: String,
    pub entry_count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DictListResult {
    pub dictionaries: Vec<DictInfo>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DictEntry {
    pub word: String,
    pub word_raw: String,
    pub definition: String,
    pub audio_ref: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DictSearchResult {
    pub entries: Vec<DictEntry>,
    pub total: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DictSuggestResult {
    pub words: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DictLookupResult {
    pub found: bool,
    pub entry: Option<DictEntry>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DictResource {
    pub kind: String,
    pub filename: String,
    pub zip_file: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DictResourceData {
    pub mime: String,
    pub data_base64: String,
}

pub struct Dictionary;

// ponytail: 全局 Mutex 连接池, 复用 open_thread_safe 连接 (Send+Sync), 避免每次 IPC 重新 open 970MB db
static DICT_POOL: OnceLock<Mutex<std::collections::HashMap<PathBuf, sqlite::ConnectionThreadSafe>>> = OnceLock::new();

impl Dictionary {
    pub fn get_db_path(app: &tauri::AppHandle) -> PathBuf {
        let data_dir = app
            .path()
            .app_data_dir()
            .expect("failed to get app data dir");
        std::fs::create_dir_all(&data_dir).ok();
        data_dir.join("dictionaries.db")
    }

    pub fn ensure_connection(app: &tauri::AppHandle) -> Result<&'static mut sqlite::ConnectionThreadSafe, String> {
        let path = Self::get_db_path(app);
        if !path.exists() {
            return Err("词典数据库不存在，请先构建词典".to_string());
        }
        let pool = DICT_POOL.get_or_init(|| Mutex::new(std::collections::HashMap::new()));
        let mut guard = pool.lock().map_err(|e| format!("连接池锁失败: {}", e))?;
        let entry = guard.entry(path.clone()).or_insert_with(|| {
            // ponytail: 池内连接永不 drop (进程退出即关闭), 用 ManuallyDrop 把所有权限转移出去
            sqlite::Connection::open_thread_safe(&path).expect("open_thread_safe 失败")
        });
        let conn: &'static mut sqlite::ConnectionThreadSafe = unsafe {
            std::mem::transmute(entry)
        };
        Ok(conn)
    }

    pub fn list(app: &tauri::AppHandle) -> Result<DictListResult, String> {
        let conn = Self::ensure_connection(app)?;
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT d.id, d.name, d.lang_from, COALESCE(d.lang_to, '') AS lang_to, \
                 (SELECT COUNT(*) FROM entries_data e WHERE e.dictionary_id = d.id) AS entry_count \
                 FROM dictionaries d \
                 ORDER BY d.name",
            )
            .map_err(|e| format!("查询字典列表失败: {}", e))?;

        let mut dictionaries = Vec::new();
        while let Ok(sqlite::State::Row) = stmt.next() {
            let id: i64 = stmt.read(0).unwrap_or(0);
            let name: String = stmt.read(1).unwrap_or_default();
            let lang_from: String = stmt.read(2).unwrap_or_default();
            let lang_to: String = stmt.read(3).unwrap_or_default();
            let entry_count: i64 = stmt.read(4).unwrap_or(0);
            // ponytail: DISTINCT 按全部列去重, 同名字典不同 id 会各自出现; 构建器应保证不重复插入
            dictionaries.push(DictInfo {
                id, name, lang_from, lang_to, entry_count,
            });
        }

        Ok(DictListResult { dictionaries })
    }

    pub fn search(app: &tauri::AppHandle, query: String) -> Result<DictSearchResult, String> {
        let conn = Self::ensure_connection(app)?;
        let q = format!("%{}%", query);

        let mut stmt = conn
            .prepare(
                "SELECT word, word_raw, definition, audio_ref FROM entries_data \
                 WHERE word LIKE ?1 OR word_raw LIKE ?1 OR definition LIKE ?1 \
                 ORDER BY word LIMIT 50",
            )
            .map_err(|e| format!("搜索准备失败: {}", e))?;
        stmt.bind((1, q.as_str())).map_err(|e| format!("搜索绑定失败: {}", e))?;

        let mut entries = Vec::new();
        while let Ok(sqlite::State::Row) = stmt.next() {
            let word: String = stmt.read(0).unwrap_or_default();
            let word_raw: String = stmt.read(1).unwrap_or_default();
            let definition: String = stmt.read(2).unwrap_or_default();
            let audio_ref: Option<String> = stmt.read(3).ok();
            entries.push(DictEntry {
                word, word_raw, definition, audio_ref,
            });
        }

        let total = entries.len();
        Ok(DictSearchResult {
            entries,
            total,
        })
    }

    pub fn suggest(app: &tauri::AppHandle, query: String, dictionary_id: Option<i64>) -> Result<DictSuggestResult, String> {
        let conn = Self::ensure_connection(app)?;
        let q = format!("{}*", query);

        // ponytail: FTS 表无 dictionary_id, 过滤时 JOIN entries_data; 无过滤走原快路径
        let sql = match dictionary_id {
            Some(_) => "SELECT e.word FROM entries_fts f \
                       JOIN entries_data e ON e.id = f.rowid \
                       WHERE f.match(?1) AND e.dictionary_id = ?2 \
                       LIMIT 20",
            None => "SELECT word FROM entries_fts WHERE entries_fts MATCH ?1 ORDER BY rank LIMIT 20",
        };

        let mut stmt = conn
            .prepare(sql)
            .map_err(|e| format!("联想准备失败: {}", e))?;
        stmt.bind((1, q.as_str())).map_err(|e| format!("联想绑定失败: {}", e))?;
        if let Some(did) = dictionary_id {
            stmt.bind((2, did)).map_err(|e| format!("字典过滤绑定失败: {}", e))?;
        }

        let mut words = Vec::new();
        while let Ok(sqlite::State::Row) = stmt.next() {
            let word: String = stmt.read(0).unwrap_or_default();
            if !words.contains(&word) {
                words.push(word);
            }
        }

        Ok(DictSuggestResult { words })
    }

    pub fn lookup(app: &tauri::AppHandle, word: String, dictionary_id: Option<i64>) -> Result<DictLookupResult, String> {
        let conn = Self::ensure_connection(app)?;

        let sql = match dictionary_id {
            Some(_) => "SELECT word, word_raw, definition, audio_ref FROM entries_data WHERE word = ?1 AND dictionary_id = ?2",
            None => "SELECT word, word_raw, definition, audio_ref FROM entries_data WHERE word = ?1 OR word_raw = ?1",
        };

        let mut stmt = conn
            .prepare(sql)
            .map_err(|e| format!("查找准备失败: {}", e))?;
        stmt.bind((1, word.as_str())).map_err(|e| format!("查找绑定失败: {}", e))?;
        if let Some(did) = dictionary_id {
            stmt.bind((2, did)).map_err(|e| format!("字典过滤绑定失败: {}", e))?;
        }

        match stmt.next() {
            Ok(sqlite::State::Row) => {
                let word: String = stmt.read(0).unwrap_or_default();
                let word_raw: String = stmt.read(1).unwrap_or_default();
                let definition: String = stmt.read(2).unwrap_or_default();
                let audio_ref: Option<String> = stmt.read(3).ok();
                Ok(DictLookupResult {
                    found: true,
                    entry: Some(DictEntry {
                        word, word_raw, definition, audio_ref,
                    }),
                })
            }
            _ => Ok(DictLookupResult {
                    found: false,
                    entry: None,
                })
        }
    }

    pub fn get_resources(app: &tauri::AppHandle, word: String) -> Result<Vec<DictResource>, String> {
        let conn = Self::ensure_connection(app)?;

        let mut stmt = conn
            .prepare(
                "SELECT r.kind, r.filename, r.zip_file FROM resources r \
                 JOIN entries_data e ON r.entry_id = e.id \
                 WHERE e.word = ?1 OR e.word_raw = ?1",
            )
            .map_err(|e| format!("资源查询准备失败: {}", e))?;
        stmt.bind((1, word.as_str())).map_err(|e| format!("资源查询绑定失败: {}", e))?;

        let mut resources = Vec::new();
        while let Ok(sqlite::State::Row) = stmt.next() {
            let kind: String = stmt.read(0).unwrap_or_default();
            let filename: String = stmt.read(1).unwrap_or_default();
            let zip_file: String = stmt.read(2).unwrap_or_default();
            resources.push(DictResource { kind, filename, zip_file });
        }

        Ok(resources)
    }

    // 从资源 zip 中提取单个文件, 返回 base64 (data URL 用); 用系统 unzip, 避免新增依赖
    pub fn get_resource_data(app: &tauri::AppHandle, zip_file: String, filename: String) -> Result<DictResourceData, String> {
        let path = std::path::PathBuf::from(&zip_file);
        if !path.exists() {
            return Err(format!("资源包不存在: {}", zip_file));
        }
        let out = std::process::Command::new("unzip")
            .args(["-p", &zip_file, &filename])
            .output()
            .map_err(|e| format!("unzip 启动失败: {}", e))?;
        if !out.status.success() {
            return Err(format!("从资源包提取失败: {}", filename));
        }
        let ext = std::path::Path::new(&filename)
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let mime = match ext.as_str() {
            "wav" => "audio/wav",
            "mp3" => "audio/mpeg",
            "ogg" | "oga" => "audio/ogg",
            "m4a" => "audio/mp4",
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "svg" => "image/svg+xml",
            "webp" => "image/webp",
            _ => "application/octet-stream",
        };
        use base64::Engine as _;
        let data_base64 = base64::engine::general_purpose::STANDARD.encode(&out.stdout);
        Ok(DictResourceData {
            mime: mime.to_string(),
            data_base64,
        })
    }

    pub fn init(app: &tauri::AppHandle) -> Result<bool, String> {
        let db_path = Self::get_db_path(app);
        if db_path.exists() {
            return Ok(true);
        }
        // Try to copy from project directory
        let project_dir = std::env::current_dir().map_err(|e| format!("获取当前目录失败: {}", e))?;
        let src = project_dir.join("dictionaries.db");
        if src.exists() {
            std::fs::copy(&src, &db_path).map_err(|e| format!("复制词典数据库失败: {}", e))?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub fn has_db(app: &tauri::AppHandle) -> bool {
        Self::get_db_path(app).exists()
    }

    pub fn build(app: &tauri::AppHandle) -> Result<String, String> {
        let exe_dir = std::env::current_exe()
            .map_err(|e| format!("获取当前目录失败: {}", e))?
            .parent()
            .ok_or_else(|| "无法获取可执行文件目录")?
            .to_path_buf();
        let dictbuild_bin = exe_dir.join("dictbuild");
        if !dictbuild_bin.exists() {
            return Err(format!("dictbuild 未找到: {}", dictbuild_bin.display()));
        }
        let db_path = Self::get_db_path(app);
        let paths = super::db::DictPaths::get(app)?;
        if paths.is_empty() {
            return Err("未配置词典路径，请在设置中添加".to_string());
        }

        // ponytail: dictbuild 单次调用接收全部 --input; 它在启动时清空旧数据后全量重建,
        // 因此不能拆成多次调用 (后一次会清掉前一次的结果)
        let mut cmd = std::process::Command::new(&dictbuild_bin);
        cmd.arg("--output").arg(db_path.to_string_lossy().as_ref());
        for input_dir in &paths {
            cmd.arg("--input").arg(input_dir);
        }
        let mut child = cmd
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("启动 dictbuild 失败: {}", e))?;

        let status = child.wait().map_err(|e| format!("等待 dictbuild 失败: {}", e))?;

        if !status.success() {
            return Err("dictbuild 构建失败".to_string());
        }

        Ok("词典构建完成".to_string())
    }

    pub fn get_word_count(app: &tauri::AppHandle) -> Result<i64, String> {
        let conn = Self::ensure_connection(app)?;
        let mut stmt = conn
            .prepare("SELECT COUNT(*) FROM entries_data")
            .map_err(|e| format!("查询词条数失败: {}", e))?;
        stmt.next().map_err(|e| format!("查询词条数失败: {}", e))?;
        match stmt.next() {
            Ok(sqlite::State::Row) => Ok(stmt.read::<i64, _>(0).unwrap_or(0)),
            _ => Ok(0),
        }
    }
}
