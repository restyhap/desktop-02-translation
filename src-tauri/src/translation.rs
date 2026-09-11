use serde::{Deserialize, Serialize};
use md5::{Md5, Digest};

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslationResult {
    pub text: String,
    pub source_lang: String,
    pub target_lang: String,
    pub engine: String,
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
    
    let translation = result.data.translations.into_iter().next()
        .ok_or_else(|| "未找到翻译结果".to_string())?;
    
    Ok(TranslationResult {
        text: translation.translated_text,
        source_lang: translation.detected_source_language.unwrap_or(source_lang.to_string()),
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
    
    let translation = result.translations.into_iter().next()
        .ok_or_else(|| "未找到翻译结果".to_string())?;
    
    Ok(TranslationResult {
        text: translation.text,
        source_lang: translation.detected_source_language.unwrap_or(source_lang.to_string()),
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
    
    let salt: u64 = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() % 100000;
    let sign_str = format!("{}{}{}{}", app_id, text, salt, secret_key);
    let mut hasher = Md5::new();
    hasher.update(&sign_str);
    let result = hasher.finalize();
    let sign_hex = format!("{:x}", result);
    
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
    let response = client.get(&url).send().await
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
        src: String,
        dst: String,
    }
    
    let result: BaiduResponse = response
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {}", e))?;
    
    if let Some(code) = result.error_code {
        return Err(format!("百度翻译错误: {} - {}", code, result.error_msg.unwrap_or_default()));
    }
    
    let translation = result.trans_result.into_iter().next()
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
    
    let salt: u64 = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() % 100000;
    let sign_str = format!("{}{}{}{}", app_key, text, salt, secret_key);
    let mut hasher = Md5::new();
    hasher.update(&sign_str);
    let result = hasher.finalize();
    let sign_hex = format!("{:x}", result);
    
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
    let response = client.get(&url).send().await
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
    
    let translation_text = result.translation
        .and_then(|t| t.first().cloned())
        .or_else(|| result.web_translation
            .map(|translations| translations.iter().map(|t| t.join(",")).collect::<Vec<_>>().join("; "))
            .filter(|s| !s.is_empty()))
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
        return Err(format!("彩云小译错误: {} - {}", code, result.message.unwrap_or_default()));
    }
    
    let translation_text = result.target.join("\n");
    
    Ok(TranslationResult {
        text: translation_text,
        source_lang: source_lang.to_string(),
        target_lang: target_lang.to_string(),
        engine: "caiyun".to_string(),
    })
}
