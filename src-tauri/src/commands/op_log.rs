use crate::db::Database;
use crate::models::OperationLogEntry;
use tauri::State;

#[tauri::command]
pub async fn log_operation(
    db: State<'_, Database>,
    operation_type: String,
    project_path: String,
    project_name: Option<String>,
    details: Option<String>,
    status: String,
    error_message: Option<String>,
) -> Result<(), String> {
    let db = db.inner().clone();
    let id = uuid::Uuid::new_v4().to_string();
    db.insert_operation_log(
        &id,
        &operation_type,
        &project_path,
        project_name.as_deref(),
        details.as_deref(),
        &status,
        error_message.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_operation_log(
    db: State<'_, Database>,
    limit: Option<usize>,
) -> Result<Vec<OperationLogEntry>, String> {
    let db = db.inner().clone();
    db.get_operation_log(limit.unwrap_or(100))
        .map_err(|e| e.to_string())
}
