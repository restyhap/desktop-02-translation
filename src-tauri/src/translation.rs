use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslationResult {
    pub text: String,
    pub source_lang: String,
    pub target_lang: String,
    pub engine: String,
}

/// MD5 hex 摘要（翻译 API 签名共用）
fn md5_hex(input: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(input);
    format!("{:x}", hasher.finalize())
}

// ==================== 组合服务：缓存查找 + 引擎分发 ====================

/// 翻译缓存查找：命中历史库则跳过 API（省配额/离线可用）
fn find_cached_translation(
    app: &tauri::AppHandle,
    text: &str,
    source_lang: &str,
    target_lang: &str,
    engine: &str,
) -> Option<String> {
    let conn = crate::db::open_db(app).ok()?;
    let mut stmt = conn
        .prepare(
            "SELECT translated_text FROM translation_history \
             WHERE source_text = ?1 AND source_lang = ?2 AND target_lang = ?3 AND engine = ?4 \
             ORDER BY timestamp DESC LIMIT 1",
        )
        .ok()?;
    stmt.bind((1, text)).ok()?;
    stmt.bind((2, source_lang)).ok()?;
    stmt.bind((3, target_lang)).ok()?;
    stmt.bind((4, engine)).ok()?;
    match stmt.next() {
        Ok(sqlite::State::Row) => {
            let translated: String = stmt.read(0).ok()?;
            Some(translated)
        }
        _ => None,
    }
}

/// 组合翻译流程：缓存命中直接返回，否则读取 API Key 并调用对应引擎
pub async fn translate_with_cache(
    app: &tauri::AppHandle,
    text: &str,
    source_lang: &str,
    target_lang: &str,
    engine: &str,
) -> Result<TranslationResult, String> {
    // 缓存命中直接返回，跳过 API（省配额/离线可用）
    if let Some(translated) = find_cached_translation(app, text, source_lang, target_lang, engine) {
        return Ok(TranslationResult {
            text: translated,
            source_lang: source_lang.to_string(),
            target_lang: target_lang.to_string(),
            engine: engine.to_string(),
        });
    }

    // 获取 API Key 和 App ID
    let key_record = crate::keys::KeyManager::get_key_with_appid(app, engine)
        .map_err(|e| format!("读取 API Key 失败: {}", e))?;

    let (api_key, app_id) = match key_record {
        Some((key, app_id)) if !key.is_empty() => (key, app_id),
        _ => return Err(format!("未找到 {} 的 API Key，请在设置中配置", engine)),
    };

    match engine {
        "google" => translate_with_google(text, source_lang, target_lang, &api_key).await,
        "deepl" => translate_with_deepl(text, source_lang, target_lang, &api_key).await,
        "baidu" => translate_with_baidu(text, source_lang, target_lang, &app_id, &api_key).await,
        "youdao" => translate_with_youdao(text, source_lang, target_lang, &app_id, &api_key).await,
        "caiyun" => translate_with_caiyun(text, source_lang, target_lang, &api_key).await,
        "ali" => translate_with_alibaba(text, source_lang, target_lang, &api_key, &app_id).await,
        _ => Err(format!("不支持的翻译引擎: {}", engine)),
    }
}

// ==================== Google Translate ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct GoogleTranslateResponse {
    #[serde(rename = "data")]
    data: TranslateData,
}

#[derive(Debug, Serialize, Deserialize)]
struct TranslateData {
    translations: Vec<TranslationItem>,
}

#[derive(Debug, Serialize, Deserialize)]
struct TranslationItem {
    #[serde(rename = "translatedText")]
    translated_text: String,
    #[serde(rename = "detectedSourceLanguage")]
    detected_source_language: Option<String>,
}

/// 调用 Google Translate API
pub async fn translate_with_google(
    text: &str,
    source_lang: &str,
    target_lang: &str,
    api_key: &str,
) -> Result<TranslationResult, String> {
    let url = format!(
        "https://translation.googleapis.com/language/translate/v2?key={}",
        api_key
    );

    let body = serde_json::json!({
        "q": text,
        "source": source_lang,
        "target": target_lang,
        "format": "text"
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP 请求失败: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API 错误: {}", error_text));
    }

    let result: GoogleTranslateResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let translation = result
        .data
        .translations
        .into_iter()
        .next()
        .ok_or_else(|| "未找到翻译结果".to_string())?;

    Ok(TranslationResult {
        text: translation.translated_text,
        source_lang: translation
            .detected_source_language
            .unwrap_or(source_lang.to_string()),
        target_lang: target_lang.to_string(),
        engine: "google".to_string(),
    })
}

// ==================== DeepL ====================

/// 调用 DeepL API
pub async fn translate_with_deepl(
    text: &str,
    source_lang: &str,
    target_lang: &str,
    api_key: &str,
) -> Result<TranslationResult, String> {
    let url = "https://api.deepl.com/v2/translate";

    let body = serde_json::json!({
        "text": [text],
        "source_lang": source_lang.to_uppercase(),
        "target_lang": target_lang.to_uppercase()
    });

    let client = reqwest::Client::new();
    let response = client
        .post(url)
        .header("Authorization", format!("DeepL-Auth-Key {}", api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP 请求失败: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API 错误: {}", error_text));
    }

    #[derive(Debug, Deserialize)]
    struct DeepLResponse {
        translations: Vec<DeepLTranslation>,
    }

    #[derive(Debug, Deserialize)]
    struct DeepLTranslation {
        detected_source_language: Option<String>,
        text: String,
    }

    let result: DeepLResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    let translation = result
        .translations
        .into_iter()
        .next()
        .ok_or_else(|| "未找到翻译结果".to_string())?;

    Ok(TranslationResult {
        text: translation.text,
        source_lang: translation
            .detected_source_language
            .unwrap_or(source_lang.to_string()),
        target_lang: target_lang.to_string(),
        engine: "deepl".to_string(),
    })
}

// ==================== 百度翻译 ====================

/// 调用百度翻译 API
pub async fn translate_with_baidu(
    text: &str,
    source_lang: &str,
    target_lang: &str,
    app_id: &str,
    secret_key: &str,
) -> Result<TranslationResult, String> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let salt: u64 = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() % 100000)
        .unwrap_or(0);
    let sign_hex = md5_hex(&format!("{}{}{}{}", app_id, text, salt, secret_key));

    let url = format!(
        "https://fanyi-api.baidu.com/api/trans/vip/translate?q={}&from={}&to={}&appid={}&salt={}&sign={}",
        urlencoding::encode(text),
        source_lang,
        target_lang,
        app_id,
        salt,
        sign_hex
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP 请求失败: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API 错误: {}", error_text));
    }

    #[derive(Debug, Deserialize)]
    struct BaiduResponse {
        trans_result: Vec<BaiduTransResult>,
        error_code: Option<String>,
        error_msg: Option<String>,
    }

    #[derive(Debug, Deserialize)]
    struct BaiduTransResult {
        dst: String,
    }

    let result: BaiduResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    if let Some(code) = result.error_code {
        return Err(format!(
            "百度翻译错误: {} - {}",
            code,
            result.error_msg.unwrap_or_default()
        ));
    }

    let translation = result
        .trans_result
        .into_iter()
        .next()
        .ok_or_else(|| "未找到翻译结果".to_string())?;

    Ok(TranslationResult {
        text: translation.dst,
        source_lang: source_lang.to_string(),
        target_lang: target_lang.to_string(),
        engine: "baidu".to_string(),
    })
}

// ==================== 有道翻译 ====================

/// 调用有道翻译 API
pub async fn translate_with_youdao(
    text: &str,
    source_lang: &str,
    target_lang: &str,
    app_key: &str,
    secret_key: &str,
) -> Result<TranslationResult, String> {
    use std::time::{SystemTime, UNIX_EPOCH};

    let salt: u64 = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() % 100000)
        .unwrap_or(0);
    let sign_hex = md5_hex(&format!("{}{}{}{}", app_key, text, salt, secret_key));

    let url = format!(
        "https://openapi.youdao.com/api?q={}&from={}&to={}&appKey={}&salt={}&sign={}&signType=v3",
        urlencoding::encode(text),
        source_lang,
        target_lang,
        app_key,
        salt,
        sign_hex
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP 请求失败: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API 错误: {}", error_text));
    }

    #[derive(Debug, Deserialize)]
    struct YoudaoResponse {
        error_code: String,
        translation: Option<Vec<String>>,
        web_translation: Option<Vec<Vec<String>>>,
    }

    let result: YoudaoResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    if result.error_code != "0" {
        return Err(format!("有道翻译错误: {}", result.error_code));
    }

    let translation_text = result
        .translation
        .and_then(|t| t.first().cloned())
        .or_else(|| {
            result
                .web_translation
                .map(|translations| {
                    translations
                        .iter()
                        .map(|t| t.join(","))
                        .collect::<Vec<_>>()
                        .join("; ")
                })
                .filter(|s| !s.is_empty())
        })
        .ok_or_else(|| "未找到翻译结果".to_string())?;

    Ok(TranslationResult {
        text: translation_text,
        source_lang: source_lang.to_string(),
        target_lang: target_lang.to_string(),
        engine: "youdao".to_string(),
    })
}

// ==================== 彩云小译 ====================

/// 调用彩云小译 API
pub async fn translate_with_caiyun(
    text: &str,
    source_lang: &str,
    target_lang: &str,
    api_key: &str,
) -> Result<TranslationResult, String> {
    let url = "https://api.caiyunapp.com/v1/translator";

    let body = serde_json::json!({
        "source": text,
        "trans_type": format!("{}-{}", source_lang, target_lang),
        "request_id": "desktop-translation",
        "detect": true
    });

    let client = reqwest::Client::new();
    let response = client
        .post(url)
        .header("Appkey", api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP 请求失败: {}", e))?;

    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("API 错误: {}", error_text));
    }

    #[derive(Debug, Deserialize)]
    struct CaiyunResponse {
        target: Vec<String>,
        message: Option<String>,
        code: Option<i32>,
    }

    let result: CaiyunResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;

    if let Some(code) = result.code {
        return Err(format!(
            "彩云小译错误: {} - {}",
            code,
            result.message.unwrap_or_default()
        ));
    }

    let translation_text = result.target.join("\n");

    Ok(TranslationResult {
        text: translation_text,
        source_lang: source_lang.to_string(),
        target_lang: target_lang.to_string(),
        engine: "caiyun".to_string(),
    })
}

// ==================== 阿里翻译 ====================

use hmac::{Hmac, Mac};
use sha1::Sha1;
use base64::Engine;

type HmacSha1 = Hmac<Sha1>;

/// 调用阿里翻译 API（HTTP 网关 /api/translate/web/general，ROA 风格签名）
pub async fn translate_with_alibaba(
    text: &str,
    source_lang: &str,
    target_lang: &str,
    access_key_secret: &str,
    access_key_id: &str,
) -> Result<TranslationResult, String> {
    const ENDPOINT: &str = "http://mt.cn-hangzhou.aliyuncs.com/api/translate/web/general";
    const ACCEPT: &str = "application/json";
    const CONTENT_TYPE: &str = "application/json;charset=utf-8";
    const API_VERSION: &str = "2019-01-02";

    let body = serde_json::json!({
        "FormatType": "text",
        "SourceLanguage": source_lang,
        "TargetLanguage": target_lang,
        "SourceText": text,
        "Scene": "general",
    })
    .to_string();

    // ROA 签名：Content-MD5 头 = Base64(MD5(body))
    let mut hasher = Md5::new();
    hasher.update(body.as_bytes());
    let body_md5 = base64::engine::general_purpose::STANDARD.encode(hasher.finalize());
    let date = chrono::Utc::now().format("%a, %d %b %Y %H:%M:%S GMT").to_string();
    let nonce = uuid::Uuid::new_v4().to_string();

    let string_to_sign = format!(
        "POST\n{accept}\n{body_md5}\n{content_type}\n{date}\n\
         x-acs-signature-method:HMAC-SHA1\n\
         x-acs-signature-nonce:{nonce}\n\
         x-acs-version:{api_version}\n\
         /api/translate/web/general",
        accept = ACCEPT,
        body_md5 = body_md5,
        content_type = CONTENT_TYPE,
        date = date,
        nonce = nonce,
        api_version = API_VERSION,
    );

    let mut mac = HmacSha1::new_from_slice(access_key_secret.as_bytes())
        .map_err(|e| format!("签名失败: {}", e))?;
    mac.update(string_to_sign.as_bytes());
    let signature = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
    let authorization = format!("acs {}:{}", access_key_id, signature);

    let client = reqwest::Client::new();
    let response = client
        .post(ENDPOINT)
        .header("Accept", ACCEPT)
        .header("Content-Type", CONTENT_TYPE)
        .header("Content-MD5", &body_md5)
        .header("Date", &date)
        .header("Host", "mt.cn-hangzhou.aliyuncs.com")
        .header("Authorization", &authorization)
        .header("x-acs-signature-nonce", &nonce)
        .header("x-acs-signature-method", "HMAC-SHA1")
        .header("x-acs-version", API_VERSION)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("HTTP 请求失败: {}", e))?;

    let status = response.status();
    let body_text = response.text().await.unwrap_or_default();

    // HTTP 网关统一错误返回：{"errorCode":"...","errorMsg":"..."}
    let error_msg = serde_json::from_str::<serde_json::Value>(&body_text)
        .ok()
        .and_then(|v| {
            v.get("errorMsg")
                .or_else(|| v.get("ErrorMsg"))
                .and_then(|m| m.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| body_text.clone());

    if !status.is_success() {
        return Err(format!("阿里翻译 API 错误: {}", error_msg));
    }

#[derive(Debug, Deserialize)]
struct AlibabaHttpResponse {
    #[serde(rename = "Code", alias = "code")]
    code: Option<String>,
    #[serde(rename = "Message", alias = "message")]
    message: Option<String>,
    #[serde(rename = "Data", alias = "data")]
    data: Option<AlibabaHttpData>,
    #[serde(rename = "errorCode", alias = "ErrorCode")]
    error_code: Option<String>,
    #[serde(rename = "errorMsg", alias = "ErrorMsg")]
    error_msg: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AlibabaHttpData {
    #[serde(rename = "Translated", alias = "translated")]
    translated: Option<String>,
}

    let result: AlibabaHttpResponse = serde_json::from_str(&body_text)
        .map_err(|e| format!("解析响应失败: {} - 原始响应: {}", e, body_text))?;

    if let Some(err_code) = result.error_code {
        return Err(format!(
            "阿里翻译错误: {} - {}",
            err_code,
            result.error_msg.unwrap_or_default()
        ));
    }

    if let Some(code) = result.code {
        if code != "200" {
            return Err(format!(
                "阿里翻译错误: {} - {}",
                code,
                result.message.unwrap_or_default()
            ));
        }
    }

    let translation_text = result
        .data
        .and_then(|d| d.translated)
        .ok_or_else(|| format!("阿里翻译响应中未找到译文: {}", body_text))?;

    Ok(TranslationResult {
        text: translation_text,
        source_lang: source_lang.to_string(),
        target_lang: target_lang.to_string(),
        engine: "ali".to_string(),
    })
}
