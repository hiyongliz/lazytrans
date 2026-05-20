use accessibility_sys::*;
use core_foundation::base::{CFRelease, CFTypeRef, TCFType};
use core_foundation::string::{CFString, CFStringRef};
use std::ffi::c_void;
use std::ptr;

pub fn read_focused_selection() -> Option<String> {
    unsafe {
        let system_wide = AXUIElementCreateSystemWide();
        if system_wide.is_null() {
            return None;
        }

        let mut focused_app: CFTypeRef = ptr::null();
        let attr_focused_app = CFString::new("AXFocusedApplication");
        let code = AXUIElementCopyAttributeValue(
            system_wide,
            attr_focused_app.as_concrete_TypeRef(),
            &mut focused_app,
        );
        CFRelease(system_wide as *const c_void);
        if code != kAXErrorSuccess || focused_app.is_null() {
            return None;
        }

        let mut focused_el: CFTypeRef = ptr::null();
        let attr_focused_ui = CFString::new("AXFocusedUIElement");
        let code = AXUIElementCopyAttributeValue(
            focused_app as AXUIElementRef,
            attr_focused_ui.as_concrete_TypeRef(),
            &mut focused_el,
        );
        CFRelease(focused_app as *const c_void);
        if code != kAXErrorSuccess || focused_el.is_null() {
            return None;
        }

        let mut selected: CFTypeRef = ptr::null();
        let attr_selected = CFString::new("AXSelectedText");
        let code = AXUIElementCopyAttributeValue(
            focused_el as AXUIElementRef,
            attr_selected.as_concrete_TypeRef(),
            &mut selected,
        );
        CFRelease(focused_el as *const c_void);
        if code != kAXErrorSuccess || selected.is_null() {
            return None;
        }

        let cf_str = selected as CFStringRef;
        let s = CFString::wrap_under_create_rule(cf_str).to_string();
        Some(s)
    }
}

pub fn is_accessibility_trusted() -> bool {
    unsafe { AXIsProcessTrusted() }
}
