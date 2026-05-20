use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_shell::ShellExt;
use tokio_util::sync::CancellationToken;

use crate::errors::{AppError, Result};
use crate::state::AppState;
use crate::translator::{translate_text_stream, TranslateStreamOptions};
use crate::translator::prompts::TranslateDirection;

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
                source_text: source,
                translated_text: translated,
                error_message: String::new(),
                error_code: None,
                shortcut_label: Some(shortcut_label),
                phonetic: None,
            });
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
