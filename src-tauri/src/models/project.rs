use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitProject {
    pub id: String,
    pub name: String,
    pub path: String,
    pub alias: Option<String>,
    pub sort_order: i64,
    pub group_id: String,
    pub color: Option<String>,
    pub last_active_at: Option<String>,
    pub last_commit_hash: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub description: Option<String>,
    pub notes: Option<String>,
}

impl GitProject {
    pub fn new(name: String, path: String, group_id: String) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            path,
            alias: None,
            sort_order: 0,
            group_id,
            color: None,
            last_active_at: None,
            last_commit_hash: None,
            updated_at: now.clone(),
            created_at: now,
            description: None,
            notes: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectDetail {
    pub project: GitProject,
    pub current_branch: String,
    pub branches: Vec<BranchInfo>,
    pub status: GitStatus,
    pub group: Group,
    pub stash_count: usize,
}

impl ProjectDetail {
    pub fn fallback(project: GitProject, group: Group) -> Self {
        Self {
            project,
            current_branch: "unknown".to_string(),
            branches: vec![],
            status: GitStatus {
                is_merging: false,
                modified: 0,
                staged: 0,
                untracked: 0,
                ahead: 0,
                behind: 0,
            },
            group,
            stash_count: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
    #[serde(default)]
    pub is_merged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitStatus {
    pub modified: u32,
    pub staged: u32,
    pub untracked: u32,
    pub ahead: u32,
    pub behind: u32,
    #[serde(default)]
    pub is_merging: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceFile {
    pub folders: Vec<WorkspaceFolder>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkspaceFolder {
    pub path: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub parents: Vec<String>,
    pub refs: Vec<String>, // NEW: branch/tag names pointing to this commit
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Group {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchResult {
    pub project_name: String,
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FileStatus {
    Modified,
    Deleted,
    Untracked,
    Renamed,
    Added,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitFileEntry {
    pub path: String,
    pub status: FileStatus,
    pub staged: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    pub success: bool,
    pub message: String,
    pub conflicts: Vec<String>,
}

// ── AI Code Review types ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchDiff {
    pub base_branch: String,
    pub head_branch: String,
    pub files: Vec<DiffFile>,
    pub stats: DiffStats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffFile {
    pub path: String,
    pub status: String, // "added", "modified", "deleted", "renamed"
    pub additions: u32,
    pub deletions: u32,
    pub patch: String, // unified diff hunks
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct DiffStats {
    pub files_changed: u32,
    pub total_additions: u32,
    pub total_deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FindingSeverity {
    Critical,
    Warning,
    Info,
    Suggestion,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FindingCategory {
    Bug,
    Security,
    Performance,
    Quality,
    BestPractice,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewFinding {
    pub severity: FindingSeverity,
    pub category: FindingCategory,
    pub file_path: Option<String>,
    pub line_hint: Option<String>,
    pub title: String,
    pub description: String,
    pub suggestion: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReviewResult {
    pub id: String,
    pub base_branch: String,
    pub head_branch: String,
    pub summary: String,
    pub findings: Vec<ReviewFinding>,
    pub stats: DiffStats,
    pub model: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StashInfo {
    pub index: usize,
    pub message: String,
    pub oid: String,
    pub timestamp: i64,
    pub branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TagInfo {
    pub name: String,
    pub oid: String,
    pub target_oid: String,
    pub tagger: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
    pub push_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiffStats {
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub head: String,
    pub is_locked: bool,
    pub is_prunable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlameLine {
    pub line: usize,
    pub content: String,
    pub commit_id: String,
    pub author: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchHealthItem {
    pub name: String,
    pub behind: u32,
    pub last_commit_timestamp: i64,
    pub is_merged: bool,
    pub days_stale: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchHealthReport {
    pub merged: Vec<BranchHealthItem>,
    pub stale: Vec<BranchHealthItem>,
    pub behind: Vec<BranchHealthItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangedFileInfo {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmoduleInfo {
    pub name: String,
    pub path: String,
    pub url: String,
    pub head: String,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BisectState {
    pub active: bool,
    pub current_commit: String,
    pub good_commit: String,
    pub bad_commit: String,
    pub steps_remaining: usize,
    pub total_steps: usize,
    pub message: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
    pub parents: Vec<String>,
    pub refs: Vec<String>,
    pub lane: usize,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileCommitEntry {
    pub hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
    pub additions: u32,
    pub deletions: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectDiffSummary {
    pub project_name: String,
    pub project_id: String,
    pub path: String,
    pub additions: usize,
    pub deletions: usize,
    pub files_changed: usize,
    pub files: Vec<String>,
    pub current_branch: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchCompareResult {
    pub ahead: usize,
    pub behind: usize,
    pub ahead_commits: Vec<CommitInfo>,
    pub behind_commits: Vec<CommitInfo>,
    pub changed_files: Vec<ChangedFileInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReflogEntry {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectStats {
    pub total_commits: usize,
    pub contributors: Vec<String>,
    pub last_commit_date: i64,
    pub commits_last_7_days: usize,
    pub commits_last_30_days: usize,
    pub branch_count: usize,
    pub tag_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffComment {
    pub id: String,
    pub project_id: String,
    pub file_path: String,
    pub line_number: usize,
    pub content: String,
    pub created_at: String,
}
