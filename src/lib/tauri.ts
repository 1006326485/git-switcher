import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  ProjectDetail,
  AppSettings,
  CommitInfo,
  Group,
  GitFileEntry,
  MergeResult,
  ReviewResult,
  StashInfo,
  TagInfo,
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

// ── Git Operations ──────────────────────────────────────────────────────

export async function switchBranch(path: string, branch: string): Promise<ProjectDetail> {
  return invoke("switch_branch", { path, branch });
}

export async function refreshProject(path: string): Promise<ProjectDetail> {
  return invoke("refresh_project", { path });
}

export async function gitGetLog(path: string, limit?: number, offset?: number): Promise<CommitInfo[]> {
  return invoke("git_get_log", { path, limit, offset });
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

export async function gitStash(path: string, message?: string): Promise<string> {
  return invoke("git_stash", { path, message: message ?? null });
}

export async function gitStashApply(path: string, index: number): Promise<string> {
  return invoke("git_stash_apply", { path, index });
}

export async function gitStashPop(path: string, index?: number): Promise<string> {
  return invoke("git_stash_pop", { path, index: index ?? null });
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

export async function mergeBranch(path: string, branch: string): Promise<MergeResult> {
  return invoke("merge_branch", { path, branch });
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

// ── Cherry-pick / Rebase ──────────────────────────────────────────────

export async function gitCherryPick(path: string, commitHash: string): Promise<MergeResult> {
  return invoke("git_cherry_pick", { path, commitHash });
}

export async function gitRebase(path: string, ontoBranch: string): Promise<string> {
  return invoke("git_rebase", { path, ontoBranch });
}

// ── Batch Operations ────────────────────────────────────────────────────

export async function fetchAll(groupId?: string): Promise<void> {
  return invoke("fetch_all", { groupId: groupId ?? null });
}

export async function pullAll(groupId?: string): Promise<void> {
  return invoke("pull_all", { groupId: groupId ?? null });
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

export async function reorderProjects(orderedIds: string[]): Promise<void> {
  return invoke("reorder_projects", { orderedIds });
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

export async function aiReview(
  path: string,
  baseBranch: string,
  headBranch: string
): Promise<ReviewResult> {
  return invoke("ai_review", { path, baseBranch, headBranch });
}

export async function generateCommitMsg(path: string): Promise<string> {
  return invoke("generate_commit_msg", { path });
}
