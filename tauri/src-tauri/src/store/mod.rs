// TODO(T4.3/T4.4): uncomment when the submodules are created
// pub mod history;
pub mod preferences;
// pub mod settings;

use std::path::{Path, PathBuf};
use serde::{de::DeserializeOwned, Serialize};

use crate::errors::Result;

#[derive(Debug, Clone)]
pub struct ConfigPaths {
    pub root: PathBuf,
}

impl ConfigPaths {
    pub fn new(root: PathBuf) -> Self { Self { root } }
    pub fn settings(&self) -> PathBuf { self.root.join("settings.json") }
    pub fn preferences(&self) -> PathBuf { self.root.join("preferences.json") }
    pub fn history(&self) -> PathBuf { self.root.join("history.json") }
    pub fn window_state(&self) -> PathBuf { self.root.join("window-state.json") }
    pub fn env_file(&self) -> PathBuf { self.root.join(".env") }
}

pub fn read_json_or_default<T: DeserializeOwned + Default>(path: &Path) -> T {
    let Ok(bytes) = std::fs::read(path) else { return T::default(); };
    serde_json::from_slice(&bytes).unwrap_or_default()
}

pub fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut tmp = path.to_path_buf();
    let new_ext = match path.extension() {
        Some(ext) => format!("{}.tmp", ext.to_string_lossy()),
        None => "tmp".to_string(),
    };
    tmp.set_extension(new_ext);
    let bytes = serde_json::to_vec_pretty(value)?;
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use tempfile::tempdir;

    #[derive(Serialize, Deserialize, PartialEq, Debug, Default)]
    struct Sample { name: String, count: u32 }

    #[test]
    fn write_then_read_roundtrip() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("x.json");
        let v = Sample { name: "lazy".into(), count: 42 };
        write_json_atomic(&path, &v).unwrap();
        let got: Sample = read_json_or_default(&path);
        assert_eq!(got, v);
    }

    #[test]
    fn missing_file_returns_default() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("missing.json");
        let v: Sample = read_json_or_default(&path);
        assert_eq!(v, Sample::default());
    }

    #[test]
    fn corrupt_file_returns_default() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("bad.json");
        std::fs::write(&path, "not json").unwrap();
        let v: Sample = read_json_or_default(&path);
        assert_eq!(v, Sample::default());
    }

    #[test]
    fn write_does_not_leave_tmp() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("a.json");
        write_json_atomic(&path, &Sample::default()).unwrap();
        let tmp = dir.path().join("a.json.tmp");
        assert!(!tmp.exists());
    }
}
