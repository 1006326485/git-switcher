use git2::{Repository, Status, StatusOptions, BranchType, IndexAddOption, build::CheckoutBuilder, DiffOptions};

use crate::AppError;
use crate::models::{BranchInfo, CommitInfo, FileStatus, GitFileEntry, GitStatus, MergeResult, ProjectDetail, GitProject, Group, StashInfo, TagInfo};

pub struct GitService;

impl GitService {
    fn open_repo(path: &str) -> Result<Repository, AppError> {
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
        let entries: Vec<_> = index.conflicts()
            .map_err(|e| AppError::Git(format!("Failed to get conflicts: {}", e)))?
            .filter_map(|c| c.map_err(|e| log::warn!("skipping corrupt conflict entry: {}", e)).ok())
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

    pub fn get_project_detail(project: &GitProject, group: Group) -> Result<ProjectDetail, AppError> {
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

        Ok(ProjectDetail {
            project,
            current_branch,
            branches,
            status,
            group,
        })
    }

    pub fn get_current_branch(repo: &Repository) -> Result<String, AppError> {
        let head = repo.head().map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
        head.shorthand()
            .map(|s| s.to_string())
            .ok_or_else(|| AppError::Git("HEAD is detached (not on any branch)".to_string()))
    }

    pub fn get_branches(repo: &Repository) -> Result<Vec<BranchInfo>, AppError> {
        let current = Self::get_current_branch(repo).unwrap_or_default();
        let mut branches = Vec::new();

        if let Ok(local_branches) = repo.branches(Some(BranchType::Local)) {
            for branch_result in local_branches {
                if let Ok((branch, _)) = branch_result {
                    if let Ok(Some(name)) = branch.name() {
                        branches.push(BranchInfo {
                            name: name.to_string(),
                            is_current: name == current,
                            is_remote: false,
                        });
                    }
                }
            }
        }

        if let Ok(remote_branches) = repo.branches(Some(BranchType::Remote)) {
            for branch_result in remote_branches {
                if let Ok((branch, _)) = branch_result {
                    if let Ok(Some(name)) = branch.name() {
                        branches.push(BranchInfo {
                            name: name.to_string(),
                            is_current: false,
                            is_remote: true,
                        });
                    }
                }
            }
        }

        branches.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(branches)
    }

    pub fn switch_branch(path: &str, branch_name: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;

        // If a local branch with this exact name exists, check it out directly
        if let Ok(local_branch) = repo.find_branch(branch_name, BranchType::Local) {
            let head_ref = match local_branch.get().name() {
                Some(name) => name.to_string(),
                None => format!("refs/heads/{}", branch_name),
            };
            let (object, _) = repo.revparse_ext(&head_ref)
                .map_err(|e| AppError::Git(format!("Branch '{}' not found: {}", branch_name, e)))?;
            repo.checkout_tree(&object, None)
                .map_err(|e| AppError::Git(format!("Failed to checkout tree: {}", e)))?;
            repo.set_head(&head_ref)
                .map_err(|e| AppError::Git(format!("Failed to set HEAD: {}", e)))?;
        } else if branch_name.contains('/') {
            // Remote branch — strip the remote prefix (e.g. "origin/") to get local branch name
            let local_name = branch_name
                .find('/')
                .map(|i| &branch_name[i + 1..])
                .unwrap_or(branch_name);
            let (object, _) = repo.revparse_ext(branch_name)
                .map_err(|e| AppError::Git(format!("Branch '{}' not found: {}", branch_name, e)))?;
            let commit = repo.find_commit(object.id())
                .map_err(|e| AppError::Git(format!("Failed to find commit: {}", e)))?;

            let local_ref = match repo.find_branch(local_name, BranchType::Local) {
                Ok(branch) => branch,
                Err(_) => {
                    let mut branch = repo.branch(local_name, &commit, false)
                        .map_err(|e| AppError::Git(format!("Failed to create local branch '{}': {}", local_name, e)))?;
                    branch.set_upstream(Some(branch_name))
                        .map_err(|e| AppError::Git(format!("Failed to set upstream for '{}': {}", local_name, e)))?;
                    branch
                }
            };

            let head_ref = match local_ref.get().name() {
                Some(name) => name.to_string(),
                None => format!("refs/heads/{}", local_name),
            };
            repo.set_head(&head_ref)
                .map_err(|e| AppError::Git(format!("Failed to set HEAD: {}", e)))?;
            repo.checkout_head(Some(&mut CheckoutBuilder::new().force()))
                .map_err(|e| AppError::Git(format!("Failed to checkout: {}", e)))?;
        } else {
            let (object, reference) = repo.revparse_ext(branch_name)
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

        let statuses = repo.statuses(Some(&mut opts))
            .map_err(|e| AppError::Git(format!("Failed to get status: {}", e)))?;

        let mut modified = 0u32;
        let mut staged = 0u32;
        let mut untracked = 0u32;

        for entry in statuses.iter() {
            let s = entry.status();
            if s.contains(Status::WT_MODIFIED) || s.contains(Status::WT_DELETED) || s.contains(Status::WT_TYPECHANGE) {
                modified += 1;
            }
            if s.contains(Status::INDEX_NEW) || s.contains(Status::INDEX_MODIFIED) || s.contains(Status::INDEX_DELETED) || s.contains(Status::INDEX_TYPECHANGE) {
                staged += 1;
            }
            if s.contains(Status::WT_NEW) {
                untracked += 1;
            }
        }

        let (ahead, behind) = Self::get_ahead_behind(repo).unwrap_or((0, 0));

        Ok(GitStatus {
            modified,
            staged,
            untracked,
            ahead,
            behind,
        })
    }

    fn status_label(s: Status) -> FileStatus {
        if s.contains(Status::WT_NEW) || s.contains(Status::INDEX_NEW) {
            FileStatus::Untracked
        } else if s.contains(Status::WT_MODIFIED) || s.contains(Status::INDEX_MODIFIED) {
            FileStatus::Modified
        } else if s.contains(Status::WT_DELETED) || s.contains(Status::INDEX_DELETED) {
            FileStatus::Deleted
        } else if s.contains(Status::WT_RENAMED) || s.contains(Status::INDEX_RENAMED) {
            FileStatus::Renamed
        } else {
            FileStatus::Modified
        }
    }

    fn get_ahead_behind(repo: &Repository) -> Result<(u32, u32), AppError> {
        let head = repo.head().map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
        let local_oid = head.target().ok_or(AppError::Git("No HEAD target — repository may have no commits".to_string()))?;

        let upstream = repo.branch_upstream_name(head.name().ok_or(AppError::Git("Invalid refname".to_string()))?)
            .map_err(|e| AppError::Git(format!("Failed to get upstream name: {}", e)))?;
        let upstream_ref = repo.find_reference(
            std::str::from_utf8(&upstream).map_err(|e| AppError::Git(format!("Invalid upstream ref encoding: {}", e)))?
        ).map_err(|e| AppError::Git(format!("Failed to find upstream ref: {}", e)))?;
        let upstream_oid = upstream_ref.target().ok_or(AppError::Git("No upstream target".to_string()))?;

        let (ahead, behind) = repo.graph_ahead_behind(local_oid, upstream_oid)
            .map_err(|e| AppError::Git(format!("Failed to compute ahead/behind: {}", e)))?;

        Ok((ahead as u32, behind as u32))
    }

    pub fn get_head_commit_hash(repo: &Repository) -> Result<String, AppError> {
        let head = repo.head().map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
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

        let statuses = repo.statuses(Some(&mut opts))
            .map_err(|e| AppError::Git(format!("Failed to get status: {}", e)))?;

        let files = statuses.iter().map(|entry| {
            GitFileEntry {
                path: entry.path().unwrap_or("").to_string(),
                status: Self::status_label(entry.status()),
            }
        }).collect();

        Ok(files)
    }

    pub fn stage_file(path: &str, file_path: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;
        let mut index = repo.index().map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
        index.add_path(std::path::Path::new(file_path))
            .map_err(|e| AppError::Git(format!("Failed to stage file: {}", e)))?;
        index.write().map_err(|e| AppError::Git(format!("Failed to write index: {}", e)))?;
        Ok(())
    }

    pub fn unstage_file(path: &str, file_path: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;

        // Equivalent of `git reset HEAD -- <file>`: reset index entry to match
        // HEAD without touching the working directory. For new files (no HEAD
        // yet), remove from index instead.
        match repo.revparse_single("HEAD").ok() {
            Some(head_obj) => {
                repo.reset_default(Some(&head_obj), &[std::path::Path::new(file_path)])
                    .map_err(|e| AppError::Git(format!("Failed to unstage: {}", e)))?;
            }
            None => {
                let mut index = repo.index().map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
                index.remove_path(std::path::Path::new(file_path))
                    .map_err(|e| AppError::Git(format!("Failed to unstage: {}", e)))?;
                index.write().map_err(|e| AppError::Git(format!("Failed to write index: {}", e)))?;
            }
        }

        Ok(())
    }

    pub fn stage_all(path: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;
        let mut index = repo.index().map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
        index.add_all(["*"].iter(), IndexAddOption::DEFAULT, None)
            .map_err(|e| AppError::Git(format!("Failed to stage all: {}", e)))?;
        index.write().map_err(|e| AppError::Git(format!("Failed to write index: {}", e)))?;
        Ok(())
    }

    pub fn unstage_all(path: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;
        match repo.revparse_single("HEAD").ok() {
            Some(head_obj) => {
                repo.reset_default(Some(&head_obj), &["*"])
                    .map_err(|e| AppError::Git(format!("Failed to unstage all: {}", e)))?;
            }
            None => {
                let mut index = repo.index().map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
                index.clear().map_err(|e| AppError::Git(format!("Failed to clear index: {}", e)))?;
                index.write().map_err(|e| AppError::Git(format!("Failed to write index: {}", e)))?;
            }
        }
        Ok(())
    }

    pub fn get_staged_diff(path: &str) -> Result<String, AppError> {
        let repo = Self::open_repo(path)?;

        let head = match repo.revparse_single("HEAD") {
            Ok(obj) => obj,
            Err(_) => return Ok(String::new()), // no commits yet
        };
        let head_tree = repo.find_tree(Self::obj_to_tree_id(&head))
            .map_err(|e| AppError::Git(format!("Failed to find HEAD tree: {}", e)))?;

        let mut opts = DiffOptions::new();
        opts.force_text(true);

        let diff = repo.diff_tree_to_index(Some(&head_tree), None, Some(&mut opts))
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
        }).map_err(|e| AppError::Git(format!("Failed to format diff: {}", e)))?;

        Ok(output)
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
            return Err(AppError::Other("Commit message cannot be empty".to_string()));
        }
        let repo = Self::open_repo(path)?;

        let mut index = repo.index().map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
        let tree_id = index.write_tree().map_err(|e| AppError::Git(format!("Failed to write tree: {}", e)))?;
        let tree = repo.find_tree(tree_id).map_err(|e| AppError::Git(format!("Failed to find tree: {}", e)))?;

        let signature = Self::get_signature(&repo)?;

        let head = repo.head().ok();
        let parent_commit = head
            .as_ref()
            .and_then(|h| h.target())
            .and_then(|oid| repo.find_commit(oid).ok());

        let parents: Vec<&git2::Commit> = parent_commit.iter().collect();

        let commit_oid = repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &parents,
        ).map_err(|e| AppError::Git(format!("Failed to commit: {}", e)))?;

        Ok(commit_oid.to_string())
    }

    pub fn push(path: &str, branch: Option<&str>) -> Result<String, AppError> {
        let mut cmd = Self::git_cmd(path);
        cmd.arg("push");
        if let Some(b) = branch {
            cmd.args(["origin", b]);
        }
        Self::run_with_timeout(cmd, 120)
    }

    pub fn pull(path: &str) -> Result<String, AppError> {
        let mut cmd = Self::git_cmd(path);
        cmd.args(["pull", "--rebase"]);
        Self::run_with_timeout(cmd, 120)
    }

    pub fn fetch(path: &str) -> Result<String, AppError> {
        let mut cmd = Self::git_cmd(path);
        cmd.arg("fetch").arg("--all");
        Self::run_with_timeout(cmd, 120)
    }

    pub fn stash(path: &str, message: Option<&str>) -> Result<String, AppError> {
        let mut repo = Self::open_repo(path)?;

        let config = repo.config().map_err(|e| AppError::Git(format!("Failed to read config: {}", e)))?;
        let name = config.get_string("user.name").unwrap_or_else(|_| "Git Switcher".into());
        let email = config.get_string("user.email").unwrap_or_else(|_| "git-switcher@local".into());
        let signature = git2::Signature::now(&name, &email)
            .map_err(|e| AppError::Git(format!("Failed to create signature: {}", e)))?;

        let msg = message.unwrap_or("WIP: stashed by Git Switcher");
        let stash_oid = repo.stash_save(&signature, msg, None)
            .map_err(|e| AppError::Git(format!("Failed to stash: {}", e)))?;

        Ok(stash_oid.to_string())
    }

    pub fn stash_apply(path: &str, index: usize) -> Result<String, AppError> {
        let mut cmd = Self::git_cmd(path);
        cmd.args(["stash", "apply", &format!("stash@{{{}}}", index)]);
        Self::run_with_timeout(cmd, 60)
    }

    pub fn stash_pop(path: &str) -> Result<String, AppError> {
        let mut cmd = Self::git_cmd(path);
        cmd.args(["stash", "pop"]);
        Self::run_with_timeout(cmd, 60)
    }

    pub fn stash_pop_at(path: &str, index: usize) -> Result<String, AppError> {
        let mut cmd = Self::git_cmd(path);
        cmd.args(["stash", "pop", &format!("stash@{{{}}}", index)]);
        Self::run_with_timeout(cmd, 60)
    }

    pub fn get_stash_list(path: &str) -> Result<Vec<StashInfo>, AppError> {
        let output = std::process::Command::new("git")
            .args(["stash", "list", "--format=%H %gd %s"])
            .current_dir(path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to get stash list: {}", e)))?;

        if !output.status.success() {
            return Ok(vec![]);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stashes: Vec<StashInfo> = stdout
            .lines()
            .enumerate()
            .filter_map(|(i, line)| {
                let parts: Vec<&str> = line.splitn(2, ' ').collect();
                if parts.len() >= 2 {
                    let rest = parts[1];
                    let msg_start = rest.find(' ').map(|p| p + 1).unwrap_or(0);
                    let message = rest[msg_start..].trim().to_string();
                    Some(StashInfo {
                        index: i,
                        message,
                        oid: parts[0].to_string(),
                    })
                } else {
                    None
                }
            })
            .collect();

        Ok(stashes)
    }

    pub fn stash_drop(path: &str, index: usize) -> Result<(), AppError> {
        let output = std::process::Command::new("git")
            .args(["stash", "drop", &format!("stash@{{{}}}", index)])
            .current_dir(path)
            .output()
            .map_err(|e| AppError::Git(format!("Failed to drop stash: {}", e)))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(AppError::Git(format!("Failed to drop stash: {}", stderr.trim())));
        }
        Ok(())
    }

    /// Build a git Command with env vars that prevent interactive prompts from hanging.
    fn git_cmd(path: &str) -> std::process::Command {
        let mut cmd = std::process::Command::new("git");
        cmd.current_dir(path)
            // Prevent SSH / HTTPS credential prompts from hanging forever
            .env("GIT_TERMINAL_PROMPT", "0")
            // Prevent SSH from waiting for host key confirmation
            .env("GIT_SSH_COMMAND", "ssh -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new");
        cmd
    }

    /// Run a Command with a timeout (seconds). Kills the process if it doesn't finish.
    fn run_with_timeout(mut cmd: std::process::Command, timeout_secs: u64) -> Result<String, AppError> {
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
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => {
                    if start.elapsed() > timeout {
                        let _ = child.kill();
                        let _ = child.wait();
                        return Err(AppError::Git(format!("Timed out after {}s", timeout_secs)));
                    }
                    std::thread::sleep(std::time::Duration::from_millis(10));
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
            let out = if stdout.trim().is_empty() { stderr } else { stdout };
            Ok(out)
        } else {
            let err = if stderr.trim().is_empty() { stdout } else { stderr };
            Err(AppError::Git(err))
        }
    }

    // ── Branch Management ───────────────────────────────────────────────

    pub fn create_branch(path: &str, name: &str, from_branch: Option<&str>) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;

        let target = if let Some(from) = from_branch {
            let (object, _) = repo.revparse_ext(from)
                .map_err(|e| AppError::Git(format!("Branch '{}' not found: {}", from, e)))?;
            repo.find_commit(object.id())
                .map_err(|e| AppError::Git(format!("Failed to find commit: {}", e)))?
        } else {
            let head = repo.head().map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
            repo.find_commit(head.target().ok_or(AppError::Git("No HEAD target".to_string()))?)
                .map_err(|e| AppError::Git(format!("Failed to find HEAD commit: {}", e)))?
        };

        repo.branch(name, &target, false)
            .map_err(|e| AppError::Git(format!("Failed to create branch '{}': {}", name, e)))?;

        Ok(())
    }

    pub fn delete_branch(path: &str, name: &str) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;

        let mut branch = repo.find_branch(name, BranchType::Local)
            .map_err(|e| AppError::Git(format!("Branch '{}' not found: {}", name, e)))?;

        branch.delete()
            .map_err(|e| AppError::Git(format!("Failed to delete branch '{}': {}", name, e)))?;

        Ok(())
    }

    pub fn merge_branch(path: &str, branch_name: &str) -> Result<MergeResult, AppError> {
        let repo = Self::open_repo(path)?;

        let (object, _) = repo.revparse_ext(branch_name)
            .map_err(|e| AppError::Git(format!("Branch '{}' not found: {}", branch_name, e)))?;

        let annotated_commit = repo.find_annotated_commit(object.id())
            .map_err(|e| AppError::Git(format!("Failed to find annotated commit: {}", e)))?;

        // Perform merge analysis
        let (merge_analysis, _) = repo.merge_analysis(&[&annotated_commit])
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
            let head = repo.head().map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;

            let target_branch = head.shorthand()
                .ok_or_else(|| AppError::Git("HEAD reference has no short name".to_string()))?;
            let merge_target = object.id();
            repo.reference(
                &format!("refs/heads/{}", target_branch),
                merge_target,
                true,
                "merge (fast-forward)",
            ).map_err(|e| AppError::Git(format!("Failed to update reference: {}", e)))?;

            repo.checkout_head(Some(&mut CheckoutBuilder::new().force()))
                .map_err(|e| AppError::Git(format!("Failed to checkout: {}", e)))?;

            return Ok(MergeResult {
                success: true,
                message: format!("Fast-forward merged '{}' into '{}'", branch_name, target_branch),
                conflicts: vec![],
            });
        }

        // Normal merge
        repo.merge(&[&annotated_commit], None, None)
            .map_err(|e| AppError::Git(format!("Failed to merge: {}", e)))?;

        // Check for conflicts
        let mut index = repo.index().map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
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
            let tree_id = index.write_tree().map_err(|e| AppError::Git(format!("Failed to write tree: {}", e)))?;
            let tree = repo.find_tree(tree_id).map_err(|e| AppError::Git(format!("Failed to find tree: {}", e)))?;

            let signature = Self::get_signature(&repo)?;

            let head = repo.head().map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
            let head_commit = repo.find_commit(head.target().ok_or(AppError::Git("No HEAD".to_string()))?)
                .map_err(|e| AppError::Git(format!("Failed to find HEAD commit: {}", e)))?;
            let merge_commit = repo.find_commit(object.id())
                .map_err(|e| AppError::Git(format!("Failed to find merge commit: {}", e)))?;

            repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                &format!("Merge branch '{}'", branch_name),
                &tree,
                &[&head_commit, &merge_commit],
            ).map_err(|e| AppError::Git(format!("Failed to commit merge: {}", e)))?;

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

    // ── Cherry-pick (libgit2) ───────────────────────────────────────────

    pub fn cherry_pick(path: &str, commit_hash: &str) -> Result<MergeResult, AppError> {
        let repo = Self::open_repo(path)?;

        let oid = git2::Oid::from_str(commit_hash)
            .map_err(|e| AppError::Git(format!("Invalid commit hash '{}': {}", commit_hash, e)))?;
        let commit = repo.find_commit(oid)
            .map_err(|e| AppError::Git(format!("Commit '{}' not found: {}", commit_hash, e)))?;

        let head = repo.head().map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
        let head_commit = repo.find_commit(head.target().ok_or(AppError::Git("No HEAD target".to_string()))?)
            .map_err(|e| AppError::Git(format!("Failed to find HEAD commit: {}", e)))?;

        repo.cherrypick_commit(&commit, &head_commit, 0, None)
            .map_err(|e| AppError::Git(format!("Cherry-pick failed: {}", e)))?;

        // Check for conflicts
        let mut index = repo.index().map_err(|e| AppError::Git(format!("Failed to get index: {}", e)))?;
        if index.has_conflicts() {
            let conflicts = Self::collect_conflicts(&mut index)?;
            Self::abort_to_head(&repo);
            return Ok(MergeResult {
                success: false,
                message: format!("Cherry-pick has {} conflict(s)", conflicts.len()),
                conflicts,
            });
        }

        // Commit the cherry-pick — abort on any failure
        let commit_result = (|| -> Result<(), AppError> {
            let tree_id = index.write_tree().map_err(|e| AppError::Git(format!("Failed to write tree: {}", e)))?;
            let tree = repo.find_tree(tree_id).map_err(|e| AppError::Git(format!("Failed to find tree: {}", e)))?;

            let signature = Self::get_signature(&repo)?;

            let head = repo.head().map_err(|e| AppError::Git(format!("Failed to get HEAD: {}", e)))?;
            let head_commit = repo.find_commit(head.target().ok_or(AppError::Git("No HEAD".to_string()))?)
                .map_err(|e| AppError::Git(format!("Failed to find HEAD commit: {}", e)))?;

            repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                &format!("Cherry-pick {}", commit_hash),
                &tree,
                &[&head_commit],
            ).map_err(|e| AppError::Git(format!("Failed to commit cherry-pick: {}", e)))?;

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
            message: format!("Cherry-picked commit {}", &commit_hash[..std::cmp::min(8, commit_hash.len())]),
            conflicts: vec![],
        })
    }

    // ── Rebase (CLI) ────────────────────────────────────────────────────

    pub fn rebase(path: &str, onto_branch: &str) -> Result<String, AppError> {
        let mut cmd = Self::git_cmd(path);
        cmd.args(["rebase", onto_branch]);
        Self::run_with_timeout(cmd, 120)
    }

    // ── Git Log ─────────────────────────────────────────────────────────

    pub fn get_log(path: &str, offset: usize, limit: usize) -> Result<Vec<CommitInfo>, AppError> {
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

        let mut revwalk = repo.revwalk()
            .map_err(|e| AppError::Git(format!("Failed to create revwalk: {}", e)))?;

        revwalk.set_sorting(git2::Sort::TIME)
            .map_err(|e| AppError::Git(format!("Failed to set sorting: {}", e)))?;

        revwalk.push(head_oid)
            .map_err(|e| AppError::Git(format!("Failed to push HEAD: {}", e)))?;

        let mut commits = Vec::new();
        for (i, oid_result) in revwalk.enumerate() {
            if i < offset { continue; }
            if commits.len() >= limit { break; }
            let oid = oid_result.map_err(|e| AppError::Git(format!("Failed to get oid: {}", e)))?;
            let commit = repo.find_commit(oid)
                .map_err(|e| AppError::Git(format!("Failed to find commit: {}", e)))?;

            let author = commit.author();
            let parents: Vec<String> = commit.parent_ids().map(|id| id.to_string()).collect();
            let oid_s = oid.to_string();
            let short_len = 7.min(oid_s.len());

            commits.push(CommitInfo {
                short_hash: oid_s[..short_len].to_string(),
                hash: oid_s,
                message: commit.message().unwrap_or("").lines().next().unwrap_or("").to_string(),
                author: author.name().unwrap_or("Unknown").to_string(),
                email: author.email().unwrap_or("").to_string(),
                timestamp: author.when().seconds(),
                parents,
            });
        }

        Ok(commits)
    }

    // ── Remote operations (batch-capable, parallel) ────────────────────

    pub fn fetch_all_projects(paths: &[String]) -> Vec<(String, Result<String, AppError>)> {
        Self::run_batch(paths, |p| Self::fetch(&p))
    }

    pub fn pull_all_projects(paths: &[String]) -> Vec<(String, Result<String, AppError>)> {
        Self::run_batch(paths, |p| Self::pull(&p))
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
            let handles: Vec<_> = chunk.iter().map(|p| {
                let path = p.clone();
                let name = std::path::Path::new(p)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| p.clone());
                let op = op.clone();
                let tx = tx.clone();
                std::thread::spawn(move || {
                    let result = catch_unwind(std::panic::AssertUnwindSafe(|| op(path)))
                        .unwrap_or_else(|_| Err(AppError::Other("Thread panicked".to_string())));
                    let _ = tx.send((name, result));
                })
            }).collect();

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
                        format!("{} <{}>", sig.name().unwrap_or(""), sig.email().unwrap_or(""))
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

    pub fn create_tag(path: &str, name: &str, message: Option<&str>, target_ref: Option<&str>) -> Result<(), AppError> {
        let repo = Self::open_repo(path)?;
        let target = repo
            .revparse_single(target_ref.unwrap_or("HEAD"))
            .map_err(|e| AppError::Git(format!("Failed to resolve '{}': {}", target_ref.unwrap_or("HEAD"), e)))?;

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
}
