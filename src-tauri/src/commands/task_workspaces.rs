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
        return Err(AppError::Other(crate::i18n::tl(
            "backend.taskws.nameRequired",
            &[],
        )));
    }
    if trimmed.len() > 120 {
        return Err(AppError::Other(crate::i18n::tl(
            "backend.taskws.nameTooLong",
            &[],
        )));
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
        return Err(AppError::Other(crate::i18n::tl(
            "backend.taskws.reorderMismatch",
            &[],
        )));
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
        .ok_or_else(|| {
            AppError::NotFound(crate::i18n::tl("backend.taskws.projectNotFound", &[]))
        })?;
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
                            reasons: vec![crate::i18n::tl(
                                "backend.taskws.repoUnavailable",
                                &[("error", error.to_string().as_str())],
                            )],
                            recovery_guidance: vec![crate::i18n::tl(
                                "backend.taskws.repoReconnect",
                                &[],
                            )],
                        };
                    }
                };
                let status = crate::services::GitService::get_status(&repo).ok();
                let branch = repo
                    .head()
                    .ok()
                    .and_then(|head| head.shorthand().map(str::to_string));
                let head = repo
                    .head()
                    .ok()
                    .and_then(|head| head.target().map(|oid| oid.to_string()));
                let active_operation = active_git_operation(&repo);
                let mut result = crate::models::PreflightStatus::Ready;
                let mut reason_codes = Vec::new();
                let mut reasons = Vec::new();
                let mut recovery_guidance = Vec::new();
                let dirty = status
                    .as_ref()
                    .is_some_and(|value| value.modified + value.staged + value.untracked > 0);

                if let Some(operation) = &active_operation {
                    result = crate::models::PreflightStatus::Blocked;
                    reason_codes.push("active_git_operation".to_string());
                    reasons.push(crate::i18n::tl(
                        "backend.taskws.activeOp",
                        &[("operation", operation.as_str())],
                    ));
                    recovery_guidance.push(crate::i18n::tl(
                        "backend.taskws.activeOpResolve",
                        &[("operation", operation.as_str())],
                    ));
                }

                match entry.entry.strategy {
                    TaskStrategy::RetainCurrent => {}
                    TaskStrategy::SwitchExisting => {
                        let target = entry.entry.target_branch.as_deref().unwrap_or("");
                        let exists = !target.is_empty()
                            && repo.find_branch(target, git2::BranchType::Local).is_ok();
                        if !exists {
                            result = crate::models::PreflightStatus::Blocked;
                            reason_codes.push("target_branch_missing".to_string());
                            reasons.push(crate::i18n::tl("backend.taskws.targetMissing", &[]));
                            recovery_guidance
                                .push(crate::i18n::tl("backend.taskws.targetMissingHint", &[]));
                        } else if dirty && result == crate::models::PreflightStatus::Ready {
                            result = crate::models::PreflightStatus::NeedsDecision;
                            reason_codes.push("dirty_worktree".to_string());
                            reasons.push(crate::i18n::tl("backend.taskws.dirtyWorktree", &[]));
                            recovery_guidance
                                .push(crate::i18n::tl("backend.taskws.dirtyWorktreeHint", &[]));
                        }
                    }
                    TaskStrategy::CreateBranch => {
                        let target = entry.entry.target_branch.as_deref().unwrap_or("");
                        let base = entry.entry.base_branch.as_deref().unwrap_or("");
                        if target.is_empty()
                            || base.is_empty()
                            || repo.find_branch(base, git2::BranchType::Local).is_err()
                        {
                            result = crate::models::PreflightStatus::Blocked;
                            reason_codes.push("base_branch_missing".to_string());
                            reasons.push(crate::i18n::tl("backend.taskws.missingBranches", &[]));
                            recovery_guidance
                                .push(crate::i18n::tl("backend.taskws.missingBranchesHint", &[]));
                        } else if repo.find_branch(target, git2::BranchType::Local).is_ok()
                            && result == crate::models::PreflightStatus::Ready
                        {
                            result = crate::models::PreflightStatus::Warning;
                            reason_codes.push("target_branch_exists".to_string());
                            reasons.push(crate::i18n::tl("backend.taskws.targetExists", &[]));
                        }
                    }
                    TaskStrategy::CreateWorktree => {
                        let worktree_path = entry.entry.worktree_path.as_deref().unwrap_or("");
                        let target_branch = entry.entry.target_branch.as_deref().unwrap_or("");
                        if worktree_path.is_empty() || target_branch.is_empty() {
                            result = crate::models::PreflightStatus::NeedsDecision;
                            reason_codes.push("worktree_configuration_missing".to_string());
                            reasons
                                .push(crate::i18n::tl("backend.taskws.worktreeConfigMissing", &[]));
                            recovery_guidance.push(crate::i18n::tl(
                                "backend.taskws.worktreeConfigMissingHint",
                                &[],
                            ));
                        } else if std::path::Path::new(worktree_path).exists() {
                            result = crate::models::PreflightStatus::Blocked;
                            reason_codes.push("worktree_path_exists".to_string());
                            reasons.push(crate::i18n::tl("backend.taskws.worktreePathExists", &[]));
                            recovery_guidance.push(crate::i18n::tl(
                                "backend.taskws.worktreePathExistsHint",
                                &[],
                            ));
                        } else if crate::services::GitService::list_worktrees(&entry.project.path)
                            .unwrap_or_default()
                            .iter()
                            .any(|worktree| worktree.branch.as_deref() == Some(target_branch))
                        {
                            result = crate::models::PreflightStatus::Blocked;
                            reason_codes.push("worktree_branch_conflict".to_string());
                            reasons.push(crate::i18n::tl(
                                "backend.taskws.worktreeBranchConflict",
                                &[],
                            ));
                            recovery_guidance.push(crate::i18n::tl(
                                "backend.taskws.worktreeBranchConflictHint",
                                &[],
                            ));
                        }
                    }
                    TaskStrategy::ReuseWorktree => {
                        let worktree_path = entry.entry.worktree_path.as_deref().unwrap_or("");
                        if worktree_path.is_empty() || !std::path::Path::new(worktree_path).exists()
                        {
                            result = crate::models::PreflightStatus::Blocked;
                            reason_codes.push("worktree_path_missing".to_string());
                            reasons
                                .push(crate::i18n::tl("backend.taskws.worktreePathMissing", &[]));
                            recovery_guidance.push(crate::i18n::tl(
                                "backend.taskws.worktreePathMissingHint",
                                &[],
                            ));
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
    .map_err(|error| {
        AppError::Other(crate::i18n::tl(
            "backend.taskws.preflightFailed",
            &[("error", error.to_string().as_str())],
        ))
    })?;

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
                outcome.message = crate::i18n::tl("backend.taskws.skippedAfterFailure", &[]);
            } else if !matches!(
                planned.status,
                crate::models::PreflightStatus::Ready | crate::models::PreflightStatus::Warning
            ) {
                outcome.state = crate::models::TaskExecutionState::Skipped;
                outcome.message = crate::i18n::tl(
                    "backend.taskws.preflightBlocked",
                    &[("status", &format!("{:?}", planned.status))],
                );
                stopped = !continue_on_failure;
            } else {
                match git2::Repository::open(&project.path) {
                    Err(error) => {
                        outcome.state = crate::models::TaskExecutionState::Failed;
                        outcome.message = crate::i18n::tl(
                            "backend.taskws.repoUnavailable",
                            &[("error", error.to_string().as_str())],
                        );
                        stopped = !continue_on_failure;
                    }
                    Ok(repo) => {
                        let (current_branch, current_head) = branch_and_head(&repo);
                        if current_branch != planned.observed_branch
                            || current_head != planned.observed_head
                        {
                            outcome.state = crate::models::TaskExecutionState::Failed;
                            outcome.message = crate::i18n::tl("backend.taskws.stateChanged", &[]);
                            stopped = !continue_on_failure;
                        } else {
                            outcome.state = crate::models::TaskExecutionState::Running;
                            let operation = match entry.strategy {
                                TaskStrategy::RetainCurrent => {
                                    Ok(crate::i18n::tl("backend.taskws.keptCurrent", &[]))
                                }
                                TaskStrategy::SwitchExisting => entry
                                    .target_branch
                                    .as_deref()
                                    .ok_or_else(|| {
                                        AppError::Other(crate::i18n::tl(
                                            "backend.taskws.targetRequired",
                                            &[],
                                        ))
                                    })
                                    .and_then(|branch| {
                                        crate::services::GitService::switch_branch(
                                            &project.path,
                                            branch,
                                        )
                                        .map(|_| {
                                            crate::i18n::tl(
                                                "backend.taskws.switched",
                                                &[("branch", branch)],
                                            )
                                        })
                                    }),
                                TaskStrategy::CreateBranch => {
                                    let target =
                                        entry.target_branch.as_deref().ok_or_else(|| {
                                            AppError::Other(crate::i18n::tl(
                                                "backend.taskws.targetRequired",
                                                &[],
                                            ))
                                        })?;
                                    let base = entry.base_branch.as_deref().ok_or_else(|| {
                                        AppError::Other(crate::i18n::tl(
                                            "backend.taskws.baseRequired",
                                            &[],
                                        ))
                                    })?;
                                    if repo.find_branch(target, git2::BranchType::Local).is_err() {
                                        crate::services::GitService::create_branch(
                                            &project.path,
                                            target,
                                            Some(base),
                                        )?;
                                    }
                                    crate::services::GitService::switch_branch(
                                        &project.path,
                                        target,
                                    )?;
                                    Ok(crate::i18n::tl(
                                        "backend.taskws.preparedBranch",
                                        &[("branch", target)],
                                    ))
                                }
                                TaskStrategy::CreateWorktree => {
                                    let worktree_path =
                                        entry.worktree_path.as_deref().ok_or_else(|| {
                                            AppError::Other(crate::i18n::tl(
                                                "backend.taskws.worktreePathRequired",
                                                &[],
                                            ))
                                        })?;
                                    let name = std::path::Path::new(worktree_path)
                                        .file_name()
                                        .and_then(|value| value.to_str())
                                        .ok_or_else(|| {
                                            AppError::Other(crate::i18n::tl(
                                                "backend.taskws.worktreePathMustEndInDir",
                                                &[],
                                            ))
                                        })?;
                                    crate::services::GitService::add_worktree_at(
                                        &project.path,
                                        std::path::Path::new(worktree_path),
                                        name,
                                        entry.target_branch.as_deref(),
                                        true,
                                    )?;
                                    Ok(crate::i18n::tl(
                                        "backend.taskws.createdWorktree",
                                        &[("path", worktree_path)],
                                    ))
                                }
                                TaskStrategy::ReuseWorktree => {
                                    let worktree_path =
                                        entry.worktree_path.as_deref().ok_or_else(|| {
                                            AppError::Other(crate::i18n::tl(
                                                "backend.taskws.worktreePathRequired",
                                                &[],
                                            ))
                                        })?;
                                    if std::path::Path::new(worktree_path).exists() {
                                        Ok(crate::i18n::tl(
                                            "backend.taskws.reusedWorktree",
                                            &[("path", worktree_path)],
                                        ))
                                    } else {
                                        Err(AppError::NotFound(crate::i18n::tl(
                                            "backend.taskws.worktreePathMissing",
                                            &[],
                                        )))
                                    }
                                }
                            };
                            match operation {
                                Ok(message) => {
                                    let repo = git2::Repository::open(&project.path).ok();
                                    outcome.result_branch =
                                        repo.as_ref().and_then(|value| branch_and_head(value).0);
                                    outcome.state = crate::models::TaskExecutionState::Succeeded;
                                    outcome.message = message;
                                }
                                Err(error) => {
                                    outcome.state = crate::models::TaskExecutionState::Failed;
                                    outcome.message = crate::i18n::tl(
                                        "backend.taskws.executionFailed",
                                        &[
                                            ("error", error.to_string().as_str()),
                                            (
                                                "start_branch",
                                                &format!("{:?}", outcome.start_branch),
                                            ),
                                        ],
                                    );
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
        Ok(crate::models::TaskWorkspaceExecution {
            workspace_id: plan.workspace_id,
            executed_at: Utc::now().to_rfc3339(),
            outcomes,
        })
    })
    .await
    .map_err(|error| {
        AppError::Other(crate::i18n::tl(
            "backend.taskws.taskExecutionFailed",
            &[("error", error.to_string().as_str())],
        ))
    })?
}

#[tauri::command]
pub fn list_task_workspace_outcomes(
    workspace_id: String,
    db: State<'_, Database>,
) -> Result<Vec<crate::models::TaskWorkspaceOutcome>, AppError> {
    db.list_task_workspace_outcomes(&workspace_id)
}
