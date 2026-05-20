use std::sync::RwLock;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::translator::TranslateConfig;
use crate::translator::cache::TranslateCache;

pub struct AppState {
    pub config: RwLock<TranslateConfig>,
    pub cache: TranslateCache,
    pub active_cancel: Mutex<Option<CancellationToken>>,
    pub manual_input_text: RwLock<String>,
    pub shortcut_label: RwLock<String>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            config: RwLock::new(TranslateConfig::from_env()),
            cache: TranslateCache::new(),
            active_cancel: Mutex::new(None),
            manual_input_text: RwLock::new(String::new()),
            shortcut_label: RwLock::new("Option + D".into()),
        }
    }
}

impl Default for AppState {
    fn default() -> Self { Self::new() }
}
