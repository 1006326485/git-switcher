use std::path::Path;
use tauri::State;
use uuid::Uuid;
use chrono::Utc;

use crate::AppError;
use crate::db::Database;
use crate::models::{GitProject, ProjectDetail};
use crate::services::{GitService, WorkspaceService};

use super::try_update_activity;

fn canonicalize_path(path: &str) -> Result<String, AppError> {
    Path::new(path)
        .canonicalize()
        .map_err(|e| AppError::Other(format!("Invalid path: {}", e)))
        .map(|p| p.to_string_lossy().to_string())
}

fn path_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string())
}

#[tauri::command]
pub async fn add_project(path: String, group_id: String, db: State<'_, Database>) -> Result<ProjectDetail, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        let path = canonicalize_path(&path)?;

        if !GitService::is_git_repo(&path) {
            return Err(AppError::Other("Not a git repository".to_string()));
        }

        if db.project_exists(&path)? {
            return Err(AppError::Other("Project already exists".to_string()));
        }

        let group = db.get_group_by_id(&group_id)?;
        let name = path_name(&path);
        let project = GitProject::new(name, path, group_id);
        db.insert_project(&project)?;

        let detail = GitService::get_project_detail(&project, group)?;
        try_update_activity(&db, &detail.project.id, detail.project.last_commit_hash.as_deref());
        Ok(detail)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn remove_project(id: String, db: State<'_, Database>) -> Result<(), AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || db.delete_project(&id))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn list_projects(db: State<'_, Database>) -> Result<Vec<ProjectDetail>, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        let projects = db.get_all_projects()?;
        Ok(super::fetch_project_details_batch(&db, projects))
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn import_workspace(file_path: String, group_id: String, db: State<'_, Database>) -> Result<Vec<ProjectDetail>, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        let folders = WorkspaceService::parse_workspace_file(&file_path)?;
        let mut results = Vec::new();

        for folder in folders {
            if !GitService::is_git_repo(&folder.path) {
                continue;
            }
            match db.project_exists(&folder.path) {
                Ok(true) => continue,
                Err(e) => {
                    log::warn!("failed to check project existence for '{}': {}", folder.path, e);
                    continue;
                }
                _ => {}
            }
            let name = folder.name.unwrap_or_else(|| path_name(&folder.path));
            let project = GitProject::new(name, folder.path, group_id.clone());

            if let Err(e) = db.insert_project(&project) {
                log::warn!("failed to insert project '{}': {}", project.path, e);
                continue;
            }
            match db.get_project_group(&project.id) {
                Ok(group) => match GitService::get_project_detail(&project, group) {
                    Ok(detail) => results.push(detail),
                    Err(e) => log::warn!("failed to get detail for '{}': {}", project.path, e),
                },
                Err(e) => log::warn!("failed to get group for '{}': {}", project.path, e),
            }
        }

        Ok(results)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn init_git_project(path: String, name: String, group_id: String, db: State<'_, Database>) -> Result<ProjectDetail, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        let path = canonicalize_path(&path)?;

        if db.project_exists(&path)? {
            return Err(AppError::Other("Project already exists at this path".to_string()));
        }

        GitService::init_repo(&path)?;

        let group = db.get_group_by_id(&group_id)?;
        let project = GitProject::new(name, path, group_id);
        db.insert_project(&project)?;

        let detail = GitService::get_project_detail(&project, group)?;
        try_update_activity(&db, &detail.project.id, detail.project.last_commit_hash.as_deref());
        Ok(detail)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn set_project_alias(id: String, alias: String, db: State<'_, Database>) -> Result<(), AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || db.update_project_alias(&id, &alias))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn reorder_projects(ordered_ids: Vec<String>, db: State<'_, Database>) -> Result<(), AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || db.reorder_projects(&ordered_ids))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn open_in_terminal(path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .args(["-a", "Terminal", &path])
                .spawn()
                .map_err(|e| AppError::Io(e))?;
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(&path)
                .spawn()
                .map_err(|e| AppError::Io(e))?;
        }
        #[cfg(target_os = "windows")]
        {
            if path.contains('"') {
                return Err(AppError::Other("Path contains characters that cannot be used in Windows command line".into()));
            }
            std::process::Command::new("cmd")
                .args(["/C", "start", "cmd", "/K", &format!("cd /d \"{}\"", path)])
                .spawn()
                .map_err(|e| AppError::Io(e))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

fn spawn_command(program: &str, args: &[&str], label: &str) -> Result<(), AppError> {
    std::process::Command::new(program)
        .args(args)
        .spawn()
        .map_err(|e| AppError::Other(format!("Failed to open {}: {}", label, e)))?;
    Ok(())
}

#[tauri::command]
pub async fn open_in_finder(path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        { spawn_command("open", &[&path], "Finder")?; }
        #[cfg(target_os = "linux")]
        { spawn_command("xdg-open", &[&path], "file manager")?; }
        #[cfg(target_os = "windows")]
        { spawn_command("explorer", &[&path], "Explorer")?; }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn open_in_vscode(path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        { spawn_command("code", &[&path], "VS Code")?; }
        #[cfg(target_os = "linux")]
        { spawn_command("code", &[&path], "VS Code")?; }
        #[cfg(target_os = "windows")]
        { spawn_command("cmd", &["/C", "code", &path], "VS Code")?; }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn export_projects(db: State<'_, Database>) -> Result<String, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        let projects = db.get_all_projects()?;
        serde_json::to_string_pretty(&projects)
            .map_err(|e| AppError::Other(format!("Failed to serialize: {}", e)))
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn import_projects(json: String, group_id: String, db: State<'_, Database>) -> Result<Vec<ProjectDetail>, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        let projects: Vec<GitProject> = serde_json::from_str(&json)
            .map_err(|e| AppError::Other(format!("Failed to parse JSON: {}", e)))?;

        let mut results = Vec::new();
        for mut project in projects {
            if !GitService::is_git_repo(&project.path) {
                continue;
            }
            match db.project_exists(&project.path) {
                Ok(true) => continue,
                Err(e) => {
                    log::warn!("failed to check existence for '{}': {}", project.path, e);
                    continue;
                }
                _ => {}
            }
            project.id = Uuid::new_v4().to_string();
            project.group_id = group_id.clone();
            let now = Utc::now().to_rfc3339();
            project.created_at = now.clone();
            project.updated_at = now;

            if let Err(e) = db.insert_project(&project) {
                log::warn!("failed to import project '{}': {}", project.path, e);
                continue;
            }
            match db.get_project_group(&project.id) {
                Ok(group) => match GitService::get_project_detail(&project, group) {
                    Ok(detail) => results.push(detail),
                    Err(e) => log::warn!("failed to get detail for '{}': {}", project.path, e),
                },
                Err(e) => log::warn!("failed to get group for '{}': {}", project.path, e),
            }
        }

        Ok(results)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}
