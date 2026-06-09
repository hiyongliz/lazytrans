use std::process::Command;
use std::time::Duration;
use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

use crate::errors::{AppError, Result};

const KEY_C: u16 = 8; // macOS virtual keycode for 'C' (kVK_ANSI_C)

/// Try CGEvent-based ⌘C first; on failure, fall back to osascript.
/// Both paths trigger a system-wide Cmd+C keystroke.
pub fn simulate_cmd_c() -> Result<()> {
    if try_cgevent().is_ok() {
        return Ok(());
    }
    fallback_osascript()
}

fn try_cgevent() -> std::result::Result<(), ()> {
    let src = CGEventSource::new(CGEventSourceStateID::CombinedSessionState).map_err(|_| ())?;
    let down = CGEvent::new_keyboard_event(src.clone(), KEY_C, true).map_err(|_| ())?;
    down.set_flags(CGEventFlags::CGEventFlagCommand);
    down.post(CGEventTapLocation::HID);
    let up = CGEvent::new_keyboard_event(src, KEY_C, false).map_err(|_| ())?;
    up.set_flags(CGEventFlags::CGEventFlagCommand);
    up.post(CGEventTapLocation::HID);
    Ok(())
}

fn fallback_osascript() -> Result<()> {
    let script = "tell application \"System Events\" to keystroke \"c\" using command down";
    let out = Command::new("/usr/bin/osascript")
        .args(["-e", script])
        .output()
        .map_err(|e| AppError::Selection(format!("osascript 启动失败: {e}")))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(AppError::Selection(format!("osascript 执行失败: {err}")));
    }
    Ok(())
}

/// Timing constants kept from the previous selection-copy implementation.
/// `FOCUS_RESTORE_DELAY`: wait after clearing the clipboard before posting ⌘C,
/// so the focus returns to the previous app.
/// `POLL_INTERVAL`: how often to check the clipboard for the new value.
/// `POLL_TIMEOUT`: maximum time to wait for the clipboard to change.
pub const FOCUS_RESTORE_DELAY: Duration = Duration::from_millis(90);
pub const POLL_INTERVAL: Duration = Duration::from_millis(20);
pub const POLL_TIMEOUT: Duration = Duration::from_millis(320);
