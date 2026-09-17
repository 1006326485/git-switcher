use crate::db::Database;
use crate::models::CustomCommand;
use tauri::State;

#[tauri::command]
pub async fn create_custom_command(
    db: State<'_, Database>,
    name: String,
    command: String,
    shortcut: Option<String>,
) -> Result<CustomCommand, String> {
    let db = db.inner().clone();
    let id = uuid::Uuid::new_v4().to_string();
    let existing = db.get_all_custom_commands().unwrap_or_default();
    let sort_order = existing.len() as i32;
    db.insert_custom_command(&id, &name, &command, shortcut.as_deref(), sort_order)
        .map_err(|e| e.to_string())?;
    Ok(CustomCommand {
        id,
        name,
        command,
        shortcut,
        sort_order,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub async fn list_custom_commands(db: State<'_, Database>) -> Result<Vec<CustomCommand>, String> {
    let db = db.inner().clone();
    db.get_all_custom_commands().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_custom_command(db: State<'_, Database>, id: String) -> Result<(), String> {
    let db = db.inner().clone();
    db.delete_custom_command(&id).map_err(|e| e.to_string())
}
