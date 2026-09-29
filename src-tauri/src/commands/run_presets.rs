use crate::db::Database;
use crate::models::{RunPreset, RunPresetItem};
use tauri::State;

#[tauri::command]
pub async fn create_run_preset(
    db: State<'_, Database>,
    name: String,
    items: Vec<RunPresetItem>,
) -> Result<RunPreset, String> {
    let db = db.inner().clone();
    let id = uuid::Uuid::new_v4().to_string();
    let existing = db.get_all_run_presets().unwrap_or_default();
    let sort_order = existing.len() as i32;
    let items_json = serde_json::to_string(&items).map_err(|e| e.to_string())?;
    db.insert_run_preset(&id, &name, &items_json, sort_order)
        .map_err(|e| e.to_string())?;
    Ok(RunPreset {
        id,
        name,
        items,
        sort_order,
        created_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub async fn list_run_presets(db: State<'_, Database>) -> Result<Vec<RunPreset>, String> {
    let db = db.inner().clone();
    db.get_all_run_presets().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_run_preset(db: State<'_, Database>, id: String) -> Result<(), String> {
    let db = db.inner().clone();
    db.delete_run_preset(&id).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_db(name: &str) -> (Database, PathBuf) {
        let dir = std::env::temp_dir().join(format!("git-switcher-preset-test-{}", name));
        let _ = std::fs::remove_dir_all(&dir);
        let db = Database::new(&dir).unwrap();
        (db, dir)
    }

    fn sample_items() -> Vec<RunPresetItem> {
        vec![
            RunPresetItem {
                cwd: "/repos/a".to_string(),
                project_title: "gcf-cod".to_string(),
                title: "serve:watch".to_string(),
                command: Some("yarn run serve:watch".to_string()),
            },
            RunPresetItem {
                cwd: "/repos/b".to_string(),
                project_title: "api".to_string(),
                title: "zsh".to_string(),
                command: None,
            },
        ]
    }

    #[test]
    fn run_preset_round_trips_items() {
        let (db, dir) = temp_db("roundtrip");
        let items = sample_items();
        let items_json = serde_json::to_string(&items).unwrap();
        db.insert_run_preset("p1", "Dev Stack", &items_json, 0)
            .unwrap();
        let presets = db.get_all_run_presets().unwrap();
        assert_eq!(presets.len(), 1);
        assert_eq!(presets[0].name, "Dev Stack");
        assert_eq!(presets[0].items.len(), 2);
        assert_eq!(
            presets[0].items[0].command.as_deref(),
            Some("yarn run serve:watch")
        );
        assert_eq!(presets[0].items[0].project_title, "gcf-cod");
        assert!(presets[0].items[1].command.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn run_preset_deletes_only_existing() {
        let (db, dir) = temp_db("delete");
        db.insert_run_preset("p1", "Dev Stack", "[]", 0).unwrap();
        db.delete_run_preset("p1").unwrap();
        assert!(db.get_all_run_presets().unwrap().is_empty());
        assert!(db.delete_run_preset("missing").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
