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
use tauri_plugin_global_shortcut::{
    Builder as GlobalShortcutBuilder, GlobalShortcutExt,
    ShortcutState as TauriShortcutState,
};

use state::AppState;
use window::{ensure_translate_window, show_translate_window};

fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("ts={}", secs)
}

fn append_startup_log(line: &str) {
    eprintln!("{}", line.trim_end());
    if let Some(home) = std::env::var_os("HOME") {
        let log_dir = std::path::PathBuf::from(home).join("Library/Logs/LazyTrans");
        let _ = std::fs::create_dir_all(&log_dir);
        let log_path = log_dir.join("startup.log");
        use std::io::Write;
        if let Ok(mut f) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            let _ = f.write_all(line.as_bytes());
        }
    }
}

pub fn run() {
    let candidates = shortcuts::candidates();

    let sc_handler_candidates = candidates.clone();
    let setup_candidates = candidates.clone();
    let sc_plugin = GlobalShortcutBuilder::new()
        .with_handler(move |app, sc, event| {
            if event.state != TauriShortcutState::Pressed {
                return;
            }
            let label = sc_handler_candidates
                .iter()
                .find(|c| c.to_shortcut() == *sc)
                .map(|c| c.label)
                .unwrap_or("?");
            append_startup_log(&format!("[{}] [shortcut] triggered: {}\n", chrono_like_now(), label));

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
            commands::get_api_settings,
            commands::save_api_settings,
            commands::test_api_settings,
            commands::list_history,
            commands::clear_history,
            commands::remove_history_entry,
            commands::translate_history_entry,
            commands::get_preferences,
            commands::patch_preferences,
            commands::write_clipboard,
            commands::check_accessibility,
        ])
        .setup(move |app| {
            crate::env::load_dotenv_files(app.handle());
            let state = AppState::init(app.handle());
            app.manage(state);

            let registration = shortcuts::register_available(&setup_candidates, |candidate| {
                app.global_shortcut()
                    .register(candidate.to_shortcut())
                    .map_err(|error| error.to_string())
            });
            match registration {
                shortcuts::ShortcutRegistration::Registered {
                    labels,
                    failed_labels,
                } => {
                    let label = labels.first().copied().unwrap_or("Option + D");
                    if let Some(app_state) = app.try_state::<AppState>() {
                        *app_state.shortcut_label.write().unwrap() = label.to_string();
                    }
                    append_startup_log(&format!(
                        "[{}] shortcuts registered: {} failed={}\n",
                        chrono_like_now(),
                        labels.join(" / "),
                        if failed_labels.is_empty() {
                            "none".to_string()
                        } else {
                            failed_labels.join(" / ")
                        }
                    ));
                }
                shortcuts::ShortcutRegistration::Failed { attempted_labels } => {
                    append_startup_log(&format!(
                        "[{}] shortcut registration failed: {}\n",
                        chrono_like_now(),
                        attempted_labels.join(" / ")
                    ));
                }
            }

            // 注册一个最小应用菜单, 主要为了让 Cmd+W 和标准编辑快捷键生效.
            // macOS Accessory app 不显示菜单栏, 但菜单项的快捷键仍由 NSWindow.performKeyEquivalent
            // 路径拦截, 所以即使菜单不可见, Cmd+W / Cmd+A / Cmd+C 等也能命中.
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
            let close_item = MenuItem::with_id(
                app.handle(),
                "close_window",
                "Close Window",
                true,
                Some("CmdOrCtrl+W"),
            )?;
            let edit_submenu = Submenu::with_items(
                app.handle(),
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app.handle(), None)?,
                    &PredefinedMenuItem::redo(app.handle(), None)?,
                    &PredefinedMenuItem::separator(app.handle())?,
                    &PredefinedMenuItem::cut(app.handle(), None)?,
                    &PredefinedMenuItem::copy(app.handle(), None)?,
                    &PredefinedMenuItem::paste(app.handle(), None)?,
                    &PredefinedMenuItem::select_all(app.handle(), None)?,
                ],
            )?;
            let window_submenu =
                Submenu::with_items(app.handle(), "Window", true, &[&close_item])?;
            let app_menu = Menu::with_items(app.handle(), &[&edit_submenu, &window_submenu])?;
            app.set_menu(app_menu)?;
            app.on_menu_event(|app, event| {
                if event.id().as_ref() == "close_window" {
                    if let Some(w) = app.get_webview_window(crate::window::WINDOW_LABEL) {
                        let _ = w.hide();
                    }
                }
            });

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
                    let scale = w.scale_factor().unwrap_or(1.0).max(1.0);
                    let bounds = crate::window_state::Bounds {
                        x: (pos.x as f64 / scale).round() as i32,
                        y: (pos.y as f64 / scale).round() as i32,
                        width: (size.width as f64 / scale).round().max(1.0) as u32,
                        height: (size.height as f64 / scale).round().max(1.0) as u32,
                    };
                    let writer = state.window_state_writer.clone();
                    tauri::async_runtime::spawn(async move {
                        writer.schedule(bounds).await;
                    });
                }
            });

            // 启动诊断: 写一行到 ~/Library/Logs/LazyTrans/startup.log
            // 因为 .app 启动时 stderr 被 launchd 截走, eprintln 看不到.
            {
                let trusted = crate::selection::ax::is_accessibility_trusted();
                let exe = std::env::current_exe()
                    .map(|p| p.display().to_string())
                    .unwrap_or_else(|_| "(unknown)".into());
                let line = format!(
                    "[{}] AX trusted = {}  exe = {}\n",
                    chrono_like_now(),
                    trusted,
                    exe
                );
                append_startup_log(&line);
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
            show_translate_window(&app, true, false);
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
            show_translate_window(&app, true, false);
            let code = commands::error_code(&e);
            append_startup_log(&format!(
                "[{}] [shortcut-err] code={} msg={}\n",
                chrono_like_now(),
                code,
                e
            ));
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
