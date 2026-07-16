use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

use crate::db::Database;
use crate::models::{
    BatchResult, BisectState, BlameLine, BranchCompareResult, BranchHealthReport, BranchInfo,
    CommitInfo, FileCommitEntry, FileDiffStats, GitFileEntry, GitStatus, LogEntry, MergeResult,
    ProjectDetail, ProjectDiffSummary, ProjectStats, ReflogEntry, RemoteInfo, StashInfo,
    SubmoduleInfo, TagInfo, WorktreeInfo,
};
use crate::services::GitService;
use crate::AppError;

use super::events::{emit_op_done, emit_op_error, emit_op_start};
use super::notifications::NotificationStore;
use super::op_tracker::{next_op_id, ActiveOps};
use super::try_update_activity;

/// Validate and canonicalize a repository path, ensuring it is a git repo.
fn validate_repo_path(path: &str) -> Result<std::path::PathBuf, AppError> {
    let canonical = std::fs::canonicalize(path)
        .map_err(|e| AppError::NotFound(format!("Invalid path '{}': {}", path, e)))?;
    if !GitService::is_git_repo(&canonical.to_string_lossy()) {
        return Err(AppError::NotFound(format!(
            "Not a git repository: {}",
            canonical.display()
        )));
    }
    Ok(canonical)
}

fn get_project_detail_for_path(db: &Database, path: &str) -> Result<ProjectDetail, AppError> {
    let project = db.get_project_by_path(path)?;
    let group = db.get_project_group(&project.id)?;
    GitService::get_project_detail(&project, group)
}

fn project_name_from_path(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

fn emit_notification(
    notifications: &NotificationStore,
    path: &str,
    event_type: &str,
    message: String,
) {
    let store = notifications.clone();
    let name = project_name_from_path(path);
    let et = event_type.to_string();
    tokio::task::spawn(async move {
        store.push(name, et, message).await;
    });
}

// ── Libgit2-backed commands (async via spawn_blocking) ────────────────

#[tauri::command]
pub async fn get_branches(path: String) -> Result<Vec<BranchInfo>, AppError> {
    tokio::task::spawn_blocking(move || -> Result<Vec<BranchInfo>, AppError> {
        let repo = git2::Repository::open(&path)
            .map_err(|e| AppError::Git(format!("Failed to open repo: {}", e)))?;
        GitService::get_branches(&repo)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn switch_branch(
    path: String,
    branch: String,
    db: State<'_, Database>,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<ProjectDetail, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "switch_branch", &path);

    let db = db.inner().clone();
    let path_clone = path.clone();
    let branch_clone = branch.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<ProjectDetail, AppError> {
        let _canonical = validate_repo_path(&path_clone)?;
        GitService::switch_branch(&path_clone, &branch_clone)?;
        let detail = get_project_detail_for_path(&db, &path_clone)?;
        try_update_activity(
            &db,
            &detail.project.id,
            detail.project.last_commit_hash.as_deref(),
        );
        Ok(detail)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => {
            emit_op_done(&app_clone, op_id, "switch_branch", &path);
            emit_notification(
                &notifications,
                &path,
                "info",
                format!("Switched to branch '{}'", branch),
            );
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "switch_branch", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Failed to switch to '{}': {}", branch, e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn get_status(path: String) -> Result<GitStatus, AppError> {
    tokio::task::spawn_blocking(move || -> Result<GitStatus, AppError> {
        let repo = git2::Repository::open(&path)
            .map_err(|e| AppError::Git(format!("Failed to open repo: {}", e)))?;
        GitService::get_status(&repo)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn refresh_project(
    path: String,
    db: State<'_, Database>,
) -> Result<ProjectDetail, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || -> Result<ProjectDetail, AppError> {
        let project = db.get_project_by_path(&path)?;
        let group = db.get_project_group(&project.id)?;
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
pub async fn git_get_log(
    path: String,
    limit: Option<usize>,
    offset: Option<usize>,
    author: Option<String>,
    message_contains: Option<String>,
    since: Option<i64>,
    until: Option<i64>,
) -> Result<Vec<CommitInfo>, AppError> {
    tokio::task::spawn_blocking(move || -> Result<Vec<CommitInfo>, AppError> {
        GitService::get_log(
            &path,
            offset.unwrap_or(0),
            limit.unwrap_or(50),
            author.as_deref(),
            message_contains.as_deref(),
            since,
            until,
        )
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_get_files(path: String) -> Result<Vec<GitFileEntry>, AppError> {
    tokio::task::spawn_blocking(move || -> Result<Vec<GitFileEntry>, AppError> {
        GitService::get_file_list(&path)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_stage_file(path: String, file: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        GitService::stage_file(&path, &file)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_unstage_file(path: String, file: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        GitService::unstage_file(&path, &file)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_discard_file(path: String, file: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        GitService::discard_file(&path, &file)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_stage_all(path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || -> Result<(), AppError> { GitService::stage_all(&path) })
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_unstage_all(path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || -> Result<(), AppError> { GitService::unstage_all(&path) })
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_get_staged_diff(path: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        GitService::get_staged_diff(&path)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_commit(
    path: String,
    message: String,
    db: State<'_, Database>,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<String, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "commit", &path);

    let db = db.inner().clone();
    let path_clone = path.clone();
    let app_clone = app.clone();
    let msg_clone = message.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        let hash = GitService::commit(&path_clone, &msg_clone)?;
        if let Ok(project) = db.get_project_by_path(&path_clone) {
            try_update_activity(&db, &project.id, Some(hash.as_str()));
        }
        Ok(hash)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => {
            emit_op_done(&app_clone, op_id, "commit", &path);
            emit_notification(
                &notifications,
                &path,
                "info",
                format!("Committed: {}", message.lines().next().unwrap_or("")),
            );
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "commit", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Commit failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_stash(
    path: String,
    message: Option<String>,
    include_untracked: Option<bool>,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<String, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "stash", &path);

    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        GitService::stash(
            &path_clone,
            message.as_deref(),
            include_untracked.unwrap_or(false),
        )
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => {
            emit_op_done(&app_clone, op_id, "stash", &path);
            emit_notification(&notifications, &path, "stash", "Stash created".to_string());
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "stash", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Stash failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_stash_apply(
    path: String,
    index: usize,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<String, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "stash_apply", &path);

    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        GitService::stash_apply(&path_clone, index)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => {
            emit_op_done(&app_clone, op_id, "stash_apply", &path);
            emit_notification(
                &notifications,
                &path,
                "stash",
                format!("Stash #{} applied", index),
            );
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "stash_apply", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Stash apply failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn create_branch(
    path: String,
    name: String,
    from_branch: Option<String>,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        GitService::create_branch(&path, &name, from_branch.as_deref())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn delete_branch(path: String, name: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        GitService::delete_branch(&path, &name)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn merge_branch(
    path: String,
    branch: String,
    strategy: Option<String>,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<MergeResult, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "merge", &path);

    let path_clone = path.clone();
    let branch_clone = branch.clone();
    let app_clone = app.clone();
    let strategy_clone = strategy.unwrap_or_else(|| "default".to_string());

    let result = tokio::task::spawn_blocking(move || -> Result<MergeResult, AppError> {
        GitService::merge_with_strategy(&path_clone, &branch_clone, &strategy_clone)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(r) if r.success => {
            emit_op_done(&app_clone, op_id, "merge", &path);
            emit_notification(
                &notifications,
                &path,
                "info",
                format!("Merged branch '{}'", branch),
            );
        }
        Ok(r) => {
            emit_op_error(&app_clone, op_id, "merge", &path, &r.message);
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Merge of '{}' failed: {}", branch, r.message),
            );
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "merge", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Merge of '{}' failed: {}", branch, e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_cherry_pick(
    path: String,
    commit_hash: String,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<MergeResult, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "cherry_pick", &path);

    let path_clone = path.clone();
    let commit_clone = commit_hash.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<MergeResult, AppError> {
        GitService::cherry_pick(&path_clone, &commit_clone)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(r) if r.success => {
            emit_op_done(&app_clone, op_id, "cherry_pick", &path);
            emit_notification(
                &notifications,
                &path,
                "info",
                format!("Cherry-picked {}", &commit_hash[..7.min(commit_hash.len())]),
            );
        }
        Ok(r) => {
            emit_op_error(&app_clone, op_id, "cherry_pick", &path, &r.message);
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Cherry-pick failed: {}", r.message),
            );
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "cherry_pick", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Cherry-pick failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_cherry_pick_range(
    path: String,
    from: String,
    to: String,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<MergeResult, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "cherry_pick", &path);

    let path_clone = path.clone();
    let from_clone = from.clone();
    let to_clone = to.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<MergeResult, AppError> {
        GitService::cherry_pick_range(&path_clone, &from_clone, &to_clone)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(r) if r.success => {
            emit_op_done(&app_clone, op_id, "cherry_pick", &path);
            emit_notification(&notifications, &path, "info", r.message.clone());
        }
        Ok(r) => {
            emit_op_error(&app_clone, op_id, "cherry_pick", &path, &r.message);
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Cherry-pick range failed: {}", r.message),
            );
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "cherry_pick", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Cherry-pick range failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_rebase(
    path: String,
    onto_branch: String,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<MergeResult, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "rebase", &path);

    let path_clone = path.clone();
    let branch_clone = onto_branch.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<MergeResult, AppError> {
        GitService::rebase(&path_clone, &branch_clone)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(r) if r.success => {
            emit_op_done(&app_clone, op_id, "rebase", &path);
            emit_notification(
                &notifications,
                &path,
                "info",
                format!("Rebased onto '{}'", onto_branch),
            );
        }
        Ok(r) => {
            emit_op_error(&app_clone, op_id, "rebase", &path, &r.message);
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Rebase onto '{}' failed: {}", onto_branch, r.message),
            );
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "rebase", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Rebase onto '{}' failed: {}", onto_branch, e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_reword_commit(
    path: String,
    commit_hash: String,
    new_message: String,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<String, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "reword_commit", &path);

    let path_clone = path.clone();
    let hash_clone = commit_hash.clone();
    let msg_clone = new_message.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        GitService::reword_commit(&path_clone, &hash_clone, &msg_clone)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(msg) => {
            emit_op_done(&app_clone, op_id, "reword_commit", &path);
            emit_notification(&notifications, &path, "info", msg.clone());
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "reword_commit", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Reword failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_drop_commit(
    path: String,
    commit_hash: String,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<String, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "drop_commit", &path);

    let path_clone = path.clone();
    let hash_clone = commit_hash.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        GitService::drop_commit(&path_clone, &hash_clone)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(msg) => {
            emit_op_done(&app_clone, op_id, "drop_commit", &path);
            emit_notification(&notifications, &path, "info", msg.clone());
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "drop_commit", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Drop failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_reset(
    path: String,
    target: String,
    mode: String,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<String, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "reset", &path);

    let path_clone = path.clone();
    let target_clone = target.clone();
    let mode_clone = mode.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        let _canonical = validate_repo_path(&path_clone)?;
        GitService::git_reset(&path_clone, &target_clone, &mode_clone)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(msg) => {
            emit_op_done(&app_clone, op_id, "reset", &path);
            emit_notification(&notifications, &path, "info", msg.clone());
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "reset", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Reset failed: {}", e),
            );
        }
    }
    result
}

// ── Network operations (async via spawn_blocking + CLI subprocess) ────

#[tauri::command]
pub async fn git_push(
    path: String,
    branch: Option<String>,
    app: AppHandle,
    active_ops: State<'_, ActiveOps>,
    notifications: State<'_, NotificationStore>,
) -> Result<String, AppError> {
    let op_id = next_op_id();
    let cancel_flag = Arc::new(AtomicBool::new(true));
    active_ops.insert(op_id, cancel_flag.clone());
    emit_op_start(&app, op_id, "push", &path);

    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        let _canonical = validate_repo_path(&path_clone)?;
        GitService::push(&path_clone, branch.as_deref(), Some(cancel_flag))
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    active_ops.remove(&op_id);
    match &result {
        Ok(_) => {
            emit_op_done(&app_clone, op_id, "push", &path);
            emit_notification(&notifications, &path, "push", "Push successful".to_string());
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "push", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Push failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_pull(
    path: String,
    app: AppHandle,
    active_ops: State<'_, ActiveOps>,
    notifications: State<'_, NotificationStore>,
) -> Result<String, AppError> {
    let op_id = next_op_id();
    let cancel_flag = Arc::new(AtomicBool::new(true));
    active_ops.insert(op_id, cancel_flag.clone());
    emit_op_start(&app, op_id, "pull", &path);

    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        let _canonical = validate_repo_path(&path_clone)?;
        GitService::pull(&path_clone, Some(cancel_flag))
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    active_ops.remove(&op_id);
    match &result {
        Ok(_) => {
            emit_op_done(&app_clone, op_id, "pull", &path);
            emit_notification(&notifications, &path, "pull", "Pull successful".to_string());
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "pull", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Pull failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_fetch(
    path: String,
    app: AppHandle,
    active_ops: State<'_, ActiveOps>,
    notifications: State<'_, NotificationStore>,
) -> Result<String, AppError> {
    let op_id = next_op_id();
    let cancel_flag = Arc::new(AtomicBool::new(true));
    active_ops.insert(op_id, cancel_flag.clone());
    emit_op_start(&app, op_id, "fetch", &path);

    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        let _canonical = validate_repo_path(&path_clone)?;
        GitService::fetch(&path_clone, Some(cancel_flag))
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    active_ops.remove(&op_id);
    match &result {
        Ok(_) => {
            emit_op_done(&app_clone, op_id, "fetch", &path);
            emit_notification(
                &notifications,
                &path,
                "fetch",
                "Fetch successful".to_string(),
            );
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "fetch", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Fetch failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_stash_pop(
    path: String,
    index: Option<usize>,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<String, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "stash_pop", &path);

    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        match index {
            Some(i) => GitService::stash_pop_at(&path_clone, i),
            None => GitService::stash_pop(&path_clone),
        }
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => {
            emit_op_done(&app_clone, op_id, "stash_pop", &path);
            emit_notification(&notifications, &path, "stash", "Stash popped".to_string());
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "stash_pop", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Stash pop failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_stash_show(path: String, index: usize) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || GitService::stash_show(&path, index))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_stash_list(path: String) -> Result<Vec<StashInfo>, AppError> {
    tokio::task::spawn_blocking(move || GitService::get_stash_list(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_stash_drop(
    path: String,
    index: usize,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<(), AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "stash_drop", &path);
    let path_clone = path.clone();
    let app_clone = app.clone();
    let result = tokio::task::spawn_blocking(move || GitService::stash_drop(&path_clone, index))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;
    match &result {
        Ok(_) => {
            emit_op_done(&app_clone, op_id, "stash_drop", &path);
            emit_notification(
                &notifications,
                &path,
                "stash",
                format!("Stash #{} dropped", index),
            );
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "stash_drop", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Stash drop failed: {}", e),
            );
        }
    }
    result
}

// ── Tag management ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn git_list_tags(path: String) -> Result<Vec<TagInfo>, AppError> {
    tokio::task::spawn_blocking(move || GitService::list_tags(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_create_tag(
    path: String,
    name: String,
    message: Option<String>,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || {
        GitService::create_tag(&path, &name, message.as_deref(), None)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_delete_tag(path: String, name: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || GitService::delete_tag(&path, &name))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_push_tag(
    path: String,
    name: String,
    remote: Option<String>,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || GitService::push_tag(&path, &name, remote.as_deref()))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

// ── Remote management ────────────────────────────────────────────────

#[tauri::command]
pub async fn git_list_remotes(path: String) -> Result<Vec<RemoteInfo>, AppError> {
    tokio::task::spawn_blocking(move || GitService::list_remotes(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_add_remote(path: String, name: String, url: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || GitService::add_remote(&path, &name, &url))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_remove_remote(path: String, name: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || GitService::remove_remote(&path, &name))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_set_remote_url(path: String, name: String, url: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || GitService::set_remote_url(&path, &name, &url))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

// ── Batch operations: non-blocking, results stream via events ──────────

type BatchOperation = fn(&[String]) -> Vec<(String, Result<String, AppError>)>;
type StatusFilter = fn(&GitStatus) -> bool;

fn run_batch_sync(
    app: &AppHandle,
    db: &Database,
    label: &str,
    group_id: Option<&str>,
    op: BatchOperation,
) -> Result<(), AppError> {
    let projects = match group_id {
        Some(gid) => db.get_projects_in_group(gid)?,
        None => db.get_all_projects()?,
    };
    let paths: Vec<String> = projects.iter().map(|p| p.path.clone()).collect();

    let results = op(&paths);
    for (name, result) in results {
        let batch_result = BatchResult {
            project_name: name,
            success: result.is_ok(),
            message: result.unwrap_or_else(|e| e.to_string()),
        };
        if let Err(e) = app.emit("batch-result", &batch_result) {
            log::error!("failed to emit batch-result: {}", e);
        }
    }
    if let Err(e) = app.emit("batch-done", label) {
        log::error!("failed to emit batch-done: {}", e);
    }

    Ok(())
}

#[tauri::command]
pub async fn fetch_all(
    app: AppHandle,
    db: State<'_, Database>,
    group_id: Option<String>,
) -> Result<(), AppError> {
    let db = db.inner().clone();
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        run_batch_sync(
            &app_clone,
            &db,
            "fetch",
            group_id.as_deref(),
            GitService::fetch_all_projects,
        )
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

/// Auto-fetch all projects on launch. Skips recently fetched repos.
/// Runs in the background — does not block the UI.
#[tauri::command]
pub async fn git_auto_fetch_all(app: AppHandle, db: State<'_, Database>) -> Result<(), AppError> {
    let db = db.inner().clone();
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        let projects = db.get_all_projects()?;
        let paths: Vec<String> = projects.iter().map(|p| p.path.clone()).collect();
        if paths.is_empty() {
            let _ = app_clone.emit("auto-fetch-done", 0u32);
            return Ok(());
        }
        let results = GitService::auto_fetch_all(&paths);
        let count = results.len() as u32;
        for (name, result) in &results {
            if let Err(e) = result {
                log::warn!("auto-fetch failed for {}: {}", name, e);
            }
        }
        let _ = app_clone.emit("auto-fetch-done", count);
        Ok(())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn pull_all(
    app: AppHandle,
    db: State<'_, Database>,
    group_id: Option<String>,
) -> Result<(), AppError> {
    let db = db.inner().clone();
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        run_batch_sync(
            &app_clone,
            &db,
            "pull",
            group_id.as_deref(),
            GitService::pull_all_projects,
        )
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn push_all(
    app: AppHandle,
    db: State<'_, Database>,
    group_id: Option<String>,
) -> Result<(), AppError> {
    let db = db.inner().clone();
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        run_batch_sync(
            &app_clone,
            &db,
            "push",
            group_id.as_deref(),
            GitService::push_all_projects,
        )
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

fn run_batch_filtered(
    app: &AppHandle,
    db: &Database,
    label: &str,
    group_id: Option<&str>,
    filter: StatusFilter,
    op: BatchOperation,
) -> Result<(), AppError> {
    let projects = match group_id {
        Some(gid) => db.get_projects_in_group(gid)?,
        None => db.get_all_projects()?,
    };

    let mut filtered = Vec::new();
    for p in &projects {
        let keep = match GitService::open_repo(&p.path) {
            Ok(repo) => match GitService::get_status(&repo) {
                Ok(s) => filter(&s),
                Err(_) => false,
            },
            Err(_) => false,
        };
        if keep {
            filtered.push(p.path.clone());
        }
    }

    if filtered.is_empty() {
        if let Err(e) = app.emit("batch-done", label) {
            log::error!("failed to emit batch-done: {}", e);
        }
        return Ok(());
    }

    let results = op(&filtered);
    for (name, result) in results {
        let batch_result = BatchResult {
            project_name: name,
            success: result.is_ok(),
            message: result.unwrap_or_else(|e| e.to_string()),
        };
        if let Err(e) = app.emit("batch-result", &batch_result) {
            log::error!("failed to emit batch-result: {}", e);
        }
    }
    if let Err(e) = app.emit("batch-done", label) {
        log::error!("failed to emit batch-done: {}", e);
    }

    Ok(())
}

fn behind_filter(s: &GitStatus) -> bool {
    s.behind > 0
}
fn ahead_filter(s: &GitStatus) -> bool {
    s.ahead > 0
}

#[tauri::command]
pub async fn pull_behind(
    app: AppHandle,
    db: State<'_, Database>,
    group_id: Option<String>,
) -> Result<(), AppError> {
    let db = db.inner().clone();
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        run_batch_filtered(
            &app_clone,
            &db,
            "pull_behind",
            group_id.as_deref(),
            behind_filter,
            GitService::pull_all_projects,
        )
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn push_ahead(
    app: AppHandle,
    db: State<'_, Database>,
    group_id: Option<String>,
) -> Result<(), AppError> {
    let db = db.inner().clone();
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        run_batch_filtered(
            &app_clone,
            &db,
            "push_ahead",
            group_id.as_deref(),
            ahead_filter,
            GitService::push_all_projects,
        )
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

// ── Sync operations ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn sync_project(
    path: String,
    app: AppHandle,
    active_ops: State<'_, ActiveOps>,
    notifications: State<'_, NotificationStore>,
) -> Result<String, AppError> {
    let op_id = next_op_id();
    let cancel_flag = Arc::new(AtomicBool::new(true));
    active_ops.insert(op_id, cancel_flag.clone());
    emit_op_start(&app, op_id, "sync", &path);

    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        let _canonical = validate_repo_path(&path_clone)?;

        // Step 1: Fetch
        GitService::fetch(&path_clone, Some(cancel_flag.clone()))?;

        // Step 2: Check status to decide pull or push
        let repo = git2::Repository::open(&path_clone)
            .map_err(|e| AppError::Git(format!("Failed to open repo: {}", e)))?;
        let status = GitService::get_status(&repo)?;

        if status.behind > 0 {
            let msg = GitService::pull(&path_clone, Some(cancel_flag))?;
            Ok(format!("Fetched and pulled: {}", msg))
        } else if status.ahead > 0 {
            let msg = GitService::push(&path_clone, None, Some(cancel_flag))?;
            Ok(format!("Fetched and pushed: {}", msg))
        } else {
            Ok("Fetched: already up to date".to_string())
        }
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    active_ops.remove(&op_id);
    match &result {
        Ok(msg) => {
            emit_op_done(&app_clone, op_id, "sync", &path);
            emit_notification(&notifications, &path, "info", format!("Sync: {}", msg));
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "sync", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Sync failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn sync_all(
    app: AppHandle,
    db: State<'_, Database>,
    group_id: Option<String>,
) -> Result<(), AppError> {
    let db = db.inner().clone();
    let app_clone = app.clone();
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        run_batch_sync(
            &app_clone,
            &db,
            "sync",
            group_id.as_deref(),
            GitService::sync_all_projects,
        )
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

// ── Cancellation ──────────────────────────────────────────────────────

#[tauri::command]
pub async fn cancel_git_op(id: u64, active_ops: State<'_, ActiveOps>) -> Result<(), AppError> {
    if let Some(flag) = active_ops.get(&id) {
        flag.store(false, std::sync::atomic::Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
pub async fn get_file_diff(
    path: String,
    file_path: String,
    staged: Option<bool>,
) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || {
        GitService::get_file_diff(&path, &file_path, staged.unwrap_or(false))
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_file_diff_stats(
    path: String,
    file_path: String,
    staged: Option<bool>,
) -> Result<FileDiffStats, AppError> {
    tokio::task::spawn_blocking(move || {
        let (additions, deletions) =
            GitService::get_file_diff_stats(&path, &file_path, staged.unwrap_or(false))?;
        Ok(FileDiffStats {
            additions,
            deletions,
        })
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_list_conflicts(path: String) -> Result<Vec<String>, AppError> {
    tokio::task::spawn_blocking(move || GitService::list_conflicts(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_resolve_conflict(
    path: String,
    file_path: String,
    resolution: String,
) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || match resolution.as_str() {
        "ours" => GitService::resolve_conflict_ours(&path, &file_path),
        "theirs" => GitService::resolve_conflict_theirs(&path, &file_path),
        _ => Err(AppError::Git(format!("Unknown resolution: {}", resolution))),
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_abort_merge(path: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || GitService::abort_merge(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_abort_cherry_pick(path: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || GitService::abort_cherry_pick(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_clean_preview(
    path: String,
    include_ignored: Option<bool>,
) -> Result<Vec<String>, AppError> {
    tokio::task::spawn_blocking(move || {
        GitService::preview_clean(&path, include_ignored.unwrap_or(false))
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_clean_execute(
    path: String,
    include_ignored: Option<bool>,
) -> Result<Vec<String>, AppError> {
    tokio::task::spawn_blocking(move || {
        GitService::execute_clean(&path, include_ignored.unwrap_or(false))
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_create_patch(path: String, commit_hash: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || GitService::create_patch(&path, &commit_hash))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_check_patch(path: String, patch_content: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || GitService::check_patch(&path, &patch_content))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_apply_patch(path: String, patch_content: String) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || GitService::apply_patch(&path, &patch_content))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_bisect_start(
    path: String,
    good: String,
    bad: String,
) -> Result<BisectState, AppError> {
    tokio::task::spawn_blocking(move || GitService::bisect_start(&path, &good, &bad))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_bisect_good(path: String) -> Result<BisectState, AppError> {
    tokio::task::spawn_blocking(move || GitService::bisect_good(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_bisect_bad(path: String) -> Result<BisectState, AppError> {
    tokio::task::spawn_blocking(move || GitService::bisect_bad(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_bisect_reset(path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || GitService::bisect_reset(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_bisect_status(path: String) -> Result<Option<BisectState>, AppError> {
    tokio::task::spawn_blocking(move || GitService::bisect_status(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_log(path: String, max_count: Option<usize>) -> Result<Vec<LogEntry>, AppError> {
    tokio::task::spawn_blocking(move || GitService::get_commit_log(&path, max_count))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_file_history(
    path: String,
    file_path: String,
    max_count: Option<usize>,
) -> Result<Vec<FileCommitEntry>, AppError> {
    tokio::task::spawn_blocking(move || GitService::file_history(&path, &file_path, max_count))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}
#[tauri::command]
pub async fn blame_file(path: String, file_path: String) -> Result<Vec<BlameLine>, AppError> {
    tokio::task::spawn_blocking(move || GitService::blame_file(&path, &file_path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

// ── Worktree management ──────────────────────────────────────────────────

#[tauri::command]
pub async fn git_list_worktrees(path: String) -> Result<Vec<WorktreeInfo>, AppError> {
    tokio::task::spawn_blocking(move || GitService::list_worktrees(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_add_worktree(
    path: String,
    name: String,
    branch: Option<String>,
    create_branch: Option<bool>,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<WorktreeInfo, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "add_worktree", &path);

    let path_clone = path.clone();
    let name_clone = name.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || {
        GitService::add_worktree(
            &path_clone,
            &name_clone,
            branch.as_deref(),
            create_branch.unwrap_or(false),
        )
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => {
            emit_op_done(&app_clone, op_id, "add_worktree", &path);
            emit_notification(
                &notifications,
                &path,
                "info",
                format!("Worktree '{}' created", name),
            );
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "add_worktree", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Worktree creation failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_remove_worktree(
    path: String,
    name: String,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<(), AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "remove_worktree", &path);

    let path_clone = path.clone();
    let name_clone = name.clone();
    let app_clone = app.clone();

    let result =
        tokio::task::spawn_blocking(move || GitService::remove_worktree(&path_clone, &name_clone))
            .await
            .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => {
            emit_op_done(&app_clone, op_id, "remove_worktree", &path);
            emit_notification(
                &notifications,
                &path,
                "info",
                format!("Worktree '{}' removed", name),
            );
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "remove_worktree", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Worktree removal failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_prune_worktrees(
    path: String,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<Vec<String>, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "prune_worktrees", &path);

    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || GitService::prune_worktrees(&path_clone))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(pruned) => {
            emit_op_done(&app_clone, op_id, "prune_worktrees", &path);
            if !pruned.is_empty() {
                emit_notification(
                    &notifications,
                    &path,
                    "info",
                    format!("Pruned {} worktree(s)", pruned.len()),
                );
            }
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "prune_worktrees", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Worktree prune failed: {}", e),
            );
        }
    }
    result
}

// ── Submodule management ───────────────────────────────────────────────

#[tauri::command]
pub async fn git_list_submodules(path: String) -> Result<Vec<SubmoduleInfo>, AppError> {
    tokio::task::spawn_blocking(move || GitService::list_submodules(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_update_submodule(
    path: String,
    name: String,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<String, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "update_submodule", &path);

    let path_clone = path.clone();
    let name_clone = name.clone();
    let app_clone = app.clone();

    let result =
        tokio::task::spawn_blocking(move || GitService::update_submodule(&path_clone, &name_clone))
            .await
            .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => {
            emit_op_done(&app_clone, op_id, "update_submodule", &path);
            emit_notification(
                &notifications,
                &path,
                "info",
                format!("Submodule '{}' updated", name),
            );
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "update_submodule", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Submodule update failed: {}", e),
            );
        }
    }
    result
}

#[tauri::command]
pub async fn git_init_submodules(
    path: String,
    app: AppHandle,
    notifications: State<'_, NotificationStore>,
) -> Result<String, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "init_submodules", &path);

    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || GitService::init_submodules(&path_clone))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => {
            emit_op_done(&app_clone, op_id, "init_submodules", &path);
            emit_notification(
                &notifications,
                &path,
                "info",
                "Submodules initialized".to_string(),
            );
        }
        Err(e) => {
            emit_op_error(&app_clone, op_id, "init_submodules", &path, &e.to_string());
            emit_notification(
                &notifications,
                &path,
                "error",
                format!("Submodule init failed: {}", e),
            );
        }
    }
    result
}

// ── Branch health ─────────────────────────────────────────────────────

#[tauri::command]
pub async fn analyze_branch_health(path: String) -> Result<BranchHealthReport, AppError> {
    tokio::task::spawn_blocking(move || GitService::analyze_branch_health(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn delete_merged_branches(
    path: String,
    branches: Vec<String>,
) -> Result<Vec<BatchResult>, AppError> {
    tokio::task::spawn_blocking(move || {
        let results = GitService::delete_merged_branches(&path, &branches);
        Ok(results
            .into_iter()
            .map(|(name, result)| BatchResult {
                project_name: name,
                success: result.is_ok(),
                message: result.unwrap_or_else(|e| e.to_string()),
            })
            .collect())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

// ── Branch comparison ─────────────────────────────────────────────────

#[tauri::command]
pub async fn git_squash_commits(
    path: String,
    n: usize,
    message: Option<String>,
) -> Result<MergeResult, AppError> {
    tokio::task::spawn_blocking(move || GitService::squash_last_n(&path, n, message.as_deref()))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_compare_branches(
    path: String,
    branch_a: String,
    branch_b: String,
) -> Result<BranchCompareResult, AppError> {
    tokio::task::spawn_blocking(move || GitService::compare_branches(&path, &branch_a, &branch_b))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_quick_diff_all(
    db: State<'_, Database>,
) -> Result<Vec<ProjectDiffSummary>, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || -> Result<Vec<ProjectDiffSummary>, AppError> {
        let projects = db.get_all_projects()?;
        let mut summaries = Vec::new();

        for project in &projects {
            let repo = match git2::Repository::open(&project.path) {
                Ok(r) => r,
                Err(_) => continue,
            };
            let status = match GitService::get_status(&repo) {
                Ok(s) => s,
                Err(_) => continue,
            };
            let total_changes = status.modified + status.staged + status.untracked;
            if total_changes == 0 {
                continue;
            }

            let files = match GitService::get_file_list(&project.path) {
                Ok(f) => f,
                Err(_) => continue,
            };

            let file_names: Vec<String> = files.iter().take(20).map(|f| f.path.clone()).collect();
            let files_changed = files.len();

            // Approximate additions/deletions from file count (lightweight)
            let additions = status.staged as usize + status.untracked as usize;
            let deletions = status.modified as usize;

            let current_branch = repo
                .head()
                .ok()
                .and_then(|h| h.shorthand().map(|s| s.to_string()))
                .unwrap_or_else(|| "unknown".to_string());

            summaries.push(ProjectDiffSummary {
                project_name: project
                    .alias
                    .clone()
                    .unwrap_or_else(|| project.name.clone()),
                project_id: project.id.clone(),
                path: project.path.clone(),
                additions,
                deletions,
                files_changed,
                files: file_names,
                current_branch,
            });
        }

        // Sort by most changes first
        summaries.sort_by(|a, b| {
            let a_total = a.files_changed + a.additions + a.deletions;
            let b_total = b.files_changed + b.additions + b.deletions;
            b_total.cmp(&a_total)
        });

        Ok(summaries)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn get_project_stats(path: String) -> Result<ProjectStats, AppError> {
    tokio::task::spawn_blocking(move || GitService::get_project_stats(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

// ── Gitignore management ──────────────────────────────────────────────

#[derive(Clone, serde::Serialize)]
pub struct GitignoreTemplate {
    pub name: String,
    pub content: String,
}

#[tauri::command]
pub async fn get_gitignore(path: String) -> Result<Option<String>, AppError> {
    let gitignore_path = std::path::Path::new(&path).join(".gitignore");
    match std::fs::read_to_string(&gitignore_path) {
        Ok(content) => Ok(Some(content)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(AppError::Io(e)),
    }
}

#[tauri::command]
pub async fn save_gitignore(path: String, content: String) -> Result<(), AppError> {
    let gitignore_path = std::path::Path::new(&path).join(".gitignore");
    std::fs::write(&gitignore_path, content)?;
    Ok(())
}

#[tauri::command]
pub async fn get_gitignore_templates() -> Result<Vec<GitignoreTemplate>, AppError> {
    Ok(vec![
        GitignoreTemplate {
            name: "Node.js".to_string(),
            content: "\
node_modules/
dist/
build/
.env
.env.local
.env.*.local
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
.npm
.eslintcache
*.tsbuildinfo
.next/
.nuxt/
.cache/
coverage/
"
            .to_string(),
        },
        GitignoreTemplate {
            name: "Rust".to_string(),
            content: "\
/target/
Cargo.lock
**/*.rs.bk
*.pdb
.idea/
.vscode/
*.swp
*.swo
"
            .to_string(),
        },
        GitignoreTemplate {
            name: "Python".to_string(),
            content: "\
__pycache__/
*.py[cod]
*$py.class
*.egg-info/
dist/
build/
.eggs/
*.egg
.venv/
venv/
.env
.mypy_cache/
.pytest_cache/
.ruff_cache/
.tox/
.coverage
htmlcov/
*.log
"
            .to_string(),
        },
        GitignoreTemplate {
            name: "macOS".to_string(),
            content: "\
.DS_Store
.AppleDouble
.LSOverride
._*
.Spotlight-V100
.Trashes
.fseventsd
.TemporaryItems
.VolumeIcon.icns
.com.apple.timemachine.donotpresent
.AppleDB
.AppleDesktop
Network Trash Folder
Temporary Items
.apdisk
"
            .to_string(),
        },
        GitignoreTemplate {
            name: "IDE / Editor".to_string(),
            content: "\
.vscode/
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?
*~
*.swp
*.swo
.project
.classpath
.settings/
*.iml
out/
"
            .to_string(),
        },
        GitignoreTemplate {
            name: "Go".to_string(),
            content: "\
*.exe
*.exe~
*.dll
*.so
*.dylib
*.test
*.out
vendor/
go.work
go.work.sum
"
            .to_string(),
        },
        GitignoreTemplate {
            name: "Java / Kotlin".to_string(),
            content: "\
*.class
*.jar
*.war
*.ear
*.nar
.gradle/
build/
!gradle/wrapper/gradle-wrapper.jar
.settings/
.classpath
.project
.idea/
*.iml
out/
target/
*.log
"
            .to_string(),
        },
    ])
}

#[tauri::command]
pub async fn git_get_reflog(
    path: String,
    max_count: Option<usize>,
) -> Result<Vec<ReflogEntry>, AppError> {
    tokio::task::spawn_blocking(move || GitService::get_reflog(&path, max_count))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_checkout_commit(path: String, hash: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || GitService::checkout_commit(&path, &hash))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

// ── Archive export ────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_archive(
    path: String,
    format: String,
    output_path: String,
    ref_name: Option<String>,
) -> Result<String, AppError> {
    tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        let _canonical = validate_repo_path(&path)?;

        if format != "zip" && format != "tar.gz" {
            return Err(AppError::Other(format!(
                "Unsupported archive format: {}",
                format
            )));
        }

        let ref_to_use = ref_name.unwrap_or_else(|| "HEAD".to_string());

        let output = std::process::Command::new("git")
            .arg("-C")
            .arg(&path)
            .arg("archive")
            .arg("--format")
            .arg(&format)
            .arg("--output")
            .arg(&output_path)
            .arg(&ref_to_use)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to run git archive: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::Git(format!(
                "git archive failed: {}",
                stderr.trim()
            )));
        }

        Ok(output_path)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

// ── Git Hooks Management ──────────────────────────────────────────────

#[derive(Clone, serde::Serialize)]
pub struct GitHook {
    pub name: String,
    pub path: String,
    pub active: bool,
    pub content: Option<String>,
}

#[tauri::command]
pub async fn list_hooks(path: String) -> Result<Vec<GitHook>, AppError> {
    let hooks_dir = std::path::Path::new(&path).join(".git").join("hooks");
    if !hooks_dir.exists() {
        return Ok(Vec::new());
    }
    let entries = std::fs::read_dir(&hooks_dir)?;
    let mut hooks = Vec::new();
    let sample_suffix = ".sample";
    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        // Skip directories and non-hook files (.sample files are handled below)
        if file_name.starts_with('.') || file_name.ends_with(".sample") {
            // Check if this is a .sample file — the base name is a hook
            if let Some(base_name) = file_name.strip_suffix(sample_suffix) {
                let active_path = hooks_dir.join(base_name);
                // Only list as disabled if the active version doesn't exist
                if !active_path.exists() {
                    hooks.push(GitHook {
                        name: base_name.to_string(),
                        path: entry.path().to_string_lossy().to_string(),
                        active: false,
                        content: None,
                    });
                }
            }
            continue;
        }
        // Check if the file is executable (active hook)
        hooks.push(GitHook {
            name: file_name.clone(),
            path: entry.path().to_string_lossy().to_string(),
            active: true,
            content: None,
        });
    }
    hooks.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(hooks)
}

#[tauri::command]
pub async fn toggle_hook(path: String, name: String, active: bool) -> Result<(), AppError> {
    let hooks_dir = std::path::Path::new(&path).join(".git").join("hooks");
    let active_path = hooks_dir.join(&name);
    let sample_path = hooks_dir.join(format!("{}.sample", name));

    if active {
        // Enable: rename .sample → active
        if sample_path.exists() && !active_path.exists() {
            std::fs::rename(&sample_path, &active_path)?;
        }
    } else {
        // Disable: rename active → .sample
        if active_path.exists() && !sample_path.exists() {
            std::fs::rename(&active_path, &sample_path)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn get_hook_content(path: String, name: String) -> Result<String, AppError> {
    let hooks_dir = std::path::Path::new(&path).join(".git").join("hooks");
    let active_path = hooks_dir.join(&name);
    let sample_path = hooks_dir.join(format!("{}.sample", name));

    if active_path.exists() {
        Ok(std::fs::read_to_string(&active_path)?)
    } else if sample_path.exists() {
        Ok(std::fs::read_to_string(&sample_path)?)
    } else {
        Err(AppError::NotFound(format!("Hook '{}' not found", name)))
    }
}
