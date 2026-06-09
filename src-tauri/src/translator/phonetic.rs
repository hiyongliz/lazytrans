use std::time::Duration;
use serde::Serialize;
use tokio_util::sync::CancellationToken;

use crate::translator::cache::{CacheKey, TranslateCache};
use crate::translator::{build_chat_completions_url, TranslateConfig};

const PHONETIC_TIMEOUT: Duration = Duration::from_millis(6000);
const PHONETIC_SYSTEM_PROMPT: &str = "你是英文发音助手。只输出输入英文单词的 IPA 国际音标，包含两侧斜杠，例如 /həˈloʊ/。不要加任何其他文字、解释、标点或换行。如果输入不是常规英文单词，输出空字符串。";

pub fn is_single_english_word(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() || t.len() > 40 {
        return false;
    }
    let bytes = t.as_bytes();
    if !bytes[0].is_ascii_alphabetic() {
        return false;
    }
    for (i, b) in bytes.iter().enumerate() {
        let is_letter = b.is_ascii_alphabetic();
        let is_mid = matches!(*b, b'\'' | b'-');
        if !is_letter && !(is_mid && i > 0 && i < bytes.len() - 1) {
            return false;
        }
    }
    let last = *bytes.last().unwrap();
    last.is_ascii_alphabetic()
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
    content: &'a str,
}

pub async fn fetch_phonetic(
    word: &str,
    config: &TranslateConfig,
    cache: &TranslateCache,
    cancel: Option<&CancellationToken>,
) -> Option<String> {
    let trimmed = word.trim();
    if !is_single_english_word(trimmed) || config.api_key.trim().is_empty() {
        return None;
    }

    let key = CacheKey {
        text: trimmed.to_lowercase(),
        model: config.model.clone(),
        base_url: config.base_url.clone(),
        direction: "auto".into(),
        kind: "phonetic".into(),
    };
    if let Some(cached) = cache.get(&key) {
        return if cached.is_empty() { None } else { Some(cached) };
    }

    let body = serde_json::to_vec(&ChatRequest {
        model: &config.model,
        messages: vec![
            ChatMessage { role: "system", content: PHONETIC_SYSTEM_PROMPT },
            ChatMessage { role: "user", content: trimmed },
        ],
        temperature: 0.0,
        stream: false,
    })
    .ok()?;

    let client = reqwest::Client::builder()
        .timeout(PHONETIC_TIMEOUT)
        .build()
        .ok()?;
    let req = client
        .post(build_chat_completions_url(&config.base_url))
        .header("Authorization", format!("Bearer {}", config.api_key))
        .header("Content-Type", "application/json")
        .body(body);

    let resp = tokio::select! {
        r = req.send() => r.ok()?,
        _ = async {
            match cancel {
                Some(c) => c.cancelled().await,
                None => std::future::pending::<()>().await,
            }
        } => return None,
    };
    if !resp.status().is_success() {
        return None;
    }
    let v: serde_json::Value = resp.json().await.ok()?;
    let content = v["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();
    let phon = extract_phonetic(&content);
    cache.set(
        CacheKey {
            text: trimmed.to_lowercase(),
            model: config.model.clone(),
            base_url: config.base_url.clone(),
            direction: "auto".into(),
            kind: "phonetic".into(),
        },
        phon.clone().unwrap_or_default(),
    );
    phon
}

fn extract_phonetic(content: &str) -> Option<String> {
    let bytes = content.as_bytes();
    let start = bytes.iter().position(|b| *b == b'/')?;
    let after = &content[start + 1..];
    let end_rel = after.bytes().position(|b| b == b'/')?;
    Some(format!("/{}/", &after[..end_rel]))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_single_word() {
        assert!(is_single_english_word("hello"));
        assert!(is_single_english_word("can't"));
        assert!(is_single_english_word("state-of-art"));
        assert!(!is_single_english_word(""));
        assert!(!is_single_english_word("hello world"));
        assert!(!is_single_english_word("123"));
        assert!(!is_single_english_word(&"a".repeat(50)));
    }

    #[test]
    fn extracts_phonetic() {
        assert_eq!(extract_phonetic("/həˈloʊ/").unwrap(), "/həˈloʊ/");
        assert_eq!(extract_phonetic("音标：/test/ end").unwrap(), "/test/");
        assert!(extract_phonetic("无音标").is_none());
    }
}
