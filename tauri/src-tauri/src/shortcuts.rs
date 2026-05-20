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
}
