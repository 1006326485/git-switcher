use chrono::Utc;
use tauri::State;
use uuid::Uuid;

use crate::db::Database;
use crate::models::{Group, ProjectDetail};

#[tauri::command]
pub fn create_group(name: String, color: Option<String>, db: State<'_, Database>) -> Result<Group, String> {
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
}

#[tauri::command]
pub fn list_groups(db: State<'_, Database>) -> Result<Vec<Group>, String> {
    db.get_all_groups()
}

#[tauri::command]
pub fn update_group(group: Group, db: State<'_, Database>) -> Result<Group, String> {
    db.update_group(&group)?;
    Ok(group)
}

#[tauri::command]
pub fn delete_group(id: String, db: State<'_, Database>) -> Result<(), String> {
    db.delete_group(&id)
}

#[tauri::command]
pub fn assign_to_group(project_id: String, group_id: String, db: State<'_, Database>) -> Result<(), String> {
    db.assign_project_to_group(&project_id, &group_id)
}

#[tauri::command]
pub fn list_projects_in_group(group_id: String, db: State<'_, Database>) -> Result<Vec<ProjectDetail>, String> {
    let projects = db.get_projects_in_group(&group_id)?;
    Ok(super::fetch_project_details_batch(&db, projects))
}
