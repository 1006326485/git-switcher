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
