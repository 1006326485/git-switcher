use tauri::State;

use crate::commands::settings::SettingsStore;
use crate::models::{BranchDiff, ReviewResult};
use crate::services::LlmService;

#[tauri::command]
pub fn get_branch_diff(
    path: String,
    base_branch: String,
    head_branch: String,
) -> Result<BranchDiff, String> {
    LlmService::get_branch_diff(&path, &base_branch, &head_branch)
}

#[tauri::command]
pub async fn ai_review(
    path: String,
    base_branch: String,
    head_branch: String,
    store: State<'_, SettingsStore>,
) -> Result<ReviewResult, String> {
    let config = store.get_all()?.llm;

    if !config.enabled {
        return Err("AI review is not enabled. Go to Settings to configure LLM.".to_string());
    }

    let diff = LlmService::get_branch_diff(&path, &base_branch, &head_branch)?;

    if diff.files.is_empty() {
        return Err("No differences found between branches.".to_string());
    }

    let result = LlmService::review_diff(&diff, &config).await?;

    Ok(result)
}
