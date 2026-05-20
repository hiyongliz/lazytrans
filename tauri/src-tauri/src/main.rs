#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            WebviewWindowBuilder::new(app, "translate", WebviewUrl::default())
                .title("LazyTrans Spike")
                .inner_size(460.0, 520.0)
                .min_inner_size(360.0, 400.0)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .focused(false)
                .resizable(true)
                .skip_taskbar(true)
                .visible(true)
                .visible_on_all_workspaces(true)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
