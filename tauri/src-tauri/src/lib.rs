pub mod commands;
pub mod errors;
pub mod shortcuts;
pub mod state;
pub mod translator;
pub mod window;

pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
