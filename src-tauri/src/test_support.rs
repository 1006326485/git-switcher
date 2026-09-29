use std::fs;
use std::path::{Path, PathBuf};

use git2::{Repository, Signature};
use tempfile::{tempdir, TempDir};

pub struct GitFixture {
    _directory: TempDir,
    repository_path: PathBuf,
}

impl GitFixture {
    pub fn new() -> Self {
        let directory = tempdir().expect("create temporary directory");
        let repository_path = directory.path().join("repository");
        let repository =
            Repository::init(&repository_path).expect("initialize temporary repository");
        let signature = Signature::now("Git Switcher Test", "tests@git-switcher.local")
            .expect("create test signature");
        let tree_id = repository
            .index()
            .expect("open index")
            .write_tree()
            .expect("write empty tree");
        let tree = repository.find_tree(tree_id).expect("find initial tree");

        repository
            .commit(
                Some("HEAD"),
                &signature,
                &signature,
                "Initial commit",
                &tree,
                &[],
            )
            .expect("create initial commit");

        Self {
            _directory: directory,
            repository_path,
        }
    }

    pub fn path(&self) -> &str {
        self.repository_path
            .to_str()
            .expect("temporary repository path is valid UTF-8")
    }

    pub fn open(&self) -> Repository {
        Repository::open(&self.repository_path).expect("open temporary repository")
    }

    pub fn write_file(&self, relative_path: impl AsRef<Path>, contents: &str) {
        let path = self.repository_path.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create test file parent directory");
        }
        fs::write(path, contents).expect("write test file");
    }
}

/// Identity + no-signing config so CLI git operations work non-interactively.
pub fn configure_identity(fixture: &GitFixture) {
    let repo = fixture.open();
    let mut config = repo.config().expect("open config");
    config
        .set_str("user.name", "Git Switcher Test")
        .expect("set user.name");
    config
        .set_str("user.email", "tests@git-switcher.local")
        .expect("set user.email");
    config
        .set_bool("commit.gpgsign", false)
        .expect("disable commit signing");
}

fn test_signature() -> Signature<'static> {
    Signature::now("Git Switcher Test", "tests@git-switcher.local").expect("create signature")
}

/// Stage `file` with `contents` without committing.
pub fn stage_file(fixture: &GitFixture, file: &str, contents: &str) {
    fixture.write_file(file, contents);
    let repo = fixture.open();
    let mut index = repo.index().expect("open index");
    index.add_path(Path::new(file)).expect("stage file");
    index.write().expect("write index");
}

/// Create a commit on HEAD adding/setting `file` and return its OID as a string.
pub fn commit_file(fixture: &GitFixture, file: &str, contents: &str, message: &str) -> String {
    stage_file(fixture, file, contents);
    let repo = fixture.open();
    let mut index = repo.index().expect("open index");
    let tree_id = index.write_tree().expect("write tree");
    let tree = repo.find_tree(tree_id).expect("find tree");
    let parent_oid = repo.head().expect("read HEAD").target().expect("HEAD oid");
    let parent = repo.find_commit(parent_oid).expect("find HEAD commit");
    let oid = repo
        .commit(
            Some("HEAD"),
            &test_signature(),
            &test_signature(),
            message,
            &tree,
            &[&parent],
        )
        .expect("create commit");
    oid.to_string()
}

/// Commit `file` on an existing branch without switching to it (leaves the
/// worktree dirty relative to HEAD — call `reset_hard_to_head` afterwards).
pub fn commit_file_on_branch(
    fixture: &GitFixture,
    branch: &str,
    file: &str,
    contents: &str,
    message: &str,
) -> String {
    stage_file(fixture, file, contents);
    let repo = fixture.open();
    let mut index = repo.index().expect("open index");
    let tree_id = index.write_tree().expect("write tree");
    let tree = repo.find_tree(tree_id).expect("find tree");
    let refname = format!("refs/heads/{}", branch);
    let parent_oid = repo.refname_to_id(&refname).expect("branch tip");
    let parent = repo
        .find_commit(parent_oid)
        .expect("find branch tip commit");
    let oid = repo
        .commit(
            Some(&refname),
            &test_signature(),
            &test_signature(),
            message,
            &tree,
            &[&parent],
        )
        .expect("create commit");
    oid.to_string()
}

/// Throw away worktree/index drift so the repo matches HEAD again.
pub fn reset_hard_to_head(fixture: &GitFixture) {
    let repo = fixture.open();
    let head = repo.head().expect("read HEAD");
    let commit = head.peel_to_commit().expect("peel HEAD to commit");
    repo.reset(commit.as_object(), git2::ResetType::Hard, None)
        .expect("reset to HEAD");
}

/// Commit messages from HEAD backwards (newest first).
pub fn log_messages(fixture: &GitFixture) -> Vec<String> {
    let repo = fixture.open();
    let mut revwalk = repo.revwalk().expect("create revwalk");
    revwalk.push_head().expect("push HEAD");
    revwalk
        .map(|oid| {
            let commit = repo
                .find_commit(oid.expect("walk oid"))
                .expect("find commit");
            commit.message().unwrap_or("").trim_end().to_string()
        })
        .collect()
}
