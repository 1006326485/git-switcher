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

/// Resolves the confirmation copy for one operation from the catalogue.
///
/// Each arm only names its risk and the catalogue stem; the three strings
/// come from `backend.policy.<stem>{Title,Desc,Confirm}` so the dialog copy
/// follows the UI language.
fn policy(operation: &str) -> Result<OperationPolicy, AppError> {
    let (risk, stem) = match operation {
        "git_reset" => (OperationRisk::HistoryRewrite, "resetRepository"),
        "git_clean" => (OperationRisk::Destructive, "deleteUntrackedFiles"),
        "git_stash_drop" => (OperationRisk::Destructive, "dropStash"),
        "delete_branch" | "delete_merged_branches" => (OperationRisk::Destructive, "deleteBranch"),
        "git_remove_worktree" => (OperationRisk::Destructive, "removeWorktree"),
        "git_delete_tag" => (OperationRisk::Destructive, "deleteTag"),
        "git_apply_patch" => (OperationRisk::HistoryRewrite, "applyPatch"),
        "git_rebase" | "git_squash_commits" | "git_drop_commit" | "git_reword_commit"
        | "git_amend" => (OperationRisk::HistoryRewrite, "rewriteHistory"),
        "git_revert" => (OperationRisk::HistoryRewrite, "revertCommit"),
        "git_push_force" => (OperationRisk::HistoryRewrite, "forcePush"),
        "git_delete_remote_branch" => (OperationRisk::Destructive, "deleteRemoteBranch"),
        "git_cherry_pick" | "git_cherry_pick_range" => {
            (OperationRisk::HistoryRewrite, "cherryPickCommits")
        }
        "task_workspace_execute" | "push_all" | "push_ahead" | "sync_all" => {
            (OperationRisk::BatchDestructive, "runBatchGitOperation")
        }
        _ => {
            return Err(AppError::NotFound(crate::i18n::tl(
                "backend.policy.unknownPolicy",
                &[("operation", operation)],
            )));
        }
    };

    let title_key = format!("backend.policy.{}Title", stem);
    let description_key = format!("backend.policy.{}Desc", stem);
    let confirm_label_key = format!("backend.policy.{}Confirm", stem);

    Ok(OperationPolicy {
        operation: operation.to_string(),
        risk,
        title: crate::i18n::tl(&title_key, &[]),
        description: crate::i18n::tl(&description_key, &[]),
        confirm_label: crate::i18n::tl(&confirm_label_key, &[]),
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
        return Err(AppError::Other(crate::i18n::tl(
            "backend.policy.emptyImpact",
            &[],
        )));
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

    #[test]
    fn every_policy_stem_resolves_in_both_languages() {
        use crate::i18n;
        let stems = [
            "resetRepository",
            "deleteUntrackedFiles",
            "dropStash",
            "deleteBranch",
            "removeWorktree",
            "deleteTag",
            "applyPatch",
            "rewriteHistory",
            "revertCommit",
            "forcePush",
            "deleteRemoteBranch",
            "cherryPickCommits",
            "runBatchGitOperation",
        ];
        for stem in stems {
            for suffix in ["Title", "Desc", "Confirm"] {
                let key = format!("backend.policy.{}{}", stem, suffix);
                let en = i18n::t("en", &key, &[]);
                assert_ne!(en, key, "missing English copy for {key}");
                assert_ne!(
                    i18n::t("zh-CN", &key, &[]),
                    key,
                    "missing zh-CN copy for {key}"
                );
            }
        }
        // The catalogue is the source of the English copy, so pin it byte for
        // byte — a locale edit must not silently change what users see.
        assert_eq!(
            i18n::t("en", "backend.policy.resetRepositoryTitle", &[]),
            "Reset repository"
        );
        assert_eq!(
            i18n::t("en", "backend.policy.forcePushDesc", &[]),
            "This rewrites the remote branch with --force-with-lease. Commits that exist only on the remote are discarded unless they match the remote-tracking ref."
        );
        assert_eq!(
            i18n::t("en", "backend.policy.cherryPickCommitsConfirm", &[]),
            "Cherry-pick"
        );
        assert_eq!(
            i18n::t(
                "en",
                "backend.policy.unknownPolicy",
                &[("operation", "git_whatever")]
            ),
            "No destructive-operation policy is registered for 'git_whatever'"
        );
        assert_eq!(
            i18n::t("en", "backend.policy.emptyImpact", &[]),
            "A destructive operation must name at least one affected target"
        );
    }
}
