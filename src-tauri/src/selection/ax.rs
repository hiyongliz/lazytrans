use accessibility_sys::*;
use core_foundation::base::{CFRelease, CFTypeRef, TCFType};
use core_foundation::string::{CFString, CFStringRef};
use std::ffi::c_void;
use std::ptr;

use crate::errors::{AppError, Result};

/// Reads the currently focused UI element's `AXSelectedText`.
/// Returns:
///   - `Ok(Some(text))` if a selection is found.
///   - `Ok(None)` if no selection (or AX walk failed at some step).
///   - `Err(AccessibilityDenied)` if the process is not trusted by the AX system.
pub fn read_selection_via_ax() -> Result<Option<String>> {
    if !is_accessibility_trusted() {
        return Err(AppError::AccessibilityDenied);
    }
    unsafe {
        let system_wide = AXUIElementCreateSystemWide();
        if system_wide.is_null() {
            return Ok(None);
        }

        let mut focused_app: CFTypeRef = ptr::null();
        let attr = CFString::new("AXFocusedApplication");
        let code = AXUIElementCopyAttributeValue(
            system_wide,
            attr.as_concrete_TypeRef(),
            &mut focused_app,
        );
        CFRelease(system_wide as *const c_void);
        if code != kAXErrorSuccess || focused_app.is_null() {
            return Ok(None);
        }

        let mut focused_el: CFTypeRef = ptr::null();
        let attr = CFString::new("AXFocusedUIElement");
        let code = AXUIElementCopyAttributeValue(
            focused_app as AXUIElementRef,
            attr.as_concrete_TypeRef(),
            &mut focused_el,
        );
        CFRelease(focused_app as *const c_void);
        if code != kAXErrorSuccess || focused_el.is_null() {
            return Ok(None);
        }

        let mut selected: CFTypeRef = ptr::null();
        let attr = CFString::new("AXSelectedText");
        let code = AXUIElementCopyAttributeValue(
            focused_el as AXUIElementRef,
            attr.as_concrete_TypeRef(),
            &mut selected,
        );
        CFRelease(focused_el as *const c_void);
        if code != kAXErrorSuccess || selected.is_null() {
            return Ok(None);
        }

        let cf_str = selected as CFStringRef;
        let s = CFString::wrap_under_create_rule(cf_str).to_string();
        if s.trim().is_empty() {
            Ok(None)
        } else {
            Ok(Some(s))
        }
    }
}

pub fn is_accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trusted_check_returns_bool_without_panic() {
        // Whatever the actual state, just confirm the FFI call doesn't crash.
        let _ = is_accessibility_trusted();
    }
}
