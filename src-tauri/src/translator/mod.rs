pub mod cache;
pub mod phonetic;
pub mod prompts;
pub mod sse;

use std::time::Duration;
use serde::Serialize;
use tokio_util::sync::CancellationToken;

use crate::errors::{AppError, Result};
use crate::translator::cache::{CacheKey, TranslateCache};
use prompts::{PromptStyle, TranslateDirection};

pub const DEFAULT_OPENAI_BASE_URL: &str = "https://api.openai.com/v1";
pub const DEFAULT_OPENAI_MODEL: &str = "gpt-4.1-mini";
const API_REQUEST_TIMEOUT_MS: u64 = 15000;

#[derive(Debug, Clone)]
pub struct TranslateConfig {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

impl TranslateConfig {
    pub fn from_env() -> Self {
        let env = std::env::vars().collect::<std::collections::HashMap<_, _>>();
        Self {
            api_key: env.get("TRANSLATE_API_KEY").cloned()
                .or_else(|| env.get("OPENAI_API_KEY").cloned())
                .unwrap_or_default(),
            base_url: env.get("TRANSLATE_API_BASE_URL").cloned()
                .or_else(|| env.get("TRANSLATE_API_URL").cloned())
                .unwrap_or_else(|| DEFAULT_OPENAI_BASE_URL.to_string()),
            model: env.get("TRANSLATE_MODEL").cloned()
                .unwrap_or_else(|| DEFAULT_OPENAI_MODEL.to_string()),
        }
    }
}

pub fn build_chat_completions_url(base_url: &str) -> String {
    format!("{}/chat/completions", base_url.trim_end_matches('/'))
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: Vec<ChatMessage<'a>>,
    temperature: f32,
    stream: bool,
}

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: String,
}

pub struct TranslateStreamOptions<'a> {
    pub direction: TranslateDirection,
    pub style: PromptStyle,
    pub timeout: Duration,
    pub cancel: Option<&'a CancellationToken>,
    pub cache: Option<&'a TranslateCache>,
    pub on_delta: Box<dyn FnMut(&str) + Send + 'a>,
}

impl<'a> Default for TranslateStreamOptions<'a> {
    fn default() -> Self {
        Self {
            direction: TranslateDirection::Auto,
            style: PromptStyle::Programmer,
            timeout: Duration::from_millis(API_REQUEST_TIMEOUT_MS),
            cancel: None,
            cache: None,
            on_delta: Box::new(|_| {}),
        }
    }
}

pub async fn translate_text_stream(
    text: &str,
    config: &TranslateConfig,
    mut options: TranslateStreamOptions<'_>,
) -> Result<String> {
    if config.api_key.trim().is_empty() {
        return Err(AppError::MissingApiKey(
            "OPENAI_API_KEY or TRANSLATE_API_KEY is not configured".into(),
        ));
    }
    let source = text.trim();
    if source.is_empty() {
        return Ok(String::new());
    }

    // 缓存命中: 直接回放完整结果作为一次 delta, 然后返回
    if let Some(cache) = options.cache {
        let key = CacheKey {
            text: source.to_string(),
            model: config.model.clone(),
            base_url: config.base_url.clone(),
            direction: format!("{:?}-{:?}", options.direction, options.style).to_lowercase(),
            kind: "translation".into(),
        };
        if let Some(cached) = cache.get(&key) {
            (options.on_delta)(&cached);
            return Ok(cached);
        }
    }

    let body = serde_json::to_vec(&ChatRequest {
        model: &config.model,
        messages: vec![
            ChatMessage { role: "system", content: prompts::system_prompt(options.direction, options.style) },
            ChatMessage { role: "user", content: prompts::build_user_prompt(source) },
        ],
        temperature: 0.2,
        stream: true,
    })?;

    let client = reqwest::Client::builder()
        .timeout(options.timeout)
        .build()
        .map_err(|e| AppError::Network(e.to_string()))?;

    let req = client
        .post(build_chat_completions_url(&config.base_url))
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .body(body);

    let response_fut = req.send();
    let response = tokio::select! {
        r = response_fut => r.map_err(map_reqwest_err)?,
        _ = cancel_signal(options.cancel) => return Err(AppError::Cancelled),
    };

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        let msg = parse_api_error_message(&text).unwrap_or_else(|| status.to_string());
        return Err(AppError::Api(format!("API request failed: {}", msg)));
    }

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    if !content_type.contains("text/event-stream") {
        let text = response.text().await.map_err(map_reqwest_err)?;
        let value: serde_json::Value = serde_json::from_str(&text).unwrap_or_default();
        let translated = value["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .trim()
            .to_string();
        if translated.is_empty() {
            return Err(AppError::ApiResponseInvalid(
                "API response did not include translated text".into(),
            ));
        }
        (options.on_delta)(&translated);
        store_in_cache(options.cache, source, config, options.direction, options.style, &translated);
        return Ok(translated);
    }

    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();
    let mut translated = String::new();
    loop {
        let chunk_res = tokio::select! {
            c = stream.next() => c,
            _ = cancel_signal(options.cancel) => return Err(AppError::Cancelled),
        };
        let Some(chunk_res) = chunk_res else { break; };
        let chunk = chunk_res.map_err(map_reqwest_err)?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        let (rem, done) = sse::consume_server_sent_events(&buffer, |delta| {
            translated.push_str(delta);
            (options.on_delta)(delta);
        });
        buffer = rem;
        if done {
            break;
        }
        if let Some(c) = options.cancel {
            if c.is_cancelled() {
                return Err(AppError::Cancelled);
            }
        }
    }

    let translated = translated.trim().to_string();
    if translated.is_empty() {
        return Err(AppError::ApiResponseInvalid(
            "API response did not include translated text".into(),
        ));
    }
    store_in_cache(options.cache, source, config, options.direction, options.style, &translated);
    Ok(translated)
}

fn store_in_cache(
    cache: Option<&TranslateCache>,
    source: &str,
    config: &TranslateConfig,
    direction: TranslateDirection,
    style: PromptStyle,
    translated: &str,
) {
    let Some(cache) = cache else { return };
    let key = CacheKey {
        text: source.to_string(),
        model: config.model.clone(),
        base_url: config.base_url.clone(),
        direction: format!("{:?}-{:?}", direction, style).to_lowercase(),
        kind: "translation".into(),
    };
    cache.set(key, translated.to_string());
}

async fn cancel_signal(cancel: Option<&CancellationToken>) {
    match cancel {
        Some(c) => c.cancelled().await,
        None => std::future::pending::<()>().await,
    }
}

fn map_reqwest_err(e: reqwest::Error) -> AppError {
    if e.is_timeout() {
        AppError::Timeout(format!("API request timed out: {}", e))
    } else {
        AppError::Network(format!("API request failed: {}", e))
    }
}

fn parse_api_error_message(body: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(body).ok()?;
    v["error"]["message"].as_str().map(|s| s.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    fn config(server: &MockServer) -> TranslateConfig {
        TranslateConfig {
            api_key: "test-key".into(),
            base_url: server.uri(),
            model: "test-model".into(),
        }
    }

    #[tokio::test]
    async fn returns_translated_text_from_sse_stream() {
        let server = MockServer::start().await;
        let sse_body = "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\ndata: [DONE]\n\n";
        Mock::given(method("POST")).and(path("/chat/completions"))
            .respond_with(ResponseTemplate::new(200)
                .set_body_raw(sse_body.as_bytes().to_vec(), "text/event-stream"))
            .mount(&server).await;

        let result = translate_text_stream("hi", &config(&server), TranslateStreamOptions::default()).await.unwrap();
        assert_eq!(result, "hello world");
    }

    #[tokio::test]
    async fn returns_missing_api_key_error() {
        let cfg = TranslateConfig { api_key: "".into(), base_url: "http://x".into(), model: "m".into() };
        let err = translate_text_stream("hi", &cfg, TranslateStreamOptions::default()).await.unwrap_err();
        assert!(matches!(err, AppError::MissingApiKey(_)));
    }

    #[tokio::test]
    async fn maps_non_ok_response_to_api_error() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .respond_with(ResponseTemplate::new(401).set_body_string(r#"{"error":{"message":"invalid api key"}}"#))
            .mount(&server).await;
        let err = translate_text_stream("hi", &config(&server), TranslateStreamOptions::default()).await.unwrap_err();
        match err {
            AppError::Api(msg) => assert!(msg.contains("invalid api key")),
            other => panic!("unexpected: {:?}", other),
        }
    }

    #[tokio::test]
    async fn empty_source_returns_empty() {
        let server = MockServer::start().await;
        let result = translate_text_stream("   ", &config(&server), TranslateStreamOptions::default()).await.unwrap();
        assert_eq!(result, "");
    }
}
