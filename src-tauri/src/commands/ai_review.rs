use tauri::{AppHandle, State};

use crate::AppError;
use crate::commands::settings::SettingsStore;
use crate::models::{BranchDiff, LlmConfig, ReviewResult};
use crate::services::LlmService;

/// Validate config is enabled and branches have diffs. Returns the diff if valid.
fn validate_review(
    store: &SettingsStore,
    path: &str,
    base_branch: &str,
    head_branch: &str,
) -> Result<(LlmConfig, BranchDiff), AppError> {
    let config = store.get_all()?.llm;

    if !config.enabled {
        return Err(AppError::Llm("AI review is not enabled. Go to Settings to configure LLM.".to_string()));
    }

    let diff = LlmService::get_branch_diff(path, base_branch, head_branch)?;

    if diff.files.is_empty() {
        return Err(AppError::Other("No differences found between branches.".to_string()));
    }

    Ok((config, diff))
}

#[tauri::command]
pub fn get_branch_diff(
    path: String,
    base_branch: String,
    head_branch: String,
) -> Result<BranchDiff, AppError> {
    LlmService::get_branch_diff(&path, &base_branch, &head_branch)
}

#[tauri::command]
pub async fn ai_review(
    path: String,
    base_branch: String,
    head_branch: String,
    store: State<'_, SettingsStore>,
) -> Result<ReviewResult, AppError> {
    let (config, diff) = validate_review(&store, &path, &base_branch, &head_branch)?;
    LlmService::review_diff(&diff, &config).await
}

#[tauri::command]
pub async fn generate_commit_msg(
    path: String,
    store: State<'_, SettingsStore>,
) -> Result<String, AppError> {
    let config = store.get_all()?.llm;

    if !config.enabled {
        return Err(AppError::Llm("AI is not enabled. Go to Settings to configure LLM.".to_string()));
    }

    LlmService::generate_commit_message(&path, &config).await
}

#[tauri::command]
pub async fn ai_review_streaming(
    path: String,
    base_branch: String,
    head_branch: String,
    store: State<'_, SettingsStore>,
    app: AppHandle,
) -> Result<ReviewResult, AppError> {
    let (config, diff) = validate_review(&store, &path, &base_branch, &head_branch)?;
    LlmService::review_diff_streaming(&diff, &config, &app).await
}
