use tauri::{AppHandle, Emitter, State};

use crate::AppError;
use crate::db::Database;
use crate::models::{BatchResult, BranchInfo, CommitInfo, GitFileEntry, GitStatus, MergeResult, ProjectDetail, StashInfo};
use crate::services::GitService;

use super::{emit_op_done, emit_op_error, emit_op_start, next_op_id, try_update_activity};

fn get_project_detail_for_path(db: &Database, path: &str) -> Result<ProjectDetail, AppError> {
    let project = db.get_project_by_path(path)?;
    let group = db.get_project_group(&project.id)?;
    GitService::get_project_detail(&project, group)
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
) -> Result<ProjectDetail, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "switch_branch", &path);

    let db = db.inner().clone();
    let path_clone = path.clone();
    let branch_clone = branch.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<ProjectDetail, AppError> {
        GitService::switch_branch(&path_clone, &branch_clone)?;
        let detail = get_project_detail_for_path(&db, &path_clone)?;
        try_update_activity(&db, &detail.project.id, detail.project.last_commit_hash.as_deref());
        Ok(detail)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => emit_op_done(&app_clone, op_id, "switch_branch", &path),
        Err(e) => emit_op_error(&app_clone, op_id, "switch_branch", &path, &e.to_string()),
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
        try_update_activity(&db, &detail.project.id, detail.project.last_commit_hash.as_deref());
        Ok(detail)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_get_log(path: String, limit: Option<usize>, offset: Option<usize>) -> Result<Vec<CommitInfo>, AppError> {
    tokio::task::spawn_blocking(move || -> Result<Vec<CommitInfo>, AppError> {
        GitService::get_log(&path, offset.unwrap_or(0), limit.unwrap_or(50))
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
pub async fn git_stage_all(path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        GitService::stage_all(&path)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_unstage_all(path: String) -> Result<(), AppError> {
    tokio::task::spawn_blocking(move || -> Result<(), AppError> {
        GitService::unstage_all(&path)
    })
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
) -> Result<String, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "commit", &path);

    let db = db.inner().clone();
    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        let hash = GitService::commit(&path_clone, &message)?;
        if let Ok(project) = db.get_project_by_path(&path_clone) {
            try_update_activity(&db, &project.id, Some(hash.as_str()));
        }
        Ok(hash)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => emit_op_done(&app_clone, op_id, "commit", &path),
        Err(e) => emit_op_error(&app_clone, op_id, "commit", &path, &e.to_string()),
    }
    result
}

#[tauri::command]
pub async fn git_stash(path: String, message: Option<String>, app: AppHandle) -> Result<String, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "stash", &path);

    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        GitService::stash(&path_clone, message.as_deref())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => emit_op_done(&app_clone, op_id, "stash", &path),
        Err(e) => emit_op_error(&app_clone, op_id, "stash", &path, &e.to_string()),
    }
    result
}

#[tauri::command]
pub async fn git_stash_apply(path: String, index: usize, app: AppHandle) -> Result<String, AppError> {
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
        Ok(_) => emit_op_done(&app_clone, op_id, "stash_apply", &path),
        Err(e) => emit_op_error(&app_clone, op_id, "stash_apply", &path, &e.to_string()),
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
pub async fn merge_branch(path: String, branch: String, app: AppHandle) -> Result<MergeResult, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "merge", &path);

    let path_clone = path.clone();
    let branch_clone = branch.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<MergeResult, AppError> {
        GitService::merge_branch(&path_clone, &branch_clone)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(r) if r.success => emit_op_done(&app_clone, op_id, "merge", &path),
        Ok(r) => emit_op_error(&app_clone, op_id, "merge", &path, &r.message),
        Err(e) => emit_op_error(&app_clone, op_id, "merge", &path, &e.to_string()),
    }
    result
}

// ── Network operations (async via spawn_blocking + CLI subprocess) ────

#[tauri::command]
pub async fn git_push(
    path: String,
    branch: Option<String>,
    app: AppHandle,
) -> Result<String, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "push", &path);

    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        GitService::push(&path_clone, branch.as_deref())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => emit_op_done(&app_clone, op_id, "push", &path),
        Err(e) => emit_op_error(&app_clone, op_id, "push", &path, &e.to_string()),
    }
    result
}

#[tauri::command]
pub async fn git_pull(path: String, app: AppHandle) -> Result<String, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "pull", &path);

    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        GitService::pull(&path_clone)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => emit_op_done(&app_clone, op_id, "pull", &path),
        Err(e) => emit_op_error(&app_clone, op_id, "pull", &path, &e.to_string()),
    }
    result
}

#[tauri::command]
pub async fn git_fetch(path: String, app: AppHandle) -> Result<String, AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "fetch", &path);

    let path_clone = path.clone();
    let app_clone = app.clone();

    let result = tokio::task::spawn_blocking(move || -> Result<String, AppError> {
        GitService::fetch(&path_clone)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;

    match &result {
        Ok(_) => emit_op_done(&app_clone, op_id, "fetch", &path),
        Err(e) => emit_op_error(&app_clone, op_id, "fetch", &path, &e.to_string()),
    }
    result
}

#[tauri::command]
pub async fn git_stash_pop(path: String, index: Option<usize>, app: AppHandle) -> Result<String, AppError> {
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
        Ok(_) => emit_op_done(&app_clone, op_id, "stash_pop", &path),
        Err(e) => emit_op_error(&app_clone, op_id, "stash_pop", &path, &e.to_string()),
    }
    result
}

#[tauri::command]
pub async fn git_stash_list(path: String) -> Result<Vec<StashInfo>, AppError> {
    tokio::task::spawn_blocking(move || GitService::get_stash_list(&path))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn git_stash_drop(path: String, index: usize, app: AppHandle) -> Result<(), AppError> {
    let op_id = next_op_id();
    emit_op_start(&app, op_id, "stash_drop", &path);
    let path_clone = path.clone();
    let app_clone = app.clone();
    let result = tokio::task::spawn_blocking(move || GitService::stash_drop(&path_clone, index))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?;
    match &result {
        Ok(_) => emit_op_done(&app_clone, op_id, "stash_drop", &path),
        Err(e) => emit_op_error(&app_clone, op_id, "stash_drop", &path, &e.to_string()),
    }
    result
}

// ── Batch operations: non-blocking, results stream via events ──────────

fn run_batch_sync(
    app: &AppHandle,
    db: &Database,
    label: &str,
    group_id: Option<&str>,
    op: fn(&[String]) -> Vec<(String, Result<String, AppError>)>,
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
        run_batch_sync(&app_clone, &db, "fetch", group_id.as_deref(), GitService::fetch_all_projects)
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
        run_batch_sync(&app_clone, &db, "pull", group_id.as_deref(), GitService::pull_all_projects)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

// ── Cancellation ──────────────────────────────────────────────────────

use crate::commands::ActiveOps;

#[tauri::command]
pub async fn cancel_git_op(id: u64, active_ops: State<'_, ActiveOps>) -> Result<(), AppError> {
    if let Some(flag) = active_ops.get(&id) {
        flag.store(false, std::sync::atomic::Ordering::SeqCst);
    }
    Ok(())
}
