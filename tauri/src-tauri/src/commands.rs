use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_shell::ShellExt;
use tokio_util::sync::CancellationToken;

use crate::errors::{AppError, Result};
use crate::state::AppState;
use crate::store::{
    history::{self, CreateInput, HistoryEntry},
    preferences::{merge, promote_recent_model, Preferences, PreferencesPatch},
    settings::{apply_to_env, complete, ApiSettings},
    write_json_atomic,
};
use crate::translator::prompts::TranslateDirection;
use crate::translator::{translate_text_stream, TranslateStreamOptions};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslationState {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    pub source_text: String,
    pub translated_text: String,
    pub error_message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shortcut_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phonetic: Option<String>,
}

fn emit_state(app: &AppHandle, state: TranslationState) {
    let _ = app.emit("translation:update", state);
}

pub fn error_code(e: &AppError) -> String {
    match e {
        AppError::MissingApiKey(_) => "missing-api-key".into(),
        AppError::Network(_) => "network".into(),
        AppError::Timeout(_) => "api-timeout".into(),
        AppError::ApiResponseInvalid(_) => "api-error".into(),
        AppError::Cancelled => "api-error".into(),
        AppError::Io(_) => "api-error".into(),
        AppError::Selection(_) => "selection-permission".into(),
        AppError::AccessibilityDenied => "selection-permission".into(),
        AppError::InputMonitoringDenied => "selection-permission".into(),
        AppError::Api(msg) => {
            let m = msg.to_lowercase();
            if m.contains("401")
                || m.contains("unauthorized")
                || m.contains("incorrect api key")
                || m.contains("invalid api key")
            {
                "auth-failed".into()
            } else if m.contains("429") || m.contains("rate limit") || m.contains("quota") {
                "rate-limited".into()
            } else {
                "api-error".into()
            }
        }
    }
}

#[tauri::command]
pub async fn translate_input(
    app: AppHandle,
    state: State<'_, AppState>,
    text: String,
) -> Result<()> {
    let source = text.trim().to_string();
    let shortcut_label = state.shortcut_label.read().unwrap().clone();

    if source.is_empty() {
        emit_state(&app, TranslationState {
            status: "empty".into(),
            phase: None,
            source_text: String::new(),
            translated_text: String::new(),
            error_message: "请输入要翻译的文本".into(),
            error_code: None,
            shortcut_label: Some(shortcut_label),
            phonetic: None,
        });
        return Ok(());
    }

    // 取消上一个翻译请求, 用 request_id 标识当前请求归属
    let my_id = state.next_request_id.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let cancel = CancellationToken::new();
    {
        let mut guard = state.active_request.lock().await;
        if let Some((_, prev)) = guard.take() {
            prev.cancel();
        }
        *guard = Some((my_id, cancel.clone()));
    }

    let direction = TranslateDirection::Auto;
    emit_state(&app, TranslationState {
        status: "loading".into(),
        phase: Some("translating".into()),
        source_text: source.clone(),
        translated_text: String::new(),
        error_message: String::new(),
        error_code: None,
        shortcut_label: Some(shortcut_label.clone()),
        phonetic: None,
    });

    let cfg = state.config.read().unwrap().clone();
    let mut streamed = String::new();
    let app_for_delta = app.clone();
    let source_for_delta = source.clone();
    let label_for_delta = shortcut_label.clone();

    let res = translate_text_stream(
        &source,
        &cfg,
        TranslateStreamOptions {
            direction,
            timeout: std::time::Duration::from_millis(15000),
            cancel: Some(&cancel),
            cache: Some(&state.cache),
            on_delta: Box::new(move |d| {
                streamed.push_str(d);
                emit_state(&app_for_delta, TranslationState {
                    status: "loading".into(),
                    phase: Some("translating".into()),
                    source_text: source_for_delta.clone(),
                    translated_text: streamed.clone(),
                    error_message: String::new(),
                    error_code: None,
                    shortcut_label: Some(label_for_delta.clone()),
                    phonetic: None,
                });
            }),
        },
    )
    .await;

    match res {
        Ok(translated) => {
            emit_state(&app, TranslationState {
                status: "success".into(),
                phase: None,
                source_text: source.clone(),
                translated_text: translated.clone(),
                error_message: String::new(),
                error_code: None,
                shortcut_label: Some(shortcut_label),
                phonetic: None,
            });

            // 写入历史: 成功才记录, 直接复用 history::append 的 dedupe + cap 逻辑
            let entry = history::create_entry(CreateInput {
                source_text: &source,
                translated_text: &translated,
                model: &cfg.model,
                base_url: &cfg.base_url,
                direction,
            });
            let history_path = state.paths.history();
            let next_history = {
                let mut h = state.history.write().unwrap();
                *h = history::append(h.clone(), entry);
                h.clone()
            };
            let _ = write_json_atomic(&history_path, &next_history);
        }
        Err(AppError::Cancelled) => {
            // 取消由 cancel_translation 命令负责推送 state，这里不重复
        }
        Err(e) => {
            let code = error_code(&e);
            emit_state(&app, TranslationState {
                status: "error".into(),
                phase: None,
                source_text: source,
                translated_text: String::new(),
                error_message: e.to_string(),
                error_code: Some(code),
                shortcut_label: Some(shortcut_label),
                phonetic: None,
            });
        }
    }

    // 清理 active_request（若仍是自己）
    let mut guard = state.active_request.lock().await;
    let still_ours = guard
        .as_ref()
        .map(|(id, _)| *id == my_id)
        .unwrap_or(false);
    if still_ours {
        *guard = None;
    }
    Ok(())
}

#[tauri::command]
pub async fn cancel_translation(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<()> {
    let mut guard = state.active_request.lock().await;
    let Some((_, token)) = guard.take() else {
        return Ok(()); // 当前无进行中的翻译, 不再 emit 一个虚假的 cancelled 状态
    };
    drop(guard);
    token.cancel();
    let manual = state.manual_input_text.read().unwrap().trim().to_string();
    let label = state.shortcut_label.read().unwrap().clone();
    emit_state(&app, TranslationState {
        status: "cancelled".into(),
        phase: None,
        source_text: manual,
        translated_text: String::new(),
        error_message: "已取消".into(),
        error_code: None,
        shortcut_label: Some(label),
        phonetic: None,
    });
    Ok(())
}

#[tauri::command]
pub fn update_manual_input(state: State<'_, AppState>, text: String) -> Result<()> {
    *state.manual_input_text.write().unwrap() = text;
    Ok(())
}

#[tauri::command]
pub fn hide_window(window: tauri::WebviewWindow) -> Result<()> {
    let _ = window.hide();
    Ok(())
}

#[tauri::command]
pub async fn open_accessibility_settings(app: AppHandle) -> Result<()> {
    #[allow(deprecated)]
    app.shell()
        .open(
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
            None,
        )
        .map_err(|e| AppError::Io(e.to_string()))
}

#[tauri::command]
pub fn get_api_settings(state: State<'_, AppState>) -> ApiSettings {
    state.api_settings.read().unwrap().clone()
}

fn validate_api_settings(s: ApiSettings) -> Result<ApiSettings> {
    if s.api_key.is_empty() {
        return Err(AppError::Selection("请输入 API Key".into()));
    }
    if s.base_url.is_empty() {
        return Err(AppError::Selection("请输入 API 地址".into()));
    }
    if url::Url::parse(&s.base_url).is_err() {
        return Err(AppError::Selection("API 地址格式无效".into()));
    }
    if s.model.is_empty() {
        return Err(AppError::Selection("请输入模型名称".into()));
    }
    Ok(s)
}

#[tauri::command]
pub fn save_api_settings(
    state: State<'_, AppState>,
    settings: ApiSettings,
) -> Result<ApiSettings> {
    let validated = validate_api_settings(complete(settings))?;
    write_json_atomic(&state.paths.settings(), &validated)?;
    apply_to_env(&validated);
    *state.api_settings.write().unwrap() = validated.clone();
    *state.config.write().unwrap() = crate::translator::TranslateConfig::from_env();

    let prefs_path = state.paths.preferences();
    let prefs_snapshot = {
        let mut prefs = state.preferences.write().unwrap();
        prefs.recent_models = promote_recent_model(&prefs.recent_models, &validated.model);
        prefs.clone()
    };
    let _ = write_json_atomic(&prefs_path, &prefs_snapshot);
    Ok(validated)
}

#[tauri::command]
pub async fn test_api_settings(settings: ApiSettings) -> Result<serde_json::Value> {
    let cfg = validate_api_settings(complete(settings))?;
    let config = crate::translator::TranslateConfig {
        api_key: cfg.api_key,
        base_url: cfg.base_url,
        model: cfg.model,
    };
    crate::translator::translate_text_stream(
        ".",
        &config,
        crate::translator::TranslateStreamOptions {
            timeout: std::time::Duration::from_millis(5000),
            ..Default::default()
        },
    )
    .await?;
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
pub fn list_history(state: State<'_, AppState>) -> Vec<HistoryEntry> {
    state.history.read().unwrap().clone()
}

#[tauri::command]
pub fn clear_history(state: State<'_, AppState>) -> Result<()> {
    let history_path = state.paths.history();
    let snapshot = {
        let mut h = state.history.write().unwrap();
        h.clear();
        h.clone()
    };
    write_json_atomic(&history_path, &snapshot)?;
    Ok(())
}

#[tauri::command]
pub fn remove_history_entry(
    state: State<'_, AppState>,
    id: String,
) -> Result<Vec<HistoryEntry>> {
    let history_path = state.paths.history();
    let next = {
        let mut h = state.history.write().unwrap();
        let next = history::remove(h.clone(), &id);
        *h = next.clone();
        next
    };
    write_json_atomic(&history_path, &next)?;
    Ok(next)
}

#[tauri::command]
pub async fn translate_history_entry(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<()> {
    let entry = state
        .history
        .read()
        .unwrap()
        .iter()
        .find(|e| e.id == id)
        .cloned();
    let Some(entry) = entry else {
        return Ok(());
    };
    translate_input(app, state, entry.source_text).await
}

#[tauri::command]
pub fn get_preferences(state: State<'_, AppState>) -> Preferences {
    state.preferences.read().unwrap().clone()
}

#[tauri::command]
pub fn patch_preferences(
    state: State<'_, AppState>,
    patch: PreferencesPatch,
) -> Result<Preferences> {
    let prefs_path = state.paths.preferences();
    let cur = state.preferences.read().unwrap().clone();
    let next = merge(cur, patch);
    *state.preferences.write().unwrap() = next.clone();
    write_json_atomic(&prefs_path, &next)?;
    Ok(next)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_missing_api_key() {
        assert_eq!(error_code(&AppError::MissingApiKey("x".into())), "missing-api-key");
    }

    #[test]
    fn maps_network() {
        assert_eq!(error_code(&AppError::Network("x".into())), "network");
    }

    #[test]
    fn maps_timeout() {
        assert_eq!(error_code(&AppError::Timeout("x".into())), "api-timeout");
    }

    #[test]
    fn maps_selection_permissions() {
        assert_eq!(error_code(&AppError::AccessibilityDenied), "selection-permission");
        assert_eq!(error_code(&AppError::InputMonitoringDenied), "selection-permission");
        assert_eq!(error_code(&AppError::Selection("x".into())), "selection-permission");
    }

    #[test]
    fn api_401_maps_to_auth_failed() {
        assert_eq!(
            error_code(&AppError::Api("HTTP 401 Unauthorized: invalid api key".into())),
            "auth-failed"
        );
    }

    #[test]
    fn api_429_maps_to_rate_limited() {
        assert_eq!(
            error_code(&AppError::Api("429 Too Many Requests: rate limit exceeded".into())),
            "rate-limited"
        );
    }

    #[test]
    fn api_other_maps_to_api_error() {
        assert_eq!(
            error_code(&AppError::Api("500 Internal Server Error".into())),
            "api-error"
        );
    }
}
