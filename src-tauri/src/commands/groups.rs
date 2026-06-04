use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::AppError;
use crate::db::Database;
use crate::models::{Group, ProjectDetail};

#[tauri::command]
pub async fn create_group(name: String, color: Option<String>, db: State<'_, Database>) -> Result<Group, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        let now = Utc::now().to_rfc3339();
        let group = Group {
            id: Uuid::new_v4().to_string(),
            name,
            color,
            sort_order: 0,
            created_at: now,
        };
        db.insert_group(&group)?;
        Ok(group)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn list_groups(db: State<'_, Database>) -> Result<Vec<Group>, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || db.get_all_groups())
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn update_group(group: Group, db: State<'_, Database>) -> Result<Group, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        db.update_group(&group)?;
        Ok(group)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn delete_group(id: String, db: State<'_, Database>) -> Result<(), AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || db.delete_group(&id))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn assign_to_group(project_id: String, group_id: String, db: State<'_, Database>) -> Result<(), AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || db.assign_project_to_group(&project_id, &group_id))
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn list_projects_in_group(group_id: String, db: State<'_, Database>) -> Result<Vec<ProjectDetail>, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        let projects = db.get_projects_in_group(&group_id)?;
        Ok(super::fetch_project_details_batch(&db, projects))
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}
