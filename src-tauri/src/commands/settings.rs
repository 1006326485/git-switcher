use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

use crate::models::AppSettings;

pub struct SettingsStore {
    path: PathBuf,
    settings: Mutex<AppSettings>,
}

impl SettingsStore {
    fn with_settings<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&AppSettings) -> Result<T, String>,
    {
        let settings = self.settings.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        f(&settings)
    }

    pub fn new(app_data_dir: &PathBuf) -> Self {
        let path = app_data_dir.join("settings.json");
        let settings = if path.exists() {
            match fs::read_to_string(&path) {
                Ok(content) => match serde_json::from_str::<AppSettings>(&content) {
                    Ok(s) => s,
                    Err(e) => {
                        log::warn!("Corrupt settings.json, falling back to defaults: {}", e);
                        AppSettings::default()
                    }
                },
                Err(e) => {
                    log::warn!("Failed to read settings.json: {}", e);
                    AppSettings::default()
                }
            }
        } else {
            AppSettings::default()
        };

        Self {
            path,
            settings: Mutex::new(settings),
        }
    }

    pub fn get_all(&self) -> Result<AppSettings, String> {
        self.with_settings(|settings| Ok(settings.clone()))
    }

    pub fn update_all(&self, new_settings: &AppSettings) -> Result<(), String> {
        // Write to disk first so in-memory and disk stay consistent on failure
        self.save(new_settings)?;
        let mut settings = self.settings.lock().map_err(|e| format!("Lock poisoned: {}", e))?;
        *settings = new_settings.clone();
        Ok(())
    }

    fn save(&self, settings: &AppSettings) -> Result<(), String> {
        let content = serde_json::to_string_pretty(settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        fs::write(&self.path, content)
            .map_err(|e| format!("Failed to write settings: {}", e))?;
        Ok(())
    }
}

#[tauri::command]
pub fn get_settings(store: State<'_, SettingsStore>) -> Result<AppSettings, String> {
    store.get_all()
}

#[tauri::command]
pub fn update_settings(new_settings: AppSettings, store: State<'_, SettingsStore>) -> Result<AppSettings, String> {
    store.update_all(&new_settings)?;
    Ok(new_settings)
}
