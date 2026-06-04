export interface GitProject {
  id: string;
  name: string;
  path: string;
  alias: string | null;
  sort_order: number;
  group_id: string;
  last_active_at: string | null;
  last_commit_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface BranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
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
}

export type Theme = "light" | "dark" | "system";
export type ViewMode = "card" | "list" | "compact" | "table" | "dashboard";

export interface LlmConfig {
  enabled: boolean;
  api_key: string;
  endpoint: string;
  model: string;
  temperature: number;
  max_tokens: number;
}

export interface AppSettings {
  theme: Theme;
  auto_refresh: boolean;
  refresh_interval_secs: number;
  view_mode: ViewMode;
  llm: LlmConfig;
}

export interface CommitInfo {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  email: string;
  timestamp: number;
  parents: string[];
}

export interface Group {
  id: string;
  name: string;
  color: string | null;
  sort_order: number;
  created_at: string;
}

export type FileStatus = "modified" | "deleted" | "untracked" | "renamed";

export interface GitFileEntry {
  path: string;
  status: FileStatus;
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
}

export interface TagInfo {
  name: string;
  oid: string;
  target_oid: string;
  tagger: string | null;
  message: string | null;
}

