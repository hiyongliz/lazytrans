use core_graphics::event::CGEvent;
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use objc2_app_kit::NSScreen;
use objc2_foundation::MainThreadMarker;
use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};

pub const WINDOW_LABEL: &str = "translate";
const WINDOW_WIDTH: f64 = 460.0;
const WINDOW_HEIGHT: f64 = 520.0;
const WINDOW_MARGIN: f64 = 18.0;

pub fn ensure_translate_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(win) = app.get_webview_window(WINDOW_LABEL) {
        return Ok(win);
    }
    let win = WebviewWindowBuilder::new(app, WINDOW_LABEL, WebviewUrl::default())
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
        .build()?;

    let win_for_close = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = win_for_close.hide();
        }
    });

    Ok(win)
}

pub fn show_translate_window(app: &AppHandle, focus: bool, reposition: bool) {
    let Ok(win) = ensure_translate_window(app) else {
        return;
    };
    if reposition {
        position_window_near_cursor(&win);
    }
    if focus {
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        let _ = win.show();
    }
    let _ = win.set_always_on_top(true);
}

pub fn position_window_near_cursor(win: &WebviewWindow) {
    let Some(cursor) = cursor_screen_point() else {
        return;
    };
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };

    let screens = NSScreen::screens(mtm);
    let count = screens.count();
    if count == 0 {
        return;
    }

    // CGEvent location uses a flipped coordinate system (top-left origin),
    // NSScreen uses bottom-left. Convert via the main screen's full height.
    let main_screen = screens.objectAtIndex(0);
    let main_height = main_screen.frame().size.height;
    let cursor_x = cursor.0;
    let cursor_y_top = cursor.1;
    let cursor_y_bottom = main_height - cursor_y_top;

    // Find the screen containing cursor (by X overlap of visibleFrame; sufficient
    // approximation for typical multi-monitor layouts).
    let mut target_frame: Option<(f64, f64, f64, f64)> = None;
    for i in 0..count {
        let f = screens.objectAtIndex(i).visibleFrame();
        let (x, y, w, h) = (f.origin.x, f.origin.y, f.size.width, f.size.height);
        if cursor_x >= x && cursor_x <= x + w {
            target_frame = Some((x, y, w, h));
            break;
        }
    }
    let (sx, sy, sw, sh) = target_frame.unwrap_or_else(|| {
        let f = main_screen.visibleFrame();
        (f.origin.x, f.origin.y, f.size.width, f.size.height)
    });

    // Use the window's current outer_size to compute placement.
    let scale = win.scale_factor().unwrap_or(1.0);
    let outer = win.outer_size().unwrap_or_default();
    let w = (outer.width as f64 / scale).max(WINDOW_WIDTH);
    let h = (outer.height as f64 / scale).max(WINDOW_HEIGHT);

    // Centered horizontally on cursor; "below" cursor in screen-bottom-left coords
    // means subtract (h + margin) from cursor_y_bottom (the window's bottom edge).
    let target_x = (cursor_x - w / 2.0)
        .max(sx + WINDOW_MARGIN)
        .min(sx + sw - w - WINDOW_MARGIN);
    let target_y = (cursor_y_bottom - WINDOW_MARGIN - h)
        .max(sy + WINDOW_MARGIN)
        .min(sy + sh - h - WINDOW_MARGIN);

    let _ = win.set_position(LogicalPosition::new(target_x, target_y));
    let _ = win.set_size(LogicalSize::new(w, h));
}

fn cursor_screen_point() -> Option<(f64, f64)> {
    let src = CGEventSource::new(CGEventSourceStateID::HIDSystemState).ok()?;
    let event = CGEvent::new(src).ok()?;
    let p = event.location();
    Some((p.x, p.y))
}
