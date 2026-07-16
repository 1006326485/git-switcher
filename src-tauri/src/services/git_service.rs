use git2::{
    build::CheckoutBuilder, BranchType, DiffOptions, IndexAddOption, Repository, Status,
    StatusOptions,
};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::models::{
    BisectState, BlameLine, BranchCompareResult, BranchHealthItem, BranchHealthReport, BranchInfo,
    ChangedFileInfo, CommitInfo, FileCommitEntry, FileStatus, GitFileEntry, GitProject, GitStatus,
    Group, LogEntry, MergeResult, ProjectDetail, ProjectStats, ReflogEntry, RemoteInfo, StashInfo,
    SubmoduleInfo, TagInfo, WorktreeInfo,
};
use crate::AppError;

pub struct GitService;

impl GitService {
    pub fn open_repo(path: &str) -> Result<Repository, AppError> {
        Repository::open(path).map_err(|e| AppError::Git(format!("Failed to open repo: {}", e)))
    }

    fn get_signature(repo: &Repository) -> Result<git2::Signature<'_>, AppError> {
        repo.signature()
            .or_else(|_| git2::Signature::now("Git Switcher", "git-switcher@local"))
            .map_err(|e| AppError::Git(format!("Failed to create signature: {}", e)))
    }

    /// Collect conflicting file paths from the index.
    fn collect_conflicts(index: &mut git2::Index) -> Result<Vec<String>, AppError> {
        let mut conflicts = Vec::new();
        let entries: Vec<_> = index
            .conflicts()
            .map_err(|e| AppError::Git(format!("Failed to get conflicts: {}", e)))?
            .filter_map(|c| {
                c.map_err(|e| log::warn!("skipping corrupt conflict entry: {}", e))
                    .ok()
            })
            .collect();
        for entry in &entries {
            if let Some(our) = &entry.our {
                let path = String::from_utf8_lossy(&our.path).to_string();
                if !conflicts.contains(&path) {
                    conflicts.push(path);
                }
            } else if let Some(their) = &entry.their {
                let path = String::from_utf8_lossy(&their.path).to_string();
                if !conflicts.contains(&path) {
                    conflicts.push(path);
                }
            }
        }
        Ok(conflicts)
    }

    /// Reset the repo to HEAD and clean up merge/cherry-pick state.
    fn abort_to_head(repo: &Repository) {
        if let Ok(head) = repo.head() {
            if let Some(oid) = head.target() {
                if let Ok(obj) = repo.find_object(oid, Some(git2::ObjectType::Commit)) {
                    let _ = repo.reset(&obj, git2::ResetType::Hard, None);
                }
            }
        }
        let _ = repo.cleanup_state();
    }

    pub fn is_git_repo(path: &str) -> bool {
        Repository::open(path).is_ok()
    }

    pub fn init_repo(path: &str) -> Result<(), AppError> {
        Repository::init(path).map_err(|e| AppError::Git(format!("Failed to init repo: {}", e)))?;
        Ok(())
    }

    pub fn get_project_detail(
        project: &GitProject,
        group: Group,
    ) -> Result<ProjectDetail, AppError> {
        let repo = Self::open_repo(&project.path)?;

        let current_branch = Self::get_current_branch(&repo)?;
        let branches = Self::get_branches(&repo)?;
        let status = Self::get_status(&repo)?;

        // Capture current HEAD hash so callers don't need to re-open the repo
        let project = match Self::get_head_commit_hash(&repo) {
            Ok(hash) => {
                let mut p = project.clone();
                p.last_commit_hash = Some(hash);
                p
            }
            Err(_) => project.clone(),
        };

        // Count stashes (uses separate mutable handle to avoid borrow conflicts)
        let stash_count = {
            let mut count = 0usize;
            if let Ok(mut repo_mut) = Self::open_repo(&project.path) {
                let _ = repo_mut.stash_foreach(|_, _, _| {
                    count += 1;
                    true
                });
            }
            count
        };

        Ok(ProjectDetail {
            project,
            current_branch,
            branches,
            status,
            group,
            stash_count,
        })
    }

    pub fn get_current_branch(repo: &Repository) -> Result<String, AppError> {
        let head = repo
            .head()
            .map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
        if let Some(name) = head.shorthand() {
            return Ok(name.to_string());
        }
        // Detached HEAD — return short commit hash for display
        let commit = head
            .peel_to_commit()
            .map_err(|e| AppError::Git(format!("Failed to peel HEAD to commit: {}", e)))?;
        let short = commit.id().to_string();
        let short = &short[..7.min(short.len())];
        Ok(format!("(detached {})", short))
    }

    pub fn get_branches(repo: &Repository) -> Result<Vec<BranchInfo>, AppError> {
        let current = Self::get_current_branch(repo).unwrap_or_default();
        let mut branches = Vec::new();

        // Get current branch tip for merge-base checks
        let current_tip = repo
            .find_branch(&current, BranchType::Local)
            .ok()
            .and_then(|b| b.get().target());

        match repo.branches(Some(BranchType::Local)) {
            Ok(local_branches) => {
                for branch_result in local_branches {
                    match branch_result {
                        Ok((branch, _)) => match branch.name() {
                            Ok(Some(name)) => {
                                let is_current = name == current;
                                // Check if this branch is fully merged into current
                                let is_merged = if is_current {
                                    true
                                } else if let (Some(cur_tip), Some(br_tip)) =
                                    (current_tip, branch.get().target())
                                {
                                    repo.graph_ahead_behind(br_tip, cur_tip)
                                        .map(|(ahead, _)| ahead == 0)
                                        .unwrap_or(false)
                                } else {
                                    false
                                };
                                branches.push(BranchInfo {
                                    name: name.to_string(),
                                    is_current,
                                    is_remote: false,
                                    is_merged,
                                });
                            }
                            Ok(None) => log::warn!("Local branch with no UTF-8 name, skipping"),
                            Err(e) => log::warn!("Failed to get local branch name: {}", e),
                        },
                        Err(e) => log::warn!("Failed to read local branch: {}", e),
                    }
                }
            }
            Err(e) => log::warn!("Failed to list local branches: {}", e),
        }

        match repo.branches(Some(BranchType::Remote)) {
            Ok(remote_branches) => {
                for branch_result in remote_branches {
                    match branch_result {
                        Ok((branch, _)) => match branch.name() {
                            Ok(Some(name)) => {
                                branches.push(BranchInfo {
                                    name: name.to_string(),
                                    is_current: false,
                                    is_remote: true,
                                    is_merged: false,
                                });
                            }
                            Ok(None) => log::warn!("Remote branch with no UTF-8 name, skipping"),
                            Err(e) => log::warn!("Failed to get remote branch name: {}", e),
                        },
                        Err(e) => log::warn!("Failed to read remote branch: {}", e),
                    }
                }
            }
            Err(e) => log::warn!("Failed to list remote branches: {}", e),
        }

        branches.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(branches)
    }

    pub fn switch_branch(path: &str, branch_name: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;

        // If a local branch with this exact name exists, check it out directly
        let is_local = repo.find_branch(branch_name, BranchType::Local).is_ok();

        if is_local {
            let head_ref = format!("refs/heads/{}", branch_name);
            let (object, _) = repo
                .revparse_ext(&head_ref)
                .map_err(|e| AppError::Git(format!("Branch '{}' not found: {}", branch_name, e)))?;
            repo.checkout_tree(&object, None)
                .map_err(|e| AppError::Git(format!("Failed to checkout tree: {}", e)))?;
            repo.set_head(&head_ref)
                .map_err(|e| AppError::Git(format!("Failed to set HEAD: {}", e)))?;
        } else if branch_name.contains('/') {
            // Remote branch — use CLI for auto-stash/pop behavior
            let local_name = branch_name
                .find('/')
                .map(|i| &branch_name[i + 1..])
                .unwrap_or(branch_name);

            // Check for uncommitted changes
            let has_changes = {
                let mut status_opts = StatusOptions::new();
                status_opts.include_untracked(false);
                repo.statuses(Some(&mut status_opts))
                    .map(|s| !s.is_empty())
                    .unwrap_or(false)
            };

            // Drop repo before calling stash (which opens its own repo handle)
            drop(repo);

            // Auto-stash if there are uncommitted changes
            let stashed = if has_changes {
                log::info!("Auto-stashing uncommitted changes before branch switch");
                Self::stash(path, Some("Auto-stash before branch switch"), false).is_ok()
            } else {
                false
            };

            // Use git CLI for the switch (handles remote tracking branches correctly)
            let output = std::process::Command::new("git")
                .args(["checkout", local_name])
                .current_dir(path)
                .output()
                .map_err(|e| AppError::Git(format!("Failed to switch branch: {}", e)))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                // If checkout failed and we stashed, try to pop the stash back
                if stashed {
                    let _ = Self::stash_pop(path);
                }
                return Err(AppError::Git(format!(
                    "Failed to switch to '{}': {}",
                    branch_name,
                    stderr.trim()
                )));
            }

            // Auto-pop stash after successful checkout
            if stashed {
                if let Err(e) = Self::stash_pop(path) {
                    log::warn!("Auto-stash pop failed (conflicts may exist): {}", e);
                }
            }
        } else {
            let (object, reference) = repo
                .revparse_ext(branch_name)
                .map_err(|e| AppError::Git(format!("Branch '{}' not found: {}", branch_name, e)))?;

            repo.checkout_tree(&object, None)
                .map_err(|e| AppError::Git(format!("Failed to checkout tree: {}", e)))?;

            if let Some(reference) = reference {
                let head_ref = match reference.name() {
                    Some(name) => name.to_string(),
                    None => format!("refs/heads/{}", branch_name),
                };
                repo.set_head(&head_ref)
                    .map_err(|e| AppError::Git(format!("Failed to set HEAD: {}", e)))?;
            } else {
                repo.set_head_detached(object.id())
                    .map_err(|e| AppError::Git(format!("Failed to set HEAD detached: {}", e)))?;
            }
        }

        Ok(())
    }

    pub fn get_status(repo: &Repository) -> Result<GitStatus, AppError> {
        let mut opts = StatusOptions::new();
        opts.include_untracked(true);
        opts.recurse_untracked_dirs(true);

        let statuses = repo
            .statuses(Some(&mut opts))
            .map_err(|e| AppError::Git(format!("Failed to get status: {}", e)))?;

        let mut modified = 0u32;
        let mut staged = 0u32;
        let mut untracked = 0u32;

        for entry in statuses.iter() {
            let s = entry.status();
            if s.contains(Status::WT_MODIFIED)
                || s.contains(Status::WT_DELETED)
                || s.contains(Status::WT_RENAMED)
                || s.contains(Status::WT_TYPECHANGE)
            {
                modified += 1;
            }
            if s.contains(Status::INDEX_NEW)
                || s.contains(Status::INDEX_MODIFIED)
                || s.contains(Status::INDEX_DELETED)
                || s.contains(Status::INDEX_RENAMED)
                || s.contains(Status::INDEX_TYPECHANGE)
            {
                staged += 1;
            }
            if s.contains(Status::WT_NEW) {
                untracked += 1;
            }
        }

        let (ahead, behind) = Self::get_ahead_behind(repo).unwrap_or((0, 0));

        Ok(GitStatus {
            is_merging: repo.path().join("MERGE_HEAD").exists(),
            modified,
            staged,
            untracked,
            ahead,
            behind,
        })
    }

    /// Map index (staged) status flags to FileStatus
    fn status_label_for_index(s: Status) -> FileStatus {
        if s.contains(Status::INDEX_NEW) {
            FileStatus::Added
        } else if s.contains(Status::INDEX_MODIFIED) || s.contains(Status::INDEX_TYPECHANGE) {
            FileStatus::Modified
        } else if s.contains(Status::INDEX_DELETED) {
            FileStatus::Deleted
        } else if s.contains(Status::INDEX_RENAMED) {
            FileStatus::Renamed
        } else {
            FileStatus::Modified
        }
    }

    /// Map working tree (unstaged) status flags to FileStatus
    fn status_label_for_worktree(s: Status) -> FileStatus {
        if s.contains(Status::WT_MODIFIED) || s.contains(Status::WT_TYPECHANGE) {
            FileStatus::Modified
        } else if s.contains(Status::WT_DELETED) {
            FileStatus::Deleted
        } else if s.contains(Status::WT_RENAMED) {
            FileStatus::Renamed
        } else {
            FileStatus::Modified
        }
    }

    fn get_ahead_behind(repo: &Repository) -> Result<(u32, u32), AppError> {
        let head = repo
            .head()
            .map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
        let local_oid = head.target().ok_or(AppError::Git(
            "No HEAD target — repository may have no commits".to_string(),
        ))?;

        let upstream = repo
            .branch_upstream_name(
                head.name()
                    .ok_or(AppError::Git("Invalid refname".to_string()))?,
            )
            .map_err(|e| AppError::Git(format!("Failed to get upstream name: {}", e)))?;
        let upstream_ref = repo
            .find_reference(
                std::str::from_utf8(&upstream)
                    .map_err(|e| AppError::Git(format!("Invalid upstream ref encoding: {}", e)))?,
            )
            .map_err(|e| AppError::Git(format!("Failed to find upstream ref: {}", e)))?;
        let upstream_oid = upstream_ref
            .target()
            .ok_or(AppError::Git("No upstream target".to_string()))?;

        let (ahead, behind) = repo
            .graph_ahead_behind(local_oid, upstream_oid)
            .map_err(|e| AppError::Git(format!("Failed to compute ahead/behind: {}", e)))?;

        Ok((ahead as u32, behind as u32))
    }

    pub fn get_head_commit_hash(repo: &Repository) -> Result<String, AppError> {
        let head = repo
            .head()
            .map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
        head.target()
            .map(|oid| oid.to_string())
            .ok_or_else(|| AppError::Git("No HEAD target".to_string()))
    }

    // ── Git Operations ──────────────────────────────────────────────────

    pub fn get_file_list(path: &str) -> Result<Vec<GitFileEntry>, AppError> {
        let repo = Self::open_repo(path)?;

        let mut opts = StatusOptions::new();
        opts.include_untracked(true);
        opts.recurse_untracked_dirs(true);

        let statuses = repo
            .statuses(Some(&mut opts))
            .map_err(|e| AppError::Git(format!("Failed to get status: {}", e)))?;

        let mut files = Vec::new();

        for entry in statuses.iter() {
            let s = entry.status();
            let file_path = entry.path().unwrap_or("").to_string();

            // Check if file has staged (index) changes
            let has_staged = s.contains(Status::INDEX_NEW)
                || s.contains(Status::INDEX_MODIFIED)
                || s.contains(Status::INDEX_DELETED)
                || s.contains(Status::INDEX_RENAMED)
                || s.contains(Status::INDEX_TYPECHANGE);

            // Check if file has unstaged (working tree) changes
            let has_unstaged = s.contains(Status::WT_MODIFIED)
                || s.contains(Status::WT_DELETED)
                || s.contains(Status::WT_RENAMED)
                || s.contains(Status::WT_TYPECHANGE);

            // Check if file is untracked (new in working tree, never staged)
            let is_untracked = s.contains(Status::WT_NEW);

            if has_staged {
                files.push(GitFileEntry {
                    path: file_path.clone(),
                    status: Self::status_label_for_index(s),
                    staged: true,
                });
            }

            if has_unstaged {
                files.push(GitFileEntry {
                    path: file_path,
                    status: Self::status_label_for_worktree(s),
                    staged: false,
                });
            } else if is_untracked {
                files.push(GitFileEntry {
                    path: file_path,
                    status: FileStatus::Untracked,
                    staged: false,
                });
            }
        }

        Ok(files)
    }

    pub fn stage_file(path: &str, file_path: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;
        let mut index = repo
            .index()
            .map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
        index
            .add_path(std::path::Path::new(file_path))
            .map_err(|e| AppError::Git(format!("Failed to stage file: {}", e)))?;
        index
            .write()
            .map_err(|e| AppError::Git(format!("Failed to write index: {}", e)))?;
        Ok(())
    }

    pub fn unstage_file(path: &str, file_path: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;

        // Equivalent of `git reset HEAD -- <file>`: reset index entry to match
        // HEAD without touching the working directory. For new files (no HEAD
        // yet), remove from index instead.
        match repo.revparse_single("HEAD").ok() {
            Some(head_obj) => {
                repo.reset_default(Some(&head_obj), [std::path::Path::new(file_path)])
                    .map_err(|e| AppError::Git(format!("Failed to unstage: {}", e)))?;
            }
            None => {
                let mut index = repo
                    .index()
                    .map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
                index
                    .remove_path(std::path::Path::new(file_path))
                    .map_err(|e| AppError::Git(format!("Failed to unstage: {}", e)))?;
                index
                    .write()
                    .map_err(|e| AppError::Git(format!("Failed to write index: {}", e)))?;
            }
        }

        Ok(())
    }

    pub fn stage_all(path: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;
        let mut index = repo
            .index()
            .map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
        index
            .add_all(["*"], IndexAddOption::DEFAULT, None)
            .map_err(|e| AppError::Git(format!("Failed to stage all: {}", e)))?;
        index
            .write()
            .map_err(|e| AppError::Git(format!("Failed to write index: {}", e)))?;
        Ok(())
    }

    pub fn unstage_all(path: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;
        match repo.revparse_single("HEAD").ok() {
            Some(head_obj) => {
                repo.reset_default(Some(&head_obj), ["*"])
                    .map_err(|e| AppError::Git(format!("Failed to unstage all: {}", e)))?;
            }
            None => {
                let mut index = repo
                    .index()
                    .map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
                index
                    .clear()
                    .map_err(|e| AppError::Git(format!("Failed to clear index: {}", e)))?;
                index
                    .write()
                    .map_err(|e| AppError::Git(format!("Failed to write index: {}", e)))?;
            }
        }
        Ok(())
    }

    pub fn discard_file(path: &str, file_path: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;

        // Check if file is untracked (new file not in HEAD)
        let is_untracked = {
            let mut status_opts = StatusOptions::new();
            status_opts.include_untracked(true);
            repo.statuses(Some(&mut status_opts))
                .map(|statuses| {
                    statuses.iter().any(|entry| {
                        entry.path().unwrap_or("") == file_path
                            && entry.status().contains(Status::WT_NEW)
                    })
                })
                .unwrap_or(false)
        };

        if is_untracked {
            // For untracked files, delete them from disk
            let full_path = std::path::Path::new(path).join(file_path);
            if full_path.exists() {
                std::fs::remove_file(&full_path).map_err(AppError::Io)?;
            }
        } else {
            // For tracked files, restore from HEAD
            let head = repo
                .revparse_single("HEAD")
                .map_err(|e| AppError::Git(format!("No HEAD commit: {}", e)))?;
            repo.checkout_tree(&head, Some(CheckoutBuilder::new().path(file_path).force()))
                .map_err(|e| AppError::Git(format!("Failed to discard changes: {}", e)))?;
        }

        Ok(())
    }

    pub fn get_staged_diff(path: &str) -> Result<String, AppError> {
        let repo = Self::open_repo(path)?;

        let head = match repo.revparse_single("HEAD") {
            Ok(obj) => obj,
            Err(_) => return Ok(String::new()), // no commits yet
        };
        let head_tree = repo
            .find_tree(Self::obj_to_tree_id(&head))
            .map_err(|e| AppError::Git(format!("Failed to find HEAD tree: {}", e)))?;

        let mut opts = DiffOptions::new();
        opts.force_text(true);

        let diff = repo
            .diff_tree_to_index(Some(&head_tree), None, Some(&mut opts))
            .map_err(|e| AppError::Git(format!("Failed to compute diff: {}", e)))?;

        let mut output = String::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            let prefix = match line.origin() {
                '+' => "+",
                '-' => "-",
                ' ' => " ",
                _ => "",
            };
            output.push_str(prefix);
            output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
            true
        })
        .map_err(|e| AppError::Git(format!("Failed to format diff: {}", e)))?;

        Ok(output)
    }

    /// Get the diff for a single file. If `staged` is true, shows the diff between
    /// HEAD and the index (what would be committed); otherwise shows the diff between
    /// the index and the working directory (unstaged changes).
    pub fn get_file_diff(path: &str, file_path: &str, staged: bool) -> Result<String, AppError> {
        let repo = Self::open_repo(path)?;

        let mut opts = DiffOptions::new();
        opts.force_text(true);
        opts.pathspec(file_path);

        let diff = if staged {
            let head = match repo.revparse_single("HEAD") {
                Ok(obj) => obj,
                Err(_) => return Ok(String::new()), // no commits yet
            };
            let head_tree = repo
                .find_tree(Self::obj_to_tree_id(&head))
                .map_err(|e| AppError::Git(format!("Failed to find HEAD tree: {}", e)))?;
            repo.diff_tree_to_index(Some(&head_tree), None, Some(&mut opts))
                .map_err(|e| AppError::Git(format!("Failed to compute staged diff: {}", e)))?
        } else {
            repo.diff_index_to_workdir(None, Some(&mut opts))
                .map_err(|e| AppError::Git(format!("Failed to compute unstaged diff: {}", e)))?
        };

        let mut output = String::new();
        diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
            let prefix = match line.origin() {
                '+' => "+",
                '-' => "-",
                ' ' => " ",
                _ => "",
            };
            output.push_str(prefix);
            output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
            true
        })
        .map_err(|e| AppError::Git(format!("Failed to format diff: {}", e)))?;

        Ok(output)
    }

    /// Get diff line stats (additions/deletions) for a single file.
    pub fn get_file_diff_stats(
        path: &str,
        file_path: &str,
        staged: bool,
    ) -> Result<(u32, u32), AppError> {
        let repo = Self::open_repo(path)?;

        let mut opts = DiffOptions::new();
        opts.force_text(true);
        opts.pathspec(file_path);

        let diff = if staged {
            let head = match repo.revparse_single("HEAD") {
                Ok(obj) => obj,
                Err(_) => return Ok((0, 0)),
            };
            let head_tree = repo
                .find_tree(Self::obj_to_tree_id(&head))
                .map_err(|e| AppError::Git(format!("Failed to find HEAD tree: {}", e)))?;
            repo.diff_tree_to_index(Some(&head_tree), None, Some(&mut opts))
                .map_err(|e| AppError::Git(format!("Failed to compute staged diff: {}", e)))?
        } else {
            repo.diff_index_to_workdir(None, Some(&mut opts))
                .map_err(|e| AppError::Git(format!("Failed to compute unstaged diff: {}", e)))?
        };

        let stats = diff
            .stats()
            .map_err(|e| AppError::Git(format!("Failed to compute diff stats: {}", e)))?;
        Ok((stats.insertions() as u32, stats.deletions() as u32))
    }

    fn obj_to_tree_id(obj: &git2::Object) -> git2::Oid {
        if obj.kind() == Some(git2::ObjectType::Commit) {
            obj.peel_to_commit()
                .map(|c| c.tree_id())
                .unwrap_or(obj.id())
        } else {
            obj.id()
        }
    }

    pub fn commit(path: &str, message: &str) -> Result<String, AppError> {
        if message.trim().is_empty() {
            return Err(AppError::Other(
                "Commit message cannot be empty".to_string(),
            ));
        }
        let repo = Self::open_repo(path)?;

        let mut index = repo
            .index()
            .map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
        let tree_id = index
            .write_tree()
            .map_err(|e| AppError::Git(format!("Failed to write tree: {}", e)))?;
        let tree = repo
            .find_tree(tree_id)
            .map_err(|e| AppError::Git(format!("Failed to find tree: {}", e)))?;

        let signature = Self::get_signature(&repo)?;

        let head = repo.head().ok();
        let parent_commit = head
            .as_ref()
            .and_then(|h| h.target())
            .and_then(|oid| repo.find_commit(oid).ok());

        let parents: Vec<&git2::Commit> = parent_commit.iter().collect();

        let commit_oid = repo
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                message,
                &tree,
                &parents,
            )
            .map_err(|e| AppError::Git(format!("Failed to commit: {}", e)))?;

        Ok(commit_oid.to_string())
    }

    pub fn push(
        path: &str,
        branch: Option<&str>,
        cancel_flag: Option<Arc<AtomicBool>>,
    ) -> Result<String, AppError> {
        let mut cmd = Self::git_cmd(path);
        cmd.arg("push");
        if let Some(b) = branch {
            // Use git's configured upstream (don't hardcode "origin")
            cmd.arg(b);
        }
        Self::run_with_timeout(cmd, 120, cancel_flag)
    }

    pub fn pull(path: &str, cancel_flag: Option<Arc<AtomicBool>>) -> Result<String, AppError> {
        let mut cmd = Self::git_cmd(path);
        cmd.args(["pull", "--rebase"]);
        Self::run_with_timeout(cmd, 120, cancel_flag)
    }

    pub fn fetch(path: &str, cancel_flag: Option<Arc<AtomicBool>>) -> Result<String, AppError> {
        let mut cmd = Self::git_cmd(path);
        cmd.arg("fetch").arg("--all");
        Self::run_with_timeout(cmd, 120, cancel_flag)
    }

    pub fn stash(
        path: &str,
        message: Option<&str>,
        include_untracked: bool,
    ) -> Result<String, AppError> {
        let mut repo = Self::open_repo(path)?;

        let config = repo
            .config()
            .map_err(|e| AppError::Git(format!("Failed to read config: {}", e)))?;
        let name = config
            .get_string("user.name")
            .unwrap_or_else(|_| "Git Switcher".into());
        let email = config
            .get_string("user.email")
            .unwrap_or_else(|_| "git-switcher@local".into());
        let signature = git2::Signature::now(&name, &email)
            .map_err(|e| AppError::Git(format!("Failed to create signature: {}", e)))?;

        let flags = if include_untracked {
            Some(git2::StashFlags::INCLUDE_UNTRACKED)
        } else {
            None
        };
        let msg = message.unwrap_or("WIP: stashed by Git Switcher");
        let stash_oid = repo
            .stash_save2(&signature, Some(msg), flags)
            .map_err(|e| AppError::Git(format!("Failed to stash: {}", e)))?;

        Ok(stash_oid.to_string())
    }

    pub fn stash_pop(path: &str) -> Result<String, AppError> {
        let mut repo = Self::open_repo(path)?;
        repo.stash_pop(0, None)
            .map_err(|e| AppError::Git(format!("Failed to pop stash: {}", e)))?;
        Ok("Stash popped".to_string())
    }

    pub fn stash_pop_at(path: &str, index: usize) -> Result<String, AppError> {
        let mut repo = Self::open_repo(path)?;
        repo.stash_pop(index, None)
            .map_err(|e| AppError::Git(format!("Failed to pop stash@{{{}}}: {}", index, e)))?;
        Ok(format!("Stash@{{{}}} popped", index))
    }

    pub fn stash_apply(path: &str, index: usize) -> Result<String, AppError> {
        let mut repo = Self::open_repo(path)?;
        repo.stash_apply(index, None)
            .map_err(|e| AppError::Git(format!("Failed to apply stash@{{{}}}: {}", index, e)))?;
        Ok(format!("Stash@{{{}}} applied", index))
    }

    pub fn get_stash_list(path: &str) -> Result<Vec<StashInfo>, AppError> {
        let repo = Self::open_repo(path)?;
        let mut raw_stashes: Vec<(usize, String, String)> = Vec::new();
        {
            let mut repo_mut = Self::open_repo(path)?;
            repo_mut
                .stash_foreach(|index, name, oid| {
                    raw_stashes.push((index, name.to_string(), oid.to_string()));
                    true
                })
                .map_err(|e| AppError::Git(format!("Failed to list stashes: {}", e)))?;
        }
        let stashes = raw_stashes
            .into_iter()
            .map(|(index, name, oid)| {
                let ts = oid
                    .parse::<git2::Oid>()
                    .ok()
                    .and_then(|oid| repo.find_commit(oid).ok())
                    .map(|c| c.time().seconds())
                    .unwrap_or(0);
                let branch = if let Some(rest) = name.strip_prefix("On ") {
                    rest.split(": ").next().unwrap_or("").to_string()
                } else {
                    String::new()
                };
                StashInfo {
                    index,
                    message: name,
                    oid,
                    timestamp: ts,
                    branch,
                }
            })
            .collect();
        Ok(stashes)
    }

    pub fn stash_drop(path: &str, index: usize) -> Result<(), AppError> {
        let mut repo = Self::open_repo(path)?;
        repo.stash_drop(index)
            .map_err(|e| AppError::Git(format!("Failed to drop stash@{{{}}}: {}", index, e)))?;
        Ok(())
    }

    pub fn stash_show(path: &str, index: usize) -> Result<String, AppError> {
        let output = Self::git_cmd(path)
            .args(["stash", "show", "-p", &format!("stash@{{{}}}", index)])
            .output()
            .map_err(|e| AppError::Git(format!("Failed to run git stash show: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::Git(format!(
                "git stash show failed: {}",
                stderr.trim()
            )));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Build a git Command with env vars that prevent interactive prompts from hanging.
    fn git_cmd(path: &str) -> std::process::Command {
        let mut cmd = std::process::Command::new("git");
        cmd.current_dir(path)
            // Prevent SSH / HTTPS credential prompts from hanging forever
            .env("GIT_TERMINAL_PROMPT", "0")
            // Prevent SSH from waiting for host key confirmation
            .env(
                "GIT_SSH_COMMAND",
                "ssh -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new",
            );
        cmd
    }

    /// Run a Command with a timeout (seconds). Kills the process if it doesn't finish.
    /// If a cancel_flag is provided, checks it during polling and kills the process if set to false.
    fn run_with_timeout(
        mut cmd: std::process::Command,
        timeout_secs: u64,
        cancel_flag: Option<Arc<AtomicBool>>,
    ) -> Result<String, AppError> {
        let mut child = cmd
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()?;

        // Read stdout/stderr on separate threads to prevent pipe deadlock
        let stdout_handle = child.stdout.take().map(|mut o| {
            std::thread::spawn(move || {
                let mut s = String::new();
                use std::io::Read;
                let _ = o.read_to_string(&mut s);
                s
            })
        });
        let stderr_handle = child.stderr.take().map(|mut e| {
            std::thread::spawn(move || {
                let mut s = String::new();
                use std::io::Read;
                let _ = e.read_to_string(&mut s);
                s
            })
        });

        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(timeout_secs);

        // Poll with short interval — pipe reads are on separate threads so no deadlock
        let status = loop {
            // Check cancellation flag
            if let Some(ref flag) = cancel_flag {
                if !flag.load(Ordering::SeqCst) {
                    let _ = child.kill();
                    let _ = child.wait();
                    return Err(AppError::Other("Operation cancelled".to_string()));
                }
            }

            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => {
                    if start.elapsed() > timeout {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(AppError::Git(format!("Timed out after {}s", timeout_secs)));
                    }
                    std::thread::sleep(std::time::Duration::from_millis(100));
                }
                Err(e) => {
                    let _ = child.kill();
                    return Err(AppError::Io(e));
                }
            }
        };

        let stdout = stdout_handle
            .map(|h| h.join().unwrap_or_default())
            .unwrap_or_default();
        let stderr = stderr_handle
            .map(|h| h.join().unwrap_or_default())
            .unwrap_or_default();

        if status.success() {
            let out = if stdout.trim().is_empty() {
                stderr
            } else {
                stdout
            };
            Ok(out)
        } else {
            let err = if stderr.trim().is_empty() {
                stdout
            } else {
                stderr
            };
            Err(AppError::Git(err))
        }
    }

    // ── Branch Management ───────────────────────────────────────────────

    pub fn create_branch(
        path: &str,
        name: &str,
        from_branch: Option<&str>,
    ) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;

        let target = if let Some(from) = from_branch {
            let (object, _) = repo
                .revparse_ext(from)
                .map_err(|e| AppError::Git(format!("Branch '{}' not found: {}", from, e)))?;
            repo.find_commit(object.id())
                .map_err(|e| AppError::Git(format!("Failed to find commit: {}", e)))?
        } else {
            let head = repo
                .head()
                .map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
            repo.find_commit(
                head.target()
                    .ok_or(AppError::Git("No HEAD target".to_string()))?,
            )
            .map_err(|e| AppError::Git(format!("Failed to find HEAD commit: {}", e)))?
        };

        repo.branch(name, &target, false)
            .map_err(|e| AppError::Git(format!("Failed to create branch '{}': {}", name, e)))?;

        Ok(())
    }

    pub fn delete_branch(path: &str, name: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;

        let mut branch = repo
            .find_branch(name, BranchType::Local)
            .map_err(|e| AppError::Git(format!("Branch '{}' not found: {}", name, e)))?;

        branch
            .delete()
            .map_err(|e| AppError::Git(format!("Failed to delete branch '{}': {}", name, e)))?;

        Ok(())
    }

    pub fn merge_branch(path: &str, branch_name: &str) -> Result<MergeResult, AppError> {
        let repo = Self::open_repo(path)?;

        let (object, _) = repo
            .revparse_ext(branch_name)
            .map_err(|e| AppError::Git(format!("Branch '{}' not found: {}", branch_name, e)))?;

        let annotated_commit = repo
            .find_annotated_commit(object.id())
            .map_err(|e| AppError::Git(format!("Failed to find annotated commit: {}", e)))?;

        // Perform merge analysis
        let (merge_analysis, _) = repo
            .merge_analysis(&[&annotated_commit])
            .map_err(|e| AppError::Git(format!("Failed to analyze merge: {}", e)))?;

        if merge_analysis.is_up_to_date() {
            return Ok(MergeResult {
                success: true,
                message: "Already up-to-date".to_string(),
                conflicts: vec![],
            });
        }

        if merge_analysis.is_fast_forward() {
            // Fast-forward merge
            let head = repo
                .head()
                .map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;

            let target_branch = head
                .shorthand()
                .ok_or_else(|| AppError::Git("HEAD reference has no short name".to_string()))?;
            let merge_target = object.id();
            repo.reference(
                &format!("refs/heads/{}", target_branch),
                merge_target,
                true,
                "merge (fast-forward)",
            )
            .map_err(|e| AppError::Git(format!("Failed to update reference: {}", e)))?;

            repo.checkout_head(Some(&mut CheckoutBuilder::new().force()))
                .map_err(|e| AppError::Git(format!("Failed to checkout: {}", e)))?;

            return Ok(MergeResult {
                success: true,
                message: format!(
                    "Fast-forward merged '{}' into '{}'",
                    branch_name, target_branch
                ),
                conflicts: vec![],
            });
        }

        // Normal merge
        repo.merge(&[&annotated_commit], None, None)
            .map_err(|e| AppError::Git(format!("Failed to merge: {}", e)))?;

        // Check for conflicts
        let mut index = repo
            .index()
            .map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
        if index.has_conflicts() {
            let conflicts = Self::collect_conflicts(&mut index)?;
            Self::abort_to_head(&repo);
            return Ok(MergeResult {
                success: false,
                message: format!("Merge has {} conflict(s)", conflicts.len()),
                conflicts,
            });
        }

        // Commit the merge — abort on any failure
        let commit_result = (|| -> Result<(), AppError> {
            let tree_id = index
                .write_tree()
                .map_err(|e| AppError::Git(format!("Failed to write tree: {}", e)))?;
            let tree = repo
                .find_tree(tree_id)
                .map_err(|e| AppError::Git(format!("Failed to find tree: {}", e)))?;

            let signature = Self::get_signature(&repo)?;

            let head = repo
                .head()
                .map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
            let head_commit = repo
                .find_commit(head.target().ok_or(AppError::Git("No HEAD".to_string()))?)
                .map_err(|e| AppError::Git(format!("Failed to find HEAD commit: {}", e)))?;
            let merge_commit = repo
                .find_commit(object.id())
                .map_err(|e| AppError::Git(format!("Failed to find merge commit: {}", e)))?;

            repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                &format!("Merge branch '{}'", branch_name),
                &tree,
                &[&head_commit, &merge_commit],
            )
            .map_err(|e| AppError::Git(format!("Failed to commit merge: {}", e)))?;

            Ok(())
        })();

        if commit_result.is_err() {
            Self::abort_to_head(&repo);
        }
        if let Err(e) = repo.cleanup_state() {
            log::warn!("cleanup_state failed: {}", e);
        }

        commit_result?;

        Ok(MergeResult {
            success: true,
            message: format!("Merged branch '{}'", branch_name),
            conflicts: vec![],
        })
    }

    pub fn merge_with_strategy(
        path: &str,
        branch_name: &str,
        strategy: &str,
    ) -> Result<MergeResult, AppError> {
        match strategy {
            "no-ff" => Self::merge_no_ff(path, branch_name),
            "squash" => Self::merge_squash(path, branch_name),
            _ => Self::merge_branch(path, branch_name),
        }
    }

    fn merge_no_ff(path: &str, branch_name: &str) -> Result<MergeResult, AppError> {
        let repo = Self::open_repo(path)?;

        let (object, _) = repo
            .revparse_ext(branch_name)
            .map_err(|e| AppError::Git(format!("Branch '{}' not found: {}", branch_name, e)))?;

        let annotated_commit = repo
            .find_annotated_commit(object.id())
            .map_err(|e| AppError::Git(format!("Failed to find annotated commit: {}", e)))?;

        let (merge_analysis, _) = repo
            .merge_analysis(&[&annotated_commit])
            .map_err(|e| AppError::Git(format!("Failed to analyze merge: {}", e)))?;

        if merge_analysis.is_up_to_date() {
            return Ok(MergeResult {
                success: true,
                message: "Already up-to-date".to_string(),
                conflicts: vec![],
            });
        }

        // Always perform a merge commit (no fast-forward)
        repo.merge(&[&annotated_commit], None, None)
            .map_err(|e| AppError::Git(format!("Failed to merge: {}", e)))?;

        let mut index = repo
            .index()
            .map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
        if index.has_conflicts() {
            let conflicts = Self::collect_conflicts(&mut index)?;
            Self::abort_to_head(&repo);
            return Ok(MergeResult {
                success: false,
                message: format!("Merge has {} conflict(s)", conflicts.len()),
                conflicts,
            });
        }

        let commit_result = (|| -> Result<(), AppError> {
            let tree_id = index
                .write_tree()
                .map_err(|e| AppError::Git(format!("Failed to write tree: {}", e)))?;
            let tree = repo
                .find_tree(tree_id)
                .map_err(|e| AppError::Git(format!("Failed to find tree: {}", e)))?;

            let signature = Self::get_signature(&repo)?;

            let head = repo
                .head()
                .map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
            let head_commit = repo
                .find_commit(head.target().ok_or(AppError::Git("No HEAD".to_string()))?)
                .map_err(|e| AppError::Git(format!("Failed to find HEAD commit: {}", e)))?;
            let merge_commit = repo
                .find_commit(object.id())
                .map_err(|e| AppError::Git(format!("Failed to find merge commit: {}", e)))?;

            repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                &format!("Merge branch '{}'", branch_name),
                &tree,
                &[&head_commit, &merge_commit],
            )
            .map_err(|e| AppError::Git(format!("Failed to commit merge: {}", e)))?;

            Ok(())
        })();

        if commit_result.is_err() {
            Self::abort_to_head(&repo);
        }
        if let Err(e) = repo.cleanup_state() {
            log::warn!("cleanup_state failed: {}", e);
        }

        commit_result?;

        Ok(MergeResult {
            success: true,
            message: format!("Merged branch '{}' (no-ff)", branch_name),
            conflicts: vec![],
        })
    }

    fn merge_squash(path: &str, branch_name: &str) -> Result<MergeResult, AppError> {
        let repo = Self::open_repo(path)?;

        let (object, _) = repo
            .revparse_ext(branch_name)
            .map_err(|e| AppError::Git(format!("Branch '{}' not found: {}", branch_name, e)))?;

        let annotated_commit = repo
            .find_annotated_commit(object.id())
            .map_err(|e| AppError::Git(format!("Failed to find annotated commit: {}", e)))?;

        let (merge_analysis, _) = repo
            .merge_analysis(&[&annotated_commit])
            .map_err(|e| AppError::Git(format!("Failed to analyze merge: {}", e)))?;

        if merge_analysis.is_up_to_date() {
            return Ok(MergeResult {
                success: true,
                message: "Already up-to-date".to_string(),
                conflicts: vec![],
            });
        }

        // Perform squash merge (stage changes but don't commit)
        repo.merge(&[&annotated_commit], None, None)
            .map_err(|e| AppError::Git(format!("Failed to merge: {}", e)))?;

        let mut index = repo
            .index()
            .map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
        if index.has_conflicts() {
            let conflicts = Self::collect_conflicts(&mut index)?;
            Self::abort_to_head(&repo);
            return Ok(MergeResult {
                success: false,
                message: format!("Squash merge has {} conflict(s)", conflicts.len()),
                conflicts,
            });
        }

        // Stage all changes
        index
            .add_all(["*"], IndexAddOption::DEFAULT, None)
            .map_err(|e| AppError::Git(format!("Failed to stage changes: {}", e)))?;
        index
            .write()
            .map_err(|e| AppError::Git(format!("Failed to write index: {}", e)))?;

        // Cleanup merge state without committing
        if let Err(e) = repo.cleanup_state() {
            log::warn!("cleanup_state failed: {}", e);
        }

        Ok(MergeResult {
            success: true,
            message: format!(
                "Squash merged '{}' - staged changes, ready to commit",
                branch_name
            ),
            conflicts: vec![],
        })
    }

    // ── Cherry-pick (libgit2) ───────────────────────────────────────────

    pub fn cherry_pick(path: &str, commit_hash: &str) -> Result<MergeResult, AppError> {
        let repo = Self::open_repo(path)?;

        let oid = git2::Oid::from_str(commit_hash)
            .map_err(|e| AppError::Git(format!("Invalid commit hash '{}': {}", commit_hash, e)))?;
        let commit = repo
            .find_commit(oid)
            .map_err(|e| AppError::Git(format!("Commit '{}' not found: {}", commit_hash, e)))?;

        let head = repo
            .head()
            .map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
        let head_commit = repo
            .find_commit(
                head.target()
                    .ok_or(AppError::Git("No HEAD target".to_string()))?,
            )
            .map_err(|e| AppError::Git(format!("Failed to find HEAD commit: {}", e)))?;

        repo.cherrypick_commit(&commit, &head_commit, 0, None)
            .map_err(|e| AppError::Git(format!("Cherry-pick failed: {}", e)))?;

        // Check for conflicts — leave conflict state for user to resolve or abort
        let mut index = repo
            .index()
            .map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
        if index.has_conflicts() {
            let conflicts = Self::collect_conflicts(&mut index)?;
            return Ok(MergeResult {
                success: false,
                message: format!("Cherry-pick has {} conflict(s)", conflicts.len()),
                conflicts,
            });
        }

        // Commit the cherry-pick — abort on any failure
        let commit_result = (|| -> Result<(), AppError> {
            let tree_id = index
                .write_tree()
                .map_err(|e| AppError::Git(format!("Failed to write tree: {}", e)))?;
            let tree = repo
                .find_tree(tree_id)
                .map_err(|e| AppError::Git(format!("Failed to find tree: {}", e)))?;

            let signature = Self::get_signature(&repo)?;

            let head = repo
                .head()
                .map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
            let head_commit = repo
                .find_commit(head.target().ok_or(AppError::Git("No HEAD".to_string()))?)
                .map_err(|e| AppError::Git(format!("Failed to find HEAD commit: {}", e)))?;

            repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                &format!("Cherry-pick {}", commit_hash),
                &tree,
                &[&head_commit],
            )
            .map_err(|e| AppError::Git(format!("Failed to commit cherry-pick: {}", e)))?;

            Ok(())
        })();

        if commit_result.is_err() {
            Self::abort_to_head(&repo);
        }
        if let Err(e) = repo.cleanup_state() {
            log::warn!("cleanup_state failed: {}", e);
        }

        commit_result?;

        Ok(MergeResult {
            success: true,
            message: format!(
                "Cherry-picked commit {}",
                &commit_hash[..std::cmp::min(8, commit_hash.len())]
            ),
            conflicts: vec![],
        })
    }

    /// Cherry-pick a range of commits (from..to, exclusive of `from`).
    /// Walks from `to` backwards to `from`, then applies oldest-first.
    /// Stops on the first conflict.
    pub fn cherry_pick_range(path: &str, from: &str, to: &str) -> Result<MergeResult, AppError> {
        let repo = Self::open_repo(path)?;

        let from_oid = git2::Oid::from_str(from)
            .map_err(|e| AppError::Git(format!("Invalid commit hash '{}': {}", from, e)))?;
        let to_oid = git2::Oid::from_str(to)
            .map_err(|e| AppError::Git(format!("Invalid commit hash '{}': {}", to, e)))?;

        // Collect commits in range (from..to, exclusive of from)
        let mut revwalk = repo
            .revwalk()
            .map_err(|e| AppError::Git(format!("Failed to create revwalk: {}", e)))?;
        revwalk
            .set_sorting(git2::Sort::TOPOLOGICAL)
            .map_err(|e| AppError::Git(format!("Failed to set sorting: {}", e)))?;
        revwalk
            .push(to_oid)
            .map_err(|e| AppError::Git(format!("Failed to push to_oid: {}", e)))?;
        revwalk
            .hide(from_oid)
            .map_err(|e| AppError::Git(format!("Failed to hide from_oid: {}", e)))?;

        let mut commit_oids: Vec<git2::Oid> = Vec::new();
        for oid_result in revwalk {
            let oid = oid_result.map_err(|e| AppError::Git(format!("Revwalk error: {}", e)))?;
            commit_oids.push(oid);
        }

        if commit_oids.is_empty() {
            return Ok(MergeResult {
                success: true,
                message: "No commits in range".to_string(),
                conflicts: vec![],
            });
        }

        // Reverse so oldest commit is first (topological sort gives newest-first)
        commit_oids.reverse();

        let total = commit_oids.len();

        // Cherry-pick each commit sequentially
        for oid in &commit_oids {
            let commit = repo
                .find_commit(*oid)
                .map_err(|e| AppError::Git(format!("Failed to find commit {}: {}", oid, e)))?;

            let head = repo
                .head()
                .map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
            let head_commit = repo
                .find_commit(
                    head.target()
                        .ok_or(AppError::Git("No HEAD target".to_string()))?,
                )
                .map_err(|e| AppError::Git(format!("Failed to find HEAD commit: {}", e)))?;

            repo.cherrypick_commit(&commit, &head_commit, 0, None)
                .map_err(|e| AppError::Git(format!("Cherry-pick failed for {}: {}", oid, e)))?;

            // Check for conflicts
            let mut index = repo
                .index()
                .map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
            if index.has_conflicts() {
                let conflicts = Self::collect_conflicts(&mut index)?;
                Self::abort_to_head(&repo);
                let short = &oid.to_string()[..std::cmp::min(8, oid.to_string().len())];
                return Ok(MergeResult {
                    success: false,
                    message: format!(
                        "Cherry-pick range conflict at {}: {} conflict(s)",
                        short,
                        conflicts.len()
                    ),
                    conflicts,
                });
            }

            // Commit the cherry-pick
            let commit_result = (|| -> Result<(), AppError> {
                let tree_id = index
                    .write_tree()
                    .map_err(|e| AppError::Git(format!("Failed to write tree: {}", e)))?;
                let tree = repo
                    .find_tree(tree_id)
                    .map_err(|e| AppError::Git(format!("Failed to find tree: {}", e)))?;

                let signature = Self::get_signature(&repo)?;

                let head = repo
                    .head()
                    .map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
                let head_commit = repo
                    .find_commit(head.target().ok_or(AppError::Git("No HEAD".to_string()))?)
                    .map_err(|e| AppError::Git(format!("Failed to find HEAD commit: {}", e)))?;

                let oid_s = oid.to_string();
                let short = &oid_s[..std::cmp::min(8, oid_s.len())];
                let msg = commit.message().unwrap_or("").lines().next().unwrap_or("");

                repo.commit(
                    Some("HEAD"),
                    &signature,
                    &signature,
                    &format!("Cherry-pick {}: {}", short, msg),
                    &tree,
                    &[&head_commit],
                )
                .map_err(|e| AppError::Git(format!("Failed to commit cherry-pick: {}", e)))?;

                Ok(())
            })();

            if commit_result.is_err() {
                Self::abort_to_head(&repo);
            }
            if let Err(e) = repo.cleanup_state() {
                log::warn!("cleanup_state failed: {}", e);
            }

            commit_result?;
        }

        Ok(MergeResult {
            success: true,
            message: format!("Cherry-picked {} commit(s)", total),
            conflicts: vec![],
        })
    }

    // ── Rebase (CLI) ────────────────────────────────────────────────────

    pub fn rebase(path: &str, onto_branch: &str) -> Result<MergeResult, AppError> {
        let mut cmd = Self::git_cmd(path);
        cmd.args(["rebase", onto_branch]);
        match Self::run_with_timeout(cmd, 120, None) {
            Ok(output) => Ok(MergeResult {
                success: true,
                message: output.trim().to_string(),
                conflicts: vec![],
            }),
            Err(e) => {
                // Collect conflicting files BEFORE aborting (abort clears them)
                let conflicts = Self::collect_unmerged_files(path).unwrap_or_default();

                // Abort to restore repo to a clean state
                let mut abort_cmd = Self::git_cmd(path);
                abort_cmd.args(["rebase", "--abort"]);
                let _ = Self::run_with_timeout(abort_cmd, 30, None);

                Ok(MergeResult {
                    success: false,
                    message: format!("Rebase onto '{}' failed: {}", onto_branch, e),
                    conflicts,
                })
            }
        }
    }

    /// Collect unmerged (conflicting) file paths by inspecting the git index.
    /// Used after a failed rebase where libgit2 state may not be available.
    fn collect_unmerged_files(path: &str) -> Result<Vec<String>, AppError> {
        let repo = Self::open_repo(path)?;
        let mut index = repo
            .index()
            .map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
        Self::collect_conflicts(&mut index)
    }

    // ── Git Log ─────────────────────────────────────────────────────────

    pub fn get_log(
        path: &str,
        offset: usize,
        limit: usize,
        author: Option<&str>,
        message_contains: Option<&str>,
        since: Option<i64>,
        until: Option<i64>,
    ) -> Result<Vec<CommitInfo>, AppError> {
        let repo = Self::open_repo(path)?;

        // Empty repo with no commits — return empty log instead of error
        let head = match repo.head() {
            Ok(h) => h,
            Err(_) => return Ok(Vec::new()),
        };
        let head_oid = match head.target() {
            Some(oid) => oid,
            None => return Ok(Vec::new()),
        };

        let has_filters =
            author.is_some() || message_contains.is_some() || since.is_some() || until.is_some();

        let mut revwalk = repo
            .revwalk()
            .map_err(|e| AppError::Git(format!("Failed to create revwalk: {}", e)))?;

        revwalk
            .set_sorting(git2::Sort::TIME)
            .map_err(|e| AppError::Git(format!("Failed to set sorting: {}", e)))?;

        revwalk
            .push(head_oid)
            .map_err(|e| AppError::Git(format!("Failed to push HEAD: {}", e)))?;

        let author_lower = author.map(|a| a.to_lowercase());
        let msg_lower = message_contains.map(|m| m.to_lowercase());

        let mut commits = Vec::new();
        let mut filtered_count: usize = 0;

        for oid_result in revwalk {
            if !has_filters && filtered_count >= offset + limit {
                break;
            }
            if has_filters && commits.len() >= limit {
                break;
            }

            let oid = oid_result.map_err(|e| AppError::Git(format!("Failed to get oid: {}", e)))?;
            let commit = repo
                .find_commit(oid)
                .map_err(|e| AppError::Git(format!("Failed to find commit: {}", e)))?;

            let commit_author = commit.author();
            let commit_ts = commit_author.when().seconds();

            // Apply date filters
            if let Some(s) = since {
                if commit_ts < s {
                    continue;
                }
            }
            if let Some(u) = until {
                if commit_ts > u {
                    continue;
                }
            }

            // Apply author filter
            let author_name = commit_author.name().unwrap_or("Unknown").to_string();
            if let Some(ref al) = author_lower {
                if !author_name.to_lowercase().contains(al.as_str()) {
                    continue;
                }
            }

            // Apply message filter
            let commit_msg = commit
                .message()
                .unwrap_or("")
                .lines()
                .next()
                .unwrap_or("")
                .to_string();
            if let Some(ref ml) = msg_lower {
                if !commit_msg.to_lowercase().contains(ml.as_str()) {
                    continue;
                }
            }

            filtered_count += 1;
            if filtered_count <= offset {
                continue;
            }

            let parents: Vec<String> = commit.parent_ids().map(|id| id.to_string()).collect();
            let oid_s = oid.to_string();
            let short_len = 7.min(oid_s.len());

            // Collect refs pointing to this commit
            let refs: Vec<String> = repo
                .references()
                .map_err(|e| AppError::Git(format!("Failed to get references: {}", e)))?
                .filter_map(|r| r.ok())
                .filter(|r| r.target() == Some(oid))
                .filter_map(|r| {
                    r.name().map(|n| {
                        // Strip refs/heads/ and refs/tags/ prefixes for display
                        let name = n.to_string();
                        if let Some(name) = name.strip_prefix("refs/heads/") {
                            name.to_string()
                        } else if let Some(name) = name.strip_prefix("refs/tags/") {
                            name.to_string()
                        } else if let Some(name) = name.strip_prefix("refs/remotes/") {
                            name.to_string()
                        } else {
                            name
                        }
                    })
                })
                .collect();

            commits.push(CommitInfo {
                short_hash: oid_s[..short_len].to_string(),
                hash: oid_s,
                message: commit_msg,
                author: author_name,
                email: commit_author.email().unwrap_or("").to_string(),
                timestamp: commit_ts,
                parents,
                refs,
            });
        }

        Ok(commits)
    }

    // ── Remote operations (batch-capable, parallel) ────────────────────

    pub fn fetch_all_projects(paths: &[String]) -> Vec<(String, Result<String, AppError>)> {
        Self::run_batch(paths, |p| Self::fetch(&p, None))
    }

    /// Fetch all projects, skipping any that were fetched within the last 5 minutes.
    /// Checks `.git/FETCH_HEAD` mtime to determine last fetch time.
    pub fn auto_fetch_all(paths: &[String]) -> Vec<(String, Result<String, AppError>)> {
        let cooldown = std::time::Duration::from_secs(300);
        let eligible: Vec<String> = paths
            .iter()
            .filter(|p| {
                let fetch_head = std::path::Path::new(p).join(".git").join("FETCH_HEAD");
                match fetch_head.metadata().and_then(|m| m.modified()) {
                    Ok(modified) => match modified.elapsed() {
                        Ok(elapsed) => elapsed >= cooldown,
                        Err(_) => true,
                    },
                    Err(_) => true, // FETCH_HEAD doesn't exist → never fetched
                }
            })
            .cloned()
            .collect();

        if eligible.is_empty() {
            return paths
                .iter()
                .map(|p| {
                    let name = std::path::Path::new(p)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| p.clone());
                    (name, Ok("Skipped (recently fetched)".to_string()))
                })
                .collect();
        }

        Self::run_batch(&eligible, |p| Self::fetch(&p, None))
    }

    pub fn pull_all_projects(paths: &[String]) -> Vec<(String, Result<String, AppError>)> {
        Self::run_batch(paths, |p| Self::pull(&p, None))
    }

    pub fn push_all_projects(paths: &[String]) -> Vec<(String, Result<String, AppError>)> {
        Self::run_batch(paths, |p| Self::push(&p, None, None))
    }

    pub fn sync_all_projects(paths: &[String]) -> Vec<(String, Result<String, AppError>)> {
        Self::run_batch(paths, |p| {
            Self::fetch(&p, None)?;
            let repo = git2::Repository::open(&p)
                .map_err(|e| AppError::Git(format!("Failed to open repo: {}", e)))?;
            let status = Self::get_status(&repo)?;
            if status.behind > 0 {
                let msg = Self::pull(&p, None)?;
                Ok(format!("Pulled: {}", msg))
            } else if status.ahead > 0 {
                let msg = Self::push(&p, None, None)?;
                Ok(format!("Pushed: {}", msg))
            } else {
                Ok("Up to date".to_string())
            }
        })
    }

    fn run_batch<F>(paths: &[String], op: F) -> Vec<(String, Result<String, AppError>)>
    where
        F: Fn(String) -> Result<String, AppError> + Send + Sync + 'static,
    {
        use std::panic::catch_unwind;
        use std::sync::mpsc;
        const MAX_CONCURRENT: usize = 8;

        let op = std::sync::Arc::new(op);
        let (tx, rx) = mpsc::channel();

        // Process in chunks to bound concurrency
        for chunk in paths.chunks(MAX_CONCURRENT) {
            let handles: Vec<_> = chunk
                .iter()
                .map(|p| {
                    let path = p.clone();
                    let name = std::path::Path::new(p)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| p.clone());
                    let op = op.clone();
                    let tx = tx.clone();
                    std::thread::spawn(move || {
                        let result = catch_unwind(std::panic::AssertUnwindSafe(|| op(path)))
                            .unwrap_or_else(|e| {
                                let msg = if let Some(s) = e.downcast_ref::<String>() {
                                    s.clone()
                                } else if let Some(s) = e.downcast_ref::<&str>() {
                                    s.to_string()
                                } else {
                                    "unknown panic".to_string()
                                };
                                log::error!("Thread panicked during batch operation: {}", msg);
                                Err(AppError::Other(format!("Thread panicked: {}", msg)))
                            });
                        let _ = tx.send((name, result));
                    })
                })
                .collect();

            for h in handles {
                let _ = h.join();
            }
        }
        drop(tx);

        let mut results = Vec::with_capacity(paths.len());
        while let Ok(item) = rx.recv() {
            results.push(item);
        }
        results
    }

    // ── Tag Management ──────────────────────────────────────────────────

    pub fn list_tags(path: &str) -> Result<Vec<TagInfo>, AppError> {
        let repo = Self::open_repo(path)?;
        let mut tags = Vec::new();

        repo.tag_foreach(|oid, name_bytes| {
            let name = match std::str::from_utf8(name_bytes) {
                Ok(s) => s.strip_prefix("refs/tags/").unwrap_or(s).to_string(),
                Err(_) => return true, // skip invalid UTF-8
            };

            let (target_oid, tagger, message) = match repo.find_tag(oid) {
                Ok(tag) => (
                    tag.target_id().to_string(),
                    tag.tagger().map(|sig| {
                        format!(
                            "{} <{}>",
                            sig.name().unwrap_or(""),
                            sig.email().unwrap_or("")
                        )
                    }),
                    tag.message().map(|s| s.to_string()),
                ),
                Err(_) => {
                    // Lightweight tag — oid is the target directly
                    (oid.to_string(), None, None)
                }
            };

            tags.push(TagInfo {
                name,
                oid: oid.to_string(),
                target_oid,
                tagger,
                message,
            });
            true
        })
        .map_err(|e| AppError::Git(format!("Failed to list tags: {}", e)))?;

        tags.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(tags)
    }

    pub fn create_tag(
        path: &str,
        name: &str,
        message: Option<&str>,
        target_ref: Option<&str>,
    ) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;
        let target = repo
            .revparse_single(target_ref.unwrap_or("HEAD"))
            .map_err(|e| {
                AppError::Git(format!(
                    "Failed to resolve '{}': {}",
                    target_ref.unwrap_or("HEAD"),
                    e
                ))
            })?;

        if let Some(msg) = message {
            let signature = Self::get_signature(&repo)?;
            repo.tag(name, &target, &signature, msg, false)
                .map_err(|e| AppError::Git(format!("Failed to create tag '{}': {}", name, e)))?;
        } else {
            repo.tag_lightweight(name, &target, false)
                .map_err(|e| AppError::Git(format!("Failed to create tag '{}': {}", name, e)))?;
        }

        Ok(())
    }

    pub fn delete_tag(path: &str, name: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;
        repo.tag_delete(name)
            .map_err(|e| AppError::Git(format!("Failed to delete tag '{}': {}", name, e)))?;
        Ok(())
    }

    pub fn push_tag(path: &str, name: &str, remote: Option<&str>) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;
        let remote_name = remote.unwrap_or("origin");
        let mut remote = repo.find_remote(remote_name).map_err(|e| {
            AppError::Git(format!("Failed to find remote '{}': {}", remote_name, e))
        })?;

        let refspec = format!("refs/tags/{}:refs/tags/{}", name, name);
        remote
            .push(&[&refspec], None)
            .map_err(|e| AppError::Git(format!("Failed to push tag '{}': {}", name, e)))?;
        Ok(())
    }

    // ── Remote Management ────────────────────────────────────────────────

    pub fn list_remotes(path: &str) -> Result<Vec<RemoteInfo>, AppError> {
        let repo = Self::open_repo(path)?;
        let remotes = repo
            .remotes()
            .map_err(|e| AppError::Git(format!("Failed to list remotes: {}", e)))?;

        let mut result = Vec::new();
        for i in 0..remotes.len() {
            if let Some(name) = remotes.get(i) {
                if let Ok(remote) = repo.find_remote(name) {
                    let url = remote.url().unwrap_or("").to_string();
                    let push_url = remote.pushurl().map(|s| s.to_string());
                    result.push(RemoteInfo {
                        name: name.to_string(),
                        url,
                        push_url,
                    });
                }
            }
        }
        Ok(result)
    }

    pub fn add_remote(path: &str, name: &str, url: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;
        repo.remote(name, url)
            .map_err(|e| AppError::Git(format!("Failed to add remote '{}': {}", name, e)))?;
        Ok(())
    }

    pub fn remove_remote(path: &str, name: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;
        repo.remote_delete(name)
            .map_err(|e| AppError::Git(format!("Failed to remove remote '{}': {}", name, e)))?;
        Ok(())
    }

    pub fn set_remote_url(path: &str, name: &str, url: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;
        repo.remote_set_url(name, url).map_err(|e| {
            AppError::Git(format!("Failed to set URL for remote '{}': {}", name, e))
        })?;
        Ok(())
    }

    // ── Worktree Management ──────────────────────────────────────────────

    pub fn list_worktrees(path: &str) -> Result<Vec<WorktreeInfo>, AppError> {
        let repo = Self::open_repo(path)?;
        let names = repo
            .worktrees()
            .map_err(|e| AppError::Git(format!("Failed to list worktrees: {}", e)))?;

        let mut worktrees = Vec::new();
        for i in 0..names.len() {
            if let Some(name) = names.get(i) {
                match repo.find_worktree(name) {
                    Ok(wt) => {
                        let wt_path = wt.path().to_string_lossy().to_string();
                        let is_locked =
                            matches!(wt.is_locked(), Ok(git2::WorktreeLockStatus::Locked(_)));
                        let is_prunable = wt.is_prunable(None).unwrap_or(false);

                        // Determine branch and head from the worktree's repo
                        let (branch, head) = match Repository::open(&wt_path) {
                            Ok(wt_repo) => {
                                let branch = wt_repo
                                    .head()
                                    .ok()
                                    .and_then(|h| h.shorthand().map(|s| s.to_string()));
                                let head = wt_repo
                                    .head()
                                    .ok()
                                    .and_then(|h| h.target())
                                    .map(|oid| oid.to_string())
                                    .unwrap_or_default();
                                (branch, head)
                            }
                            Err(_) => (None, String::new()),
                        };

                        worktrees.push(WorktreeInfo {
                            name: name.to_string(),
                            path: wt_path,
                            branch,
                            head,
                            is_locked,
                            is_prunable,
                        });
                    }
                    Err(e) => {
                        log::warn!("Failed to get worktree '{}': {}", name, e);
                    }
                }
            }
        }

        Ok(worktrees)
    }

    pub fn add_worktree(
        path: &str,
        name: &str,
        branch: Option<&str>,
        create_branch: bool,
    ) -> Result<WorktreeInfo, AppError> {
        let parent = std::path::Path::new(path)
            .parent()
            .ok_or_else(|| AppError::Git("Cannot determine parent directory".to_string()))?;
        let worktree_path = parent.join(format!("{}.worktree", name));
        Self::add_worktree_at(path, &worktree_path, name, branch, create_branch)
    }

    pub fn add_worktree_at(
        repository_path: &str,
        worktree_path: &std::path::Path,
        name: &str,
        branch: Option<&str>,
        create_branch: bool,
    ) -> Result<WorktreeInfo, AppError> {
        let mut cmd = Self::git_cmd(repository_path);
        cmd.arg("worktree").arg("add");
        if create_branch {
            let branch = branch.ok_or_else(|| {
                AppError::Git(
                    "A branch name is required when creating a worktree branch".to_string(),
                )
            })?;
            cmd.arg("-b").arg(branch).arg(worktree_path);
        } else {
            cmd.arg(worktree_path);
            if let Some(branch) = branch {
                cmd.arg(branch);
            }
        }

        let output = cmd
            .output()
            .map_err(|e| AppError::Git(format!("Failed to add worktree: {}", e)))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::Git(format!(
                "Failed to add worktree: {}",
                stderr.trim()
            )));
        }

        let worktree_path_string = worktree_path.to_string_lossy().to_string();
        let worktree_repository = Repository::open(&worktree_path_string)
            .map_err(|e| AppError::Git(format!("Failed to open new worktree: {}", e)))?;
        let worktree_branch = worktree_repository
            .head()
            .ok()
            .and_then(|head| head.shorthand().map(str::to_string));
        let worktree_head = worktree_repository
            .head()
            .ok()
            .and_then(|head| head.target())
            .map(|oid| oid.to_string())
            .unwrap_or_default();

        Ok(WorktreeInfo {
            name: name.to_string(),
            path: worktree_path_string,
            branch: worktree_branch,
            head: worktree_head,
            is_locked: false,
            is_prunable: false,
        })
    }

    pub fn remove_worktree(path: &str, name: &str) -> Result<(), AppError> {
        // git2 0.18 does not expose worktree_remove — use git CLI
        let mut cmd = Self::git_cmd(path);
        cmd.arg("worktree").arg("remove").arg(name);
        let output = cmd
            .output()
            .map_err(|e| AppError::Git(format!("Failed to remove worktree: {}", e)))?;
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::Git(format!(
                "Failed to remove worktree '{}': {}",
                name,
                stderr.trim()
            )));
        }
        Ok(())
    }

    pub fn prune_worktrees(path: &str) -> Result<Vec<String>, AppError> {
        let repo = Self::open_repo(path)?;

        // Collect worktrees that are prunable before pruning
        let names = repo
            .worktrees()
            .map_err(|e| AppError::Git(format!("Failed to list worktrees: {}", e)))?;

        let mut prunable_names = Vec::new();
        for i in 0..names.len() {
            if let Some(name) = names.get(i) {
                if let Ok(wt) = repo.find_worktree(name) {
                    if wt.is_prunable(None).unwrap_or(false) {
                        prunable_names.push(name.to_string());
                    }
                }
            }
        }

        // Prune each prunable worktree
        for name in &prunable_names {
            if let Ok(wt) = repo.find_worktree(name) {
                if let Err(e) = wt.prune(None) {
                    log::warn!("Failed to prune worktree '{}': {}", name, e);
                }
            }
        }

        Ok(prunable_names)
    }

    // ── Submodule Management ────────────────────────────────────────────

    pub fn list_submodules(path: &str) -> Result<Vec<SubmoduleInfo>, AppError> {
        let repo = Self::open_repo(path)?;
        let submodules = repo
            .submodules()
            .map_err(|e| AppError::Git(format!("Failed to list submodules: {}", e)))?;

        let mut result = Vec::new();
        for sm in &submodules {
            let name = sm.name().unwrap_or("").to_string();
            let path_str = sm.path().to_string_lossy().to_string();
            let url = sm.url().unwrap_or("").to_string();
            let head = sm.head_id().map(|oid| oid.to_string()).unwrap_or_default();
            // A submodule is active if its repo can be opened
            let sm_full_path = std::path::Path::new(path).join(sm.path());
            let active =
                sm_full_path.join(".git").exists() || Repository::open(&sm_full_path).is_ok();

            result.push(SubmoduleInfo {
                name,
                path: path_str,
                url,
                head,
                active,
            });
        }
        Ok(result)
    }

    pub fn update_submodule(path: &str, name: &str) -> Result<String, AppError> {
        let mut cmd = Self::git_cmd(path);
        cmd.arg("submodule")
            .arg("update")
            .arg("--init")
            .arg("--remote")
            .arg(name);
        let output = cmd
            .output()
            .map_err(|e| AppError::Git(format!("Failed to update submodule: {}", e)))?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(AppError::Git(format!(
                "Submodule update failed: {}",
                stderr
            )))
        }
    }

    pub fn init_submodules(path: &str) -> Result<String, AppError> {
        let mut cmd = Self::git_cmd(path);
        cmd.arg("submodule").arg("init");
        let init_out = cmd
            .output()
            .map_err(|e| AppError::Git(format!("Failed to init submodules: {}", e)))?;
        if !init_out.status.success() {
            let stderr = String::from_utf8_lossy(&init_out.stderr).trim().to_string();
            return Err(AppError::Git(format!("Submodule init failed: {}", stderr)));
        }

        let mut cmd2 = Self::git_cmd(path);
        cmd2.arg("submodule").arg("update");
        let update_out = cmd2
            .output()
            .map_err(|e| AppError::Git(format!("Failed to update submodules: {}", e)))?;
        if update_out.status.success() {
            Ok(String::from_utf8_lossy(&update_out.stdout)
                .trim()
                .to_string())
        } else {
            let stderr = String::from_utf8_lossy(&update_out.stderr)
                .trim()
                .to_string();
            Err(AppError::Git(format!(
                "Submodule update failed: {}",
                stderr
            )))
        }
    }

    pub fn blame_file(path: &str, file_path: &str) -> Result<Vec<BlameLine>, AppError> {
        let repo = Self::open_repo(path)?;

        let mut opts = git2::BlameOptions::new();
        let blame = repo
            .blame_file(std::path::Path::new(file_path), Some(&mut opts))
            .map_err(|e| AppError::Git(format!("Failed to blame '{}': {}", file_path, e)))?;

        // Read file content for line text
        let file_content = std::fs::read_to_string(format!("{}/{}", path, file_path))
            .map_err(|e| AppError::Git(format!("Failed to read file '{}': {}", file_path, e)))?;
        let lines: Vec<&str> = file_content.lines().collect();

        let mut result = Vec::new();
        let mut line_no: usize = 1;

        for i in 0..blame.len() {
            let hunk = blame
                .get_index(i)
                .ok_or_else(|| AppError::Git(format!("Missing blame hunk at index {}", i)))?;
            let lines_in_hunk = hunk.lines_in_hunk();
            let commit_id = hunk.final_commit_id();
            let short_hash = {
                let s = commit_id.to_string();
                s[..7.min(s.len())].to_string()
            };
            let sig = hunk.final_signature();
            let author = sig.name().unwrap_or("Unknown").to_string();
            let timestamp = sig.when().seconds();

            for _j in 0..lines_in_hunk {
                let content = lines.get(line_no - 1).unwrap_or(&"").to_string();
                result.push(BlameLine {
                    line: line_no,
                    content,
                    commit_id: short_hash.clone(),
                    author: author.clone(),
                    timestamp,
                });
                line_no += 1;
            }
        }

        Ok(result)
    }

    pub fn compare_branches(
        path: &str,
        branch_a: &str,
        branch_b: &str,
    ) -> Result<BranchCompareResult, AppError> {
        let repo = Self::open_repo(path)?;

        // Resolve branch tips
        let oid_a = Self::resolve_branch_oid(&repo, branch_a)?;
        let oid_b = Self::resolve_branch_oid(&repo, branch_b)?;

        // Find merge base
        let merge_base = repo.merge_base(oid_a, oid_b).map_err(|e| {
            AppError::Git(format!(
                "No common ancestor between '{}' and '{}': {}",
                branch_a, branch_b, e
            ))
        })?;

        // Count ahead/behind using graph_ahead_behind
        let (ahead, behind) = repo
            .graph_ahead_behind(oid_a, oid_b)
            .map_err(|e| AppError::Git(format!("Failed to compute ahead/behind: {}", e)))?;

        // Collect ahead commits (in branch_a but not branch_b)
        let ahead_commits = Self::walk_commits(&repo, oid_a, merge_base, 50)?;

        // Collect behind commits (in branch_b but not branch_a)
        let behind_commits = Self::walk_commits(&repo, oid_b, merge_base, 50)?;

        // Compute changed files with diff stats between the two branch tips
        let changed_files = Self::diff_between_commits(&repo, oid_a, oid_b)?;

        Ok(BranchCompareResult {
            ahead,
            behind,
            ahead_commits,
            behind_commits,
            changed_files,
        })
    }

    fn resolve_branch_oid(repo: &Repository, branch_name: &str) -> Result<git2::Oid, AppError> {
        // Try local branch first
        if let Ok(branch) = repo.find_branch(branch_name, BranchType::Local) {
            if let Some(oid) = branch.get().target() {
                return Ok(oid);
            }
        }
        // Try remote branch
        if let Ok(branch) = repo.find_branch(branch_name, BranchType::Remote) {
            if let Some(oid) = branch.get().target() {
                return Ok(oid);
            }
        }
        // Try revparse (HEAD, tags, short hashes, etc.)
        let (obj, _) = repo
            .revparse_ext(branch_name)
            .map_err(|e| AppError::Git(format!("Branch '{}' not found: {}", branch_name, e)))?;
        Ok(obj.id())
    }

    /// Walk commits from `tip` stopping at `stop_oid`, collecting up to `limit`.
    fn walk_commits(
        repo: &Repository,
        tip: git2::Oid,
        stop_oid: git2::Oid,
        limit: usize,
    ) -> Result<Vec<CommitInfo>, AppError> {
        let mut revwalk = repo
            .revwalk()
            .map_err(|e| AppError::Git(format!("Failed to create revwalk: {}", e)))?;
        revwalk
            .set_sorting(git2::Sort::TIME)
            .map_err(|e| AppError::Git(format!("Failed to set sorting: {}", e)))?;
        revwalk
            .push(tip)
            .map_err(|e| AppError::Git(format!("Failed to push oid: {}", e)))?;

        // Hide the merge base and everything reachable from it
        revwalk
            .hide(stop_oid)
            .map_err(|e| AppError::Git(format!("Failed to hide stop oid: {}", e)))?;

        let mut commits = Vec::new();
        for oid_result in revwalk {
            if commits.len() >= limit {
                break;
            }
            let oid = oid_result.map_err(|e| AppError::Git(format!("Revwalk error: {}", e)))?;
            let commit = repo
                .find_commit(oid)
                .map_err(|e| AppError::Git(format!("Failed to find commit: {}", e)))?;

            let author = commit.author();
            let oid_s = oid.to_string();
            let short_len = 7.min(oid_s.len());
            commits.push(CommitInfo {
                short_hash: oid_s[..short_len].to_string(),
                hash: oid_s,
                message: commit
                    .message()
                    .unwrap_or("")
                    .lines()
                    .next()
                    .unwrap_or("")
                    .to_string(),
                author: author.name().unwrap_or("Unknown").to_string(),
                email: author.email().unwrap_or("").to_string(),
                timestamp: author.when().seconds(),
                parents: commit.parent_ids().map(|id| id.to_string()).collect(),
                refs: Vec::new(), // Will be populated in Task 2
            });
        }
        Ok(commits)
    }

    fn diff_between_commits(
        repo: &Repository,
        oid_a: git2::Oid,
        oid_b: git2::Oid,
    ) -> Result<Vec<ChangedFileInfo>, AppError> {
        let commit_a = repo
            .find_commit(oid_a)
            .map_err(|e| AppError::Git(format!("Failed to find commit: {}", e)))?;
        let tree_a = commit_a
            .tree()
            .map_err(|e| AppError::Git(format!("Failed to get tree: {}", e)))?;

        let commit_b = repo
            .find_commit(oid_b)
            .map_err(|e| AppError::Git(format!("Failed to find commit: {}", e)))?;
        let tree_b = commit_b
            .tree()
            .map_err(|e| AppError::Git(format!("Failed to get tree: {}", e)))?;

        let mut opts = DiffOptions::new();
        opts.force_text(true);

        let diff = repo
            .diff_tree_to_tree(Some(&tree_a), Some(&tree_b), Some(&mut opts))
            .map_err(|e| AppError::Git(format!("Failed to compute diff: {}", e)))?;

        let mut files = Vec::new();
        for delta_idx in 0..diff.deltas().len() {
            let delta = diff.deltas().nth(delta_idx).unwrap();
            let file_path = delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();

            // Get per-file stats via patch
            let patch = git2::Patch::from_diff(&diff, delta_idx)
                .map_err(|e| AppError::Git(format!("Failed to create patch: {}", e)))?;
            let (additions, deletions) = if let Some(p) = patch {
                let stats = p
                    .line_stats()
                    .map_err(|e| AppError::Git(format!("Failed to get line stats: {}", e)))?;
                (stats.1 as u32, stats.2 as u32)
            } else {
                (0, 0)
            };

            files.push(ChangedFileInfo {
                path: file_path,
                additions,
                deletions,
            });
        }
        Ok(files)
    }

    fn run_git_command(path: &str, args: &[&str]) -> Result<String, AppError> {
        let output = std::process::Command::new("git")
            .current_dir(path)
            .args(args)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to run git: {}", e)))?;
        if output.status.success() {
            Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            Err(AppError::Git(format!("Git error: {}", stderr)))
        }
    }

    fn parse_bisect_output(output: &str) -> BisectState {
        let mut state = BisectState {
            active: true,
            current_commit: String::new(),
            good_commit: String::new(),
            bad_commit: String::new(),
            steps_remaining: 0,
            total_steps: 0,
            message: output.to_string(),
        };
        for line in output.lines() {
            if line.starts_with("Bisecting:") {
                state.message = line.to_string();
                if let Some(remaining) = line.split_whitespace().nth(1) {
                    state.steps_remaining = remaining.parse().unwrap_or(0);
                }
            }
            if line.len() >= 7 && line.chars().take(7).all(|c| c.is_ascii_hexdigit()) {
                state.current_commit = line[..7].to_string();
            }
        }
        state
    }

    pub fn preview_clean(path: &str, include_ignored: bool) -> Result<Vec<String>, AppError> {
        let flag = if include_ignored { "-fdxn" } else { "-fdn" };
        let output = Self::run_git_command(path, &["clean", flag])?;
        let files: Vec<String> = output
            .lines()
            .filter(|l| !l.is_empty())
            .map(|l| {
                // git clean output: "Would remove path/to/file"
                l.strip_prefix("Would remove ").unwrap_or(l).to_string()
            })
            .collect();
        Ok(files)
    }

    pub fn execute_clean(path: &str, include_ignored: bool) -> Result<Vec<String>, AppError> {
        let flag = if include_ignored { "-fdx" } else { "-fd" };
        let output = Self::run_git_command(path, &["clean", flag])?;
        let files: Vec<String> = output
            .lines()
            .filter(|l| !l.is_empty())
            .map(|l| l.strip_prefix("Removing ").unwrap_or(l).to_string())
            .collect();
        Ok(files)
    }

    pub fn create_patch(path: &str, commit_hash: &str) -> Result<String, AppError> {
        let output = Self::run_git_command(path, &["format-patch", "-1", commit_hash, "--stdout"])?;
        if output.is_empty() {
            return Err(AppError::Git("No patch content generated".to_string()));
        }
        Ok(output)
    }

    pub fn check_patch(path: &str, patch_content: &str) -> Result<String, AppError> {
        // Write patch to a temp file and run git apply --check
        let tmp = std::env::temp_dir().join(format!("git-switcher-{}.patch", std::process::id()));
        std::fs::write(&tmp, patch_content)
            .map_err(|e| AppError::Git(format!("Failed to write temp patch: {}", e)))?;
        let result = Self::run_git_command(path, &["apply", "--check", &tmp.to_string_lossy()]);
        let _ = std::fs::remove_file(&tmp);
        result
    }

    pub fn apply_patch(path: &str, patch_content: &str) -> Result<String, AppError> {
        let tmp = std::env::temp_dir().join(format!("git-switcher-{}.patch", std::process::id()));
        std::fs::write(&tmp, patch_content)
            .map_err(|e| AppError::Git(format!("Failed to write temp patch: {}", e)))?;
        let result = Self::run_git_command(path, &["apply", &tmp.to_string_lossy()]);
        let _ = std::fs::remove_file(&tmp);
        match result {
            Ok(_) => Ok("Patch applied successfully".to_string()),
            Err(e) => Err(e),
        }
    }

    pub fn list_conflicts(path: &str) -> Result<Vec<String>, AppError> {
        let output = Self::run_git_command(path, &["diff", "--name-only", "--diff-filter=U"])?;
        let files: Vec<String> = output
            .lines()
            .filter(|l| !l.is_empty())
            .map(|l| l.to_string())
            .collect();
        Ok(files)
    }

    pub fn resolve_conflict_ours(path: &str, file_path: &str) -> Result<(), AppError> {
        Self::run_git_command(path, &["checkout", "--ours", file_path])?;
        Self::run_git_command(path, &["add", file_path])?;
        Ok(())
    }

    pub fn resolve_conflict_theirs(path: &str, file_path: &str) -> Result<(), AppError> {
        Self::run_git_command(path, &["checkout", "--theirs", file_path])?;
        Self::run_git_command(path, &["add", file_path])?;
        Ok(())
    }

    pub fn abort_merge(path: &str) -> Result<String, AppError> {
        let output = Self::run_git_command(path, &["merge", "--abort"])?;
        Ok(output)
    }

    pub fn abort_cherry_pick(path: &str) -> Result<String, AppError> {
        let output = Self::run_git_command(path, &["cherry-pick", "--abort"])?;
        Ok(output)
    }

    pub fn bisect_start(path: &str, good: &str, bad: &str) -> Result<BisectState, AppError> {
        let output = Self::run_git_command(path, &["bisect", "start", bad, good])?;
        Ok(Self::parse_bisect_output(&output))
    }

    pub fn bisect_good(path: &str) -> Result<BisectState, AppError> {
        let output = Self::run_git_command(path, &["bisect", "good"])?;
        if output.contains("is the first bad commit") {
            let commit = output
                .lines()
                .next()
                .unwrap_or("")
                .chars()
                .take(7)
                .collect();
            return Ok(BisectState {
                active: false,
                current_commit: commit,
                good_commit: String::new(),
                bad_commit: String::new(),
                steps_remaining: 0,
                total_steps: 0,
                message: output,
            });
        }
        Ok(Self::parse_bisect_output(&output))
    }

    pub fn bisect_bad(path: &str) -> Result<BisectState, AppError> {
        let output = Self::run_git_command(path, &["bisect", "bad"])?;
        if output.contains("is the first bad commit") {
            let commit = output
                .lines()
                .next()
                .unwrap_or("")
                .chars()
                .take(7)
                .collect();
            return Ok(BisectState {
                active: false,
                current_commit: commit,
                good_commit: String::new(),
                bad_commit: String::new(),
                steps_remaining: 0,
                total_steps: 0,
                message: output,
            });
        }
        Ok(Self::parse_bisect_output(&output))
    }

    pub fn bisect_reset(path: &str) -> Result<(), AppError> {
        Self::run_git_command(path, &["bisect", "reset"])?;
        Ok(())
    }

    // ── Git Reset ────────────────────────────────────────────────────────

    /// Reset the repository to the given target with the specified mode.
    ///
    /// `target` can be a commit hash, "HEAD", "HEAD~N", a branch name, etc.
    /// `mode` is one of "soft", "mixed", "hard".
    pub fn git_reset(path: &str, target: &str, mode: &str) -> Result<String, AppError> {
        let repo = Self::open_repo(path)?;

        let reset_type = match mode {
            "soft" => git2::ResetType::Soft,
            "mixed" => git2::ResetType::Mixed,
            "hard" => git2::ResetType::Hard,
            _ => {
                return Err(AppError::Git(format!(
                    "Invalid reset mode '{}'. Use soft, mixed, or hard.",
                    mode
                )))
            }
        };

        // Resolve target string (commit hash, HEAD, HEAD~N, branch name, etc.)
        let obj = repo
            .revparse_single(target)
            .map_err(|e| AppError::Git(format!("Failed to resolve '{}': {}", target, e)))?;

        // Safety check: refuse hard reset if there are uncommitted changes
        if reset_type == git2::ResetType::Hard {
            let statuses = repo
                .statuses(Some(
                    git2::StatusOptions::new()
                        .include_untracked(true)
                        .include_ignored(false),
                ))
                .map_err(|e| AppError::Git(format!("Failed to get status: {}", e)))?;

            if !statuses.is_empty() {
                return Err(AppError::Git(
                    "Cannot hard reset: there are uncommitted changes. Stash or commit them first."
                        .to_string(),
                ));
            }
        }

        repo.reset(&obj, reset_type, None)
            .map_err(|e| AppError::Git(format!("Reset failed: {}", e)))?;

        let short = target.to_string();
        Ok(format!("Reset ({}) to {}", mode, short))
    }

    pub fn bisect_status(path: &str) -> Result<Option<BisectState>, AppError> {
        let bisect_log = std::path::Path::new(path).join(".git").join("BISECT_LOG");
        if !bisect_log.exists() {
            return Ok(None);
        }
        let head = Self::run_git_command(path, &["rev-parse", "--short", "HEAD"])?;
        Ok(Some(BisectState {
            active: true,
            current_commit: head,
            good_commit: String::new(),
            bad_commit: String::new(),
            steps_remaining: 0,
            total_steps: 0,
            message: "Bisect in progress".to_string(),
        }))
    }

    pub fn get_commit_log(
        repo_path: &str,
        max_count: Option<usize>,
    ) -> Result<Vec<LogEntry>, AppError> {
        let repo = Self::open_repo(repo_path)?;
        let max = max_count.unwrap_or(100);

        // Build ref map: oid -> Vec<ref_name>
        let mut ref_map: std::collections::HashMap<String, Vec<String>> =
            std::collections::HashMap::new();
        if let Ok(refs) = repo.references() {
            for reference in refs.flatten() {
                if let Some(oid) = reference.target() {
                    let name = reference.shorthand().unwrap_or("").to_string();
                    if !name.is_empty() {
                        ref_map.entry(oid.to_string()).or_default().push(name);
                    }
                }
            }
        }

        let mut revwalk = repo
            .revwalk()
            .map_err(|e| AppError::Git(format!("Revwalk error: {}", e)))?;
        revwalk
            .set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)
            .ok();
        revwalk
            .push_head()
            .map_err(|e| AppError::Git(format!("Push head error: {}", e)))?;

        let mut results = Vec::new();
        let mut lane_map: std::collections::HashMap<String, usize> =
            std::collections::HashMap::new();
        let mut next_lane: usize = 0;

        for oid_result in revwalk {
            if results.len() >= max {
                break;
            }
            let oid = oid_result.map_err(|e| AppError::Git(format!("Revwalk error: {}", e)))?;
            let commit = repo
                .find_commit(oid)
                .map_err(|e| AppError::Git(format!("Commit error: {}", e)))?;
            let oid_str = oid.to_string();

            // Assign lane
            let lane = *lane_map.entry(oid_str.clone()).or_insert_with(|| {
                let l = next_lane;
                next_lane += 1;
                l
            });
            lane_map.remove(&oid_str);

            // Assign lanes to parents
            let mut parents = Vec::new();
            for i in 0..commit.parent_count() {
                if let Ok(parent) = commit.parent(i) {
                    let parent_oid = parent.id().to_string();
                    parents.push(parent_oid.clone());
                    // First parent inherits current lane, others get new lanes
                    if i == 0 {
                        lane_map.entry(parent_oid).or_insert(lane);
                    } else {
                        let new_lane = next_lane;
                        next_lane += 1;
                        lane_map.entry(parent_oid).or_insert(new_lane);
                    }
                }
            }

            let refs = ref_map.get(&oid_str).cloned().unwrap_or_default();

            results.push(LogEntry {
                hash: oid_str,
                short_hash: oid.to_string()[..7].to_string(),
                message: commit
                    .message()
                    .unwrap_or("")
                    .lines()
                    .next()
                    .unwrap_or("")
                    .to_string(),
                author: commit.author().name().unwrap_or("Unknown").to_string(),
                timestamp: commit.time().seconds(),
                parents,
                refs,
                lane,
            });
        }
        Ok(results)
    }

    pub fn file_history(
        repo_path: &str,
        file_path: &str,
        max_count: Option<usize>,
    ) -> Result<Vec<FileCommitEntry>, AppError> {
        let repo = Self::open_repo(repo_path)?;
        let max = max_count.unwrap_or(50);
        let mut revwalk = repo
            .revwalk()
            .map_err(|e| AppError::Git(format!("Failed to create revwalk: {}", e)))?;
        revwalk
            .set_sorting(git2::Sort::TIME)
            .map_err(|e| AppError::Git(format!("Failed to set sort: {}", e)))?;
        revwalk
            .push_head()
            .map_err(|e| AppError::Git(format!("Failed to push head: {}", e)))?;

        let mut results = Vec::new();
        for oid_result in revwalk {
            if results.len() >= max {
                break;
            }
            let oid = oid_result.map_err(|e| AppError::Git(format!("Revwalk error: {}", e)))?;
            let commit = repo
                .find_commit(oid)
                .map_err(|e| AppError::Git(format!("Commit not found: {}", e)))?;

            // Check if this commit touches the file
            let tree = commit
                .tree()
                .map_err(|e| AppError::Git(format!("Tree error: {}", e)))?;
            let parent_tree = if commit.parent_count() > 0 {
                commit.parent(0).ok().and_then(|p| p.tree().ok())
            } else {
                None
            };

            let mut diff_opts = git2::DiffOptions::new();
            let diff = repo
                .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut diff_opts))
                .map_err(|e| AppError::Git(format!("Diff error: {}", e)))?;

            let mut touches_file = false;
            let mut additions: u32 = 0;
            let mut deletions: u32 = 0;

            for delta_idx in 0..diff.deltas().len() {
                if let Some(delta) = diff.get_delta(delta_idx) {
                    let old_path = delta
                        .old_file()
                        .path()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let new_path = delta
                        .new_file()
                        .path()
                        .map(|p| p.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if old_path == file_path || new_path == file_path {
                        touches_file = true;
                        if let Ok(Some(patch)) = git2::Patch::from_diff(&diff, delta_idx) {
                            if let Ok(stats) = patch.line_stats() {
                                additions = stats.1 as u32;
                                deletions = stats.2 as u32;
                            }
                        }
                        break;
                    }
                }
            }

            if touches_file {
                results.push(FileCommitEntry {
                    hash: oid.to_string(),
                    message: commit
                        .message()
                        .unwrap_or("")
                        .lines()
                        .next()
                        .unwrap_or("")
                        .to_string(),
                    author: commit.author().name().unwrap_or("Unknown").to_string(),
                    timestamp: commit.time().seconds(),
                    additions,
                    deletions,
                });
            }
        }
        Ok(results)
    }

    pub fn squash_last_n(
        path: &str,
        n: usize,
        message: Option<&str>,
    ) -> Result<MergeResult, AppError> {
        if n < 2 {
            return Err(AppError::Git(
                "Need at least 2 commits to squash".to_string(),
            ));
        }
        let repo = Self::open_repo(path)?;
        let head = repo
            .head()
            .map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
        let head_oid = head
            .target()
            .ok_or_else(|| AppError::Git("HEAD has no target".to_string()))?;

        // Walk back N commits to find the target
        let mut revwalk = repo
            .revwalk()
            .map_err(|e| AppError::Git(format!("Revwalk error: {}", e)))?;
        revwalk
            .push(head_oid)
            .map_err(|e| AppError::Git(format!("Push error: {}", e)))?;
        revwalk.set_sorting(git2::Sort::NONE).ok();

        let mut target_oid = None;
        for (i, oid_result) in revwalk.enumerate() {
            if i == n - 1 {
                target_oid =
                    Some(oid_result.map_err(|e| AppError::Git(format!("Revwalk error: {}", e)))?);
                break;
            }
        }

        let target_oid = target_oid.ok_or_else(|| {
            AppError::Git(format!("Not enough commits (need {}, found fewer)", n))
        })?;
        let target_commit = repo
            .find_commit(target_oid)
            .map_err(|e| AppError::Git(format!("Commit error: {}", e)))?;

        // Get the parent of the oldest commit in the range
        let parent = target_commit
            .parent(0)
            .map_err(|e| AppError::Git(format!("Parent error: {}", e)))?;
        let _parent_tree = parent
            .tree()
            .map_err(|e| AppError::Git(format!("Tree error: {}", e)))?;

        // Get HEAD tree (the result of all N commits)
        let head_commit = repo
            .find_commit(head_oid)
            .map_err(|e| AppError::Git(format!("Head commit error: {}", e)))?;
        let head_tree = head_commit
            .tree()
            .map_err(|e| AppError::Git(format!("Head tree error: {}", e)))?;

        // Build commit message
        let default_msg = format!("Squash {} commits", n);
        let msg = message.unwrap_or(&default_msg);

        // Create the squashed commit
        let sig = repo
            .signature()
            .map_err(|e| AppError::Git(format!("Signature error: {}", e)))?;
        let new_oid = repo
            .commit(Some("HEAD"), &sig, &sig, msg, &head_tree, &[&parent])
            .map_err(|e| AppError::Git(format!("Commit error: {}", e)))?;

        Ok(MergeResult {
            success: true,
            conflicts: vec![],
            message: format!("Squashed {} commits into {}", n, &new_oid.to_string()[..7]),
        })
    }

    /// Shared helper: run an interactive rebase on `commit_hash` with automated editors.
    /// `seq_editor_script` is passed to `perl -i -pe` as the GIT_SEQUENCE_EDITOR.
    /// `git_editor` is set as GIT_EDITOR (defaults to "true" = no-op if None).
    fn run_interactive_rebase(
        path: &str,
        commit_hash: &str,
        seq_editor_script: &str,
        git_editor: Option<&str>,
    ) -> Result<String, AppError> {
        let repo = Self::open_repo(path)?;

        let oid = git2::Oid::from_str(commit_hash)
            .map_err(|_| AppError::Git(format!("Invalid commit hash: {}", commit_hash)))?;
        repo.find_commit(oid)
            .map_err(|_| AppError::Git(format!("Commit not found: {}", commit_hash)))?;

        let head = repo
            .head()
            .map_err(|e| AppError::Git(format!("HEAD error: {}", e)))?;
        let head_oid = head
            .target()
            .ok_or_else(|| AppError::Git("HEAD has no target".to_string()))?;

        if oid == head_oid {
            return Err(AppError::Git(
                "Cannot rebase HEAD commit — use amend instead".to_string(),
            ));
        }

        // Count commits between target (exclusive) and HEAD (inclusive) → HEAD~(count+1) is parent of target
        let range = format!("{}..{}", commit_hash, head_oid);
        let count_output = Self::run_with_timeout(
            {
                let mut cmd = Self::git_cmd(path);
                cmd.args(["rev-list", &range, "--count"]);
                cmd
            },
            10,
            None,
        )?;
        let count: usize = count_output
            .trim()
            .parse()
            .map_err(|_| AppError::Git("Failed to parse commit count".to_string()))?;
        let rebase_target = format!("HEAD~{}", count + 1);

        let mut cmd = Self::git_cmd(path);
        cmd.arg("rebase").arg("-i").arg(&rebase_target);
        cmd.env(
            "GIT_SEQUENCE_EDITOR",
            format!("perl -i -pe '{}'", seq_editor_script),
        );
        cmd.env("GIT_EDITOR", git_editor.unwrap_or("true"));

        Self::run_with_timeout(cmd, 60, None)
    }

    /// Rewrite the commit message of a specific commit via interactive rebase.
    pub fn reword_commit(
        path: &str,
        commit_hash: &str,
        new_message: &str,
    ) -> Result<String, AppError> {
        let pid = std::process::id();
        let msg_editor_path = std::env::temp_dir().join(format!("gs-msg-{}", pid));

        // Sequence editor: change `pick <hash>` to `reword <hash>` (safe for inline perl -pe)
        let seq_script = format!("s/^pick ({})/reword $1/", commit_hash);

        // Message editor: overwrite the file with the new message
        // Perl reads the script from the file; `shift(@ARGV)` gets the message-file path
        let perl_msg = format!(
            "open(F,\">\",shift(@ARGV)) or die;binmode(F,\":utf8\");print F \"{}\";close F",
            new_message.replace('\\', "\\\\").replace('"', "\\\"")
        );
        std::fs::write(&msg_editor_path, &perl_msg)
            .map_err(|e| AppError::Git(format!("Failed to write msg editor: {}", e)))?;

        let result = Self::run_interactive_rebase(
            path,
            commit_hash,
            &seq_script,
            Some(&format!("perl {}", msg_editor_path.display())),
        );

        let _ = std::fs::remove_file(&msg_editor_path);

        result?;
        Ok(format!(
            "Reworded commit {}: {}",
            &commit_hash[..7.min(commit_hash.len())],
            new_message.lines().next().unwrap_or("")
        ))
    }

    /// Drop (remove) a specific commit from history via interactive rebase.
    pub fn drop_commit(path: &str, commit_hash: &str) -> Result<String, AppError> {
        let seq_editor = format!("s/^pick ({})/drop $1/", commit_hash);

        Self::run_interactive_rebase(path, commit_hash, &seq_editor, None)?;
        Ok(format!(
            "Dropped commit {}",
            &commit_hash[..7.min(commit_hash.len())]
        ))
    }

    pub fn analyze_branch_health(path: &str) -> Result<BranchHealthReport, AppError> {
        let repo = Self::open_repo(path)?;
        let now = chrono::Utc::now().timestamp();

        // Detect base branch: develop > main > master
        let base_branch_name = ["develop", "main", "master"]
            .iter()
            .find(|name| repo.find_branch(name, BranchType::Local).is_ok())
            .map(|s| s.to_string());

        let base_oid = base_branch_name.as_ref().and_then(|name| {
            repo.find_branch(name, BranchType::Local)
                .ok()
                .and_then(|b| b.get().target())
        });

        let exclude: std::collections::HashSet<&str> = ["HEAD", "main", "master", "develop"]
            .iter()
            .copied()
            .collect();

        let mut merged = Vec::new();
        let mut stale = Vec::new();
        let mut behind = Vec::new();

        let local_branches = repo
            .branches(Some(BranchType::Local))
            .map_err(|e| AppError::Git(format!("Failed to list branches: {}", e)))?;

        for branch_result in local_branches {
            let (branch, _) = branch_result
                .map_err(|e| AppError::Git(format!("Failed to read branch: {}", e)))?;
            let name = match branch.name() {
                Ok(Some(n)) => n.to_string(),
                _ => continue,
            };
            if exclude.contains(name.as_str()) {
                continue;
            }

            let branch_oid = match branch.get().target() {
                Some(oid) => oid,
                None => continue,
            };

            let commit = repo
                .find_commit(branch_oid)
                .map_err(|e| AppError::Git(format!("Failed to find commit: {}", e)))?;
            let last_commit_timestamp = commit.time().seconds();
            let days_stale = ((now - last_commit_timestamp) / 86400).max(0) as u32;

            let is_merged = base_oid
                .map(|base| repo.graph_descendant_of(base, branch_oid).unwrap_or(false))
                .unwrap_or(false);

            let (_ahead_count, behind_count) = base_oid
                .map(|base| repo.graph_ahead_behind(branch_oid, base).unwrap_or((0, 0)))
                .unwrap_or((0, 0));

            let item = BranchHealthItem {
                name: name.clone(),
                behind: behind_count as u32,
                last_commit_timestamp,
                is_merged,
                days_stale,
            };

            if is_merged {
                merged.push(item);
            } else {
                if days_stale > 30 {
                    stale.push(BranchHealthItem {
                        behind: behind_count as u32,
                        ..item.clone()
                    });
                }
                if behind_count > 10 {
                    behind.push(item);
                }
            }
        }

        merged.sort_by(|a, b| a.name.cmp(&b.name));
        stale.sort_by_key(|item| std::cmp::Reverse(item.days_stale));
        behind.sort_by_key(|item| std::cmp::Reverse(item.behind));

        Ok(BranchHealthReport {
            merged,
            stale,
            behind,
        })
    }

    pub fn delete_merged_branches(
        path: &str,
        branches: &[String],
    ) -> Vec<(String, Result<String, AppError>)> {
        let mut results = Vec::new();
        for name in branches {
            let result =
                Self::delete_branch(path, name).map(|_| format!("Deleted branch '{}'", name));
            results.push((name.clone(), result));
        }
        results
    }

    pub fn get_project_stats(path: &str) -> Result<ProjectStats, AppError> {
        let repo = Self::open_repo(path)?;

        // Empty repo
        let head = match repo.head() {
            Ok(h) => h,
            Err(_) => {
                return Ok(ProjectStats {
                    total_commits: 0,
                    contributors: vec![],
                    last_commit_date: 0,
                    commits_last_7_days: 0,
                    commits_last_30_days: 0,
                    branch_count: 0,
                    tag_count: 0,
                });
            }
        };
        let head_oid = head
            .target()
            .ok_or_else(|| AppError::Git("No HEAD target".to_string()))?;

        let now = chrono::Utc::now().timestamp();
        let seven_days_ago = now - 7 * 24 * 3600;
        let thirty_days_ago = now - 30 * 24 * 3600;

        let mut total_commits = 0usize;
        let mut commits_7d = 0usize;
        let mut commits_30d = 0usize;
        let mut last_commit_date: i64 = 0;
        let mut authors = std::collections::HashSet::new();
        const MAX_WALK: usize = 1000;

        let mut revwalk = repo
            .revwalk()
            .map_err(|e| AppError::Git(format!("Failed to create revwalk: {}", e)))?;
        revwalk
            .set_sorting(git2::Sort::TIME)
            .map_err(|e| AppError::Git(format!("Failed to set sorting: {}", e)))?;
        revwalk
            .push(head_oid)
            .map_err(|e| AppError::Git(format!("Failed to push HEAD: {}", e)))?;

        for oid_result in revwalk {
            if total_commits >= MAX_WALK {
                break;
            }
            let oid = oid_result.map_err(|e| AppError::Git(format!("Revwalk error: {}", e)))?;
            let commit = repo
                .find_commit(oid)
                .map_err(|e| AppError::Git(format!("Failed to find commit: {}", e)))?;

            let sig = commit.author();
            let ts = sig.when().seconds();

            if total_commits == 0 {
                last_commit_date = ts;
            }

            if ts >= seven_days_ago {
                commits_7d += 1;
            }
            if ts >= thirty_days_ago {
                commits_30d += 1;
            }

            if let Some(name) = sig.name() {
                authors.insert(name.to_string());
            }

            total_commits += 1;
        }

        // Branch count
        let mut branch_count = 0usize;
        if let Ok(branches) = repo.branches(Some(BranchType::Local)) {
            branch_count = branches.count();
        }
        if let Ok(branches) = repo.branches(Some(BranchType::Remote)) {
            branch_count += branches.count();
        }

        // Tag count
        let mut tag_count = 0usize;
        let _ = repo.tag_foreach(|_oid, _name| {
            tag_count += 1;
            true
        });

        let mut contributors: Vec<String> = authors.into_iter().collect();
        contributors.sort();

        Ok(ProjectStats {
            total_commits,
            contributors,
            last_commit_date,
            commits_last_7_days: commits_7d,
            commits_last_30_days: commits_30d,
            branch_count,
            tag_count,
        })
    }
    // ── Reflog ─────────────────────────────────────────────────────────────

    pub fn get_reflog(path: &str, max_count: Option<usize>) -> Result<Vec<ReflogEntry>, AppError> {
        let repo = Self::open_repo(path)?;
        let reflog = repo
            .reflog("HEAD")
            .map_err(|e| AppError::Git(format!("Failed to read reflog: {}", e)))?;

        let limit = max_count.unwrap_or(50);
        let mut entries = Vec::with_capacity(limit.min(reflog.len()));

        for i in 0..reflog.len().min(limit) {
            if let Some(entry) = reflog.get(i) {
                let oid = entry.id_new();
                let hash = oid.to_string();
                let short_hash = hash.chars().take(7).collect();
                let message = entry.message().unwrap_or("").to_string();
                let sig = entry.committer();
                let author = sig.name().unwrap_or("unknown").to_string();
                let timestamp = sig.when().seconds();

                entries.push(ReflogEntry {
                    hash,
                    short_hash,
                    message,
                    author,
                    timestamp,
                });
            }
        }

        Ok(entries)
    }

    pub fn checkout_commit(path: &str, hash: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;
        let oid = git2::Oid::from_str(hash)
            .map_err(|e| AppError::Git(format!("Invalid commit hash '{}': {}", hash, e)))?;
        let obj = repo
            .find_object(oid, Some(git2::ObjectType::Commit))
            .map_err(|e| AppError::Git(format!("Commit not found '{}': {}", hash, e)))?;
        repo.checkout_tree(&obj, Some(CheckoutBuilder::new().force()))
            .map_err(|e| AppError::Git(format!("Failed to checkout tree: {}", e)))?;
        repo.set_head_detached(oid)
            .map_err(|e| AppError::Git(format!("Failed to set HEAD detached: {}", e)))?;
        Ok(())
    }
}

use super::git_backend::GitBackend;

impl GitBackend for GitService {
    fn is_git_repo(path: &str) -> bool {
        Self::is_git_repo(path)
    }
    fn init_repo(path: &str) -> Result<(), AppError> {
        Self::init_repo(path)
    }
    fn get_project_detail(project: &GitProject, group: Group) -> Result<ProjectDetail, AppError> {
        Self::get_project_detail(project, group)
    }
    fn switch_branch(path: &str, branch_name: &str) -> Result<(), AppError> {
        Self::switch_branch(path, branch_name)
    }
    fn create_branch(path: &str, name: &str, from_branch: Option<&str>) -> Result<(), AppError> {
        Self::create_branch(path, name, from_branch)
    }
    fn delete_branch(path: &str, name: &str) -> Result<(), AppError> {
        Self::delete_branch(path, name)
    }
    fn merge_branch(path: &str, branch_name: &str) -> Result<MergeResult, AppError> {
        Self::merge_branch(path, branch_name)
    }
    fn get_file_list(path: &str) -> Result<Vec<GitFileEntry>, AppError> {
        Self::get_file_list(path)
    }
    fn stage_file(path: &str, file_path: &str) -> Result<(), AppError> {
        Self::stage_file(path, file_path)
    }
    fn unstage_file(path: &str, file_path: &str) -> Result<(), AppError> {
        Self::unstage_file(path, file_path)
    }
    fn commit(path: &str, message: &str) -> Result<String, AppError> {
        Self::commit(path, message)
    }
    fn push(
        path: &str,
        branch: Option<&str>,
        cancel_flag: Option<Arc<AtomicBool>>,
    ) -> Result<String, AppError> {
        Self::push(path, branch, cancel_flag)
    }
    fn pull(path: &str, cancel_flag: Option<Arc<AtomicBool>>) -> Result<String, AppError> {
        Self::pull(path, cancel_flag)
    }
    fn fetch(path: &str, cancel_flag: Option<Arc<AtomicBool>>) -> Result<String, AppError> {
        Self::fetch(path, cancel_flag)
    }
    fn stash(
        path: &str,
        message: Option<&str>,
        include_untracked: bool,
    ) -> Result<String, AppError> {
        Self::stash(path, message, include_untracked)
    }
    fn stash_pop(path: &str) -> Result<String, AppError> {
        Self::stash_pop(path)
    }
    fn stash_pop_at(path: &str, index: usize) -> Result<String, AppError> {
        Self::stash_pop_at(path, index)
    }
    fn stash_apply(path: &str, index: usize) -> Result<String, AppError> {
        Self::stash_apply(path, index)
    }
    fn get_stash_list(path: &str) -> Result<Vec<StashInfo>, AppError> {
        Self::get_stash_list(path)
    }
    fn stash_drop(path: &str, index: usize) -> Result<(), AppError> {
        Self::stash_drop(path, index)
    }
    fn get_log(
        path: &str,
        offset: usize,
        limit: usize,
        author: Option<&str>,
        message_contains: Option<&str>,
        since: Option<i64>,
        until: Option<i64>,
    ) -> Result<Vec<CommitInfo>, AppError> {
        Self::get_log(path, offset, limit, author, message_contains, since, until)
    }
    fn fetch_all_projects(paths: &[String]) -> Vec<(String, Result<String, AppError>)> {
        Self::fetch_all_projects(paths)
    }
    fn pull_all_projects(paths: &[String]) -> Vec<(String, Result<String, AppError>)> {
        Self::pull_all_projects(paths)
    }
    fn push_all_projects(paths: &[String]) -> Vec<(String, Result<String, AppError>)> {
        Self::push_all_projects(paths)
    }
    fn sync_all_projects(paths: &[String]) -> Vec<(String, Result<String, AppError>)> {
        Self::sync_all_projects(paths)
    }
    fn list_submodules(path: &str) -> Result<Vec<SubmoduleInfo>, AppError> {
        Self::list_submodules(path)
    }
    fn update_submodule(path: &str, name: &str) -> Result<String, AppError> {
        Self::update_submodule(path, name)
    }
    fn init_submodules(path: &str) -> Result<String, AppError> {
        Self::init_submodules(path)
    }
}
