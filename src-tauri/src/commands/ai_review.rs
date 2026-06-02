use tauri::State;

use crate::AppError;
use crate::commands::settings::SettingsStore;
use crate::models::{BranchDiff, ReviewResult};
use crate::services::LlmService;

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
    let config = store.get_all()?.llm;

    if !config.enabled {
        return Err(AppError::Llm("AI review is not enabled. Go to Settings to configure LLM.".to_string()));
    }

    let diff = LlmService::get_branch_diff(&path, &base_branch, &head_branch)?;

    if diff.files.is_empty() {
        return Err(AppError::Other("No differences found between branches.".to_string()));
    }

    let result = LlmService::review_diff(&diff, &config).await?;

    Ok(result)
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
