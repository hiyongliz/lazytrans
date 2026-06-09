use crate::selection::ax::is_accessibility_trusted;

pub fn check_accessibility() -> bool {
    is_accessibility_trusted()
}

/// Preflight check for Input Monitoring permission required by CGEvent posting
/// on macOS Sequoia+. Best-effort: attempts to construct an event source,
/// which fails if the process is not granted Input Monitoring.
pub fn check_input_monitoring() -> bool {
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
    CGEventSource::new(CGEventSourceStateID::CombinedSessionState).is_ok()
}
