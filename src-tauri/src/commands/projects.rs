use std::path::Path;
use tauri::State;

use serde::{Deserialize, Serialize};

use crate::db::Database;
use crate::models::{AppSettings, GitProject, Group, ProjectDetail};
use crate::services::{GitService, WorkspaceService};
use crate::AppError;

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
            return Err(AppError::Other(format!(
                "Import failed: {}",
                errors.join("; ")
            )));
        }
        if skipped > 0 {
            return Err(AppError::Other(format!(
                "All {} project(s) already exist",
                skipped
            )));
        }
    }

    if !errors.is_empty() {
        log::warn!("import partial failures: {}", errors.join("; "));
    }

    Ok(results)
}

#[tauri::command]
pub async fn add_project(
    path: String,
    group_id: String,
    db: State<'_, Database>,
) -> Result<ProjectDetail, AppError> {
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
        try_update_activity(
            &db,
            &detail.project.id,
            detail.project.last_commit_hash.as_deref(),
        );
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
pub async fn import_workspace(
    file_path: String,
    group_id: String,
    db: State<'_, Database>,
) -> Result<Vec<ProjectDetail>, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        let folders = WorkspaceService::parse_workspace_file(&file_path)?;
        if folders.is_empty() {
            return Err(AppError::Other(
                "No folders found in workspace file".to_string(),
            ));
        }
        let entries = folders.into_iter().map(|f| (f.name, f.path));
        import_projects_core(entries, &group_id, &db)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn init_git_project(
    path: String,
    name: String,
    group_id: String,
    db: State<'_, Database>,
) -> Result<ProjectDetail, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        let path = canonicalize_path(&path)?;

        if db.project_exists(&path)? {
            return Err(AppError::Other(
                "Project already exists at this path".to_string(),
            ));
        }

        GitService::init_repo(&path)?;

        let group = db.get_group_by_id(&group_id)?;
        let project = GitProject::new(name, path, group_id);
        db.insert_project(&project)?;

        let detail = GitService::get_project_detail(&project, group)?;
        try_update_activity(
            &db,
            &detail.project.id,
            detail.project.last_commit_hash.as_deref(),
        );
        Ok(detail)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn set_project_alias(
    id: String,
    alias: String,
    db: State<'_, Database>,
) -> Result<(), AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || db.update_project_alias(&id, &alias))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn set_project_color(
    id: String,
    color: Option<String>,
    db: State<'_, Database>,
) -> Result<(), AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || db.update_project_color(&id, color.as_deref()))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn set_project_description(
    id: String,
    description: Option<String>,
    db: State<'_, Database>,
) -> Result<(), AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || db.update_project_description(&id, description.as_deref()))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn set_project_notes(
    id: String,
    notes: Option<String>,
    db: State<'_, Database>,
) -> Result<(), AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        let trimmed = notes.as_deref().map(|s| s.trim());
        let val = match trimmed {
            Some("") => None,
            other => other,
        };
        if val.is_some_and(|s| s.len() > 1000) {
            return Err(AppError::Other(
                "Notes must be at most 1000 characters".to_string(),
            ));
        }
        db.update_project_notes(&id, val)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn reorder_projects(
    ordered_ids: Vec<String>,
    db: State<'_, Database>,
) -> Result<(), AppError> {
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
                .map_err(AppError::Io)?;
        }
        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(&path)
                .spawn()
                .map_err(AppError::Io)?;
        }
        #[cfg(target_os = "windows")]
        {
            // Reject paths containing cmd.exe metacharacters to prevent injection
            const FORBIDDEN: &[char] = &['"', '&', '|', '>', '<', '^', '%', ';', '(', ')'];
            if let Some(c) = path.chars().find(|c| FORBIDDEN.contains(c)) {
                return Err(AppError::Other(format!(
                    "Path contains forbidden character '{}' for Windows command line",
                    c
                )));
            }
            std::process::Command::new("cmd")
                .args(["/C", "start", "cmd", "/K", &format!("cd /d \"{}\"", path)])
                .spawn()
                .map_err(AppError::Io)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_readme_preview(path: String) -> Result<Option<String>, AppError> {
    tokio::task::spawn_blocking(move || {
        let dir = Path::new(&path);
        let candidates = [
            "README.md",
            "readme.md",
            "README.txt",
            "readme.txt",
            "README",
        ];
        let readme_path = candidates.iter().map(|c| dir.join(c)).find(|p| p.is_file());

        let readme_path = match readme_path {
            Some(p) => p,
            None => return Ok(None),
        };

        let bytes = std::fs::read(&readme_path).map_err(AppError::Io)?;

        // Take first 500 bytes, ensure valid UTF-8
        let chunk = &bytes[..bytes.len().min(500)];
        let text = String::from_utf8_lossy(chunk);

        // Strip markdown formatting: headers (#), links [text](url), bold/italic markers, images ![alt](url)
        let cleaned: String = text
            .lines()
            .map(|line| {
                let line = line.trim_start();
                // Skip empty lines in the preview
                if line.is_empty() {
                    return String::new();
                }
                // Remove heading markers
                let line = line.trim_start_matches('#').trim_start();
                // Remove images: ![alt](url) -> ""
                let line = if line.starts_with("!") { "" } else { line };
                // Strip links: [text](url) -> text
                let mut result = String::new();
                let mut chars = line.chars().peekable();
                while let Some(c) = chars.next() {
                    if c == '[' {
                        // Collect link text until ']'
                        let mut link_text = String::new();
                        let mut found_close = false;
                        for ch in chars.by_ref() {
                            if ch == ']' {
                                found_close = true;
                                break;
                            }
                            link_text.push(ch);
                        }
                        if found_close {
                            // Skip the (url) part
                            if chars.peek() == Some(&'(') {
                                chars.next(); // skip '('
                                for ch in chars.by_ref() {
                                    if ch == ')' {
                                        break;
                                    }
                                }
                            }
                            result.push_str(&link_text);
                        } else {
                            result.push('[');
                            result.push_str(&link_text);
                        }
                    } else {
                        result.push(c);
                    }
                }
                result
            })
            .filter(|line| !line.trim().is_empty())
            .collect::<Vec<_>>()
            .join(" ");

        if cleaned.trim().is_empty() {
            return Ok(None);
        }

        Ok(Some(cleaned))
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
        {
            spawn_command("open", &[&path], "Finder")?;
        }
        #[cfg(target_os = "linux")]
        {
            spawn_command("xdg-open", &[&path], "file manager")?;
        }
        #[cfg(target_os = "windows")]
        {
            spawn_command("explorer", &[&path], "Explorer")?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn open_in_vscode(path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        #[cfg(target_os = "macos")]
        {
            spawn_command("code", &[&path], "VS Code")?;
        }
        #[cfg(target_os = "linux")]
        {
            spawn_command("code", &[&path], "VS Code")?;
        }
        #[cfg(target_os = "windows")]
        {
            // Reject paths containing cmd.exe metacharacters to prevent injection
            const FORBIDDEN: &[char] = &['"', '&', '|', '>', '<', '^', '%', ';', '(', ')'];
            if let Some(c) = path.chars().find(|c| FORBIDDEN.contains(c)) {
                return Err(AppError::Other(format!(
                    "Path contains forbidden character '{}' for Windows command line",
                    c
                )));
            }
            spawn_command("cmd", &["/C", "code", &path], "VS Code")?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn scan_directory_for_repos(path: String) -> Result<Vec<String>, AppError> {
    tokio::task::spawn_blocking(move || {
        let root = Path::new(&path);
        if !root.is_dir() {
            return Err(AppError::Other("Path is not a directory".to_string()));
        }

        let skip: Vec<&str> = vec![
            "node_modules",
            "target",
            ".cargo",
            ".npm",
            ".yarn",
            "dist",
            "build",
            ".next",
            ".nuxt",
            "vendor",
            "__pycache__",
            ".venv",
            "venv",
            ".tox",
            "Library",
            ".Trash",
            "Applications",
        ];

        let mut repos = Vec::new();
        scan_dir(root, 0, 3, &skip, &mut repos);
        repos.sort();
        Ok(repos)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

fn scan_dir(dir: &Path, depth: u32, max_depth: u32, skip: &[&str], repos: &mut Vec<String>) {
    if depth > max_depth {
        return;
    }

    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden dirs (except we still check for .git inside)
        if name.starts_with('.') && name != ".git" {
            continue;
        }

        // Skip known heavy directories
        if skip.contains(&name.as_str()) {
            continue;
        }

        if !path.is_dir() {
            continue;
        }

        // Check if this dir IS a git repo
        if name == ".git" {
            if let Some(parent) = path.parent() {
                let parent_str = parent.to_string_lossy().to_string();
                if !repos.contains(&parent_str) {
                    repos.push(parent_str);
                }
            }
            // Don't recurse into .git
            continue;
        }

        // If this dir already contains .git, it's a repo — don't recurse deeper
        if path.join(".git").exists() {
            let path_str = path.to_string_lossy().to_string();
            if !repos.contains(&path_str) {
                repos.push(path_str);
            }
            continue;
        }

        scan_dir(&path, depth + 1, max_depth, skip, repos);
    }
}

#[derive(Serialize)]
pub struct BulkImportResult {
    pub imported: Vec<ProjectDetail>,
    pub skipped: usize,
    pub errors: Vec<String>,
}

#[tauri::command]
pub async fn bulk_import_projects(
    paths: Vec<String>,
    group_id: String,
    db: State<'_, Database>,
) -> Result<BulkImportResult, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        let group = db.get_group_by_id(&group_id)?;
        let mut imported = Vec::new();
        let mut errors = Vec::new();
        let mut skipped = 0usize;

        for raw_path in &paths {
            let path = match canonicalize_path(raw_path) {
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
            let name = path_name(&path);
            let project = GitProject::new(name, path, group_id.clone());

            if let Err(e) = db.insert_project(&project) {
                errors.push(format!("'{}': {}", project.name, e));
                continue;
            }
            match GitService::get_project_detail(&project, group.clone()) {
                Ok(detail) => imported.push(detail),
                Err(e) => {
                    log::warn!("failed to get detail for '{}': {}", project.path, e);
                    imported.push(ProjectDetail::fallback(project, group.clone()));
                }
            }
        }

        if !errors.is_empty() {
            log::warn!("bulk import partial failures: {}", errors.join("; "));
        }

        Ok(BulkImportResult {
            imported,
            skipped,
            errors,
        })
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
pub async fn import_projects(
    json: String,
    group_id: String,
    db: State<'_, Database>,
) -> Result<Vec<ProjectDetail>, AppError> {
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

// ── Export / Import All Settings ─────────────────────────────────────

#[derive(Serialize, Deserialize)]
pub struct ExportData {
    pub version: String,
    pub exported_at: String,
    pub settings: AppSettings,
    pub projects: Vec<GitProject>,
    pub groups: Vec<Group>,
}

#[derive(Serialize)]
pub struct ImportResult {
    pub settings_applied: bool,
    pub groups_imported: usize,
    pub projects_imported: usize,
    pub projects_skipped: usize,
}

#[tauri::command]
pub fn export_all_settings(
    path: String,
    store: State<'_, super::settings::SettingsStore>,
    db: State<'_, Database>,
) -> Result<(), AppError> {
    let settings = store.get_all()?;
    let projects = db.get_all_projects()?;
    let groups = db.get_all_groups()?;
    let data = ExportData {
        version: "1.0".to_string(),
        exported_at: chrono::Utc::now().to_rfc3339(),
        settings,
        projects,
        groups,
    };
    let json = serde_json::to_string_pretty(&data)
        .map_err(|e| AppError::Other(format!("Serialization failed: {}", e)))?;
    std::fs::write(&path, json).map_err(AppError::Io)?;
    Ok(())
}

#[tauri::command]
pub fn import_all_settings(
    path: String,
    store: State<'_, super::settings::SettingsStore>,
    db: State<'_, Database>,
) -> Result<ImportResult, AppError> {
    let content = std::fs::read_to_string(&path).map_err(AppError::Io)?;
    let data: ExportData = serde_json::from_str(&content)
        .map_err(|e| AppError::Other(format!("Invalid export file: {}", e)))?;

    // Apply settings (skip key_in_keychain to preserve local keychain)
    let mut settings = data.settings;
    settings.llm.key_in_keychain = false;
    store.update_all(&settings)?;

    // Import groups: update existing by name, insert new
    let existing_groups = db.get_all_groups()?;
    let existing_map: std::collections::HashMap<String, &Group> = existing_groups
        .iter()
        .map(|g| (g.name.clone(), g))
        .collect();
    let mut groups_imported = 0usize;
    for group in &data.groups {
        if let Some(existing) = existing_map.get(&group.name) {
            let mut updated = group.clone();
            updated.id = existing.id.clone();
            let _ = db.update_group(&updated);
        } else {
            let _ = db.insert_group(group);
            groups_imported += 1;
        }
    }

    // Refresh group map after import
    let updated_groups = db.get_all_groups()?;
    let group_id_map: std::collections::HashMap<String, String> = data
        .groups
        .iter()
        .filter_map(|g| {
            updated_groups
                .iter()
                .find(|u| u.name == g.name)
                .map(|u| (g.id.clone(), u.id.clone()))
        })
        .collect();

    // Import projects
    let mut projects_imported = 0usize;
    let mut projects_skipped = 0usize;
    for project in &data.projects {
        if db.project_exists(&project.path).unwrap_or(false) {
            projects_skipped += 1;
            continue;
        }
        let mut p = project.clone();
        // Remap group_id to the target group
        p.group_id = group_id_map.get(&p.group_id).cloned().unwrap_or_else(|| {
            updated_groups
                .first()
                .map(|g| g.id.clone())
                .unwrap_or_default()
        });
        if db.insert_project(&p).is_ok() {
            projects_imported += 1;
        }
    }

    Ok(ImportResult {
        settings_applied: true,
        groups_imported,
        projects_imported,
        projects_skipped,
    })
}

#[tauri::command]
pub async fn read_file_text(path: String) -> Result<String, AppError> {
    std::fs::read_to_string(&path)
        .map_err(|e| AppError::NotFound(format!("Failed to read file '{}': {}", path, e)))
}
