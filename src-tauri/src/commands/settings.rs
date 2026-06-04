use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

use crate::AppError;
use crate::models::{AppSettings, LlmConfig};

const KEYCHAIN_SERVICE: &str = "git-switcher";
const KEYCHAIN_USER: &str = "llm-api-key";

pub struct SettingsStore {
    path: PathBuf,
    settings: Mutex<AppSettings>,
}

impl SettingsStore {
    fn with_settings<F, T>(&self, f: F) -> Result<T, AppError>
    where
        F: FnOnce(&AppSettings) -> Result<T, AppError>,
    {
        let settings = self.settings.lock().map_err(|e| AppError::Other(format!("Lock poisoned: {}", e)))?;
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

    pub fn get_all(&self) -> Result<AppSettings, AppError> {
        self.with_settings(|settings| Ok(settings.clone()))
    }

    /// Get LLM config with API key resolved from keyring if flagged.
    pub fn get_llm_config_with_key(&self) -> Result<LlmConfig, AppError> {
        let mut config = self.with_settings(|settings| Ok(settings.llm.clone()))?;
        if config.key_in_keychain {
            let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER)
                .map_err(|e| AppError::Other(format!("Keychain error: {}", e)))?;
            match entry.get_password() {
                Ok(key) => config.api_key = key,
                Err(keyring::Error::NoEntry) => config.api_key = String::new(),
                Err(e) => return Err(AppError::Other(format!("Failed to read key: {}", e))),
            }
        }
        Ok(config)
    }

    pub fn update_all(&self, new_settings: &AppSettings) -> Result<(), AppError> {
        // Write to disk first so in-memory and disk stay consistent on failure
        self.save(new_settings)?;
        let mut settings = self.settings.lock().map_err(|e| AppError::Other(format!("Lock poisoned: {}", e)))?;
        *settings = new_settings.clone();
        Ok(())
    }

    fn save(&self, settings: &AppSettings) -> Result<(), AppError> {
        let content = serde_json::to_string_pretty(settings)
            .map_err(|e| AppError::Config(format!("Failed to serialize settings: {}", e)))?;
        fs::write(&self.path, content)?;
        Ok(())
    }
}

#[tauri::command]
pub fn get_settings(store: State<'_, SettingsStore>) -> Result<AppSettings, AppError> {
    store.get_all()
}

#[tauri::command]
pub fn update_settings(new_settings: AppSettings, store: State<'_, SettingsStore>) -> Result<AppSettings, AppError> {
    store.update_all(&new_settings)?;
    Ok(new_settings)
}

#[tauri::command]
pub fn update_settings_partial(
    patch: serde_json::Value,
    store: State<'_, SettingsStore>,
) -> Result<AppSettings, AppError> {
    let current = store.get_all()?;
    let mut current_json = serde_json::to_value(&current)
        .map_err(|e| AppError::Config(format!("Failed to serialize: {}", e)))?;
    // Merge patch into current
    if let (Some(obj), Some(patch_obj)) = (current_json.as_object_mut(), patch.as_object()) {
        for (k, v) in patch_obj {
            obj.insert(k.clone(), v.clone());
        }
    }
    let new_settings: AppSettings = serde_json::from_value(current_json)
        .map_err(|e| AppError::Config(format!("Failed to deserialize: {}", e)))?;
    store.update_all(&new_settings)?;
    Ok(new_settings)
}

#[tauri::command]
pub fn set_llm_api_key(key: String, store: State<'_, SettingsStore>) -> Result<(), AppError> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER)
        .map_err(|e| AppError::Other(format!("Keychain error: {}", e)))?;
    entry.set_password(&key)
        .map_err(|e| AppError::Other(format!("Failed to store key: {}", e)))?;
    // Mark key as stored in keyring and clear plaintext from settings
    let mut settings = store.get_all()?;
    settings.llm.key_in_keychain = true;
    settings.llm.api_key = String::new();
    store.update_all(&settings)?;
    Ok(())
}

#[tauri::command]
pub fn get_llm_api_key() -> Result<String, AppError> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER)
        .map_err(|e| AppError::Other(format!("Keychain error: {}", e)))?;
    match entry.get_password() {
        Ok(key) => Ok(key),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(AppError::Other(format!("Failed to read key: {}", e))),
    }
}
