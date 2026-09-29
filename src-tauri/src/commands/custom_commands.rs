use crate::db::Database;
use crate::models::CustomCommand;
use tauri::State;

#[tauri::command]
pub async fn create_custom_command(
    db: State<'_, Database>,
    name: String,
    command: String,
    shortcut: Option<String>,
    project_path: Option<String>,
) -> Result<CustomCommand, String> {
    let db = db.inner().clone();
    let id = uuid::Uuid::new_v4().to_string();
    let existing = db.get_all_custom_commands().unwrap_or_default();
    let sort_order = existing.len() as i32;
    db.insert_custom_command(
        &id,
        &name,
        &command,
        shortcut.as_deref(),
        project_path.as_deref(),
        sort_order,
    )
    .map_err(|e| e.to_string())?;
    Ok(CustomCommand {
        id,
        name,
        command,
        shortcut,
        project_path,
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_db(name: &str) -> (Database, PathBuf) {
        let dir = std::env::temp_dir().join(format!("git-switcher-cmd-test-{}", name));
        let _ = std::fs::remove_dir_all(&dir);
        let db = Database::new(&dir).unwrap();
        (db, dir)
    }

    #[test]
    fn project_path_migration_is_idempotent() {
        let (db, dir) = temp_db("migrate");
        db.insert_custom_command("c1", "Build", "yarn run build", None, None, 0)
            .unwrap();
        drop(db);
        let db = Database::new(&dir).unwrap();
        let cmds = db.get_all_custom_commands().unwrap();
        assert_eq!(cmds.len(), 1);
        assert!(cmds[0].project_path.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn custom_command_round_trips_project_binding() {
        let (db, dir) = temp_db("roundtrip");
        db.insert_custom_command(
            "c1",
            "Serve Watch",
            "yarn run serve:watch",
            None,
            Some("/repos/a"),
            0,
        )
        .unwrap();
        db.insert_custom_command("c2", "Build", "yarn run build", None, None, 1)
            .unwrap();
        let cmds = db.get_all_custom_commands().unwrap();
        assert_eq!(cmds.len(), 2);
        let bound = cmds.iter().find(|c| c.id == "c1").unwrap();
        assert_eq!(bound.project_path.as_deref(), Some("/repos/a"));
        let global = cmds.iter().find(|c| c.id == "c2").unwrap();
        assert!(global.project_path.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
