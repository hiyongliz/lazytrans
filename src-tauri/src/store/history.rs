use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::translator::prompts::TranslateDirection;

const HISTORY_MAX_ENTRIES: usize = 50;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub source_text: String,
    pub translated_text: String,
    pub model: String,
    pub base_url: String,
    pub direction: TranslateDirection,
    pub created_at: u64,
}

pub struct CreateInput<'a> {
    pub source_text: &'a str,
    pub translated_text: &'a str,
    pub model: &'a str,
    pub base_url: &'a str,
    pub direction: TranslateDirection,
}

pub fn create_entry(input: CreateInput<'_>) -> HistoryEntry {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64;
    let suffix: String = (0..8).map(|_| {
        let n: u8 = rand::random::<u8>() % 36;
        if n < 10 { (b'0' + n) as char } else { (b'a' + n - 10) as char }
    }).collect();
    HistoryEntry {
        id: format!("{}-{}", now, suffix),
        source_text: input.source_text.to_string(),
        translated_text: input.translated_text.to_string(),
        model: input.model.to_string(),
        base_url: input.base_url.to_string(),
        direction: input.direction,
        created_at: now,
    }
}

pub fn append(mut current: Vec<HistoryEntry>, entry: HistoryEntry) -> Vec<HistoryEntry> {
    current.retain(|e| !(e.source_text == entry.source_text
        && e.model == entry.model
        && e.base_url == entry.base_url
        && e.direction == entry.direction));
    current.insert(0, entry);
    current.truncate(HISTORY_MAX_ENTRIES);
    current
}

pub fn remove(current: Vec<HistoryEntry>, id: &str) -> Vec<HistoryEntry> {
    current.into_iter().filter(|e| e.id != id).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(source: &str, model: &str) -> HistoryEntry {
        HistoryEntry {
            id: format!("id-{source}"),
            source_text: source.into(),
            translated_text: format!("t-{source}"),
            model: model.into(),
            base_url: "u".into(),
            direction: TranslateDirection::Auto,
            created_at: 0,
        }
    }

    #[test]
    fn append_dedupes_and_caps() {
        let cur = vec![entry("a", "m"), entry("b", "m")];
        let next = append(cur, entry("a", "m"));
        assert_eq!(next.len(), 2);
        assert_eq!(next[0].source_text, "a");
        assert_eq!(next[1].source_text, "b");
    }

    #[test]
    fn append_caps_at_50() {
        let mut cur: Vec<HistoryEntry> = (0..50).map(|i| entry(&format!("s{i}"), "m")).collect();
        cur = append(cur, entry("new", "m"));
        assert_eq!(cur.len(), 50);
        assert_eq!(cur[0].source_text, "new");
    }

    #[test]
    fn remove_filters_by_id() {
        let cur = vec![entry("a", "m"), entry("b", "m")];
        let next = remove(cur, "id-a");
        assert_eq!(next.len(), 1);
        assert_eq!(next[0].source_text, "b");
    }
}
