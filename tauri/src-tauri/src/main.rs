#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod spike_ax;

use std::time::Duration;
use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};

const KEY_C: u16 = 8; // macOS virtual keycode for 'C' (kVK_ANSI_C)

fn simulate_cmd_c() {
    let src = match CGEventSource::new(CGEventSourceStateID::CombinedSessionState) {
        Ok(s) => s,
        Err(_) => { eprintln!("[spike] event source 创建失败 — 输入监控未授权？"); return; }
    };
    if let Ok(down) = CGEvent::new_keyboard_event(src.clone(), KEY_C, true) {
        down.set_flags(CGEventFlags::CGEventFlagCommand);
        down.post(CGEventTapLocation::HID);
    }
    if let Ok(up) = CGEvent::new_keyboard_event(src, KEY_C, false) {
        up.set_flags(CGEventFlags::CGEventFlagCommand);
        up.post(CGEventTapLocation::HID);
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcut(Shortcut::new(Some(Modifiers::ALT), Code::KeyD))
                .unwrap()
                .with_handler(|app, _sc, event| {
                    if event.state != ShortcutState::Pressed { return; }
                    println!("[spike] Alt+D 触发");
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        println!("[spike] AX trusted = {}", spike_ax::is_accessibility_trusted());
                        println!("[spike] AX selected = {:?}", spike_ax::read_focused_selection());
                        // 备份剪贴板
                        let prev = app.clipboard().read_text().unwrap_or_default();
                        let _ = app.clipboard().write_text(String::new());
                        tokio::time::sleep(Duration::from_millis(90)).await;
                        simulate_cmd_c();
                        tokio::time::sleep(Duration::from_millis(120)).await;
                        let after = app.clipboard().read_text().unwrap_or_default();
                        println!("[spike] selected = {:?}", after);
                        let _ = app.clipboard().write_text(prev);

                        // 展示浮窗
                        if let Some(win) = app.get_webview_window("translate") {
                            let _ = win.show();
                        }
                    });
                })
                .build()
        )
        .setup(|app| {
            WebviewWindowBuilder::new(app, "translate", WebviewUrl::default())
                .title("LazyTrans Spike")
                .inner_size(460.0, 520.0)
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .focused(false)
                .resizable(true)
                .skip_taskbar(true)
                .visible(false)  // 注意：T0a.1 是 visible(true)，这里改 false 由快捷键触发
                .visible_on_all_workspaces(true)
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
