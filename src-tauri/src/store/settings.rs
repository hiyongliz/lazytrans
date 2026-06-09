use serde::{Deserialize, Serialize};

use crate::translator::{DEFAULT_OPENAI_BASE_URL, DEFAULT_OPENAI_MODEL};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ApiSettings {
    pub api_key: String,
    pub base_url: String,
    pub model: String,
}

pub fn complete(raw: ApiSettings) -> ApiSettings {
    ApiSettings {
        api_key: raw.api_key.trim().to_string(),
        base_url: {
            let b = raw.base_url.trim();
            if b.is_empty() { DEFAULT_OPENAI_BASE_URL.to_string() } else { b.to_string() }
        },
        model: {
            let m = raw.model.trim();
            if m.is_empty() { DEFAULT_OPENAI_MODEL.to_string() } else { m.to_string() }
        },
    }
}

pub fn apply_to_env(settings: &ApiSettings) {
    if !settings.api_key.is_empty() {
        std::env::set_var("TRANSLATE_API_KEY", &settings.api_key);
        std::env::set_var("OPENAI_API_KEY", &settings.api_key);
    }
    if !settings.base_url.is_empty() {
        std::env::set_var("TRANSLATE_API_BASE_URL", &settings.base_url);
    }
    if !settings.model.is_empty() {
        std::env::set_var("TRANSLATE_MODEL", &settings.model);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn complete_fills_defaults_for_empty() {
        let s = complete(ApiSettings { api_key: " key ".into(), base_url: "".into(), model: "".into() });
        assert_eq!(s.api_key, "key");
        assert_eq!(s.base_url, DEFAULT_OPENAI_BASE_URL);
        assert_eq!(s.model, DEFAULT_OPENAI_MODEL);
    }
}
