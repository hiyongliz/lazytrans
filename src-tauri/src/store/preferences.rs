use serde::{Deserialize, Serialize};

use crate::translator::prompts::{PromptStyle, TranslateDirection};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ThemePreference {
    #[default]
    System,
    Light,
    Dark,
}

const RECENT_MODELS_MAX: usize = 5;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    pub theme: ThemePreference,
    pub manual_direction: TranslateDirection,
    pub prompt_style: PromptStyle,
    pub recent_models: Vec<String>,
    pub shortcut_downgrade_acknowledged: bool,
    pub auto_hide_on_blur: bool,
    pub custom_shortcut: Option<String>,
}

impl Default for Preferences {
    fn default() -> Self {
        Self {
            theme: ThemePreference::default(),
            manual_direction: TranslateDirection::default(),
            prompt_style: PromptStyle::default(),
            recent_models: Vec::new(),
            shortcut_downgrade_acknowledged: false,
            auto_hide_on_blur: true,
            custom_shortcut: None,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PreferencesPatch {
    pub theme: Option<ThemePreference>,
    pub manual_direction: Option<TranslateDirection>,
    pub prompt_style: Option<PromptStyle>,
    pub recent_models: Option<Vec<String>>,
    pub shortcut_downgrade_acknowledged: Option<bool>,
    pub auto_hide_on_blur: Option<bool>,
}

pub fn merge(mut current: Preferences, patch: PreferencesPatch) -> Preferences {
    if let Some(t) = patch.theme { current.theme = t; }
    if let Some(d) = patch.manual_direction { current.manual_direction = d; }
    if let Some(s) = patch.prompt_style { current.prompt_style = s; }
    if let Some(a) = patch.auto_hide_on_blur { current.auto_hide_on_blur = a; }
    if let Some(rm) = patch.recent_models {
        current.recent_models = rm.into_iter()
            .map(|m| m.trim().to_string())
            .filter(|m| !m.is_empty())
            .take(RECENT_MODELS_MAX)
            .collect();
    }
    if let Some(a) = patch.shortcut_downgrade_acknowledged {
        current.shortcut_downgrade_acknowledged = a;
    }
    current
}

pub fn promote_recent_model(recent: &[String], model: &str) -> Vec<String> {
    let trimmed = model.trim().to_string();
    if trimmed.is_empty() { return recent.to_vec(); }
    let mut next: Vec<String> = std::iter::once(trimmed.clone())
        .chain(recent.iter().filter(|m| *m != &trimmed).cloned())
        .collect();
    next.truncate(RECENT_MODELS_MAX);
    next
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_preferences_match_ts() {
        let p = Preferences::default();
        assert_eq!(p.theme, ThemePreference::System);
        assert_eq!(p.manual_direction, TranslateDirection::Auto);
        assert_eq!(p.prompt_style, PromptStyle::Programmer);
        assert!(p.recent_models.is_empty());
        assert!(!p.shortcut_downgrade_acknowledged);
        assert!(p.auto_hide_on_blur);
        assert!(p.custom_shortcut.is_none());
    }

    #[test]
    fn merge_applies_only_provided_fields() {
        let cur = Preferences { theme: ThemePreference::Light, ..Default::default() };
        let merged = merge(cur, PreferencesPatch { manual_direction: Some(TranslateDirection::ZhEn), ..Default::default() });
        assert_eq!(merged.theme, ThemePreference::Light);
        assert_eq!(merged.manual_direction, TranslateDirection::ZhEn);
    }

    #[test]
    fn promote_dedupes_and_caps() {
        let v = promote_recent_model(&["a".into(), "b".into(), "c".into()], "b");
        assert_eq!(v, vec!["b", "a", "c"]);

        let mut long: Vec<String> = (0..10).map(|i| format!("m{i}")).collect();
        long = promote_recent_model(&long, "new");
        assert_eq!(long.len(), 5);
        assert_eq!(long[0], "new");
    }
}
