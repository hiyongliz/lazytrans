use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

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
