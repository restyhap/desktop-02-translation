use std::fs;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use sqlite::Connection;
use walkdir::WalkDir;

fn last_rowid(conn: &Connection) -> i64 {
    unsafe { sqlite::ffi::sqlite3_last_insert_rowid(conn.as_raw()) }
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut inputs: Vec<String> = Vec::new();
    let mut i = 1;
    while i < args.len() {
        if args[i] == "--input" {
            if let Some(v) = args.get(i + 1) {
                inputs.push(v.clone());
                i += 2;
                continue;
            }
        }
        i += 1;
    }
    let output_db = match args.iter().position(|a| a == "--output").and_then(|i| args.get(i + 1)) {
        Some(v) => v.clone(),
        None => {
            eprintln!("用法: dictbuild --input <词典目录> [--input <目录> ...] --output <dictionaries.db>");
            std::process::exit(2);
        }
    };
    if inputs.is_empty() {
        eprintln!("错误: 至少需要一个 --input <词典目录>");
        std::process::exit(2);
    }
    println!("🔧 dictbuild\n   输入: {:?}\n   输出: {}", inputs, output_db);
    let conn = sqlite::open(&output_db).expect("无法创建数据库");
    init_schema(&conn);

    // 全量重建: 清空旧数据, 避免重复构建时词典行/词条累加
    conn.execute("DELETE FROM resources").ok();
    conn.execute("DELETE FROM entries_data").ok();
    conn.execute("DELETE FROM dictionaries").ok();

    let mut total = 0usize;
    for input_dir in &inputs {
        for entry in WalkDir::new(input_dir).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_dir() { continue; }
            let dir_path = entry.path();
            let dir_name = dir_path.file_name().unwrap().to_string_lossy().to_string();
            if dir_name.starts_with('.') { continue; }
            if let Some(dz_path) = find_file(dir_path, |p| p.extension().map(|e| e == "dz").unwrap_or(false)) {
                println!("\n📚 {}\n   解析中...", dir_name);
                match process_dict(&conn, input_dir, &dz_path, &dir_name) {
                    Ok(c) => { total += c; println!("   ✅ {} 个词条", c); }
                    Err(e) => eprintln!("    {}", e),
                }
            }
        }
    }
    conn.execute("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')").expect("FTS5 rebuild");
    conn.execute("UPDATE dictionaries SET entry_count = (SELECT COUNT(*) FROM entries_data e WHERE e.dictionary_id = dictionaries.id)").expect("更新词条数失败");
    println!("\n🎉 完成! 共 {} 个词条", total);
}

fn init_schema(conn: &Connection) {
    conn.execute("CREATE TABLE IF NOT EXISTS dictionaries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, dict_dir TEXT NOT NULL, lang_from TEXT NOT NULL DEFAULT 'en', lang_to TEXT, entry_count INTEGER NOT NULL DEFAULT 0, dz_path TEXT NOT NULL)").expect("dictionaries 表失败");
    conn.execute("CREATE TABLE IF NOT EXISTS entries_data (id INTEGER PRIMARY KEY AUTOINCREMENT, dictionary_id INTEGER NOT NULL, word TEXT NOT NULL, word_raw TEXT NOT NULL, definition TEXT NOT NULL, audio_ref TEXT)").expect("entries_data 表失败");
    conn.execute("CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(word, content='entries_data')").expect("FTS5 表失败");
    conn.execute("CREATE TABLE IF NOT EXISTS resources (id INTEGER PRIMARY KEY AUTOINCREMENT, entry_id INTEGER NOT NULL, kind TEXT NOT NULL, filename TEXT NOT NULL, dict_dir TEXT NOT NULL, zip_file TEXT NOT NULL)").expect("resources 表失败");
    conn.execute("CREATE INDEX IF NOT EXISTS idx_entries_word ON entries_data(word)").expect("索引失败");
}

fn process_dict(conn: &Connection, input_dir: &str, dz_path: &Path, dict_name: &str) -> Result<usize, String> {
    let text = decompress_dsl_dz(dz_path)?;
    let info = parse_meta(&text, dict_name);
    // ponytail: 前一个字典若中途报错会留下未提交事务, 这里先清掉, 避免后续字典全部失败
    conn.execute("ROLLBACK").ok();
    conn.execute("BEGIN IMMEDIATE TRANSACTION")
        .map_err(|e| format!("事务开始失败: {}", e))?;
    {
        let mut stmt = conn
            .prepare("INSERT INTO dictionaries (name, dict_dir, lang_from, lang_to, entry_count, dz_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
            .map_err(|e| e.to_string())?;
        let lang_to = info.2.clone().unwrap_or_default();
        let dz_str = dz_path.to_string_lossy().to_string();
        stmt.bind((1, info.0.as_str())).map_err(|e| e.to_string())?;
        stmt.bind((2, input_dir)).map_err(|e| e.to_string())?;
        stmt.bind((3, info.1.as_str())).map_err(|e| e.to_string())?;
        stmt.bind((4, lang_to.as_str())).map_err(|e| e.to_string())?;
        stmt.bind((5, info.3 as i64)).map_err(|e| e.to_string())?;
        stmt.bind((6, dz_str.as_str())).map_err(|e| e.to_string())?;
        stmt.next().map_err(|e| e.to_string())?;
    }
    let dict_id = last_rowid(conn);
    // ponytail: zip 命名不统一——DOCE5 是 `<stem>.dsl.files.zip`, MW11 是 `<stem>.dsl.dz.files.zip`;
    // 直接扫目录匹配后缀, 避免逐个拼名字
    let zip_path = find_file(dz_path.parent().unwrap(), |p| {
        p.file_name()
            .map(|n| n.to_string_lossy().ends_with(".files.zip"))
            .unwrap_or(false)
    });

    let mut count = 0usize;
    let mut word: Option<String> = None;
    let mut def_lines: Vec<String> = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim_start();
        // ponytail: DSL 缩进不统一——DOCE5/OALD8 用 tab, MW11 用空格; 只按 \t 判断会把 MW11 释义行误当词头
        let indented = line.starts_with('\t') || line.starts_with(' ');
        if !indented && !trimmed.is_empty() && !trimmed.starts_with('#') {
            if let Some(w) = word.take() {
                let definition = expand_tags(&def_lines.join("\n"));
                let audio_ref = find_sound(&def_lines.join("\n"));
                let sql = format!("INSERT INTO entries_data (dictionary_id, word, word_raw, definition, audio_ref) VALUES ({}, '{}', '{}', '{}', '{}')", dict_id, word_lower(&w).replace('\'', "''"), w.replace('\'', "''"), definition.replace('\'', "''"), audio_ref.as_deref().unwrap_or("").replace('\'', "''"));
                conn.execute(&sql).map_err(|e| format!("entry: {}", e))?;
                let eid = last_rowid(conn);
                if let Some(zp) = zip_path.as_ref() {
                    // 存 zip 完整路径 (zip 实际在子目录, 只存文件名会丢失位置)
                    let zip_full = zp.to_string_lossy().replace('\'', "''");
                    let dir_esc = input_dir.replace('\'', "''");
                    for (kind, fname) in extract_resources(&def_lines.join("\n")) {
                        // ponytail: 音频文件名可能含单引号 (如 bre_ld41'bout.wav), 必须转义
                        let fname_esc = fname.replace('\'', "''");
                        let rsql = format!("INSERT INTO resources (entry_id, kind, filename, dict_dir, zip_file) VALUES ({}, '{}', '{}', '{}', '{}')", eid, kind, fname_esc, dir_esc, zip_full);
                        conn.execute(&rsql).map_err(|e| format!("resource: {}", e))?;
                    }
                }
                count += 1;
            }
            let word_text = trimmed.trim_start_matches('$');
            word = Some(clean_word(word_text));
            def_lines.clear();
        } else if word.is_some() && !trimmed.is_empty() {
            def_lines.push(trimmed.to_string());
        }
    }
    if let Some(w) = word {
        let definition = expand_tags(&def_lines.join("\n"));
        let audio_ref = find_sound(&def_lines.join("\n"));
        let sql = format!("INSERT INTO entries_data (dictionary_id, word, word_raw, definition, audio_ref) VALUES ({}, '{}', '{}', '{}', '{}')", dict_id, word_lower(&w).replace('\'', "''"), w.replace('\'', "''"), definition.replace('\'', "''"), audio_ref.as_deref().unwrap_or("").replace('\'', "''"));
        conn.execute(&sql).map_err(|e| format!("entry: {}", e))?;
        count += 1;
    }

    conn.execute("COMMIT")
        .map_err(|e| format!("事务提交失败: {}", e))?;
    Ok(count)
}

// 词头清理: 去掉 {..} 与 [..] 标记 (如 vitamin b{[sub]}12{[/sub]} → vitamin b12), 折叠空白
fn clean_word(w: &str) -> String {
    let chars: Vec<char> = w.chars().collect();
    let mut out = String::with_capacity(w.len());
    let mut i = 0usize;
    while i < chars.len() {
        match chars[i] {
            '{' | '[' => {
                let close = if chars[i] == '{' { '}' } else { ']' };
                let mut j = i + 1;
                while j < chars.len() && chars[j] != close { j += 1; }
                i = if j < chars.len() { j + 1 } else { chars.len() };
            }
            c => { out.push(c); i += 1; }
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn word_lower(word: &str) -> String {
    word.to_lowercase()
}

fn decompress_dsl_dz(path: &Path) -> Result<String, String> {
    let mut child = std::process::Command::new("gzip").args(["-dc", &path.to_string_lossy()]).stdout(std::process::Stdio::piped()).spawn().map_err(|e| format!("gzip 启动失败: {}", e))?;
    let stdout = child.stdout.take().ok_or("无法获取 stdout")?;
    let reader = BufReader::new(stdout);
    let mut bytes: Vec<u8> = Vec::new();
    let _ = std::io::Read::take(reader, u64::MAX).read_to_end(&mut bytes).map_err(|e| e.to_string())?;     child.wait().map_err(|e| e.to_string())?;
    let utf16: Vec<u16> = if bytes.starts_with(&[0xff, 0xfe]) { bytes[2..].chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect() } else { bytes.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect() };
    let mut text = String::from_utf16_lossy(&utf16);
    if text.starts_with("\u{feff}") { text = text[3..].to_string(); }

    Ok(text)
}

fn parse_meta(text: &str, name: &str) -> (String, String, Option<String>, usize) {
    let (mut lf, mut lt, mut count) = ("en".to_string(), None, 0usize);
    for line in text.lines().take(100) {
        if line.contains("#INDEX_LANGUAGE") { lf = extract_quoted(line); }
        else if line.contains("#CONTENTS_LANGUAGE") { lt = Some(extract_quoted(line)); }
        else if line.contains("Headwords/Entries:") { if let Some(p) = line.split('/').next() { count = p.trim().parse().unwrap_or(0); } }
    }
    (name.to_string(), lf, lt, count)
}

fn extract_quoted(s: &str) -> String { s.split_once('"').and_then(|(_, rest)| rest.rsplit_once('"')).map(|(a, _)| a.to_string()).unwrap_or_default() }

// DSL 富文本 → 简洁 HTML:
//   保留 [b][i][u][sub][sup] → HTML; 剥离其余全部 [xxx] 标签 (颜色/边距/例句/引用等);
//   去掉资源引用 [s]file[/s] 整段; 去掉 {{...}} 标记; 还原 \[ \] 转义; 换行 → <br>
fn expand_tags(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0usize;
    // 累积连续 <br>, 折叠多余空行
    let push_br = |out: &mut String| {
        if !out.ends_with("<br>") { out.push_str("<br>"); }
    };

    while i < chars.len() {
        let c = chars[i];
        match c {
            '\\' => {
                let n = chars.get(i + 1).copied();
                if matches!(n, Some('[') | Some(']') | Some('\\')) {
                    out.push(n.unwrap());
                    i += 2;
                } else {
                    out.push(c);
                    i += 1;
                }
            }
            '{' if chars.get(i + 1) == Some(&'{') => {
                let mut j = i + 2;
                while j + 1 < chars.len() && !(chars[j] == '}' && chars[j + 1] == '}') { j += 1; }
                i = if j + 1 < chars.len() { j + 2 } else { chars.len() };
            }
            '[' => {
                let mut j = i + 1;
                while j < chars.len() && chars[j] != ']' { j += 1; }
                let tag: String = chars[i + 1..j.min(chars.len())].iter().collect();
                // [s]file[/s] 资源引用: 整段丢弃
                if tag == "s" {
                    let mut k = j + 1;
                    while k + 3 <= chars.len() && !(chars[k] == '[' && chars.get(k+1) == Some(&'/') && chars.get(k+2) == Some(&'s') && chars.get(k+3) == Some(&']')) { k += 1; }
                    i = if k + 3 < chars.len() { k + 4 } else { chars.len() };
                    continue;
                }
                match tag.as_str() {
                    "b" => out.push_str("<b>"),
                    "/b" => out.push_str("</b>"),
                    "i" => out.push_str("<i>"),
                    "/i" => out.push_str("</i>"),
                    "u" => out.push_str("<u>"),
                    "/u" => out.push_str("</u>"),
                    "sub" => out.push_str("<sub>"),
                    "/sub" => out.push_str("</sub>"),
                    "sup" => out.push_str("<sup>"),
                    "/sup" => out.push_str("</sup>"),
                    _ => {}
                }
                i = if j < chars.len() { j + 1 } else { j };
            }
            '\n' | '\r' => { push_br(&mut out); i += 1; }
            _ => { out.push(c); i += 1; }
        }
    }
    out.trim().to_string()
}

fn is_audio(name: &str) -> bool {
    let n = name.to_lowercase();
    [".wav", ".mp3", ".ogg", ".oga", ".flac", ".m4a"].iter().any(|e| n.ends_with(e))
}

fn is_image(name: &str) -> bool {
    let n = name.to_lowercase();
    [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg", ".webp"].iter().any(|e| n.ends_with(e))
}

// 遍历所有 [s]filename[/s] 引用
fn each_sound_ref<F: FnMut(&str)>(text: &str, mut f: F) {
    let mut search = 0usize;
    while let Some(s) = text[search..].find("[s]") {
        let abs = search + s + 3;
        match text[abs..].find("[/s]") {
            Some(e) => { f(&text[abs..abs + e]); search = abs + e + 4; }
            None => break,
        }
    }
}

fn find_sound(text: &str) -> Option<String> {
    let mut found = None;
    each_sound_ref(text, |name| {
        if found.is_none() && is_audio(name) { found = Some(name.to_string()); }
    });
    found
}

fn extract_resources(text: &str) -> Vec<(&'static str, String)> {
    let mut r = Vec::new();
    each_sound_ref(text, |name| {
        if is_audio(name) { r.push(("audio", name.to_string())); }
        else if is_image(name) { r.push(("image", name.to_string())); }
    });
    r
}

fn find_file(dir: &Path, pred: impl Fn(&Path) -> bool) -> Option<PathBuf> {
    fs::read_dir(dir).ok()?.filter_map(|e| e.ok()?.path().into()).find(|p| pred(&p.to_path_buf()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expand_tags_keeps_bold_italic_and_strips_color_margin() {
        let input = "<b>bird</b> [c darkgray]<i>noun</i>[/c][m1] one sense[/m]";
        let out = expand_tags(input);
        assert!(out.contains("<b>bird</b>"), "保留 bold: {out}");
        assert!(out.contains("<i>noun</i>"), "保留 italic: {out}");
        assert!(!out.contains("[c"), "剥离颜色标签: {out}");
        assert!(!out.contains("[m1]"), "剥离边距标签: {out}");
        assert!(!out.contains("[/c]"), "剥离闭合色标: {out}");
    }

    #[test]
    fn expand_tags_drops_sound_ref_entirely() {
        let input = "start[s]bre_ld45bird.wav[/s]end";
        let out = expand_tags(input);
        assert_eq!(out, "startend", "应整段丢弃 [s]..[/s]: {out}");
    }

    #[test]
    fn expand_tags_strips_braces_and_restores_escaped_brackets() {
        let input = "{{ud}}used{{/ud}} [c][com]\\[countable\\][/com][/c]";
        let out = expand_tags(input);
        assert!(!out.contains("{{"), "剥离 {{}}: {out}");
        assert!(out.contains("[countable]"), "还原 \\[ 转义: {out}");
    }

    #[test]
    fn expand_tags_collapses_consecutive_newlines() {
        let out = expand_tags("a\n\n\nb");
        assert_eq!(out, "a<br>b", "重复 <br> 应折叠: {out}");
    }

    #[test]
    fn clean_word_strips_subscript_braces() {
        assert_eq!(clean_word("vitamin b{[sub]}12{[/sub]}"), "vitamin b12");
        assert_eq!(clean_word("h{[sub]}2{[/sub]}o"), "h2o");
        assert_eq!(clean_word("-a-"), "-a-");
    }

    #[test]
    fn find_sound_prefers_audio_and_skips_images() {
        let text = "[s]eagle.jpg[/s] [s]bre_ld45bird.wav[/s]";
        assert_eq!(find_sound(text).as_deref(), Some("bre_ld45bird.wav"));
    }

    #[test]
    fn extract_resources_classifies_by_extension() {
        let text = "[s]aah00001.wav[/s][s]aardvark.jpg[/s]";
        let r = extract_resources(text);
        assert!(r.contains(&("audio", "aah00001.wav".to_string())));
        assert!(r.contains(&("image", "aardvark.jpg".to_string())));
    }

    #[test]
    fn audio_filenames_with_quotes_are_preserved() {
        let text = "[s]bre_ld41'bout.wav[/s]";
        assert_eq!(find_sound(text).as_deref(), Some("bre_ld41'bout.wav"));
    }
}
