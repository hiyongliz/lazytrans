use async_trait::async_trait;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::selection::ClipboardLike;

pub struct TauriClipboard {
    handle: AppHandle,
}

impl TauriClipboard {
    pub fn new(handle: AppHandle) -> Self {
        Self { handle }
    }
}

#[async_trait]
impl ClipboardLike for TauriClipboard {
    fn read_text(&self) -> String {
        self.handle.clipboard().read_text().unwrap_or_default()
    }
    fn write_text(&self, text: &str) {
        let _ = self.handle.clipboard().write_text(text.to_string());
    }
}
