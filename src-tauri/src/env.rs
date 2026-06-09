use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

pub fn load_dotenv_files(app: &AppHandle) {
    let mut paths: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join(".env"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            paths.push(parent.join(".env"));
        }
    }
    if let Ok(resource) = app.path().resource_dir() {
        paths.push(resource.join(".env"));
    }
    if let Ok(data) = app.path().app_data_dir() {
        paths.push(data.join(".env"));
    }
    for p in paths {
        let _ = dotenvy::from_path(&p);
    }
}
