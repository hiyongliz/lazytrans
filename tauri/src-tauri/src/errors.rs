use serde::Serialize;

#[derive(Debug, thiserror::Error, Serialize)]
#[serde(tag = "code", content = "message")]
pub enum AppError {
    #[error("missing_api_key: {0}")]
    #[serde(rename = "missing_api_key")]
    MissingApiKey(String),

    #[error("network: {0}")]
    #[serde(rename = "network")]
    Network(String),

    #[error("timeout: {0}")]
    #[serde(rename = "timeout")]
    Timeout(String),

    #[error("api: {0}")]
    #[serde(rename = "api")]
    Api(String),

    #[error("api_response_invalid: {0}")]
    #[serde(rename = "api_response_invalid")]
    ApiResponseInvalid(String),

    #[error("cancelled")]
    #[serde(rename = "cancelled")]
    Cancelled,

    #[error("io: {0}")]
    #[serde(rename = "io")]
    Io(String),

    #[error("selection: {0}")]
    #[serde(rename = "selection")]
    Selection(String),

    #[error("accessibility_denied")]
    #[serde(rename = "accessibility_denied")]
    AccessibilityDenied,

    #[error("input_monitoring_denied")]
    #[serde(rename = "input_monitoring_denied")]
    InputMonitoringDenied,
}

pub type Result<T> = std::result::Result<T, AppError>;

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self { AppError::Io(e.to_string()) }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self { AppError::Io(e.to_string()) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_api_key_serializes_with_code() {
        let err = AppError::MissingApiKey("test".into());
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], "missing_api_key");
        assert_eq!(json["message"], "test");
    }

    #[test]
    fn cancelled_has_no_message() {
        let err = AppError::Cancelled;
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], "cancelled");
        assert!(json.get("message").is_none() || json["message"].is_null());
    }

    #[test]
    fn accessibility_denied_serializes_with_code() {
        let err = AppError::AccessibilityDenied;
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], "accessibility_denied");
    }
}
