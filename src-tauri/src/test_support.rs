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
