use serde::{Deserialize, Serialize};

use super::{GitProject, GitStatus};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskWorkspaceStatus {
    Active,
    Archived,
}

impl TaskWorkspaceStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Archived => "archived",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "archived" => Self::Archived,
            _ => Self::Active,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskWorkspace {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub status: TaskWorkspaceStatus,
    pub created_at: String,
    pub updated_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStrategy {
    RetainCurrent,
    SwitchExisting,
    CreateBranch,
    CreateWorktree,
    ReuseWorktree,
}

impl TaskStrategy {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::RetainCurrent => "retain_current",
            Self::SwitchExisting => "switch_existing",
            Self::CreateBranch => "create_branch",
            Self::CreateWorktree => "create_worktree",
            Self::ReuseWorktree => "reuse_worktree",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "switch_existing" => Self::SwitchExisting,
            "create_branch" => Self::CreateBranch,
            "create_worktree" => Self::CreateWorktree,
            "reuse_worktree" => Self::ReuseWorktree,
            _ => Self::RetainCurrent,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskWorkspaceEntry {
    pub id: String,
    pub workspace_id: String,
    pub project_id: String,
    pub sort_order: i64,
    pub strategy: TaskStrategy,
    pub target_branch: Option<String>,
    pub base_branch: Option<String>,
    pub worktree_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskWorkspaceEntryDetail {
    pub entry: TaskWorkspaceEntry,
    pub project: GitProject,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskWorkspaceDetail {
    pub workspace: TaskWorkspace,
    pub entries: Vec<TaskWorkspaceEntryDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PreflightStatus {
    Ready,
    Warning,
    NeedsDecision,
    Blocked,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskPreflightEntry {
    pub entry: TaskWorkspaceEntryDetail,
    pub observed_branch: Option<String>,
    pub observed_head: Option<String>,
    pub git_status: Option<GitStatus>,
    pub active_operation: Option<String>,
    pub status: PreflightStatus,
    pub reason_codes: Vec<String>,
    pub reasons: Vec<String>,
    pub recovery_guidance: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskWorkspacePlan {
    pub workspace_id: String,
    pub generated_at: String,
    pub entries: Vec<TaskPreflightEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskExecutionState {
    Pending,
    Running,
    Succeeded,
    Failed,
    Skipped,
}

impl TaskExecutionState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Succeeded => "succeeded",
            Self::Failed => "failed",
            Self::Skipped => "skipped",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "running" => Self::Running,
            "succeeded" => Self::Succeeded,
            "failed" => Self::Failed,
            "skipped" => Self::Skipped,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskWorkspaceOutcome {
    pub id: String,
    pub workspace_id: String,
    pub entry_id: String,
    pub state: TaskExecutionState,
    pub message: String,
    pub start_branch: Option<String>,
    pub start_head: Option<String>,
    pub result_branch: Option<String>,
    pub worktree_path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskWorkspaceExecution {
    pub workspace_id: String,
    pub executed_at: String,
    pub outcomes: Vec<TaskWorkspaceOutcome>,
}
