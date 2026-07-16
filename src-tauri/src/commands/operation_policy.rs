use serde::{Deserialize, Serialize};

use crate::AppError;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OperationRisk {
    Destructive,
    HistoryRewrite,
    BatchDestructive,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OperationPolicy {
    pub operation: String,
    pub risk: OperationRisk,
    pub title: String,
    pub description: String,
    pub confirm_label: String,
    pub requires_confirmation: bool,
    pub allow_skip_confirmation: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OperationTarget {
    pub path: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct OperationPreview {
    pub policy: OperationPolicy,
    pub targets: Vec<OperationTarget>,
}

fn policy(operation: &str) -> Result<OperationPolicy, AppError> {
    let (risk, title, description, confirm_label) = match operation {
        "git_reset" => (
            OperationRisk::HistoryRewrite,
            "Reset repository",
            "This can rewrite history and discard uncommitted work depending on the selected reset mode.",
            "Reset",
        ),
        "git_clean" => (
            OperationRisk::Destructive,
            "Delete untracked files",
            "This permanently deletes the listed untracked files from the repository.",
            "Delete files",
        ),
        "git_stash_drop" => (
            OperationRisk::Destructive,
            "Drop stash",
            "This permanently removes the selected stash entry.",
            "Drop stash",
        ),
        "delete_branch" | "delete_merged_branches" => (
            OperationRisk::Destructive,
            "Delete branch",
            "This permanently deletes the selected local branch or branches.",
            "Delete branch",
        ),
        "git_remove_worktree" => (
            OperationRisk::Destructive,
            "Remove worktree",
            "This removes the selected worktree directory from Git management.",
            "Remove worktree",
        ),
        "git_delete_tag" => (
            OperationRisk::Destructive,
            "Delete tag",
            "This permanently removes the selected local Git tag.",
            "Delete tag",
        ),
        "git_apply_patch" => (
            OperationRisk::HistoryRewrite,
            "Apply patch",
            "This writes the patch changes into the repository working tree and may create conflicts.",
            "Apply patch",
        ),
        "git_rebase" | "git_squash_commits" | "git_drop_commit" | "git_reword_commit" => (
            OperationRisk::HistoryRewrite,
            "Rewrite history",
            "This rewrites commit history and should not be used on shared commits without coordination.",
            "Rewrite history",
        ),
        "git_cherry_pick" | "git_cherry_pick_range" => (
            OperationRisk::HistoryRewrite,
            "Cherry-pick commits",
            "This applies commits to the current branch and may create conflicts.",
            "Cherry-pick",
        ),
        "task_workspace_execute" | "push_all" | "push_ahead" | "sync_all" => (
            OperationRisk::BatchDestructive,
            "Run batch Git operation",
            "This writes repository state across every listed project. Review the exact project set before continuing.",
            "Run batch operation",
        ),
        _ => {
            return Err(AppError::NotFound(format!(
                "No destructive-operation policy is registered for '{}'",
                operation
            )));
        }
    };

    Ok(OperationPolicy {
        operation: operation.to_string(),
        risk,
        title: title.to_string(),
        description: description.to_string(),
        confirm_label: confirm_label.to_string(),
        requires_confirmation: true,
        allow_skip_confirmation: false,
    })
}

#[tauri::command]
pub fn get_operation_preview(
    operation: String,
    targets: Vec<OperationTarget>,
) -> Result<OperationPreview, AppError> {
    if targets.is_empty() {
        return Err(AppError::Other(
            "A destructive operation must name at least one affected target".to_string(),
        ));
    }

    Ok(OperationPreview {
        policy: policy(&operation)?,
        targets,
    })
}

#[cfg(test)]
mod tests {
    use super::{get_operation_preview, OperationRisk, OperationTarget};

    #[test]
    fn destructive_operations_always_require_confirmation_without_skip() {
        let preview = get_operation_preview(
            "git_clean".to_string(),
            vec![OperationTarget {
                path: "/tmp/example".to_string(),
                label: "notes.txt".to_string(),
            }],
        )
        .unwrap();

        assert_eq!(preview.policy.risk, OperationRisk::Destructive);
        assert!(preview.policy.requires_confirmation);
        assert!(!preview.policy.allow_skip_confirmation);
    }

    #[test]
    fn rejects_unknown_operations_and_empty_impact_lists() {
        assert!(get_operation_preview("unknown".to_string(), vec![]).is_err());
        assert!(get_operation_preview(
            "unknown".to_string(),
            vec![OperationTarget {
                path: "/tmp/example".to_string(),
                label: "example".to_string(),
            }]
        )
        .is_err());
    }
}
