use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

use crate::store::{read_json_or_default, write_json_atomic};

const WRITE_DEBOUNCE: Duration = Duration::from_millis(300);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Bounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WindowState {
    pub bounds: Option<Bounds>,
}

pub fn read(path: &PathBuf) -> WindowState {
    read_json_or_default(path)
}

#[derive(Clone)]
pub struct DebouncedWriter {
    path: PathBuf,
    inflight: Arc<Mutex<Option<JoinHandle<()>>>>,
}

impl DebouncedWriter {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            inflight: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn schedule(&self, bounds: Bounds) {
        let mut guard = self.inflight.lock().await;
        if let Some(h) = guard.take() {
            h.abort();
        }
        let path = self.path.clone();
        let handle = tokio::spawn(async move {
            tokio::time::sleep(WRITE_DEBOUNCE).await;
            let state = WindowState { bounds: Some(bounds) };
            if let Err(e) = write_json_atomic(&path, &state) {
                eprintln!("write window-state failed: {e:?}");
            }
        });
        *guard = Some(handle);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[tokio::test]
    async fn debounce_only_last_value_wins() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("ws.json");
        let writer = DebouncedWriter::new(path.clone());
        for i in 0..5 {
            writer.schedule(Bounds { x: i, y: 0, width: 100, height: 100 }).await;
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        tokio::time::sleep(WRITE_DEBOUNCE + Duration::from_millis(50)).await;
        let state: WindowState = read_json_or_default(&path);
        assert_eq!(state.bounds.unwrap().x, 4);
    }
}
