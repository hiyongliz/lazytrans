pub mod commands;
pub mod env;
pub mod errors;
pub mod selection;
pub mod shortcuts;
pub mod state;
pub mod store;
pub mod tray;
pub mod translator;
pub mod window;
pub mod window_state;

use tauri::Manager;
use tauri_plugin_global_shortcut::{Builder as GlobalShortcutBuilder, ShortcutState as TauriShortcutState};

use state::AppState;
use window::{ensure_translate_window, show_translate_window};

pub fn run() {
    let candidates = shortcuts::candidates();

    let mut sc_builder_opt = Some(GlobalShortcutBuilder::new());
    for c in &candidates {
        let builder = sc_builder_opt.take().expect("builder present");
        match builder.with_shortcut(c.to_shortcut()) {
            Ok(b) => sc_builder_opt = Some(b),
            Err(e) => {
                eprintln!("failed to add shortcut {}: {}", c.label, e);
                // 注意: with_shortcut 失败时 self 已被消费, 已注册的快捷键随之丢失;
                // 这里重新起一个空 builder, 保证流程不 panic. 对于当前两个静态 candidate
                // 实际不会失败, 该分支仅作防御.
                sc_builder_opt = Some(GlobalShortcutBuilder::new());
            }
        }
    }
    let sc_builder = sc_builder_opt.expect("builder present");

    let sc_handler_candidates = candidates.clone();
    let sc_plugin = sc_builder
        .with_handler(move |app, sc, event| {
            if event.state != TauriShortcutState::Pressed {
                return;
            }
            let label = sc_handler_candidates
                .iter()
                .find(|c| c.to_shortcut() == *sc)
                .map(|c| c.label)
                .unwrap_or("?");
            println!("[shortcut] triggered: {}", label);

            if let Some(app_state) = app.try_state::<AppState>() {
                *app_state.shortcut_label.write().unwrap() = label.to_string();
            }

            let app = app.clone();
            tauri::async_runtime::spawn(handle_translate_shortcut(app));
        })
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_translate_window(app, true, false);
        }))
        .plugin(sc_plugin)
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            commands::translate_input,
            commands::cancel_translation,
            commands::update_manual_input,
            commands::hide_window,
            commands::open_accessibility_settings,
        ])
        .setup(|app| {
            crate::env::load_dotenv_files(app.handle());
            let state = AppState::init(app.handle());
            app.manage(state);

            let win = ensure_translate_window(app.handle())?;

            // 订阅窗口 Move/Resize, 防抖写入 window-state.json
            let app_handle = app.handle().clone();
            win.on_window_event(move |event| {
                use tauri::WindowEvent;
                if matches!(event, WindowEvent::Resized(_) | WindowEvent::Moved(_)) {
                    let Some(state) = app_handle.try_state::<AppState>() else { return };
                    let Some(w) = app_handle.get_webview_window(crate::window::WINDOW_LABEL) else { return };
                    let pos = w.outer_position().unwrap_or_default();
                    let size = w.outer_size().unwrap_or_default();
                    let bounds = crate::window_state::Bounds {
                        x: pos.x,
                        y: pos.y,
                        width: size.width,
                        height: size.height,
                    };
                    let writer = state.window_state_writer.clone();
                    tauri::async_runtime::spawn(async move {
                        writer.schedule(bounds).await;
                    });
                }
            });

            if !crate::selection::ax::is_accessibility_trusted() {
                eprintln!(
                    "[warn] Accessibility not trusted — selection reading via AX will fail until granted in System Settings"
                );
            }
            #[cfg(target_os = "macos")]
            {
                use objc2_app_kit::{NSApplication, NSApplicationActivationPolicy};
                use objc2_foundation::MainThreadMarker;
                if let Some(mtm) = MainThreadMarker::new() {
                    let ns_app = NSApplication::sharedApplication(mtm);
                    ns_app.setActivationPolicy(NSApplicationActivationPolicy::Accessory);
                }
            }
            let _ = tray::setup_tray(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn handle_translate_shortcut(app: tauri::AppHandle) {
    use tauri::Emitter;
    use commands::TranslationState;
    use selection::tauri_clipboard::TauriClipboard;

    let label = app
        .try_state::<AppState>()
        .map(|s| s.shortcut_label.read().unwrap().clone())
        .unwrap_or_else(|| "Option + D".into());

    show_translate_window(&app, false, true);
    let _ = app.emit(
        "translation:update",
        TranslationState {
            status: "loading".into(),
            phase: Some("reading-selection".into()),
            source_text: String::new(),
            translated_text: String::new(),
            error_message: "正在读取选中文本...".into(),
            error_code: None,
            shortcut_label: Some(label.clone()),
            phonetic: None,
        },
    );

    let clipboard = TauriClipboard::new(app.clone());
    let res = selection::get_selected_text(&clipboard).await;
    match res {
        Ok(text) if !text.is_empty() => {
            show_translate_window(&app, true, false);
            let state = app.state::<AppState>();
            let _ = commands::translate_input(app.clone(), state, text).await;
        }
        Ok(_) => {
            let _ = app.emit(
                "translation:update",
                TranslationState {
                    status: "empty".into(),
                    phase: None,
                    source_text: String::new(),
                    translated_text: String::new(),
                    error_message: "没有获取到选中文本".into(),
                    error_code: None,
                    shortcut_label: Some(label),
                    phonetic: None,
                },
            );
        }
        Err(e) => {
            let code = commands::error_code(&e);
            let _ = app.emit(
                "translation:update",
                TranslationState {
                    status: "error".into(),
                    phase: None,
                    source_text: String::new(),
                    translated_text: String::new(),
                    error_message: e.to_string(),
                    error_code: Some(code),
                    shortcut_label: Some(label),
                    phonetic: None,
                },
            );
        }
    }
}
