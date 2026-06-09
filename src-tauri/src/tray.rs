use tauri::image::Image;
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

use crate::state::AppState;
use crate::window::show_translate_window;

pub fn resolve_tray_icon_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("icons/trayIconTemplate.png"));
    }
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("src-tauri/icons/trayIconTemplate.png"));
        candidates.push(cwd.join("icons/trayIconTemplate.png"));
    }
    candidates.into_iter().find(|p| p.exists())
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let Some(icon_path) = resolve_tray_icon_path(app) else {
        eprintln!("[warn] tray icon asset missing; menubar will be invisible");
        return Ok(());
    };
    let icon = Image::from_path(&icon_path)?;
    let history = app.state::<AppState>().history.read().unwrap().clone();
    let menu = build_menu(app, &history)?;
    TrayIconBuilder::with_id("main")
        .icon(icon)
        .icon_as_template(true)
        .tooltip("LazyTrans")
        .menu(&menu)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_translate_window(tray.app_handle(), true, false);
            }
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref().to_string();
            match id.as_str() {
                "show" => show_translate_window(app, true, false),
                "settings" => {
                    show_translate_window(app, true, false);
                    let _ = app.emit("app:open-settings-request", ());
                }
                "quit" => app.exit(0),
                other if other.starts_with("history:") => {
                    let entry_id = other.trim_start_matches("history:").to_string();
                    show_translate_window(app, true, false);
                    let app2 = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let state = app2.state::<AppState>();
                        let _ = crate::commands::translate_history_entry(
                            app2.clone(),
                            state,
                            entry_id,
                        )
                        .await;
                    });
                }
                _ => {}
            }
        })
        .build(app)?;
    Ok(())
}

pub fn refresh_tray_menu(app: &AppHandle) {
    let Some(tray) = app.tray_by_id("main") else {
        return;
    };
    let history = app.state::<AppState>().history.read().unwrap().clone();
    if let Ok(menu) = build_menu(app, &history) {
        let _ = tray.set_menu(Some(menu));
    }
}

fn truncate_title(text: &str, max: usize) -> String {
    let cleaned = text.replace('\n', " ");
    let chars: Vec<char> = cleaned.chars().collect();
    if chars.len() <= max {
        cleaned
    } else {
        format!("{}…", chars[..max].iter().collect::<String>())
    }
}

fn build_menu(
    app: &AppHandle,
    history: &[crate::store::history::HistoryEntry],
) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "show", "显示 LazyTrans", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let history_menu = if history.is_empty() {
        let history_empty =
            MenuItem::with_id(app, "history_empty", "暂无历史", false, None::<&str>)?;
        Submenu::with_items(app, "最近翻译", true, &[&history_empty])?
    } else {
        let items: Vec<MenuItem<tauri::Wry>> = history
            .iter()
            .take(5)
            .map(|e| {
                MenuItem::with_id(
                    app,
                    format!("history:{}", e.id),
                    truncate_title(&e.source_text, 30),
                    true,
                    None::<&str>,
                )
            })
            .collect::<tauri::Result<Vec<_>>>()?;
        let refs: Vec<&dyn IsMenuItem<tauri::Wry>> =
            items.iter().map(|i| i as &dyn IsMenuItem<tauri::Wry>).collect();
        Submenu::with_items(app, "最近翻译", true, &refs)?
    };

    let sep2 = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", "设置…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 LazyTrans", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[&show, &sep1, &history_menu, &sep2, &settings, &quit],
    )
}
