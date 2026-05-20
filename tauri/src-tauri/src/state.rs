use std::sync::RwLock;
use std::sync::atomic::AtomicU64;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::translator::TranslateConfig;
use crate::translator::cache::TranslateCache;

pub struct AppState {
    pub config: RwLock<TranslateConfig>,
    pub cache: TranslateCache,
    pub active_request: Mutex<Option<(u64, CancellationToken)>>,
    pub next_request_id: AtomicU64,
    pub manual_input_text: RwLock<String>,
    pub shortcut_label: RwLock<String>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            config: RwLock::new(TranslateConfig::from_env()),
            cache: TranslateCache::new(),
            active_request: Mutex::new(None),
            next_request_id: AtomicU64::new(1),
            manual_input_text: RwLock::new(String::new()),
            shortcut_label: RwLock::new("Option + D".into()),
        }
    }
}

impl Default for AppState {
    fn default() -> Self { Self::new() }
}
