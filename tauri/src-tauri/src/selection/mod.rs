pub mod ax;
pub mod permissions;
pub mod simulated_copy;

use std::time::{Duration, Instant};
use async_trait::async_trait;
use tokio::time::sleep;

use crate::errors::{AppError, Result};
use simulated_copy::{simulate_cmd_c, FOCUS_RESTORE_DELAY, POLL_INTERVAL, POLL_TIMEOUT};

#[async_trait]
pub trait ClipboardLike: Send + Sync {
    fn read_text(&self) -> String;
    fn write_text(&self, text: &str);
}

pub async fn get_selected_text(clipboard: &dyn ClipboardLike) -> Result<String> {
    // 1. Try AX direct read first
    match ax::read_selection_via_ax() {
        Ok(Some(text)) => return Ok(text.trim().to_string()),
        Ok(None) => {} // continue to fallback
        Err(e @ AppError::AccessibilityDenied) => return Err(e),
        Err(e) => return Err(e),
    }

    // 2. Fallback: backup clipboard → clear → simulate ⌘C → poll → restore
    let previous = clipboard.read_text();
    clipboard.write_text("");
    sleep(FOCUS_RESTORE_DELAY).await;
    let copy_result = simulate_cmd_c();
    // Always restore clipboard regardless of whether simulate_cmd_c succeeded
    if let Err(e) = copy_result {
        clipboard.write_text(&previous);
        return Err(e);
    }
    let result = wait_for_clipboard_change(clipboard, &previous, POLL_TIMEOUT, POLL_INTERVAL).await;
    clipboard.write_text(&previous);
    Ok(result.trim().to_string())
}

async fn wait_for_clipboard_change(
    clipboard: &dyn ClipboardLike,
    previous: &str,
    timeout: Duration,
    interval: Duration,
) -> String {
    let started = Instant::now();
    while started.elapsed() < timeout {
        let current = clipboard.read_text();
        if !current.is_empty() && current != previous {
            return current;
        }
        sleep(interval).await;
    }
    clipboard.read_text()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    struct MockClipboard { current: Mutex<String> }

    #[async_trait]
    impl ClipboardLike for MockClipboard {
        fn read_text(&self) -> String { self.current.lock().unwrap().clone() }
        fn write_text(&self, text: &str) { *self.current.lock().unwrap() = text.to_string() }
    }

    #[tokio::test]
    async fn wait_returns_changed_text() {
        let cb = MockClipboard { current: Mutex::new("old".into()) };
        cb.write_text("new");
        let result = wait_for_clipboard_change(
            &cb,
            "old",
            Duration::from_millis(50),
            Duration::from_millis(5),
        )
        .await;
        assert_eq!(result, "new");
    }

    #[tokio::test]
    async fn wait_returns_current_after_timeout() {
        let cb = MockClipboard { current: Mutex::new("same".into()) };
        let result = wait_for_clipboard_change(
            &cb,
            "same",
            Duration::from_millis(30),
            Duration::from_millis(5),
        )
        .await;
        assert_eq!(result, "same");
    }
}
