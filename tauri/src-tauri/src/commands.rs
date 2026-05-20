use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
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

pub fn error_code(e: &AppError) -> &'static str {
    match e {
        AppError::MissingApiKey(_) => "missing_api_key",
        AppError::Network(_) => "network",
        AppError::Timeout(_) => "timeout",
        AppError::Api(_) => "api",
        AppError::ApiResponseInvalid(_) => "api_response_invalid",
        AppError::Cancelled => "cancelled",
        AppError::Io(_) => "io",
        AppError::Selection(_) => "selection",
        AppError::AccessibilityDenied => "accessibility_denied",
        AppError::InputMonitoringDenied => "input_monitoring_denied",
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

    // 取消上一个翻译请求
    let cancel = CancellationToken::new();
    {
        let mut guard = state.active_cancel.lock().await;
        if let Some(prev) = guard.take() {
            prev.cancel();
        }
        *guard = Some(cancel.clone());
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
            let code = error_code(&e).to_string();
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

    // 清理 active_cancel（若仍是自己）
    let mut guard = state.active_cancel.lock().await;
    let still_ours = guard
        .as_ref()
        .map(|c| std::ptr::eq(c, &cancel) || c.is_cancelled())
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
    let manual = state.manual_input_text.read().unwrap().trim().to_string();
    let label = state.shortcut_label.read().unwrap().clone();
    let mut guard = state.active_cancel.lock().await;
    if let Some(c) = guard.take() {
        c.cancel();
    }
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
