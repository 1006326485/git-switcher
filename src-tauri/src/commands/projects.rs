use std::path::Path;
use tauri::State;

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

/// Core import logic shared by import_workspace and import_projects.
/// Takes an iterator of (Option<name>, raw_path) pairs.
fn import_projects_core(
    entries: impl IntoIterator<Item = (Option<String>, String)>,
    group_id: &str,
    db: &Database,
) -> Result<Vec<ProjectDetail>, AppError> {
    let group = db.get_group_by_id(group_id)?;
    let mut results = Vec::new();
    let mut errors = Vec::new();
    let mut skipped = 0usize;

    for (name, raw_path) in entries {
        let path = match canonicalize_path(&raw_path) {
            Ok(p) => p,
            Err(_) => {
                errors.push(format!("'{}': path not found", raw_path));
                continue;
            }
        };
        if !GitService::is_git_repo(&path) {
            errors.push(format!("'{}': not a git repository", path));
            continue;
        }
        if db.project_exists(&path).unwrap_or(false) {
            skipped += 1;
            continue;
        }
        let project_name = name.unwrap_or_else(|| path_name(&path));
        let project = GitProject::new(project_name, path, group_id.to_string());

        if let Err(e) = db.insert_project(&project) {
            errors.push(format!("'{}': {}", project.name, e));
            continue;
        }
        match GitService::get_project_detail(&project, group.clone()) {
            Ok(detail) => results.push(detail),
            Err(e) => {
                log::warn!("failed to get detail for '{}': {}", project.path, e);
                results.push(ProjectDetail::fallback(project, group.clone()));
            }
        }
    }

    if results.is_empty() {
        if !errors.is_empty() {
            return Err(AppError::Other(format!("Import failed: {}", errors.join("; "))));
        }
        if skipped > 0 {
            return Err(AppError::Other(format!("All {} project(s) already exist", skipped)));
        }
    }

    if !errors.is_empty() {
        log::warn!("import partial failures: {}", errors.join("; "));
    }

    Ok(results)
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
        if folders.is_empty() {
            return Err(AppError::Other("No folders found in workspace file".to_string()));
        }
        let entries = folders.into_iter().map(|f| (f.name, f.path));
        import_projects_core(entries, &group_id, &db)
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
            // Reject paths containing cmd.exe metacharacters to prevent injection
            const FORBIDDEN: &[char] = &['"', '&', '|', '>', '<', '^', '%', ';', '(', ')'];
            if let Some(c) = path.chars().find(|c| FORBIDDEN.contains(c)) {
                return Err(AppError::Other(format!(
                    "Path contains forbidden character '{}' for Windows command line", c
                )));
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
        if projects.is_empty() {
            return Err(AppError::Other("No projects found in JSON".to_string()));
        }
        let entries = projects.into_iter().map(|p| (Some(p.name), p.path));
        import_projects_core(entries, &group_id, &db)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}
