use serde::Deserialize;

#[derive(Debug, Deserialize)]
struct ChunkChoice {
    delta: Option<Delta>,
    message: Option<Delta>,
}

#[derive(Debug, Deserialize)]
struct Delta {
    content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Chunk {
    choices: Option<Vec<ChunkChoice>>,
}

/// Parses a single SSE `data: …` payload. Returns `(delta_text, done)`.
pub fn parse_chat_completion_delta(data: &str) -> (String, bool) {
    if data == "[DONE]" {
        return (String::new(), true);
    }
    let parsed: Chunk = match serde_json::from_str(data) {
        Ok(p) => p,
        Err(_) => return (String::new(), false),
    };
    let Some(choices) = parsed.choices else { return (String::new(), false); };
    let Some(first) = choices.into_iter().next() else { return (String::new(), false); };
    let delta_content = first.delta.as_ref().and_then(|d| d.content.clone());
    let msg_content = first.message.as_ref().and_then(|d| d.content.clone());
    (delta_content.or(msg_content).unwrap_or_default(), false)
}

/// Consume complete `data: …\n\n` events from `buffer`, invoking `on_delta`
/// for each. Returns `(remaining_buffer, done)`.
pub fn consume_server_sent_events<F: FnMut(&str)>(
    buffer: &str,
    mut on_delta: F,
) -> (String, bool) {
    let mut remaining = buffer.to_string();
    let mut done = false;
    loop {
        let Some(sep_idx) = remaining.find("\n\n") else { break; };
        let event = remaining[..sep_idx].to_string();
        remaining = remaining[sep_idx + 2..].to_string();
        for line in event.lines() {
            let line = line.trim();
            if !line.starts_with("data:") { continue; }
            let data = line["data:".len()..].trim();
            let (delta, is_done) = parse_chat_completion_delta(data);
            if is_done { done = true; break; }
            if !delta.is_empty() { on_delta(&delta); }
        }
        if done { break; }
    }
    (remaining, done)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_single_delta_chunk() {
        let raw = r#"{"choices":[{"delta":{"content":"hi"}}]}"#;
        let (delta, done) = parse_chat_completion_delta(raw);
        assert_eq!(delta, "hi");
        assert!(!done);
    }

    #[test]
    fn parses_done_marker() {
        let (delta, done) = parse_chat_completion_delta("[DONE]");
        assert!(delta.is_empty());
        assert!(done);
    }

    #[test]
    fn falls_back_to_message_content() {
        let raw = r#"{"choices":[{"message":{"content":"full"}}]}"#;
        let (delta, _) = parse_chat_completion_delta(raw);
        assert_eq!(delta, "full");
    }

    #[test]
    fn invalid_json_returns_empty() {
        let (delta, done) = parse_chat_completion_delta("not json");
        assert!(delta.is_empty());
        assert!(!done);
    }

    #[test]
    fn consumes_multiple_events() {
        let buf = "data: {\"choices\":[{\"delta\":{\"content\":\"a\"}}]}\n\ndata: {\"choices\":[{\"delta\":{\"content\":\"b\"}}]}\n\n";
        let mut collected = String::new();
        let (rem, done) = consume_server_sent_events(buf, |d| collected.push_str(d));
        assert_eq!(collected, "ab");
        assert!(!done);
        assert!(rem.is_empty());
    }

    #[test]
    fn keeps_incomplete_trailing_event() {
        let buf = "data: {\"choices\":[{\"delta\":{\"content\":\"a\"}}]}\n\ndata: {\"choi";
        let mut collected = String::new();
        let (rem, _) = consume_server_sent_events(buf, |d| collected.push_str(d));
        assert_eq!(collected, "a");
        assert_eq!(rem, "data: {\"choi");
    }

    #[test]
    fn stops_on_done() {
        let buf = "data: {\"choices\":[{\"delta\":{\"content\":\"a\"}}]}\n\ndata: [DONE]\n\ndata: should-not-see\n\n";
        let mut collected = String::new();
        let (_, done) = consume_server_sent_events(buf, |d| collected.push_str(d));
        assert_eq!(collected, "a");
        assert!(done);
    }
}
