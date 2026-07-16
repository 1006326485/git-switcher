use crate::services::GitService;
use crate::test_support::GitFixture;

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
