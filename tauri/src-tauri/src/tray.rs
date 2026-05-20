use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

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
    let menu = build_menu(app)?;
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
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_translate_window(app, true, false),
            "settings" => {
                show_translate_window(app, true, false);
                let _ = app.emit("app:open-settings-request", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "show", "显示 LazyTrans", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let history_empty = MenuItem::with_id(app, "history_empty", "暂无历史", false, None::<&str>)?;
    let history_menu = Submenu::with_items(app, "最近翻译", true, &[&history_empty])?;

    let clear = MenuItem::with_id(app, "clear", "清空历史", false, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", "设置…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 LazyTrans", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[&show, &sep1, &history_menu, &clear, &sep2, &settings, &quit],
    )
}
