use chrono::Utc;
use serde::Deserialize;
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::models::{
    TaskStrategy, TaskWorkspace, TaskWorkspaceDetail, TaskWorkspaceEntry, TaskWorkspaceStatus,
};
use crate::AppError;

#[derive(Debug, Deserialize)]
pub struct CreateTaskWorkspaceInput {
    pub name: String,
    pub description: Option<String>,
    pub project_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskWorkspaceInput {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTaskWorkspaceEntryInput {
    pub strategy: TaskStrategy,
    pub target_branch: Option<String>,
    pub base_branch: Option<String>,
    pub worktree_path: Option<String>,
    pub sort_order: i64,
}

fn required_name(name: &str) -> Result<&str, AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Other(
            "Task Workspace name is required".to_string(),
        ));
    }
    if trimmed.len() > 120 {
        return Err(AppError::Other(
            "Task Workspace name must be at most 120 characters".to_string(),
        ));
    }
    Ok(trimmed)
}

#[tauri::command]
pub fn create_task_workspace(
    input: CreateTaskWorkspaceInput,
    db: State<'_, Database>,
) -> Result<TaskWorkspaceDetail, AppError> {
    let name = required_name(&input.name)?;
    let now = Utc::now().to_rfc3339();
    let workspace = TaskWorkspace {
        id: Uuid::new_v4().to_string(),
        name: name.to_string(),
        description: input
            .description
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        status: TaskWorkspaceStatus::Active,
        created_at: now.clone(),
        updated_at: now.clone(),
        last_opened_at: Some(now.clone()),
    };

    db.insert_task_workspace(&workspace)?;
    for (index, project_id) in input.project_ids.into_iter().enumerate() {
        db.get_project_by_id(&project_id)?;
        db.insert_task_workspace_entry(&TaskWorkspaceEntry {
            id: Uuid::new_v4().to_string(),
            workspace_id: workspace.id.clone(),
            project_id,
            sort_order: index as i64,
            strategy: TaskStrategy::RetainCurrent,
            target_branch: None,
            base_branch: None,
            worktree_path: None,
            created_at: now.clone(),
            updated_at: now.clone(),
        })?;
    }

    db.get_task_workspace_detail(&workspace.id)
}

#[tauri::command]
pub fn list_task_workspaces(
    include_archived: Option<bool>,
    db: State<'_, Database>,
) -> Result<Vec<TaskWorkspace>, AppError> {
    db.list_task_workspaces(include_archived.unwrap_or(false))
}

#[tauri::command]
pub fn get_task_workspace(
    id: String,
    db: State<'_, Database>,
) -> Result<TaskWorkspaceDetail, AppError> {
    db.touch_task_workspace(&id)?;
    db.get_task_workspace_detail(&id)
}

#[tauri::command]
pub fn update_task_workspace(
    id: String,
    input: UpdateTaskWorkspaceInput,
    db: State<'_, Database>,
) -> Result<TaskWorkspace, AppError> {
    let name = required_name(&input.name)?;
    db.update_task_workspace(
        &id,
        name,
        input
            .description
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty()),
    )
}

#[tauri::command]
pub fn archive_task_workspace(id: String, db: State<'_, Database>) -> Result<(), AppError> {
    db.archive_task_workspace(&id)
}

#[tauri::command]
pub fn add_task_workspace_project(
    workspace_id: String,
    project_id: String,
    db: State<'_, Database>,
) -> Result<TaskWorkspaceDetail, AppError> {
    db.get_task_workspace(&workspace_id)?;
    db.get_project_by_id(&project_id)?;
    let next_order = db
        .get_task_workspace_entries(&workspace_id)?
        .into_iter()
        .map(|entry| entry.entry.sort_order)
        .max()
        .unwrap_or(-1)
        + 1;
    let now = Utc::now().to_rfc3339();
    db.insert_task_workspace_entry(&TaskWorkspaceEntry {
        id: Uuid::new_v4().to_string(),
        workspace_id: workspace_id.clone(),
        project_id,
        sort_order: next_order,
        strategy: TaskStrategy::RetainCurrent,
        target_branch: None,
        base_branch: None,
        worktree_path: None,
        created_at: now.clone(),
        updated_at: now,
    })?;
    db.get_task_workspace_detail(&workspace_id)
}

#[tauri::command]
pub fn remove_task_workspace_project(
    entry_id: String,
    workspace_id: String,
    db: State<'_, Database>,
) -> Result<TaskWorkspaceDetail, AppError> {
    db.delete_task_workspace_entry(&entry_id)?;
    db.get_task_workspace_detail(&workspace_id)
}

#[tauri::command]
pub fn reorder_task_workspace_entries(
    workspace_id: String,
    entry_ids: Vec<String>,
    db: State<'_, Database>,
) -> Result<TaskWorkspaceDetail, AppError> {
    let current = db.get_task_workspace_entries(&workspace_id)?;
    if current.len() != entry_ids.len()
        || current
            .iter()
            .any(|entry| !entry_ids.contains(&entry.entry.id))
    {
        return Err(AppError::Other(
            "Task Workspace reorder must contain every current entry exactly once".to_string(),
        ));
    }
    db.reorder_task_workspace_entries(&workspace_id, &entry_ids)?;
    db.get_task_workspace_detail(&workspace_id)
}

#[tauri::command]
pub fn update_task_workspace_entry(
    entry_id: String,
    workspace_id: String,
    input: UpdateTaskWorkspaceEntryInput,
    db: State<'_, Database>,
) -> Result<TaskWorkspaceDetail, AppError> {
    let current = db
        .get_task_workspace_entries(&workspace_id)?
        .into_iter()
        .find(|entry| entry.entry.id == entry_id)
        .ok_or_else(|| AppError::NotFound("Task Workspace project not found".to_string()))?;
    let mut entry = current.entry;
    entry.strategy = input.strategy;
    entry.target_branch = input
        .target_branch
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    entry.base_branch = input
        .base_branch
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    entry.worktree_path = input
        .worktree_path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    entry.sort_order = input.sort_order;
    db.update_task_workspace_entry(&entry)?;
    db.get_task_workspace_detail(&workspace_id)
}

fn active_git_operation(repo: &git2::Repository) -> Option<String> {
    let git_dir = repo.path();
    [
        ("MERGE_HEAD", "merge"),
        ("CHERRY_PICK_HEAD", "cherry-pick"),
        ("REVERT_HEAD", "revert"),
        ("BISECT_LOG", "bisect"),
        ("rebase-merge", "rebase"),
        ("rebase-apply", "rebase"),
    ]
    .into_iter()
    .find_map(|(marker, operation)| git_dir.join(marker).exists().then(|| operation.to_string()))
}

#[tauri::command]
pub async fn preflight_task_workspace(
    workspace_id: String,
    db: State<'_, Database>,
) -> Result<crate::models::TaskWorkspacePlan, AppError> {
    let detail = db.get_task_workspace_detail(&workspace_id)?;
    let entries = tokio::task::spawn_blocking(move || {
        detail
            .entries
            .into_iter()
            .map(|entry| {
                let repo = match git2::Repository::open(&entry.project.path) {
                    Ok(repo) => repo,
                    Err(error) => {
                        return crate::models::TaskPreflightEntry {
                            entry,
                            observed_branch: None,
                            observed_head: None,
                            git_status: None,
                            active_operation: None,
                            status: crate::models::PreflightStatus::Unavailable,
                            reason_codes: vec!["repository_unavailable".to_string()],
                            reasons: vec![format!("Repository is unavailable: {}", error)],
                            recovery_guidance: vec!["Reconnect the registered project path before continuing.".to_string()],
                        };
                    }
                };
                let status = crate::services::GitService::get_status(&repo).ok();
                let branch = repo.head().ok().and_then(|head| head.shorthand().map(str::to_string));
                let head = repo.head().ok().and_then(|head| head.target().map(|oid| oid.to_string()));
                let active_operation = active_git_operation(&repo);
                let mut result = crate::models::PreflightStatus::Ready;
                let mut reason_codes = Vec::new();
                let mut reasons = Vec::new();
                let mut recovery_guidance = Vec::new();
                let dirty = status.as_ref().is_some_and(|value| value.modified + value.staged + value.untracked > 0);

                if let Some(operation) = &active_operation {
                    result = crate::models::PreflightStatus::Blocked;
                    reason_codes.push("active_git_operation".to_string());
                    reasons.push(format!("Repository has an active {} operation.", operation));
                    recovery_guidance.push(format!("Finish or abort the active {} operation first.", operation));
                }

                match entry.entry.strategy {
                    TaskStrategy::RetainCurrent => {}
                    TaskStrategy::SwitchExisting => {
                        let target = entry.entry.target_branch.as_deref().unwrap_or("");
                        let exists = !target.is_empty() && repo.find_branch(target, git2::BranchType::Local).is_ok();
                        if !exists {
                            result = crate::models::PreflightStatus::Blocked;
                            reason_codes.push("target_branch_missing".to_string());
                            reasons.push("The selected target branch does not exist locally.".to_string());
                            recovery_guidance.push("Fetch or select an existing local branch.".to_string());
                        } else if dirty && result == crate::models::PreflightStatus::Ready {
                            result = crate::models::PreflightStatus::NeedsDecision;
                            reason_codes.push("dirty_worktree".to_string());
                            reasons.push("Switching branches can disrupt uncommitted work.".to_string());
                            recovery_guidance.push("Use a worktree, stash changes manually, or keep the current branch.".to_string());
                        }
                    }
                    TaskStrategy::CreateBranch => {
                        let target = entry.entry.target_branch.as_deref().unwrap_or("");
                        let base = entry.entry.base_branch.as_deref().unwrap_or("");
                        if target.is_empty() || base.is_empty() || repo.find_branch(base, git2::BranchType::Local).is_err() {
                            result = crate::models::PreflightStatus::Blocked;
                            reason_codes.push("base_branch_missing".to_string());
                            reasons.push("A target branch and an existing base branch are required.".to_string());
                            recovery_guidance.push("Choose a valid local base branch before continuing.".to_string());
                        } else if repo.find_branch(target, git2::BranchType::Local).is_ok() && result == crate::models::PreflightStatus::Ready {
                            result = crate::models::PreflightStatus::Warning;
                            reason_codes.push("target_branch_exists".to_string());
                            reasons.push("The target branch already exists and will not be created again.".to_string());
                        }
                    }
                    TaskStrategy::CreateWorktree => {
                        let worktree_path = entry.entry.worktree_path.as_deref().unwrap_or("");
                        let target_branch = entry.entry.target_branch.as_deref().unwrap_or("");
                        if worktree_path.is_empty() || target_branch.is_empty() {
                            result = crate::models::PreflightStatus::NeedsDecision;
                            reason_codes.push("worktree_configuration_missing".to_string());
                            reasons.push("A worktree path and target branch are required for this strategy.".to_string());
                            recovery_guidance.push("Choose a target path and branch before continuing.".to_string());
                        } else if std::path::Path::new(worktree_path).exists() {
                            result = crate::models::PreflightStatus::Blocked;
                            reason_codes.push("worktree_path_exists".to_string());
                            reasons.push("The requested worktree path already exists.".to_string());
                            recovery_guidance.push("Choose another path or use the reuse-worktree strategy.".to_string());
                        } else if crate::services::GitService::list_worktrees(&entry.project.path).unwrap_or_default().iter().any(|worktree| worktree.branch.as_deref() == Some(target_branch)) {
                            result = crate::models::PreflightStatus::Blocked;
                            reason_codes.push("worktree_branch_conflict".to_string());
                            reasons.push("The target branch is already checked out in another worktree.".to_string());
                            recovery_guidance.push("Choose another branch or reuse the existing worktree.".to_string());
                        }
                    }
                    TaskStrategy::ReuseWorktree => {
                        let worktree_path = entry.entry.worktree_path.as_deref().unwrap_or("");
                        if worktree_path.is_empty() || !std::path::Path::new(worktree_path).exists() {
                            result = crate::models::PreflightStatus::Blocked;
                            reason_codes.push("worktree_path_missing".to_string());
                            reasons.push("The configured worktree path does not exist.".to_string());
                            recovery_guidance.push("Choose an existing worktree path or create a new one.".to_string());
                        }
                    }
                }

                crate::models::TaskPreflightEntry {
                    entry,
                    observed_branch: branch,
                    observed_head: head,
                    git_status: status,
                    active_operation,
                    status: result,
                    reason_codes,
                    reasons,
                    recovery_guidance,
                }
            })
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|error| AppError::Other(format!("Task preflight failed: {}", error)))?;

    Ok(crate::models::TaskWorkspacePlan {
        workspace_id,
        generated_at: Utc::now().to_rfc3339(),
        entries,
    })
}

fn branch_and_head(repo: &git2::Repository) -> (Option<String>, Option<String>) {
    let branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(str::to_string));
    let head = repo
        .head()
        .ok()
        .and_then(|head| head.target().map(|oid| oid.to_string()));
    (branch, head)
}

#[tauri::command]
pub async fn execute_task_workspace_plan(
    plan: crate::models::TaskWorkspacePlan,
    continue_on_failure: Option<bool>,
    db: State<'_, Database>,
) -> Result<crate::models::TaskWorkspaceExecution, AppError> {
    let continue_on_failure = continue_on_failure.unwrap_or(false);
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        let mut outcomes = Vec::new();
        let mut stopped = false;

        for planned in plan.entries {
            let entry = planned.entry.entry;
            let project = planned.entry.project;
            let now = Utc::now().to_rfc3339();
            let mut outcome = crate::models::TaskWorkspaceOutcome {
                id: Uuid::new_v4().to_string(),
                workspace_id: plan.workspace_id.clone(),
                entry_id: entry.id.clone(),
                state: crate::models::TaskExecutionState::Pending,
                message: String::new(),
                start_branch: planned.observed_branch.clone(),
                start_head: planned.observed_head.clone(),
                result_branch: None,
                worktree_path: entry.worktree_path.clone(),
                created_at: now,
            };

            if stopped {
                outcome.state = crate::models::TaskExecutionState::Skipped;
                outcome.message = "Skipped because an earlier repository failed.".to_string();
            } else if !matches!(planned.status, crate::models::PreflightStatus::Ready | crate::models::PreflightStatus::Warning) {
                outcome.state = crate::models::TaskExecutionState::Skipped;
                outcome.message = format!("Preflight is {:?}; resolve blockers before execution.", planned.status);
                stopped = !continue_on_failure;
            } else {
                match git2::Repository::open(&project.path) {
                    Err(error) => {
                        outcome.state = crate::models::TaskExecutionState::Failed;
                        outcome.message = format!("Repository is unavailable: {}", error);
                        stopped = !continue_on_failure;
                    }
                    Ok(repo) => {
                        let (current_branch, current_head) = branch_and_head(&repo);
                        if current_branch != planned.observed_branch || current_head != planned.observed_head {
                            outcome.state = crate::models::TaskExecutionState::Failed;
                            outcome.message = "Repository state changed after preflight; refresh the plan before executing.".to_string();
                            stopped = !continue_on_failure;
                        } else {
                            outcome.state = crate::models::TaskExecutionState::Running;
                            let operation = match entry.strategy {
                                TaskStrategy::RetainCurrent => Ok("Kept current branch".to_string()),
                                TaskStrategy::SwitchExisting => entry.target_branch.as_deref()
                                    .ok_or_else(|| AppError::Other("Target branch is required".to_string()))
                                    .and_then(|branch| crate::services::GitService::switch_branch(&project.path, branch).map(|_| format!("Switched to {}", branch))),
                                TaskStrategy::CreateBranch => {
                                    let target = entry.target_branch.as_deref().ok_or_else(|| AppError::Other("Target branch is required".to_string()))?;
                                    let base = entry.base_branch.as_deref().ok_or_else(|| AppError::Other("Base branch is required".to_string()))?;
                                    if repo.find_branch(target, git2::BranchType::Local).is_err() {
                                        crate::services::GitService::create_branch(&project.path, target, Some(base))?;
                                    }
                                    crate::services::GitService::switch_branch(&project.path, target)?;
                                    Ok(format!("Prepared branch {}", target))
                                }
                                TaskStrategy::CreateWorktree => {
                                    let worktree_path = entry.worktree_path.as_deref().ok_or_else(|| AppError::Other("Worktree path is required".to_string()))?;
                                    let name = std::path::Path::new(worktree_path).file_name().and_then(|value| value.to_str()).ok_or_else(|| AppError::Other("Worktree path must end in a directory name".to_string()))?;
                                    crate::services::GitService::add_worktree_at(&project.path, std::path::Path::new(worktree_path), name, entry.target_branch.as_deref(), true)?;
                                    Ok(format!("Created worktree at {}", worktree_path))
                                }
                                TaskStrategy::ReuseWorktree => {
                                    let worktree_path = entry.worktree_path.as_deref().ok_or_else(|| AppError::Other("Worktree path is required".to_string()))?;
                                    if std::path::Path::new(worktree_path).exists() { Ok(format!("Reused worktree {}", worktree_path)) } else { Err(AppError::NotFound("Configured worktree path does not exist".to_string())) }
                                }
                            };
                            match operation {
                                Ok(message) => {
                                    let repo = git2::Repository::open(&project.path).ok();
                                    outcome.result_branch = repo.as_ref().and_then(|value| branch_and_head(value).0);
                                    outcome.state = crate::models::TaskExecutionState::Succeeded;
                                    outcome.message = message;
                                }
                                Err(error) => {
                                    outcome.state = crate::models::TaskExecutionState::Failed;
                                    outcome.message = format!("Execution failed: {}. Starting branch was {:?}.", error, outcome.start_branch);
                                    stopped = !continue_on_failure;
                                }
                            }
                        }
                    }
                }
            }
            db.insert_task_workspace_outcome(&outcome)?;
            outcomes.push(outcome);
        }
        Ok(crate::models::TaskWorkspaceExecution { workspace_id: plan.workspace_id, executed_at: Utc::now().to_rfc3339(), outcomes })
    }).await.map_err(|error| AppError::Other(format!("Task execution failed: {}", error)))?
}

#[tauri::command]
pub fn list_task_workspace_outcomes(
    workspace_id: String,
    db: State<'_, Database>,
) -> Result<Vec<crate::models::TaskWorkspaceOutcome>, AppError> {
    db.list_task_workspace_outcomes(&workspace_id)
}
