export interface GitProject {
  id: string;
  name: string;
  path: string;
  alias: string | null;
  sort_order: number;
  group_id: string;
  color?: string;
  last_active_at: string | null;
  last_commit_hash: string | null;
  created_at: string;
  updated_at: string;
  description?: string;
  notes?: string;
}

export const PROJECT_COLORS = [
  { id: "red", bg: "bg-red-500", light: "bg-red-100 dark:bg-red-900/30" },
  { id: "orange", bg: "bg-orange-500", light: "bg-orange-100 dark:bg-orange-900/30" },
  { id: "yellow", bg: "bg-yellow-500", light: "bg-yellow-100 dark:bg-yellow-900/30" },
  { id: "green", bg: "bg-green-500", light: "bg-green-100 dark:bg-green-900/30" },
  { id: "blue", bg: "bg-blue-500", light: "bg-blue-100 dark:bg-blue-900/30" },
  { id: "purple", bg: "bg-purple-500", light: "bg-purple-100 dark:bg-purple-900/30" },
  { id: "pink", bg: "bg-pink-500", light: "bg-pink-100 dark:bg-pink-900/30" },
  { id: "gray", bg: "bg-gray-500", light: "bg-gray-100 dark:bg-gray-900/30" },
] as const;

export interface BranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  is_merged: boolean;
}

export interface GitStatus {
  modified: number;
  staged: number;
  untracked: number;
  ahead: number;
  behind: number;
}

export interface ProjectDetail {
  project: GitProject;
  current_branch: string;
  branches: BranchInfo[];
  status: GitStatus;
  group: Group;
  stash_count: number;
}

export interface ProjectStats {
  total_commits: number;
  contributors: string[];
  last_commit_date: number;
  commits_last_7_days: number;
  commits_last_30_days: number;
  branch_count: number;
  tag_count: number;
}

export type Theme = "light" | "dark" | "system";
export type ViewMode = "card" | "list" | "compact" | "table" | "dashboard";
export type SortOption = "custom" | "name-asc" | "name-desc" | "modified" | "changes" | "branch";

export interface LlmConfig {
  enabled: boolean;
  api_key: string;
  endpoint: string;
  model: string;
  temperature: number;
  max_tokens: number;
  key_in_keychain: boolean;
}

export interface AppSettings {
  theme: Theme;
  auto_refresh: boolean;
  refresh_interval_secs: number;
  view_mode: ViewMode;
  llm: LlmConfig;
  auto_fetch_on_launch: boolean;
}

export interface CommitInfo {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  email: string;
  timestamp: number;
  parents: string[];
  refs: string[];  // NEW: branch/tag names pointing to this commit
}

export interface Group {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: string;
}

export type FileStatus = "modified" | "deleted" | "untracked" | "renamed" | "added";

export interface GitFileEntry {
  path: string;
  status: FileStatus;
  staged: boolean;
}

export interface MergeResult {
  success: boolean;
  message: string;
  conflicts: string[];
}

// ── AI Code Review types ──────────────────────────────────────────────

export interface DiffStats {
  files_changed: number;
  total_additions: number;
  total_deletions: number;
}

export interface ReviewFinding {
  severity: "critical" | "warning" | "info" | "suggestion";
  category: "bug" | "security" | "performance" | "quality" | "best-practice";
  file_path: string | null;
  line_hint: string | null;
  title: string;
  description: string;
  suggestion: string | null;
}

export interface ReviewResult {
  id: string;
  base_branch: string;
  head_branch: string;
  summary: string;
  findings: ReviewFinding[];
  stats: DiffStats;
  model: string;
  created_at: string;
}

export interface BatchResult {
  project_name: string;
  success: boolean;
  message: string;
}

export interface BulkImportResult {
  imported: ProjectDetail[];
  skipped: number;
  errors: string[];
}

export interface ImportResult {
  settings_applied: boolean;
  groups_imported: number;
  projects_imported: number;
  projects_skipped: number;
}

export interface GitOpEvent {
  id: number;
  op: string;
  path: string;
  error?: string;
}

export interface StashInfo {
  index: number;
  message: string;
  oid: string;
  timestamp: number;
  branch: string;
}

export interface TagInfo {
  name: string;
  oid: string;
  target_oid: string;
  tagger: string | null;
  message: string | null;
}

export interface RemoteInfo {
  name: string;
  url: string;
  push_url: string | null;
}

export interface ReflogEntry {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  timestamp: number;
}



export interface GitNotification {
  id: string;
  project_name: string;
  event_type: string;
  message: string;
  timestamp: number;
  read: boolean;
}

export interface CustomCommand {
  id: string;
  name: string;
  command: string;
  shortcut: string | null;
  sort_order: number;
  created_at: string;
}

export interface OperationLogEntry {
  id: string;
  operation_type: string;
  project_path: string;
  project_name: string | null;
  details: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
}


export interface BisectState {
  active: boolean;
  current_commit: string;
  good_commit: string;
  bad_commit: string;
  steps_remaining: number;
  total_steps: number;
  message: string;
}
export interface LogEntry {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  timestamp: number;
  parents: string[];
  refs: string[];
  lane: number;
}
export interface FileCommitEntry {
  hash: string;
  message: string;
  author: string;
  timestamp: number;
  additions: number;
  deletions: number;
}
export interface ChangedFileInfo {
  path: string;
  additions: number;
  deletions: number;
}

export interface BranchCompareResult {
  ahead: number;
  behind: number;
  ahead_commits: CommitInfo[];
  behind_commits: CommitInfo[];
  changed_files: ChangedFileInfo[];
}

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string | null;
  head: string;
  is_locked: boolean;
  is_prunable: boolean;
}

export interface SubmoduleInfo {
  name: string;
  path: string;
  url: string;
  head: string;
  active: boolean;
}

export interface FileDiffStats {
  additions: number;
  deletions: number;
}

export interface DiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
}

export interface BranchDiff {
  base_branch: string;
  head_branch: string;
  files: DiffFile[];
  stats: DiffStats;
}

export interface BlameLine {
  line: number;
  content: string;
  commit_id: string;
  author: string;
  timestamp: number;
}

export interface BranchHealthItem {
  name: string;
  behind: number;
  last_commit_timestamp: number;
  is_merged: boolean;
  days_stale: number;
}

export interface BranchHealthReport {
  merged: BranchHealthItem[];
  stale: BranchHealthItem[];
  behind: BranchHealthItem[];
}

// ── Gitignore ─────────────────────────────────────────────────────────

export interface GitignoreTemplate {
  name: string;
  content: string;
}

export interface BackgroundStatus {
  active: boolean;
  interval_secs: number;
  last_refresh: number | null;
}

export interface ProjectDiffSummary {
  project_name: string;
  project_id: string;
  path: string;
  additions: number;
  deletions: number;
  files_changed: number;
  files: string[];
  current_branch: string;
}

// ── Global search ─────────────────────────────────────────────────────

export interface SearchResult {
  projectName: string;
  filePath: string;
  lineNumber: number;
  lineContent: string;
  matchScore: number;
}

export interface SearchOptions {
  extensions?: string[];
  maxResults?: number;
  excludeDirs?: string[];
}

// ── Git Hooks ─────────────────────────────────────────────────────────

export interface GitHook {
  name: string;
  path: string;
  active: boolean;
  content: string | null;
}

// ── Structured error from backend ──────────────────────────────────────────

export interface AppError {
  type: "not_found" | "git" | "database" | "io" | "config" | "llm" | "other";
  message: string;
}

export interface ErrorSuggestion {
  title: string;
  description: string;
  action_label: string;
  action_type: "pull" | "stash" | "checkout" | "abort_merge" | "fetch" | "discard" | "commit";
}

/**
 * Parse an error from a Tauri invoke call into a user-friendly message.
 * Backend errors are serialized as {type, message}. Plain strings and
 * Error objects are also handled gracefully.
 */
export function parseError(error: unknown): string {
  if (error && typeof error === "object" && "type" in error && "message" in error) {
    const appErr = error as AppError;
    return appErr.message;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

/**
 * Get a user-friendly hint based on the error type.
 */
export function getErrorHint(error: unknown): string | null {
  if (error && typeof error === "object" && "type" in error) {
    const appErr = error as AppError;
    switch (appErr.type) {
      case "git": return "Check git status and try again";
      case "llm": return "Check your LLM settings";
      case "database": return "Database error — try restarting the app";
      case "config": return "Check your settings";
      case "io": return "File system error — check permissions";
      default: return null;
    }
  }
  return null;
}

/**
 * Get recovery suggestions for an error. Returns actionable suggestions
 * that can be displayed in the UI to help users fix common git issues.
 */
export function getSuggestions(error: unknown, operation?: string): ErrorSuggestion[] {
  const msg = parseError(error).toLowerCase();

  if (msg.includes("push rejected") || msg.includes("rejected") || msg.includes("failed to push")) {
    return [{
      title: "Remote has newer commits",
      description: "Pull remote changes first, then push again.",
      action_label: "Pull now",
      action_type: "pull",
    }];
  }

  if (msg.includes("merge conflict") || msg.includes("conflict") && msg.includes("merge")) {
    return [
      {
        title: "Merge conflict detected",
        description: "Manually resolve conflicts in the listed files, then commit.",
        action_label: "Abort merge",
        action_type: "abort_merge",
      },
    ];
  }

  if (msg.includes("dirty") || msg.includes("uncommitted changes") || msg.includes("working tree")) {
    return [
      {
        title: "Uncommitted changes in the way",
        description: "Stash your changes before this operation, or commit them first.",
        action_label: "Stash changes",
        action_type: "stash",
      },
      {
        title: "Commit first",
        description: "Commit your current changes before continuing.",
        action_label: "Commit changes",
        action_type: "commit",
      },
    ];
  }

  if (msg.includes("detached head")) {
    return [{
      title: "Detached HEAD state",
      description: "Create a new branch to save your work before switching.",
      action_label: "Create branch",
      action_type: "checkout",
    }];
  }

  if (msg.includes("not found") || msg.includes("unknown revision") || msg.includes("does not exist")) {
    return [{
      title: "Branch not found",
      description: "Fetch from remote to get the latest branch list, then try again.",
      action_label: "Fetch from remote",
      action_type: "fetch",
    }];
  }

  if (msg.includes("nothing to commit") || msg.includes("no changes")) {
    return [{
      title: "No changes to commit",
      description: "Make some changes to your files first.",
      action_label: "View files",
      action_type: "discard",
    }];
  }

  if (msg.includes("timed out") || msg.includes("timeout")) {
    return [{
      title: "Operation timed out",
      description: "Check your network connection and try again.",
      action_label: "Retry",
      action_type: operation === "push" ? "pull" : "fetch",
    }];
  }

  return [];
}


export type OperationRisk = "destructive" | "history_rewrite" | "batch_destructive";

export interface OperationPolicy {
  operation: string;
  risk: OperationRisk;
  title: string;
  description: string;
  confirm_label: string;
  requires_confirmation: boolean;
  allow_skip_confirmation: boolean;
}

export interface OperationTarget {
  path: string;
  label: string;
}

export interface OperationPreview {
  policy: OperationPolicy;
  targets: OperationTarget[];
}

export type TaskWorkspaceStatus = "active" | "archived";
export type TaskStrategy = "retain_current" | "switch_existing" | "create_branch" | "create_worktree" | "reuse_worktree";
export type PreflightStatus = "ready" | "warning" | "needs_decision" | "blocked" | "unavailable";

export interface TaskWorkspace {
  id: string;
  name: string;
  description: string | null;
  status: TaskWorkspaceStatus;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
}

export interface TaskWorkspaceEntry {
  id: string;
  workspace_id: string;
  project_id: string;
  sort_order: number;
  strategy: TaskStrategy;
  target_branch: string | null;
  base_branch: string | null;
  worktree_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskWorkspaceEntryDetail {
  entry: TaskWorkspaceEntry;
  project: GitProject;
}

export interface TaskWorkspaceDetail {
  workspace: TaskWorkspace;
  entries: TaskWorkspaceEntryDetail[];
}

export interface CreateTaskWorkspaceInput {
  name: string;
  description?: string | null;
  project_ids: string[];
}

export interface UpdateTaskWorkspaceInput {
  name: string;
  description?: string | null;
}

export interface UpdateTaskWorkspaceEntryInput {
  strategy: TaskStrategy;
  target_branch?: string | null;
  base_branch?: string | null;
  worktree_path?: string | null;
  sort_order: number;
}

export interface TaskPreflightEntry {
  entry: TaskWorkspaceEntryDetail;
  observed_branch: string | null;
  observed_head: string | null;
  git_status: GitStatus | null;
  active_operation: string | null;
  status: PreflightStatus;
  reason_codes: string[];
  reasons: string[];
  recovery_guidance: string[];
}

export interface TaskWorkspacePlan {
  workspace_id: string;
  generated_at: string;
  entries: TaskPreflightEntry[];
}

export type TaskExecutionState = "pending" | "running" | "succeeded" | "failed" | "skipped";
export interface TaskWorkspaceOutcome { id: string; workspace_id: string; entry_id: string; state: TaskExecutionState; message: string; start_branch: string | null; start_head: string | null; result_branch: string | null; worktree_path: string | null; created_at: string; }
export interface TaskWorkspaceExecution { workspace_id: string; executed_at: string; outcomes: TaskWorkspaceOutcome[]; }
