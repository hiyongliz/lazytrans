use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const WINDOW_LABEL: &str = "translate";
const WINDOW_WIDTH: f64 = 460.0;
const WINDOW_HEIGHT: f64 = 520.0;

pub fn ensure_translate_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
        return Ok(win);
    }
    WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::default())
        .title("LazyTrans")
        .inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
        .min_inner_size(360.0, 400.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .focused(false)
        .accept_first_mouse(true)
        .resizable(true)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .visible(false)
        .visible_on_all_workspaces(true)
        .build()
}

pub fn show_translate_window(app: &AppHandle, focus: bool) {
    let Ok(win) = ensure_translate_window(app) else { return };
    if focus {
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        let _ = win.show();
    }
    let _ = win.set_always_on_top(true);
}
