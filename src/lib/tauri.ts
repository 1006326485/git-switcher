import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  ProjectDetail,
  ProjectStats,
  AppSettings,
  BatchResult,
  BranchCompareResult,
  BranchDiff,
  CommitInfo,
  Group,
  GitFileEntry,
  GitignoreTemplate,
  GitHook,
  MergeResult,
  ReviewResult,
  StashInfo,
  SubmoduleInfo,
  TagInfo,
  WorktreeInfo,
  OperationPreview,
  OperationTarget,
  UpdateTaskWorkspaceInput,
  UpdateTaskWorkspaceEntryInput,
  TaskWorkspaceDetail,
  TaskWorkspace,
  TaskWorkspacePlan,
  TaskWorkspaceExecution,
  TaskWorkspaceOutcome,
  CreateTaskWorkspaceInput,
  FileDiffStats,
  BlameLine,
  BackgroundStatus,
  BranchHealthReport,
  SearchResult,
  FileCommitEntry,
  LogEntry,
  BisectState,
  GitNotification,
  SearchOptions,
  ProjectDiffSummary,
  BulkImportResult,
  ImportResult,
  ReflogEntry,
  RemoteInfo,
} from "./types";

// ── Projects ────────────────────────────────────────────────────────────

export async function addProject(path: string, groupId: string): Promise<ProjectDetail> {
  return invoke("add_project", { path, groupId });
}

export async function removeProject(id: string): Promise<void> {
  return invoke("remove_project", { id });
}

export async function listProjects(): Promise<ProjectDetail[]> {
  return invoke("list_projects");
}

export async function importWorkspace(filePath: string, groupId: string): Promise<ProjectDetail[]> {
  return invoke("import_workspace", { filePath, groupId });
}

export async function initGitProject(path: string, name: string, groupId: string): Promise<ProjectDetail> {
  return invoke("init_git_project", { path, name, groupId });
}

export async function exportProjects(): Promise<string> {
  return invoke("export_projects");
}

export async function importProjects(json: string, groupId: string): Promise<ProjectDetail[]> {
  return invoke("import_projects", { json, groupId });
}

export async function exportAllSettings(path: string): Promise<void> {
  return invoke("export_all_settings", { path });
}

export async function importAllSettings(path: string): Promise<ImportResult> {
  return invoke("import_all_settings", { path });
}

export async function scanDirectoryForRepos(path: string): Promise<string[]> {
  return invoke("scan_directory_for_repos", { path });
}

export async function bulkImportProjects(paths: string[], groupId: string): Promise<BulkImportResult> {
  return invoke("bulk_import_projects", { paths, groupId });
}

// ── Git Operations ──────────────────────────────────────────────────────

export async function switchBranch(path: string, branch: string): Promise<ProjectDetail> {
  return invoke("switch_branch", { path, branch });
}

export async function refreshProject(path: string): Promise<ProjectDetail> {
  return invoke("refresh_project", { path });
}

export interface GitLogFilters {
  author?: string;
  message_contains?: string;
  since?: number;
  until?: number;
}

export async function gitGetLog(
  path: string,
  limit?: number,
  offset?: number,
  filters?: GitLogFilters,
): Promise<CommitInfo[]> {
  return invoke("git_get_log", {
    path,
    limit,
    offset,
    author: filters?.author ?? null,
    message_contains: filters?.message_contains ?? null,
    since: filters?.since ?? null,
    until: filters?.until ?? null,
  });
}

export async function gitGetFiles(path: string): Promise<GitFileEntry[]> {
  return invoke("git_get_files", { path });
}

export async function gitStageFile(path: string, file: string): Promise<void> {
  return invoke("git_stage_file", { path, file });
}

export async function gitUnstageFile(path: string, file: string): Promise<void> {
  return invoke("git_unstage_file", { path, file });
}

export async function gitDiscardFile(path: string, file: string): Promise<void> {
  return invoke("git_discard_file", { path, file });
}

export async function gitStageAll(path: string): Promise<void> {
  return invoke("git_stage_all", { path });
}

export async function gitUnstageAll(path: string): Promise<void> {
  return invoke("git_unstage_all", { path });
}

export async function gitGetStagedDiff(path: string): Promise<string> {
  return invoke("git_get_staged_diff", { path });
}

export async function gitCommit(path: string, message: string): Promise<string> {
  return invoke("git_commit", { path, message });
}

export async function gitPush(path: string, branch?: string): Promise<string> {
  return invoke("git_push", { path, branch });
}

export async function gitPull(path: string): Promise<string> {
  return invoke("git_pull", { path });
}

export async function gitFetch(path: string): Promise<string> {
  return invoke("git_fetch", { path });
}

export async function syncProject(path: string): Promise<string> {
  return invoke("sync_project", { path });
}

export async function syncAll(groupId?: string): Promise<void> {
  return invoke("sync_all", { groupId: groupId ?? null });
}

export async function gitStash(path: string, message?: string, includeUntracked?: boolean): Promise<string> {
  return invoke("git_stash", { path, message: message ?? null, includeUntracked: includeUntracked ?? false });
}

export async function gitStashApply(path: string, index: number): Promise<string> {
  return invoke("git_stash_apply", { path, index });
}

export async function gitStashPop(path: string, index?: number): Promise<string> {
  return invoke("git_stash_pop", { path, index: index ?? null });
}

export async function gitStashShow(path: string, index: number): Promise<string> {
  return invoke("git_stash_show", { path, index });
}

export async function gitStashList(path: string): Promise<StashInfo[]> {
  return invoke("git_stash_list", { path });
}

export async function gitStashDrop(path: string, index: number): Promise<void> {
  return invoke("git_stash_drop", { path, index });
}

export async function cancelGitOp(id: number): Promise<void> {
  return invoke("cancel_git_op", { id });
}

// ── Branch Management ───────────────────────────────────────────────────

export async function createBranch(path: string, name: string, fromBranch?: string): Promise<void> {
  return invoke("create_branch", { path, name, fromBranch });
}

export async function deleteBranch(path: string, name: string): Promise<void> {
  return invoke("delete_branch", { path, name });
}

export async function mergeBranch(path: string, branch: string, strategy?: string): Promise<MergeResult> {
  return invoke("merge_branch", { path, branch, strategy: strategy || null });
}


export async function gitListConflicts(path: string): Promise<string[]> {
  return invoke("git_list_conflicts", { path });
}

export async function gitResolveConflict(path: string, filePath: string, resolution: string): Promise<void> {
  return invoke("git_resolve_conflict", { path, filePath, resolution });
}

export async function gitAbortMerge(path: string): Promise<string> {
  return invoke("git_abort_merge", { path });
}

export async function gitAbortCherryPick(path: string): Promise<string> {
  return invoke("git_abort_cherry_pick", { path });
}

export async function gitCleanPreview(path: string, includeIgnored?: boolean): Promise<string[]> {
  return invoke("git_clean_preview", { path, includeIgnored: includeIgnored ?? false });
}

export async function gitCleanExecute(path: string, includeIgnored?: boolean): Promise<string[]> {
  return invoke("git_clean_execute", { path, includeIgnored: includeIgnored ?? false });
}

export async function gitBisectStart(path: string, good: string, bad: string): Promise<BisectState> {
  return invoke("git_bisect_start", { path, good, bad });
}

export async function gitBisectGood(path: string): Promise<BisectState> {
  return invoke("git_bisect_good", { path });
}

export async function gitBisectBad(path: string): Promise<BisectState> {
  return invoke("git_bisect_bad", { path });
}

export async function gitBisectReset(path: string): Promise<void> {
  return invoke("git_bisect_reset", { path });
}

export async function gitBisectStatus(path: string): Promise<BisectState | null> {
  return invoke("git_bisect_status", { path });
}

export async function gitLog(path: string, maxCount?: number): Promise<LogEntry[]> {
  return invoke("git_log", { path, maxCount: maxCount ?? null });
}

export async function gitFileHistory(path: string, filePath: string, maxCount?: number): Promise<FileCommitEntry[]> {
  return invoke("git_file_history", { path, filePath, maxCount: maxCount ?? null });
}
export async function gitCompareBranches(path: string, branchA: string, branchB: string): Promise<BranchCompareResult> {
  return invoke("git_compare_branches", { path, branchA, branchB });
}

// ── Tag Management ─────────────────────────────────────────────────────

export async function gitListTags(path: string): Promise<TagInfo[]> {
  return invoke("git_list_tags", { path });
}

export async function gitCreateTag(path: string, name: string, message?: string): Promise<void> {
  return invoke("git_create_tag", { path, name, message: message ?? null });
}

export async function gitDeleteTag(path: string, name: string): Promise<void> {
  return invoke("git_delete_tag", { path, name });
}

export async function gitPushTag(path: string, name: string, remote?: string): Promise<void> {
  return invoke("git_push_tag", { path, name, remote: remote ?? null });
}

// ── Remote Management ─────────────────────────────────────────────────

export async function gitListRemotes(path: string): Promise<RemoteInfo[]> {
  return invoke("git_list_remotes", { path });
}

export async function gitAddRemote(path: string, name: string, url: string): Promise<void> {
  return invoke("git_add_remote", { path, name, url });
}

export async function gitRemoveRemote(path: string, name: string): Promise<void> {
  return invoke("git_remove_remote", { path, name });
}

export async function gitSetRemoteUrl(path: string, name: string, url: string): Promise<void> {
  return invoke("git_set_remote_url", { path, name, url });
}

// ── Worktree Management ─────────────────────────────────────────────────

export async function gitListWorktrees(path: string): Promise<WorktreeInfo[]> {
  return invoke("git_list_worktrees", { path });
}

export async function gitAddWorktree(
  path: string,
  name: string,
  branch?: string,
  createBranch?: boolean
): Promise<WorktreeInfo> {
  return invoke("git_add_worktree", {
    path,
    name,
    branch: branch ?? null,
    createBranch: createBranch ?? false,
  });
}

export async function gitRemoveWorktree(path: string, name: string): Promise<void> {
  return invoke("git_remove_worktree", { path, name });
}

export async function gitPruneWorktrees(path: string): Promise<string[]> {
  return invoke("git_prune_worktrees", { path });
}

// ── Submodule Management ────────────────────────────────────────────────

export async function gitListSubmodules(path: string): Promise<SubmoduleInfo[]> {
  return invoke("git_list_submodules", { path });
}

export async function gitUpdateSubmodule(path: string, name: string): Promise<string> {
  return invoke("git_update_submodule", { path, name });
}

export async function gitInitSubmodules(path: string): Promise<string> {
  return invoke("git_init_submodules", { path });
}

// ── Cherry-pick / Rebase ──────────────────────────────────────────────

export async function gitCherryPick(path: string, commitHash: string): Promise<MergeResult> {
  return invoke("git_cherry_pick", { path, commitHash });
}

export async function gitCherryPickRange(path: string, from: string, to: string): Promise<MergeResult> {
  return invoke("git_cherry_pick_range", { path, from, to });
}

// ── Patch Operations ─────────────────────────────────────────────────

export async function gitCreatePatch(path: string, commitHash: string): Promise<string> {
  return invoke("git_create_patch", { path, commitHash });
}

export async function gitCheckPatch(path: string, patchContent: string): Promise<string> {
  return invoke("git_check_patch", { path, patchContent });
}

export async function gitApplyPatch(path: string, patchContent: string): Promise<string> {
  return invoke("git_apply_patch", { path, patchContent });
}

export async function gitSquashCommits(path: string, n: number, message?: string): Promise<MergeResult> {
  return invoke("git_squash_commits", { path, n, message: message ?? null });
}

export async function gitRebase(path: string, ontoBranch: string): Promise<MergeResult> {
  return invoke("git_rebase", { path, ontoBranch });
}

export async function gitRewordCommit(path: string, commitHash: string, newMessage: string): Promise<string> {
  return invoke("git_reword_commit", { path, commitHash, newMessage });
}

export async function gitDropCommit(path: string, commitHash: string): Promise<string> {
  return invoke("git_drop_commit", { path, commitHash });
}

export async function gitReset(path: string, target: string, mode: string): Promise<string> {
  return invoke("git_reset", { path, target, mode });
}

// ── Batch Operations ────────────────────────────────────────────────────

export async function fetchAll(groupId?: string): Promise<void> {
  return invoke("fetch_all", { groupId: groupId ?? null });
}

export async function gitAutoFetchAll(): Promise<void> {
  return invoke("git_auto_fetch_all");
}

export async function pullAll(groupId?: string): Promise<void> {
  return invoke("pull_all", { groupId: groupId ?? null });
}

export async function pushAll(groupId?: string): Promise<void> {
  return invoke("push_all", { groupId: groupId ?? null });
}

export async function pullBehind(groupId?: string): Promise<void> {
  return invoke("pull_behind", { groupId: groupId ?? null });
}

export async function pushAhead(groupId?: string): Promise<void> {
  return invoke("push_ahead", { groupId: groupId ?? null });
}

// ── Diff ──────────────────────────────────────────────────────────────────

export async function getFileDiff(path: string, filePath: string, staged?: boolean): Promise<string> {
  return invoke("get_file_diff", { path, filePath, staged: staged ?? false });
}

export async function getFileDiffStats(path: string, filePath: string, staged?: boolean): Promise<FileDiffStats> {
  return invoke("get_file_diff_stats", { path, filePath, staged: staged ?? false });
}

export async function blameFile(path: string, filePath: string): Promise<BlameLine[]> {
  return invoke("blame_file", { path, filePath });
}

// ── Groups ──────────────────────────────────────────────────────────────

export async function createGroup(name: string, color?: string): Promise<Group> {
  return invoke("create_group", { name, color });
}

export async function listGroups(): Promise<Group[]> {
  return invoke("list_groups");
}

export async function deleteGroup(id: string): Promise<void> {
  return invoke("delete_group", { id });
}

export async function assignToGroup(projectId: string, groupId: string): Promise<void> {
  return invoke("assign_to_group", { projectId, groupId });
}

export async function listProjectsInGroup(groupId: string): Promise<ProjectDetail[]> {
  return invoke("list_projects_in_group", { groupId });
}

export async function updateGroup(group: Group): Promise<Group> {
  return invoke("update_group", { group });
}

export async function setProjectAlias(id: string, alias: string): Promise<void> {
  return invoke("set_project_alias", { id, alias });
}

export async function setProjectColor(id: string, color: string | null): Promise<void> {
  return invoke("set_project_color", { id, color });
}

export async function setProjectDescription(id: string, description: string | null): Promise<void> {
  return invoke("set_project_description", { id, description });
}

export async function setProjectNotes(id: string, notes: string | null): Promise<void> {
  return invoke("set_project_notes", { id, notes });
}

export async function reorderProjects(orderedIds: string[]): Promise<void> {
  return invoke("reorder_projects", { orderedIds });
}

export async function getReadmePreview(path: string): Promise<string | null> {
  return invoke("get_readme_preview", { path });
}

// ── Terminal / Open ─────────────────────────────────────────────────────

export async function openInTerminal(path: string): Promise<void> {
  return invoke("open_in_terminal", { path });
}

export async function openInFinder(path: string): Promise<void> {
  return invoke("open_in_finder", { path });
}

export async function openInVscode(path: string): Promise<void> {
  return invoke("open_in_vscode", { path });
}

// ── Settings ────────────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export async function updateSettings(settings: AppSettings): Promise<AppSettings> {
  return invoke("update_settings", { newSettings: settings });
}

// ── File Dialog ─────────────────────────────────────────────────────────

export async function pickDirectory(): Promise<string | null> {
  return open({ directory: true });
}

export async function pickWorkspaceFile(): Promise<string | null> {
  return open({
    filters: [{ name: "Workspace", extensions: ["code-workspace"] }],
  });
}

export async function pickPatchFile(): Promise<string | null> {
  return open({
    filters: [{ name: "Patch", extensions: ["patch", "diff"] }],
  });
}

export async function readTextFile(filePath: string): Promise<string> {
  return invoke("read_file_text", { path: filePath });
}

export async function updateSettingsPartial(patch: Partial<AppSettings>): Promise<AppSettings> {
  return invoke("update_settings_partial", { patch });
}

export async function setLlmApiKey(key: string): Promise<void> {
  return invoke("set_llm_api_key", { key });
}

export async function getLlmApiKey(): Promise<string> {
  return invoke("get_llm_api_key");
}

// ── AI Code Review ────────────────────────────────────────────────────

export async function getBranchDiff(
  path: string,
  baseBranch: string,
  headBranch: string
): Promise<BranchDiff> {
  return invoke("get_branch_diff", { path, baseBranch, headBranch });
}

export async function aiReview(
  path: string,
  baseBranch: string,
  headBranch: string
): Promise<ReviewResult> {
  return invoke("ai_review", { path, baseBranch, headBranch });
}

export async function aiReviewStreaming(
  path: string,
  baseBranch: string,
  headBranch: string
): Promise<ReviewResult> {
  return invoke("ai_review_streaming", { path, baseBranch, headBranch });
}

export async function generateCommitMsg(path: string): Promise<string> {
  return invoke("generate_commit_msg", { path });
}

export async function listReviews(path: string): Promise<ReviewResult[]> {
  return invoke("list_reviews", { path });
}

export async function deleteReview(id: string): Promise<void> {
  return invoke("delete_review", { id });
}

// ── Background Refresh ─────────────────────────────────────────────────

export async function pauseBackgroundRefresh(): Promise<void> {
  return invoke("pause_background_refresh");
}

export async function resumeBackgroundRefresh(): Promise<void> {
  return invoke("resume_background_refresh");
}

export async function setBackgroundInterval(secs: number): Promise<void> {
  return invoke("set_background_interval", { secs });
}

export async function getBackgroundStatus(): Promise<BackgroundStatus> {
  return invoke("get_background_status");
}

// ── Branch Health ──────────────────────────────────────────────────────

export async function analyzeBranchHealth(path: string): Promise<BranchHealthReport> {
  return invoke("analyze_branch_health", { path });
}

export async function deleteMergedBranches(path: string, branches: string[]): Promise<BatchResult[]> {
  return invoke("delete_merged_branches", { path, branches });
}

// ── Global Search ─────────────────────────────────────────────────────

export async function searchContent(query: string, options?: SearchOptions): Promise<SearchResult[]> {
  return invoke("search_content", { query, options: options ?? null });
}

// ── Notifications ────────────────────────────────────────────────────

export async function getNotifications(): Promise<GitNotification[]> {
  return invoke("get_notifications");
}

export async function markNotificationRead(id: string): Promise<void> {
  return invoke("mark_notification_read", { id });
}

export async function clearNotifications(): Promise<void> {
  return invoke("clear_notifications");
}

export async function getUnreadCount(): Promise<number> {
  return invoke("get_unread_count");
}

// ── Custom Commands ────────────────────────────────────────────────

import type { CustomCommand } from "./types";

export async function createCustomCommand(
  name: string,
  command: string,
  shortcut?: string,
): Promise<CustomCommand> {
  return invoke("create_custom_command", { name, command, shortcut });
}

export async function listCustomCommands(): Promise<CustomCommand[]> {
  return invoke("list_custom_commands");
}

export async function deleteCustomCommand(id: string): Promise<void> {
  return invoke("delete_custom_command", { id });
}

// ── Operation Log ──────────────────────────────────────────────────

import type { OperationLogEntry } from "./types";

export async function logOperation(
  operationType: string,
  projectPath: string,
  projectName?: string,
  details?: string,
  status?: string,
  errorMessage?: string,
): Promise<void> {
  return invoke("log_operation", {
    operationType,
    projectPath,
    projectName,
    details,
    status: status ?? "success",
    errorMessage,
  });
}

export async function getOperationLog(limit?: number): Promise<OperationLogEntry[]> {
  return invoke("get_operation_log", { limit });
}

// ── Quick Diff ───────────────────────────────────────────────────────

export async function gitQuickDiffAll(): Promise<ProjectDiffSummary[]> {
  return invoke("git_quick_diff_all");
}

// ── Project Stats ────────────────────────────────────────────────────

export async function getProjectStats(path: string): Promise<ProjectStats> {
  return invoke("get_project_stats", { path });
}

// ── Gitignore ──────────────────────────────────────────────────────

export async function getGitignore(path: string): Promise<string | null> {
  return invoke("get_gitignore", { path });
}

export async function saveGitignore(path: string, content: string): Promise<void> {
  return invoke("save_gitignore", { path, content });
}

export async function getGitignoreTemplates(): Promise<GitignoreTemplate[]> {
  return invoke("get_gitignore_templates");
}

// ── Git Hooks ──────────────────────────────────────────────────────

export async function listHooks(path: string): Promise<GitHook[]> {
  return invoke("list_hooks", { path });
}

export async function toggleHook(path: string, name: string, active: boolean): Promise<void> {
  return invoke("toggle_hook", { path, name, active });
}

export async function getHookContent(path: string, name: string): Promise<string> {
  return invoke("get_hook_content", { path, name });
}

// ── Archive ─────────────────────────────────────────────────────────

export async function createArchive(
  path: string,
  format: string,
  outputPath: string,
  refName?: string
): Promise<string> {
  return invoke("create_archive", { path, format, outputPath, refName: refName ?? null });
}

// ── Reflog ─────────────────────────────────────────────────────────────

export async function gitGetReflog(path: string, maxCount?: number): Promise<ReflogEntry[]> {
  return invoke("git_get_reflog", { path, max_count: maxCount ?? null });
}

export async function gitCheckoutCommit(path: string, hash: string): Promise<void> {
  return invoke("git_checkout_commit", { path, hash });
}

// ── Drag & Drop ────────────────────────────────────────────────────────

export interface DragDropResult {
  imported: ProjectDetail[];
  skipped: number;
  errors: string[];
}

export function onDragDropEnter(callback: (paths: string[]) => void): Promise<() => void> {
  return listen<{ paths: string[]; x: number; y: number }>("drag-drop-enter", (e) => {
    callback(e.payload.paths);
  });
}

export function onDragDropLeave(callback: () => void): Promise<() => void> {
  return listen<null>("drag-drop-leave", () => {
    callback();
  });
}

export function onDragDropResult(callback: (result: DragDropResult) => void): Promise<() => void> {
  return listen<DragDropResult>("drag-drop-result", (e) => {
    callback(e.payload);
  });
}

// ── Destructive operation policy ───────────────────────────────────────

export async function getOperationPreview(operation: string, targets: OperationTarget[]): Promise<OperationPreview> {
  return invoke("get_operation_preview", { operation, targets });
}

// ── Task Workspaces ────────────────────────────────────────────────────

export async function createTaskWorkspace(input: CreateTaskWorkspaceInput): Promise<TaskWorkspaceDetail> {
  return invoke("create_task_workspace", { input });
}

export async function listTaskWorkspaces(includeArchived = false): Promise<TaskWorkspace[]> {
  return invoke("list_task_workspaces", { includeArchived });
}

export async function getTaskWorkspace(id: string): Promise<TaskWorkspaceDetail> {
  return invoke("get_task_workspace", { id });
}

export async function updateTaskWorkspace(id: string, input: UpdateTaskWorkspaceInput): Promise<TaskWorkspace> {
  return invoke("update_task_workspace", { id, input });
}

export async function archiveTaskWorkspace(id: string): Promise<void> {
  return invoke("archive_task_workspace", { id });
}

export async function addTaskWorkspaceProject(workspaceId: string, projectId: string): Promise<TaskWorkspaceDetail> {
  return invoke("add_task_workspace_project", { workspaceId, projectId });
}

export async function removeTaskWorkspaceProject(workspaceId: string, entryId: string): Promise<TaskWorkspaceDetail> {
  return invoke("remove_task_workspace_project", { workspaceId, entryId });
}

export async function updateTaskWorkspaceEntry(workspaceId: string, entryId: string, input: UpdateTaskWorkspaceEntryInput): Promise<TaskWorkspaceDetail> {
  return invoke("update_task_workspace_entry", { workspaceId, entryId, input });
}

export async function preflightTaskWorkspace(workspaceId: string): Promise<TaskWorkspacePlan> {
  return invoke("preflight_task_workspace", { workspaceId });
}

export async function executeTaskWorkspacePlan(plan: TaskWorkspacePlan, continueOnFailure = false): Promise<TaskWorkspaceExecution> { return invoke("execute_task_workspace_plan", { plan, continueOnFailure }); }
export async function listTaskWorkspaceOutcomes(workspaceId: string): Promise<TaskWorkspaceOutcome[]> { return invoke("list_task_workspace_outcomes", { workspaceId }); }

export async function reorderTaskWorkspaceEntries(workspaceId: string, entryIds: string[]): Promise<TaskWorkspaceDetail> { return invoke("reorder_task_workspace_entries", { workspaceId, entryIds }); }
