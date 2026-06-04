use crate::AppError;
use crate::models::*;

/// Abstraction over git operations, allowing alternative implementations
/// (e.g., CLI-based, test mocks) in addition to the default libgit2 backend.
pub trait GitBackend {
    fn is_git_repo(path: &str) -> bool;
    fn init_repo(path: &str) -> Result<(), AppError>;
    fn get_project_detail(project: &GitProject, group: Group) -> Result<ProjectDetail, AppError>;

    // Branch operations
    fn switch_branch(path: &str, branch_name: &str) -> Result<(), AppError>;
    fn create_branch(path: &str, name: &str, from_branch: Option<&str>) -> Result<(), AppError>;
    fn delete_branch(path: &str, name: &str) -> Result<(), AppError>;
    fn merge_branch(path: &str, branch_name: &str) -> Result<MergeResult, AppError>;

    // Working tree
    fn get_file_list(path: &str) -> Result<Vec<GitFileEntry>, AppError>;
    fn stage_file(path: &str, file_path: &str) -> Result<(), AppError>;
    fn unstage_file(path: &str, file_path: &str) -> Result<(), AppError>;
    fn commit(path: &str, message: &str) -> Result<String, AppError>;

    // Network
    fn push(path: &str, branch: Option<&str>) -> Result<String, AppError>;
    fn pull(path: &str) -> Result<String, AppError>;
    fn fetch(path: &str) -> Result<String, AppError>;

    // Stash
    fn stash(path: &str, message: Option<&str>) -> Result<String, AppError>;
    fn stash_pop(path: &str) -> Result<String, AppError>;
    fn stash_pop_at(path: &str, index: usize) -> Result<String, AppError>;
    fn get_stash_list(path: &str) -> Result<Vec<StashInfo>, AppError>;
    fn stash_drop(path: &str, index: usize) -> Result<(), AppError>;

    // Log
    fn get_log(path: &str, offset: usize, limit: usize, author: Option<&str>, message_contains: Option<&str>, since: Option<i64>, until: Option<i64>) -> Result<Vec<CommitInfo>, AppError>;

    // Batch
    fn fetch_all_projects(paths: &[String]) -> Vec<(String, Result<String, AppError>)>;
    fn pull_all_projects(paths: &[String]) -> Vec<(String, Result<String, AppError>)>;
}
