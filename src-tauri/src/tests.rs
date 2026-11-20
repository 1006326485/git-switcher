use crate::services::GitService;
use crate::test_support::GitFixture;

/// A bare repository usable as a named remote of `fixture`.
fn init_bare_remote(fixture: &GitFixture, name: &str) -> (tempfile::TempDir, String) {
    let directory = tempfile::tempdir().expect("remote directory");
    let remote_path = directory.path().join("remote.git");
    git2::Repository::init_bare(&remote_path).expect("init bare remote");
    let url = remote_path.to_str().expect("utf-8 remote path").to_string();
    {
        let repo = fixture.open();
        repo.remote(name, &url).expect("add remote");
    }
    (directory, url)
}

fn current_branch_name(fixture: &GitFixture) -> String {
    let repo = fixture.open();
    let head = repo.head().expect("read HEAD");
    let name = head.shorthand().expect("branch name").to_string();
    name
}

#[test]
fn switches_to_a_branch_created_in_a_temporary_repository() {
    let fixture = GitFixture::new();
    let path = fixture.path();

    GitService::create_branch(path, "feature/safety-baseline", None).unwrap();
    GitService::switch_branch(path, "feature/safety-baseline").unwrap();

    let repo = fixture.open();
    let branches = GitService::get_branches(&repo).unwrap();

    assert!(branches
        .iter()
        .any(|branch| branch.name == "feature/safety-baseline" && branch.is_current));
}

#[test]
fn lists_tags_in_the_branch_picker_and_switches_to_them() {
    let fixture = GitFixture::new();
    let path = fixture.path();

    GitService::create_tag(path, "v1.0.0", None, None).unwrap();
    GitService::create_tag(path, "release/2024-06", None, None).unwrap();

    let repo = fixture.open();
    let branches = GitService::get_branches(&repo).unwrap();

    let tag = branches
        .iter()
        .find(|branch| branch.name == "release/2024-06")
        .expect("tag is listed in branch picker");
    assert!(tag.is_tag);
    assert!(!tag.is_remote);

    GitService::switch_branch(path, "release/2024-06").unwrap();

    let repo = fixture.open();
    let head = repo.head().unwrap();
    assert!(!head.is_branch(), "checkout of a tag detaches HEAD");
    assert_eq!(
        head.target().unwrap(),
        repo.revparse_single("refs/tags/release/2024-06")
            .unwrap()
            .peel_to_commit()
            .unwrap()
            .id()
    );
}

/// A remote-only branch must appear locally after it is switched to, and the
/// new local branch must track the remote-tracking ref it came from.
#[test]
fn switching_to_a_remote_branch_creates_a_local_tracking_branch() {
    use crate::test_support::{commit_file, configure_identity};

    let fixture = GitFixture::new();
    configure_identity(&fixture);
    let path = fixture.path();
    let (_remote, _url) = init_bare_remote(&fixture, "origin");

    let base = commit_file(&fixture, "base.txt", "base\n", "base");
    let head_branch = current_branch_name(&fixture);
    GitService::run_cli(
        path,
        &["push", "-u", "origin", &head_branch],
        60,
        "git push",
    )
    .expect("push base branch");

    {
        let repo = fixture.open();
        let oid: git2::Oid = base.parse().expect("parse base oid");
        let commit = repo.find_commit(oid).expect("find base commit");
        repo.branch("feature/remote-only", &commit, false)
            .expect("create remote-only branch");
    }
    GitService::run_cli(
        path,
        &["push", "-u", "origin", "feature/remote-only"],
        60,
        "git push",
    )
    .expect("push remote-only branch");
    {
        let repo = fixture.open();
        let mut local = repo
            .find_branch("feature/remote-only", git2::BranchType::Local)
            .expect("local branch before switch");
        local.delete().expect("delete local branch");
    }

    GitService::switch_branch(path, "origin/feature/remote-only").expect("switch to remote branch");

    let repo = fixture.open();
    let head = repo.head().expect("read HEAD");
    assert!(head.is_branch(), "HEAD must point at the new local branch");
    assert_eq!(head.shorthand(), Some("feature/remote-only"));
    let local = repo
        .find_branch("feature/remote-only", git2::BranchType::Local)
        .expect("local branch created on switch");
    assert_eq!(
        local
            .upstream()
            .expect("upstream set")
            .name()
            .expect("upstream name"),
        Some("origin/feature/remote-only")
    );
}

/// The picker passes the full remote-tracking name (origin/topic). When the
/// same branch also exists on another remote, Git's DWIM refuses to guess and
/// the local branch used to never be created; the selected remote must win.
#[test]
fn switching_to_a_remote_branch_uses_the_selected_remote_when_several_have_it() {
    use crate::test_support::{commit_file, configure_identity};

    let fixture = GitFixture::new();
    configure_identity(&fixture);
    let path = fixture.path();
    let (_remote, url) = init_bare_remote(&fixture, "origin");
    {
        let repo = fixture.open();
        repo.remote("upstream", &url).expect("add upstream");
    }

    let base = commit_file(&fixture, "base.txt", "base\n", "base");
    let head_branch = current_branch_name(&fixture);
    GitService::run_cli(
        path,
        &["push", "-u", "origin", &head_branch],
        60,
        "git push",
    )
    .expect("push base branch");
    {
        let repo = fixture.open();
        let oid: git2::Oid = base.parse().expect("parse base oid");
        let commit = repo.find_commit(oid).expect("find base commit");
        repo.branch("topic", &commit, false).expect("create topic");
    }
    GitService::run_cli(path, &["push", "-u", "origin", "topic"], 60, "git push")
        .expect("push topic to origin");
    GitService::run_cli(path, &["branch", "-D", "topic"], 30, "git branch -D")
        .expect("delete local topic");
    GitService::run_cli(path, &["fetch", "upstream"], 60, "git fetch upstream")
        .expect("fetch upstream");
    {
        let repo = fixture.open();
        assert!(
            repo.find_reference("refs/remotes/upstream/topic").is_ok(),
            "both remotes must carry the branch"
        );
    }

    GitService::switch_branch(path, "origin/topic").expect("switch to origin/topic");

    let repo = fixture.open();
    let local = repo
        .find_branch("topic", git2::BranchType::Local)
        .expect("local branch created from the selected remote");
    assert_eq!(
        local
            .upstream()
            .expect("upstream set")
            .name()
            .expect("upstream name"),
        Some("origin/topic"),
        "the picked remote must become the upstream"
    );
    let head = repo.head().expect("read HEAD");
    assert_eq!(head.shorthand(), Some("topic"));
}

/// A tag sharing the short name (origin/topic -> topic) used to win Git's
/// checkout DWIM and leave HEAD detached at the tag, with no local branch.
#[test]
fn switching_to_a_remote_branch_does_not_detach_on_a_same_named_tag() {
    use crate::test_support::{commit_file, configure_identity};

    let fixture = GitFixture::new();
    configure_identity(&fixture);
    let path = fixture.path();
    let (_remote, _url) = init_bare_remote(&fixture, "origin");

    let base = commit_file(&fixture, "base.txt", "base\n", "base");
    let head_branch = current_branch_name(&fixture);
    GitService::run_cli(
        path,
        &["push", "-u", "origin", &head_branch],
        60,
        "git push",
    )
    .expect("push base branch");
    {
        let repo = fixture.open();
        let oid: git2::Oid = base.parse().expect("parse base oid");
        let commit = repo.find_commit(oid).expect("find base commit");
        repo.branch("topic", &commit, false).expect("create topic");
    }
    GitService::run_cli(path, &["push", "-u", "origin", "topic"], 60, "git push")
        .expect("push topic to origin");
    GitService::run_cli(path, &["branch", "-D", "topic"], 30, "git branch -D")
        .expect("delete local topic");
    GitService::run_cli(path, &["tag", "topic", "origin/topic"], 30, "git tag")
        .expect("tag the remote branch");

    GitService::switch_branch(path, "origin/topic").expect("switch to origin/topic");

    let repo = fixture.open();
    let head = repo.head().expect("read HEAD");
    assert!(
        head.is_branch(),
        "a same-named tag must not turn the switch into a detached checkout"
    );
    assert_eq!(head.shorthand(), Some("topic"));
    assert!(repo.find_branch("topic", git2::BranchType::Local).is_ok());
}

#[test]
fn reports_an_untracked_file_in_a_temporary_repository() {
    let fixture = GitFixture::new();
    fixture.write_file("notes.txt", "untracked work");

    let repo = fixture.open();
    let status = GitService::get_status(&repo).unwrap();

    assert_eq!(status.untracked, 1);
}

#[test]
fn persists_task_workspace_entries_with_the_retain_current_strategy() {
    use chrono::Utc;
    use tempfile::tempdir;
    use uuid::Uuid;

    use crate::db::Database;
    use crate::models::{
        GitProject, TaskStrategy, TaskWorkspace, TaskWorkspaceEntry, TaskWorkspaceStatus,
    };

    let directory = tempdir().unwrap();
    let database = Database::new(&directory.path().to_path_buf()).unwrap();
    let group = database.get_all_groups().unwrap().remove(0);
    let project = GitProject::new(
        "web".to_string(),
        "/tmp/task-workspace-web".to_string(),
        group.id,
    );
    database.insert_project(&project).unwrap();
    let now = Utc::now().to_rfc3339();
    let workspace = TaskWorkspace {
        id: Uuid::new_v4().to_string(),
        name: "PAY-482".to_string(),
        description: Some("Payment retry".to_string()),
        status: TaskWorkspaceStatus::Active,
        created_at: now.clone(),
        updated_at: now.clone(),
        last_opened_at: Some(now.clone()),
    };
    database.insert_task_workspace(&workspace).unwrap();
    database
        .insert_task_workspace_entry(&TaskWorkspaceEntry {
            id: Uuid::new_v4().to_string(),
            workspace_id: workspace.id.clone(),
            project_id: project.id,
            sort_order: 0,
            strategy: TaskStrategy::RetainCurrent,
            target_branch: None,
            base_branch: None,
            worktree_path: None,
            created_at: now.clone(),
            updated_at: now,
        })
        .unwrap();

    let detail = database.get_task_workspace_detail(&workspace.id).unwrap();
    assert_eq!(detail.workspace.name, "PAY-482");
    assert_eq!(detail.entries.len(), 1);
    assert_eq!(
        detail.entries[0].entry.strategy,
        TaskStrategy::RetainCurrent
    );

    database.archive_task_workspace(&workspace.id).unwrap();
    assert_eq!(
        database.get_task_workspace(&workspace.id).unwrap().status,
        TaskWorkspaceStatus::Archived
    );
}

#[test]
fn tray_recent_projects_rank_by_open_recency() {
    use tempfile::tempdir;

    use crate::db::Database;
    use crate::models::GitProject;

    let directory = tempdir().unwrap();
    let database = Database::new(&directory.path().to_path_buf()).unwrap();
    let group = database.get_all_groups().unwrap().remove(0);
    let first = GitProject::new(
        "first".to_string(),
        "/tmp/tray-first".to_string(),
        group.id.clone(),
    );
    let second = GitProject::new(
        "second".to_string(),
        "/tmp/tray-second".to_string(),
        group.id,
    );
    database.insert_project(&first).unwrap();
    database.insert_project(&second).unwrap();

    database.touch_project_opened(&first.id).unwrap();

    let recent = database.get_recent_projects(5).unwrap();
    assert_eq!(recent.len(), 2);
    assert_eq!(recent[0].id, first.id);
    assert_eq!(recent[1].id, second.id);

    let limited = database.get_recent_projects(1).unwrap();
    assert_eq!(limited.len(), 1);
    assert_eq!(limited[0].id, first.id);
}

// ── Batch streaming ─────────────────────────────────────────────────────
//
// `run_batch_streaming` is what makes batch progress real: the UI renders one
// tick per repository as it settles instead of jumping from 0 to N when the
// slowest repository finally returns.

#[test]
fn run_batch_streaming_reports_every_repository_exactly_once() {
    let paths = vec![
        "/tmp/a".to_string(),
        "/tmp/b".to_string(),
        "/tmp/c".to_string(),
    ];
    let mut reported: Vec<String> = Vec::new();
    let mut failures = 0usize;

    GitService::run_batch_streaming(
        &paths,
        |path: String| Ok(format!("done {}", path)),
        |name, result| {
            if result.is_err() {
                failures += 1;
            }
            reported.push(name);
        },
    );

    reported.sort();
    assert_eq!(reported, vec!["a", "b", "c"]);
    assert_eq!(failures, 0);
}

#[test]
fn run_batch_streaming_reports_before_the_slowest_repository_finishes() {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    let paths = vec!["/tmp/slow".to_string(), "/tmp/fast".to_string()];
    let slow_finished = Arc::new(AtomicBool::new(false));
    let flag = Arc::clone(&slow_finished);
    let mut fast_reported_while_slow_running = false;

    GitService::run_batch_streaming(
        &paths,
        move |path: String| {
            if path.ends_with("slow") {
                std::thread::sleep(Duration::from_millis(250));
                flag.store(true, Ordering::SeqCst);
            }
            Ok("ok".to_string())
        },
        |name, _| {
            if name == "fast" && !slow_finished.load(Ordering::SeqCst) {
                fast_reported_while_slow_running = true;
            }
        },
    );

    assert!(
        fast_reported_while_slow_running,
        "the fast repository must be reported while the slow one is still in flight"
    );
}

#[test]
fn run_batch_streaming_isolates_a_panicking_repository() {
    let paths = vec!["/tmp/ok".to_string(), "/tmp/boom".to_string()];
    let mut ok = 0usize;
    let mut failed = 0usize;

    GitService::run_batch_streaming(
        &paths,
        |path: String| {
            if path.ends_with("boom") {
                panic!("simulated worker panic");
            }
            Ok("ok".to_string())
        },
        |_, result| match result {
            Ok(_) => ok += 1,
            Err(_) => failed += 1,
        },
    );

    assert_eq!((ok, failed), (1, 1), "one panic must not abort the batch");
}

#[test]
fn run_batch_streaming_with_no_projects_does_nothing() {
    let mut calls = 0usize;
    GitService::run_batch_streaming(&[], |_path: String| Ok(String::new()), |_, _| calls += 1);
    assert_eq!(calls, 0);
}
