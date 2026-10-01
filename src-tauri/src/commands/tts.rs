// 语音模型（MOSS-TTS-Nano）管理命令：
//   检查状态 / 后台下载（hf-mirror 镜像，进度事件）/ 删除（可逆）/ 合成试听 PCM
//
// 模型目录：app_data_dir/tts-models/{MOSS-TTS-Nano-100M-ONNX, MOSS-Audio-Tokenizer-Nano-ONNX}
// 文件清单与字节数来自 hf-mirror API tree/main 实测，不得自猜；
// 下载走 hf-mirror.com（中国网络下 huggingface.co 不可达）。
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{Emitter, Manager};
use tokio::io::AsyncWriteExt;

use moss_tts_nano::MossTtsNano;

/// 镜像基地址（中国网络唯一可靠通道）
const MIRROR_BASE: &str = "https://hf-mirror.com";
/// 桥接 crate 版本（与 moss-tts-nano 0.1.1 对应）
const TTS_VERSION: &str = "0.1.1";

/// 下载/删除互斥锁：防止并发操作模型目录（下载中禁删除、删除中禁下载）
static MODEL_LOCK: Mutex<()> = Mutex::new(());

/// 完整 repo id（resolve-cache 直链与 api/models 必须含组织前缀）
const TTS_REPO: &str = "OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX";
const CODEC_REPO: &str = "OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano-ONNX";
/// 磁盘子目录名（纯名，避免 URL 组织前缀产生嵌套目录）
const TTS_REPO_DIR: &str = "MOSS-TTS-Nano-100M-ONNX";
const CODEC_REPO_DIR: &str = "MOSS-Audio-Tokenizer-Nano-ONNX";

/// 文件清单（文件名 → 字节数，来自 hf-mirror API tree/main）
const TTS_FILES: &[(&str, u64)] = &[
    ("README.md", 6_095),
    ("browser_poc_manifest.json", 503_354),
    ("moss_tts_decode_step.onnx", 291_483),
    ("moss_tts_global_shared.data", 440_813_568),
    ("moss_tts_local_cached_step.onnx", 53_685),
    ("moss_tts_local_decoder.onnx", 49_231),
    ("moss_tts_local_fixed_sampled_frame.onnx", 471_262),
    ("moss_tts_local_shared.data", 229_678_080),
    ("moss_tts_prefill.onnx", 283_305),
    ("tokenizer.model", 470_897),
    ("tts_browser_onnx_meta.json", 4_487),
];
const CODEC_FILES: &[(&str, u64)] = &[
    ("README.md", 4_892),
    ("codec_browser_onnx_meta.json", 17_036),
    ("moss_audio_tokenizer_decode_full.onnx", 681_902),
    ("moss_audio_tokenizer_decode_shared.data", 44_198_912),
    ("moss_audio_tokenizer_decode_step.onnx", 351_400),
    ("moss_audio_tokenizer_encode.data", 44_507_136),
    ("moss_audio_tokenizer_encode.onnx", 815_775),
];

fn total_bytes() -> u64 {
    TTS_FILES.iter().map(|(_, s)| s).sum::<u64>() + CODEC_FILES.iter().map(|(_, s)| s).sum::<u64>()
}

/// 模型根目录
fn models_root(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to get app data dir")
        .join("tts-models")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 端到端探测：resolve-cache 直链 + 大小校验（验证真实下载链路，跑完即删）
    #[tokio::test]
    async fn probe_resolve_cache_download() {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(900))
            .user_agent("desktop-translation/0.1")
            .build()
            .unwrap();
        let (sha_tts, _) = fetch_repo_shas(&client).await.expect("fetch shas failed");
        let dir = std::env::temp_dir().join("tts-dl-probe-readme");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        download_file(&client, &dir, TTS_REPO, &sha_tts, "README.md", 6_095, &mut |_| {})
            .await
            .expect("download README.md failed");
        let meta = fs::metadata(dir.join("README.md")).expect("file missing");
        assert_eq!(meta.len(), 6_095, "README.md size mismatch");
        // 大道具即断点续传：已完整文件应被 file_ok 跳过（download_all 行为），这里直接验证 download_file 幂等
        download_file(
            &client,
            &dir,
            TTS_REPO,
            &sha_tts,
            "README.md",
            6_095,
            &mut |_| {},
        )
        .await
        .expect("idempotent re-download failed");
        fs::remove_dir_all(&dir).unwrap();
    }

    /// 大文件路径探测：302 → AWS CDN + Range 断点续传（预写垃圾字节触发 206 追加）。
    /// 网络测试，默认跳过；`cargo test -- --ignored` 显式运行。
    #[tokio::test]
    #[ignore = "真实网络下载 44MB，需显式运行"]
    async fn probe_large_file_resume() {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(30))
            .timeout(Duration::from_secs(900))
            .user_agent("desktop-translation/0.1")
            .build()
            .unwrap();
        let (_, sha_codec) = fetch_repo_shas(&client).await.expect("fetch shas failed");
        let dir = std::env::temp_dir().join("tts-dl-probe-large");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let dest = dir.join("moss_audio_tokenizer_encode.data");
        // 预写 1000 字节垃圾：download_file 会 resume=1000 → Range: bytes=1000-
        // CDN 返回 206 则追加；若忽略 Range 返回 200 则覆盖重写——两条路径最终都应对齐 44MB。
        fs::write(&dest, vec![0u8; 1000]).unwrap();
        download_file(
            &client,
            &dir,
            CODEC_REPO,
            &sha_codec,
            "moss_audio_tokenizer_encode.data",
            44_507_136,
            &mut |_| {},
        )
        .await
        .expect("download 44MB file failed");
        let meta = fs::metadata(&dest).expect("file missing");
        assert_eq!(meta.len(), 44_507_136, "size mismatch after resume");
        fs::remove_dir_all(&dir).unwrap();
    }
}

/// 单文件是否完好（存在且字节数精确匹配）
fn file_ok(path: &Path, expected: u64) -> bool {
    fs::metadata(path)
        .map(|m| m.len() == expected)
        .unwrap_or(false)
}

/// 两个模型目录的所有文件是否完整
fn models_complete(root: &Path) -> bool {
    TTS_FILES
        .iter()
        .all(|(name, size)| file_ok(&root.join(TTS_REPO_DIR).join(name), *size))
        && CODEC_FILES
            .iter()
            .all(|(name, size)| file_ok(&root.join(CODEC_REPO_DIR).join(name), *size))
}

#[derive(Serialize)]
pub struct TtsStatus {
    downloaded: bool,
    version: Option<String>,
    size_bytes: Option<u64>,
}

/// 查询模型状态：目录存在且文件齐全 → 已下载
#[tauri::command]
pub fn tts_model_status_cmd(app: tauri::AppHandle) -> Result<TtsStatus, String> {
    let root = models_root(&app);
    let complete = models_complete(&root);
    Ok(TtsStatus {
        downloaded: complete,
        version: complete.then(|| TTS_VERSION.to_string()),
        size_bytes: complete.then(total_bytes),
    })
}

/// 开始后台下载（hf-mirror）。立即返回；进度经事件推送：
///   tts-download-progress { downloaded_bytes, total_bytes, file }
///   tts-download-finished { ok, message }
#[tauri::command]
pub fn tts_model_download_cmd(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = MODEL_LOCK.try_lock().map_err(|_| "已有模型操作进行中".to_string())?;
    let root = models_root(&app);
    if models_complete(&root) {
        return Err("模型已完整，无需重复下载".to_string());
    }
    // 后台线程下载，避免阻塞主线程与 UI
    tauri::async_runtime::spawn(async move {
        let result = download_all(&app, &root).await;
        let message = match &result {
            Ok(()) => "ok".to_string(),
            Err(e) => e.clone(),
        };
        let _ = app.emit(
            "tts-download-finished",
            serde_json::json!({ "ok": result.is_ok(), "message": message }),
        );
    });
    Ok(())
}

/// 删除整个模型目录（完全可逆，删除后可再次下载）
#[tauri::command]
pub fn tts_model_delete_cmd(app: tauri::AppHandle) -> Result<(), String> {
    let _guard = MODEL_LOCK.try_lock().map_err(|_| "已有模型操作进行中".to_string())?;
    let root = models_root(&app);
    if root.exists() {
        fs::remove_dir_all(&root).map_err(|e| format!("删除模型失败: {e}"))?;
    }
    Ok(())
}

/// 内置音色清单（对应模型 manifest browser_poc_manifest.json，voice 字段即 set_voice 所需名字）
#[derive(Clone, Copy, Serialize)]
pub struct TtsVoiceInfo {
    pub voice: &'static str,
    pub group: &'static str,
}

/// 18 个内置音色（按语言/性别分组；group 前端用 i18n 展示组名）
const VOICES: &[TtsVoiceInfo] = &[
    // 中文男声
    TtsVoiceInfo { voice: "Junhao", group: "cn_male" },
    TtsVoiceInfo { voice: "Zhiming", group: "cn_male" },
    TtsVoiceInfo { voice: "Weiguo", group: "cn_male" },
    // 中文女声
    TtsVoiceInfo { voice: "Xiaoyu", group: "cn_female" },
    TtsVoiceInfo { voice: "Yuewen", group: "cn_female" },
    TtsVoiceInfo { voice: "Lingyu", group: "cn_female" },
    // 英文男声
    TtsVoiceInfo { voice: "Trump", group: "en_male" },
    TtsVoiceInfo { voice: "Adam", group: "en_male" },
    TtsVoiceInfo { voice: "Nathan", group: "en_male" },
    // 英文女声
    TtsVoiceInfo { voice: "Ava", group: "en_female" },
    TtsVoiceInfo { voice: "Bella", group: "en_female" },
    // 日文女声
    TtsVoiceInfo { voice: "Soyo", group: "jp_female" },
    TtsVoiceInfo { voice: "Saki", group: "jp_female" },
    TtsVoiceInfo { voice: "Mortis", group: "jp_female" },
    TtsVoiceInfo { voice: "Umiri", group: "jp_female" },
    TtsVoiceInfo { voice: "Mei", group: "jp_female" },
    TtsVoiceInfo { voice: "Anon", group: "jp_female" },
    TtsVoiceInfo { voice: "Arisa", group: "jp_female" },
];

fn voice_valid(voice: &str) -> bool {
    VOICES.iter().any(|v| v.voice == voice)
}

/// 列出全部内置音色
#[tauri::command]
pub fn tts_list_voices_cmd() -> Vec<TtsVoiceInfo> {
    VOICES.to_vec()
}

/// 切换当前音色（引擎已加载则即时 set_voice，不重载模型）
#[tauri::command]
pub async fn tts_set_voice_cmd(
    app: tauri::AppHandle,
    voice: String,
    state: tauri::State<'_, TtsEngineCache>,
) -> Result<(), String> {
    if !voice_valid(&voice) {
        return Err(format!("未知音色: {voice}"));
    }
    let root = models_root(&app);
    if !models_complete(&root) {
        return Err("语音模型未下载，请先在设置中下载".to_string());
    }
    let mut guard = state.0.lock().await;
    if let Some(engine) = guard.as_mut() {
        engine
            .set_voice(&voice)
            .await
            .map_err(|e| format!("切换音色失败: {e}"))?;
    }
    Ok(())
}

/// 合成试听 PCM（48kHz 双声道交错 f32）。模型未下载时返回明确错误；
/// 引擎实例做进程级缓存，避免重复加载 7 个 ONNX session。
/// voice 为当前设置音色：引擎首次构建时直接采用；已加载则 set_voice 切换。
#[tauri::command]
pub async fn tts_synthesize_cmd(
    app: tauri::AppHandle,
    text: String,
    voice: Option<String>,
    state: tauri::State<'_, TtsEngineCache>,
) -> Result<Vec<f32>, String> {
    let root = models_root(&app);
    if !models_complete(&root) {
        return Err("语音模型未下载，请先在设置中下载".to_string());
    }
    let wanted = voice.as_deref().unwrap_or("Junhao");
    if !voice_valid(wanted) {
        return Err(format!("未知音色: {wanted}"));
    }
    let mut guard = state.0.lock().await;
    if guard.is_none() {
        let engine = MossTtsNano::builder()
            .model_dir(root.join(TTS_REPO_DIR))
            .codec_dir(root.join(CODEC_REPO_DIR))
            .voice(wanted)
            .sample_mode("fixed")
            .seed(1234)
            .build()
            .await
            .map_err(|e| format!("模型加载失败: {e}"))?;
        *guard = Some(engine);
    } else if let Some(engine) = guard.as_mut() {
        engine
            .set_voice(wanted)
            .await
            .map_err(|e| format!("切换音色失败: {e}"))?;
    }
    let samples = guard
        .as_mut()
        .unwrap()
        .synth(&text)
        .await
        .map_err(|e| format!("语音合成失败: {e}"))?;
    Ok(samples)
}

/// 引擎缓存（tokio Mutex 供 async 命令跨 await 持有）
pub struct TtsEngineCache(pub tokio::sync::Mutex<Option<MossTtsNano>>);

impl Default for TtsEngineCache {
    fn default() -> Self {
        Self(tokio::sync::Mutex::new(None))
    }
}

/// 逐文件下载全部模型；单文件失败重试（退避），进度按块累计 + 节流推送
async fn download_all(app: &tauri::AppHandle, root: &Path) -> Result<(), String> {
    let total = total_bytes();
    // 已完整下载的字节数（仅文件级累加；进行中文件的增量由回调临时计入展示值）
    let mut done: u64 = 0;
    let mut throttle = ProgressThrottle::new(total);
    // client 复用于全部文件；超时策略：连接 30s，整体 900s（大模型文件 440MB 需长时间）
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(900))
        .user_agent("desktop-translation/0.1")
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;
    // 两个仓库的 commit sha（resolve-cache 直链需要；公开模型无需 token，仅拦截限流页面）
    let (sha_tts, sha_codec) = fetch_repo_shas(&client).await?;
    for (repo, repo_dir, sha, files) in [
        (TTS_REPO, TTS_REPO_DIR, sha_tts.as_str(), TTS_FILES),
        (CODEC_REPO, CODEC_REPO_DIR, sha_codec.as_str(), CODEC_FILES),
    ] {
        let dir = root.join(repo_dir);
        fs::create_dir_all(&dir).map_err(|e| format!("创建模型目录失败: {e}"))?;
        for (name, expected) in files {
            if file_ok(&dir.join(name), *expected) {
                done += *expected;
                throttle.push(app, name, done);
                continue;
            }
            download_file(&client, &dir, repo, sha, name, *expected, &mut |written| {
                // written = 本文件已写字节（含续传起点）；展示值 = 已完成文件 + 当前增量
                throttle.push(app, name, done + written);
            })
            .await?;
            done += *expected;
            throttle.push(app, name, done);
        }
    }
    Ok(())
}

/// 进度推送节流器：两次事件间隔 ≥500ms 或累计增量 ≥1MB 才 emit，
/// 保证 440MB 大文件下载中进度条持续平滑滚动而不刷爆事件通道。
struct ProgressThrottle {
    total: u64,
    last_emit: u64,
    last_time: std::time::Instant,
}

impl ProgressThrottle {
    fn new(total: u64) -> Self {
        Self {
            total,
            last_emit: 0,
            last_time: std::time::Instant::now(),
        }
    }

    fn push(&mut self, app: &tauri::AppHandle, file: &str, shown: u64) {
        const THROTTLE: Duration = Duration::from_millis(500);
        const CHUNK_SPAN: u64 = 1024 * 1024;
        if self.last_time.elapsed() >= THROTTLE || shown.saturating_sub(self.last_emit) >= CHUNK_SPAN
        {
            self.last_emit = shown;
            self.last_time = std::time::Instant::now();
            let _ = app.emit(
                "tts-download-progress",
                serde_json::json!({
                    "downloaded_bytes": shown,
                    "total_bytes": self.total,
                    "file": file,
                }),
            );
        }
    }
}

/// 通过 hf-mirror API 抓取仓库 commit sha（resolve-cache 直链的前缀）
async fn fetch_repo_shas(client: &reqwest::Client) -> Result<(String, String), String> {
    let mut shas = Vec::new();
    for repo in [TTS_REPO, CODEC_REPO] {
        let url = format!("{MIRROR_BASE}/api/models/{repo}");
        let mut last_err = String::new();
        let mut ok = false;
        // 限流兜底：最多 6 次短退避
        for attempt in 1..=6 {
            let resp = match client.get(&url).send().await {
                Ok(r) => r,
                Err(e) => {
                    last_err = format!("{e}");
                    tokio::time::sleep(Duration::from_secs(3 * attempt)).await;
                    continue;
                }
            };
            if !resp.status().is_success() {
                last_err = format!("HTTP {}", resp.status());
                tokio::time::sleep(Duration::from_secs(3 * attempt)).await;
                continue;
            }
            let json: serde_json::Value = match resp.json().await {
                Ok(j) => j,
                Err(e) => {
                    last_err = format!("{e}");
                    tokio::time::sleep(Duration::from_secs(3 * attempt)).await;
                    continue;
                }
            };
            if let Some(sha) = json.get("sha").and_then(|v| v.as_str()) {
                shas.push(sha.to_string());
                ok = true;
                break;
            }
        }
        if !ok {
            return Err(format!("获取模型仓库 sha 失败({repo}): {last_err}"));
        }
    }
    Ok((shas[0].clone(), shas[1].clone()))
}

/// 单文件下载：resolve-cache 直链（绕开 resolve/main 限流）+ 断点续传 + 大小校验 + 失败重试
/// on_chunk 回调：参数为「本文件已写入字节数」（含续传起点），每写完一个 chunk 触发一次，
/// 供 download_all 做实时进度推送；无进度需要时可传空闭包。
async fn download_file(
    client: &reqwest::Client,
    dir: &Path,
    repo: &str,
    sha: &str,
    name: &str,
    expected: u64,
    on_chunk: &mut (dyn FnMut(u64) + Send),
) -> Result<(), String> {
    // resolve-cache 免限流直链：小文件直接 200；大文件 302 到 CDN 且支持 Range 续传
    let url = format!("{MIRROR_BASE}/api/resolve-cache/models/{repo}/{sha}/{name}");
    let dest = dir.join(name);
    let mut attempt = 0;
    loop {
        attempt += 1;
        // 断点续传：本地已有部分则从该偏移继续
        let resume = fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
        let mut req = client.get(&url);
        if resume > 0 {
            req = req.header("Range", format!("bytes={resume}-"));
        }
        let resp = req
            .send()
            .await
            .map_err(|e| format!("请求失败({repo}/{name}): {e}"))?;
        let status = resp.status();
        // 只接受 200（全新）或 206（续传）；其余视为镜像限流/错误页，重试
        if !(status.is_success() || status == reqwest::StatusCode::PARTIAL_CONTENT) {
            if attempt >= 10 {
                return Err(format!("下载失败({repo}/{name}): HTTP {status}"));
            }
            tokio::time::sleep(Duration::from_secs(3 * attempt)).await;
            continue;
        }
        // 错误页预检：期望的文件通常远大于 1KB；Content-Length 明显偏小 → 直接重试
        if let Some(len) = resp.content_length() {
            if len > 0 && len < expected && len < 1024 {
                if attempt >= 10 {
                    return Err(format!("下载失败({repo}/{name}): 镜像返回错误页"));
                }
                tokio::time::sleep(Duration::from_secs(3 * attempt)).await;
                continue;
            }
        }
        // 写入：206 续传时追加；200 时覆盖（清除坏文件残留）
        let mut file = if status == reqwest::StatusCode::PARTIAL_CONTENT {
            tokio::fs::OpenOptions::new()
                .append(true)
                .open(&dest)
                .await
                .map_err(|e| format!("打开续传文件失败({repo}/{name}): {e}"))?
        } else {
            tokio::fs::File::create(&dest)
                .await
                .map_err(|e| format!("创建文件失败({repo}/{name}): {e}"))?
        };
        let mut written = resume; // 已写入字节（含续传起点，进度展示用）
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("读取响应失败({repo}/{name}): {e}"))?;
            file.write_all(&chunk)
                .await
                .map_err(|e| format!("写入失败({repo}/{name}): {e}"))?;
            written += chunk.len() as u64;
            on_chunk(written);
        }
        // 大小校验：必须精确匹配，否则删除坏文件后重试
        if file_ok(&dest, expected) {
            return Ok(());
        }
        let _ = fs::remove_file(&dest);
        if attempt >= 10 {
            return Err(format!("下载校验失败({repo}/{name}): 大小不符"));
        }
        tokio::time::sleep(Duration::from_secs(3 * attempt)).await;
    }
}