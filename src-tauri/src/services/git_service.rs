use git2::{Repository, Status, StatusOptions, BranchType, build::CheckoutBuilder};

use crate::models::{BranchInfo, CommitInfo, FileStatus, GitFileEntry, GitStatus, MergeResult, ProjectDetail, GitProject, Group};

pub struct GitService;

impl GitService {
    fn open_repo(path: &str) -> Result<Repository, String> {
        Repository::open(path).map_err(|e| format!("Failed to open repo: {}", e))
    }

    fn get_signature(repo: &Repository) -> Result<git2::Signature<'_>, String> {
        repo.signature()
            .or_else(|_| git2::Signature::now("Git Switcher", "git-switcher@local"))
            .map_err(|e| format!("Failed to create signature: {}", e))
    }

    pub fn is_git_repo(path: &str) -> bool {
        Repository::open(path).is_ok()
    }

    pub fn init_repo(path: &str) -> Result<(), String> {
        Repository::init(path).map_err(|e| format!("Failed to init repo: {}", e))?;
        Ok(())
    }

    pub fn get_project_detail(project: &GitProject, group: Group) -> Result<ProjectDetail, String> {
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

    pub fn get_current_branch(repo: &Repository) -> Result<String, String> {
        let head = repo.head().map_err(|e| format!("Failed to get HEAD: {}", e))?;
        head.shorthand()
            .map(|s| s.to_string())
            .ok_or_else(|| "HEAD is detached (not on any branch)".to_string())
    }

    pub fn get_branches(repo: &Repository) -> Result<Vec<BranchInfo>, String> {
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

    pub fn switch_branch(path: &str, branch_name: &str) -> Result<(), String> {
        let repo = Self::open_repo(path)?;

        // If a local branch with this exact name exists, check it out directly
        if let Ok(local_branch) = repo.find_branch(branch_name, BranchType::Local) {
            let head_ref = match local_branch.get().name() {
                Some(name) => name.to_string(),
                None => format!("refs/heads/{}", branch_name),
            };
            let (object, _) = repo.revparse_ext(&head_ref)
                .map_err(|e| format!("Branch '{}' not found: {}", branch_name, e))?;
            repo.checkout_tree(&object, None)
                .map_err(|e| format!("Failed to checkout tree: {}", e))?;
            repo.set_head(&head_ref)
                .map_err(|e| format!("Failed to set HEAD: {}", e))?;
        } else if branch_name.contains('/') {
            // Remote branch — strip the remote prefix (e.g. "origin/") to get local branch name
            let local_name = branch_name
                .find('/')
                .map(|i| &branch_name[i + 1..])
                .unwrap_or(branch_name);
            let (object, _) = repo.revparse_ext(branch_name)
                .map_err(|e| format!("Branch '{}' not found: {}", branch_name, e))?;
            let commit = repo.find_commit(object.id())
                .map_err(|e| format!("Failed to find commit: {}", e))?;

            let mut local_ref = match repo.find_branch(local_name, BranchType::Local) {
                Ok(branch) => branch,
                Err(_) => {
                    let mut branch = repo.branch(local_name, &commit, false)
                        .map_err(|e| format!("Failed to create local branch '{}': {}", local_name, e))?;
                    branch.set_upstream(Some(branch_name))
                        .map_err(|e| format!("Failed to set upstream for '{}': {}", local_name, e))?;
                    branch
                }
            };

            let head_ref = match local_ref.get().name() {
                Some(name) => name.to_string(),
                None => format!("refs/heads/{}", local_name),
            };
            repo.set_head(&head_ref)
                .map_err(|e| format!("Failed to set HEAD: {}", e))?;
            repo.checkout_head(Some(&mut CheckoutBuilder::new().force()))
                .map_err(|e| format!("Failed to checkout: {}", e))?;
        } else {
            let (object, reference) = repo.revparse_ext(branch_name)
                .map_err(|e| format!("Branch '{}' not found: {}", branch_name, e))?;

            repo.checkout_tree(&object, None)
                .map_err(|e| format!("Failed to checkout tree: {}", e))?;

            if let Some(reference) = reference {
                let head_ref = match reference.name() {
                    Some(name) => name.to_string(),
                    None => format!("refs/heads/{}", branch_name),
                };
                repo.set_head(&head_ref)
                    .map_err(|e| format!("Failed to set HEAD: {}", e))?;
            } else {
                repo.set_head_detached(object.id())
                    .map_err(|e| format!("Failed to set HEAD detached: {}", e))?;
            }
        }

        Ok(())
    }

    pub fn get_status(repo: &Repository) -> Result<GitStatus, String> {
        let mut opts = StatusOptions::new();
        opts.include_untracked(true);
        opts.recurse_untracked_dirs(true);

        let statuses = repo.statuses(Some(&mut opts))
            .map_err(|e| format!("Failed to get status: {}", e))?;

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

    fn get_ahead_behind(repo: &Repository) -> Result<(u32, u32), String> {
        let head = repo.head().map_err(|e| format!("Failed to get HEAD: {}", e))?;
        let local_oid = head.target().ok_or("No HEAD target — repository may have no commits")?;

        let upstream = repo.branch_upstream_name(head.name().ok_or("Invalid refname")?)
            .map_err(|e| format!("Failed to get upstream name: {}", e))?;
        let upstream_ref = repo.find_reference(
            std::str::from_utf8(&upstream).map_err(|e| format!("Invalid upstream ref encoding: {}", e))?
        ).map_err(|e| format!("Failed to find upstream ref: {}", e))?;
        let upstream_oid = upstream_ref.target().ok_or("No upstream target")?;

        let (ahead, behind) = repo.graph_ahead_behind(local_oid, upstream_oid)
            .map_err(|e| format!("Failed to compute ahead/behind: {}", e))?;

        Ok((ahead as u32, behind as u32))
    }

    pub fn get_head_commit_hash(repo: &Repository) -> Result<String, String> {
        let head = repo.head().map_err(|e| format!("Failed to get HEAD: {}", e))?;
        head.target()
            .map(|oid| oid.to_string())
            .ok_or_else(|| "No HEAD target".to_string())
    }

    // ── Git Operations ──────────────────────────────────────────────────

    pub fn get_file_list(path: &str) -> Result<Vec<GitFileEntry>, String> {
        let repo = Self::open_repo(path)?;

        let mut opts = StatusOptions::new();
        opts.include_untracked(true);
        opts.recurse_untracked_dirs(true);

        let statuses = repo.statuses(Some(&mut opts))
            .map_err(|e| format!("Failed to get status: {}", e))?;

        let files = statuses.iter().map(|entry| {
            GitFileEntry {
                path: entry.path().unwrap_or("").to_string(),
                status: Self::status_label(entry.status()),
            }
        }).collect();

        Ok(files)
    }

    pub fn stage_file(path: &str, file_path: &str) -> Result<(), String> {
        let repo = Self::open_repo(path)?;
        let mut index = repo.index().map_err(|e| format!("Failed to get index: {}", e))?;
        index.add_path(std::path::Path::new(file_path))
            .map_err(|e| format!("Failed to stage file: {}", e))?;
        index.write().map_err(|e| format!("Failed to write index: {}", e))?;
        Ok(())
    }

    pub fn unstage_file(path: &str, file_path: &str) -> Result<(), String> {
        let repo = Self::open_repo(path)?;

        // Equivalent of `git reset HEAD -- <file>`: reset index entry to match
        // HEAD without touching the working directory. For new files (no HEAD
        // yet), remove from index instead.
        match repo.revparse_single("HEAD").ok() {
            Some(head_obj) => {
                repo.reset_default(Some(&head_obj), &[std::path::Path::new(file_path)])
                    .map_err(|e| format!("Failed to unstage: {}", e))?;
            }
            None => {
                let mut index = repo.index().map_err(|e| format!("Failed to get index: {}", e))?;
                index.remove_path(std::path::Path::new(file_path))
                    .map_err(|e| format!("Failed to unstage: {}", e))?;
                index.write().map_err(|e| format!("Failed to write index: {}", e))?;
            }
        }

        Ok(())
    }

    pub fn commit(path: &str, message: &str) -> Result<String, String> {
        if message.trim().is_empty() {
            return Err("Commit message cannot be empty".to_string());
        }
        let repo = Self::open_repo(path)?;

        let mut index = repo.index().map_err(|e| format!("Failed to get index: {}", e))?;
        let tree_id = index.write_tree().map_err(|e| format!("Failed to write tree: {}", e))?;
        let tree = repo.find_tree(tree_id).map_err(|e| format!("Failed to find tree: {}", e))?;

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
        ).map_err(|e| format!("Failed to commit: {}", e))?;

        Ok(commit_oid.to_string())
    }

    pub fn push(path: &str, branch: Option<&str>) -> Result<String, String> {
        let mut cmd = Self::git_cmd(path);
        cmd.arg("push");
        if let Some(b) = branch {
            cmd.args(["origin", b]);
        }
        Self::run_with_timeout(cmd, 120)
    }

    pub fn pull(path: &str) -> Result<String, String> {
        let mut cmd = Self::git_cmd(path);
        cmd.args(["pull", "--rebase"]);
        Self::run_with_timeout(cmd, 120)
    }

    pub fn fetch(path: &str) -> Result<String, String> {
        let mut cmd = Self::git_cmd(path);
        cmd.arg("fetch").arg("--all");
        Self::run_with_timeout(cmd, 120)
    }

    pub fn stash(path: &str) -> Result<String, String> {
        let mut repo = Self::open_repo(path)?;

        // stash_save takes &mut self, so we need a 'static signature (no borrow on repo).
        // Read config values first, then create an owned signature.
        let config = repo.config().map_err(|e| format!("Failed to read config: {}", e))?;
        let name = config.get_string("user.name").unwrap_or_else(|_| "Git Switcher".into());
        let email = config.get_string("user.email").unwrap_or_else(|_| "git-switcher@local".into());
        let signature = git2::Signature::now(&name, &email)
            .map_err(|e| format!("Failed to create signature: {}", e))?;

        let stash_oid = repo.stash_save(&signature, "WIP: stashed by Git Switcher", None)
            .map_err(|e| format!("Failed to stash: {}", e))?;

        Ok(stash_oid.to_string())
    }

    pub fn stash_pop(path: &str) -> Result<String, String> {
        let mut cmd = Self::git_cmd(path);
        cmd.args(["stash", "pop"]);
        Self::run_with_timeout(cmd, 60)
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
    fn run_with_timeout(mut cmd: std::process::Command, timeout_secs: u64) -> Result<String, String> {
        let mut child = cmd
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn git: {}", e))?;

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
                        return Err(format!("Timed out after {}s", timeout_secs));
                    }
                    std::thread::sleep(std::time::Duration::from_millis(10));
                }
                Err(e) => {
                    let _ = child.kill();
                    return Err(format!("Process error: {}", e));
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
            Err(err)
        }
    }

    // ── Branch Management ───────────────────────────────────────────────

    pub fn create_branch(path: &str, name: &str, from_branch: Option<&str>) -> Result<(), String> {
        let repo = Self::open_repo(path)?;

        let target = if let Some(from) = from_branch {
            let (object, _) = repo.revparse_ext(from)
                .map_err(|e| format!("Branch '{}' not found: {}", from, e))?;
            repo.find_commit(object.id())
                .map_err(|e| format!("Failed to find commit: {}", e))?
        } else {
            let head = repo.head().map_err(|e| format!("Failed to get HEAD: {}", e))?;
            repo.find_commit(head.target().ok_or("No HEAD target")?)
                .map_err(|e| format!("Failed to find HEAD commit: {}", e))?
        };

        repo.branch(name, &target, false)
            .map_err(|e| format!("Failed to create branch '{}': {}", name, e))?;

        Ok(())
    }

    pub fn delete_branch(path: &str, name: &str) -> Result<(), String> {
        let repo = Self::open_repo(path)?;

        let mut branch = repo.find_branch(name, BranchType::Local)
            .map_err(|e| format!("Branch '{}' not found: {}", name, e))?;

        branch.delete()
            .map_err(|e| format!("Failed to delete branch '{}': {}", name, e))?;

        Ok(())
    }

    pub fn merge_branch(path: &str, branch_name: &str) -> Result<MergeResult, String> {
        let repo = Self::open_repo(path)?;

        let (object, _) = repo.revparse_ext(branch_name)
            .map_err(|e| format!("Branch '{}' not found: {}", branch_name, e))?;

        let annotated_commit = repo.find_annotated_commit(object.id())
            .map_err(|e| format!("Failed to find annotated commit: {}", e))?;

        // Perform merge analysis
        let (merge_analysis, _) = repo.merge_analysis(&[&annotated_commit])
            .map_err(|e| format!("Failed to analyze merge: {}", e))?;

        if merge_analysis.is_up_to_date() {
            return Ok(MergeResult {
                success: true,
                message: "Already up-to-date".to_string(),
                conflicts: vec![],
            });
        }

        if merge_analysis.is_fast_forward() {
            // Fast-forward merge
            let head = repo.head().map_err(|e| format!("Failed to get HEAD: {}", e))?;

            let target_branch = head.shorthand()
                .ok_or_else(|| "HEAD reference has no short name".to_string())?;
            let merge_target = object.id();
            repo.reference(
                &format!("refs/heads/{}", target_branch),
                merge_target,
                true,
                "merge (fast-forward)",
            ).map_err(|e| format!("Failed to update reference: {}", e))?;

            repo.checkout_head(Some(&mut CheckoutBuilder::new().force()))
                .map_err(|e| format!("Failed to checkout: {}", e))?;

            return Ok(MergeResult {
                success: true,
                message: format!("Fast-forward merged '{}' into '{}'", branch_name, target_branch),
                conflicts: vec![],
            });
        }

        // Normal merge
        repo.merge(&[&annotated_commit], None, None)
            .map_err(|e| format!("Failed to merge: {}", e))?;

        // Check for conflicts
        let mut conflicts = Vec::new();
        let mut index = repo.index().map_err(|e| format!("Failed to get index: {}", e))?;
        if index.has_conflicts() {
            let conflict_entries: Vec<_> = index.conflicts()
                .map_err(|e| format!("Failed to get conflicts: {}", e))?
                .filter_map(|c| c.map_err(|e| log::warn!("skipping corrupt conflict entry: {}", e)).ok())
                .collect();
            for entry in &conflict_entries {
                // Capture both sides — use "our" path as canonical name
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

            // Abort merge: reset index + working tree to HEAD, clean merge state
            if let Ok(head) = repo.head() {
                if let Some(oid) = head.target() {
                    if let Ok(obj) = repo.find_object(oid, Some(git2::ObjectType::Commit)) {
                        let _ = repo.reset(&obj, git2::ResetType::Hard, None);
                    }
                }
            }
            let _ = repo.cleanup_state();

            return Ok(MergeResult {
                success: false,
                message: format!("Merge has {} conflict(s)", conflicts.len()),
                conflicts,
            });
        }

        // Commit the merge — abort on any failure
        let commit_result = (|| -> Result<(), String> {
            let tree_id = index.write_tree().map_err(|e| format!("Failed to write tree: {}", e))?;
            let tree = repo.find_tree(tree_id).map_err(|e| format!("Failed to find tree: {}", e))?;

            let signature = Self::get_signature(&repo)?;

            let head = repo.head().map_err(|e| format!("Failed to get HEAD: {}", e))?;
            let head_commit = repo.find_commit(head.target().ok_or("No HEAD")?)
                .map_err(|e| format!("Failed to find HEAD commit: {}", e))?;
            let merge_commit = repo.find_commit(object.id())
                .map_err(|e| format!("Failed to find merge commit: {}", e))?;

            repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                &format!("Merge branch '{}'", branch_name),
                &tree,
                &[&head_commit, &merge_commit],
            ).map_err(|e| format!("Failed to commit merge: {}", e))?;

            Ok(())
        })();

        // Always clean up merge state; abort (reset to HEAD) if commit failed
        if commit_result.is_err() {
            if let Ok(head) = repo.head() {
                if let Some(oid) = head.target() {
                    if let Ok(obj) = repo.find_object(oid, Some(git2::ObjectType::Commit)) {
                        let _ = repo.reset(&obj, git2::ResetType::Hard, None);
                    }
                }
            }
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

    // ── Git Log ─────────────────────────────────────────────────────────

    pub fn get_log(path: &str, offset: usize, limit: usize) -> Result<Vec<CommitInfo>, String> {
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
            .map_err(|e| format!("Failed to create revwalk: {}", e))?;

        revwalk.set_sorting(git2::Sort::TIME)
            .map_err(|e| format!("Failed to set sorting: {}", e))?;

        revwalk.push(head_oid)
            .map_err(|e| format!("Failed to push HEAD: {}", e))?;

        let mut commits = Vec::new();
        for (i, oid_result) in revwalk.enumerate() {
            if i < offset { continue; }
            if commits.len() >= limit { break; }
            let oid = oid_result.map_err(|e| format!("Failed to get oid: {}", e))?;
            let commit = repo.find_commit(oid)
                .map_err(|e| format!("Failed to find commit: {}", e))?;

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

    pub fn fetch_all_projects(paths: &[String]) -> Vec<(String, Result<String, String>)> {
        Self::run_batch(paths, |p| Self::fetch(&p))
    }

    pub fn pull_all_projects(paths: &[String]) -> Vec<(String, Result<String, String>)> {
        Self::run_batch(paths, |p| Self::pull(&p))
    }

    fn run_batch<F>(paths: &[String], op: F) -> Vec<(String, Result<String, String>)>
    where
        F: Fn(String) -> Result<String, String> + Send + Sync + 'static,
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
                        .unwrap_or_else(|_| Err("Thread panicked".to_string()));
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
}
