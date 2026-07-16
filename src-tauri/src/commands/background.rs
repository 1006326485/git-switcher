use tauri::State;

use crate::services::background::{BackgroundService, BackgroundStatus};
use crate::AppError;

#[tauri::command]
pub async fn pause_background_refresh(bg: State<'_, BackgroundService>) -> Result<(), AppError> {
    bg.pause().await;
    Ok(())
}

#[tauri::command]
pub async fn resume_background_refresh(bg: State<'_, BackgroundService>) -> Result<(), AppError> {
    bg.resume().await;
    Ok(())
}

#[tauri::command]
pub async fn set_background_interval(
    secs: u64,
    bg: State<'_, BackgroundService>,
) -> Result<(), AppError> {
    bg.set_interval(secs).await;
    Ok(())
}

#[tauri::command]
pub async fn get_background_status(
    bg: State<'_, BackgroundService>,
) -> Result<BackgroundStatus, AppError> {
    Ok(bg.get_status().await)
}
