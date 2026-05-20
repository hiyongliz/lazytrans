use std::sync::{Arc, RwLock};
use std::sync::atomic::AtomicU64;
use tauri::AppHandle;
use tauri::Manager;
use tokio::sync::Mutex;
use tokio_util::sync::CancellationToken;

use crate::store::{
    ConfigPaths, read_json_or_default,
    history::HistoryEntry,
    preferences::Preferences,
    settings::{ApiSettings, complete},
};
use crate::translator::TranslateConfig;
use crate::translator::cache::TranslateCache;
use crate::window_state::DebouncedWriter;

pub struct AppState {
    pub paths: ConfigPaths,
    pub config: RwLock<TranslateConfig>,
    pub cache: Arc<TranslateCache>,
    pub history: RwLock<Vec<HistoryEntry>>,
    pub preferences: RwLock<Preferences>,
    pub api_settings: RwLock<ApiSettings>,
    pub active_request: Mutex<Option<(u64, CancellationToken)>>,
    pub next_request_id: AtomicU64,
    pub manual_input_text: RwLock<String>,
    pub shortcut_label: RwLock<String>,
    pub window_state_writer: DebouncedWriter,
}

impl AppState {
    pub fn init(handle: &AppHandle) -> Self {
        let root = handle.path().app_data_dir().expect("app data dir");
        let _ = std::fs::create_dir_all(&root);
        let paths = ConfigPaths::new(root);

        let api_settings: ApiSettings = read_json_or_default(&paths.settings());
        let api_settings = complete(api_settings);
        crate::store::settings::apply_to_env(&api_settings);

        let preferences: Preferences = read_json_or_default(&paths.preferences());
        let history: Vec<HistoryEntry> = read_json_or_default(&paths.history());

        let window_state_writer = DebouncedWriter::new(paths.window_state());

        Self {
            config: RwLock::new(TranslateConfig::from_env()),
            cache: Arc::new(TranslateCache::new()),
            history: RwLock::new(history),
            preferences: RwLock::new(preferences),
            api_settings: RwLock::new(api_settings),
            active_request: Mutex::new(None),
            next_request_id: AtomicU64::new(1),
            manual_input_text: RwLock::new(String::new()),
            shortcut_label: RwLock::new("Option + D".into()),
            window_state_writer,
            paths,
        }
    }
}
