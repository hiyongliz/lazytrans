use std::str::FromStr;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

/// 把前端录制的加速器字符串（如 "Alt+KeyD"、"Super+Shift+KeyK"）解析为
/// (Shortcut, 友好标签)。至少需要一个修饰键，否则返回 None。
pub fn shortcut_from_parts(accelerator: &str) -> Option<(Shortcut, String)> {
    let mut mods = Modifiers::empty();
    let mut code: Option<Code> = None;

    for raw in accelerator.split('+') {
        let part = raw.trim();
        if part.is_empty() {
            continue;
        }
        match part.to_lowercase().as_str() {
            "cmd" | "command" | "super" | "meta" | "win" => mods |= Modifiers::SUPER,
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "alt" | "option" | "opt" => mods |= Modifiers::ALT,
            "shift" => mods |= Modifiers::SHIFT,
            _ => {
                code = Code::from_str(part).ok();
            }
        }
    }

    let code = code?;
    if mods.is_empty() {
        return None;
    }
    let label = friendly_label(mods, code);
    Some((Shortcut::new(Some(mods), code), label))
}

fn friendly_label(mods: Modifiers, code: Code) -> String {
    let mut parts: Vec<&str> = Vec::new();
    if mods.contains(Modifiers::CONTROL) {
        parts.push("Control");
    }
    if mods.contains(Modifiers::ALT) {
        parts.push("Option");
    }
    if mods.contains(Modifiers::SHIFT) {
        parts.push("Shift");
    }
    if mods.contains(Modifiers::SUPER) {
        parts.push("Command");
    }
    let key = friendly_key(code);
    let mut label = parts.join(" + ");
    if label.is_empty() {
        key
    } else {
        label.push_str(" + ");
        label.push_str(&key);
        label
    }
}

fn friendly_key(code: Code) -> String {
    let raw = format!("{:?}", code);
    if let Some(letter) = raw.strip_prefix("Key") {
        return letter.to_string();
    }
    if let Some(digit) = raw.strip_prefix("Digit") {
        return digit.to_string();
    }
    raw
}

#[derive(Debug, Clone)]
pub struct ShortcutCandidate {
    pub modifiers: Modifiers,
    pub code: Code,
    pub label: &'static str,
}

pub fn candidates() -> Vec<ShortcutCandidate> {
    vec![
        ShortcutCandidate {
            modifiers: Modifiers::ALT,
            code: Code::KeyD,
            label: "Option + D",
        },
        ShortcutCandidate {
            modifiers: Modifiers::SUPER.union(Modifiers::SHIFT),
            code: Code::KeyD,
            label: "Command + Shift + D",
        },
    ]
}

#[derive(Debug, PartialEq, Eq)]
pub enum ShortcutRegistration {
    Registered {
        labels: Vec<&'static str>,
        failed_labels: Vec<&'static str>,
    },
    Failed {
        attempted_labels: Vec<&'static str>,
    },
}

pub fn register_available<F>(
    candidates: &[ShortcutCandidate],
    mut register: F,
) -> ShortcutRegistration
where
    F: FnMut(&ShortcutCandidate) -> Result<(), String>,
{
    let mut labels = Vec::new();
    let mut failed_labels = Vec::new();

    for candidate in candidates {
        if register(candidate).is_ok() {
            labels.push(candidate.label);
        } else {
            failed_labels.push(candidate.label);
        }
    }

    if !labels.is_empty() {
        return ShortcutRegistration::Registered {
            labels,
            failed_labels,
        };
    }

    ShortcutRegistration::Failed {
        attempted_labels: candidates.iter().map(|c| c.label).collect(),
    }
}

impl ShortcutCandidate {
    pub fn to_shortcut(&self) -> Shortcut {
        Shortcut::new(Some(self.modifiers), self.code)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_accelerator_with_friendly_label() {
        let (sc, label) = shortcut_from_parts("Alt+KeyD").expect("should parse");
        assert_eq!(sc, Shortcut::new(Some(Modifiers::ALT), Code::KeyD));
        assert_eq!(label, "Option + D");

        let (_, label) = shortcut_from_parts("Super+Shift+Digit1").expect("should parse");
        assert_eq!(label, "Shift + Command + 1");
    }

    #[test]
    fn rejects_accelerator_without_modifier_or_key() {
        assert!(shortcut_from_parts("KeyD").is_none());
        assert!(shortcut_from_parts("Alt").is_none());
        assert!(shortcut_from_parts("").is_none());
    }

    #[test]
    fn has_two_candidates_in_order() {
        let c = candidates();
        assert_eq!(c.len(), 2);
        assert_eq!(c[0].label, "Option + D");
        assert_eq!(c[1].label, "Command + Shift + D");
    }

    #[test]
    fn registers_fallback_when_default_shortcut_fails() {
        let c = candidates();
        let mut attempted = Vec::new();
        let result = register_available(&c, |candidate| {
            attempted.push(candidate.label);
            if candidate.label == "Option + D" {
                Err("already registered".into())
            } else {
                Ok(())
            }
        });

        assert_eq!(attempted, vec!["Option + D", "Command + Shift + D"]);
        assert_eq!(
            result,
            ShortcutRegistration::Registered {
                labels: vec!["Command + Shift + D"],
                failed_labels: vec!["Option + D"],
            }
        );
    }

    #[test]
    fn registers_all_available_shortcuts() {
        let c = candidates();
        let result = register_available(&c, |_| Ok(()));

        assert_eq!(
            result,
            ShortcutRegistration::Registered {
                labels: vec!["Option + D", "Command + Shift + D"],
                failed_labels: vec![],
            }
        );
    }
}
