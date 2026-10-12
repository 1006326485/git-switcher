use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    #[default]
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum ViewMode {
    #[default]
    Card,
    List,
    Compact,
    Table,
    Dashboard,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_endpoint")]
    pub endpoint: String,
    #[serde(default = "default_model")]
    pub model: String,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(default = "default_max_tokens")]
    pub max_tokens: u32,
    #[serde(default)]
    pub key_in_keychain: bool,
}

impl Default for LlmConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            api_key: String::new(),
            endpoint: default_endpoint(),
            model: default_model(),
            temperature: default_temperature(),
            max_tokens: default_max_tokens(),
            key_in_keychain: false,
        }
    }
}

fn default_endpoint() -> String {
    "https://api.openai.com/v1/chat/completions".to_string()
}

fn default_model() -> String {
    "gpt-4o-mini".to_string()
}

fn default_temperature() -> f32 {
    0.3
}

fn default_max_tokens() -> u32 {
    4096
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TraySettings {
    #[serde(default = "default_true")]
    pub git_actions: bool,
    #[serde(default = "default_true")]
    pub recent_projects: bool,
    #[serde(default = "default_true")]
    pub quick_launch: bool,
    #[serde(default = "default_recent_limit")]
    pub recent_limit: u32,
    /// Pinned run entries: `preset:<id>` or `saved:<id>`.
    #[serde(default)]
    pub pinned_commands: Vec<String>,
    #[serde(default = "default_true")]
    pub notifications: bool,
}

impl Default for TraySettings {
    fn default() -> Self {
        Self {
            git_actions: true,
            recent_projects: true,
            quick_launch: true,
            recent_limit: default_recent_limit(),
            pinned_commands: Vec::new(),
            notifications: true,
        }
    }
}

fn default_recent_limit() -> u32 {
    5
}

/// The raw interface-language preference stored in `settings.json`: one of the
/// codes in `locales/*.json`, or `"system"` to follow the operating system.
fn default_language() -> String {
    "system".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub theme: Theme,
    #[serde(default = "default_language")]
    pub language: String,
    #[serde(default = "default_true")]
    pub auto_refresh: bool,
    #[serde(default = "default_refresh_interval")]
    pub refresh_interval_secs: u32,
    #[serde(default)]
    pub view_mode: ViewMode,
    #[serde(default)]
    pub llm: LlmConfig,
    #[serde(default = "default_true")]
    pub auto_fetch_on_launch: bool,
    /// Global hotkey that summons the standalone terminal window.
    #[serde(default = "default_terminal_hotkey")]
    pub terminal_hotkey: String,
    /// Hide the summoned terminal window as soon as it loses focus.
    #[serde(default)]
    pub terminal_hide_on_blur: bool,
    #[serde(default)]
    pub tray: TraySettings,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            language: default_language(),
            auto_refresh: true,
            refresh_interval_secs: 30,
            view_mode: ViewMode::Card,
            llm: LlmConfig::default(),
            auto_fetch_on_launch: true,
            terminal_hotkey: default_terminal_hotkey(),
            terminal_hide_on_blur: false,
            tray: TraySettings::default(),
        }
    }
}

pub fn default_terminal_hotkey() -> String {
    "CmdOrCtrl+Shift+`".to_string()
}

fn default_true() -> bool {
    true
}

/// A stored credential for one remote of one project (or global when
/// `project_path` is empty). Used to authenticate private-repository network
/// operations without interactive prompts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitCredential {
    pub id: String,
    /// Empty string means the credential applies to every project.
    pub project_path: String,
    /// Remote URL, e.g. "https://github.com/acme/web.git".
    pub remote_url: String,
    pub username: String,
    /// Token or password. Stored in the local database this phase; migrate to
    /// the OS keychain later (see .ai/reports/git-credentials.md).
    pub secret: String,
    pub created_at: String,
    pub updated_at: String,
}

fn default_refresh_interval() -> u32 {
    30
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_terminal_fields_deserialize_to_defaults() {
        let settings: AppSettings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(settings.terminal_hotkey, default_terminal_hotkey());
        assert!(!settings.terminal_hide_on_blur);
    }

    #[test]
    fn missing_tray_fields_deserialize_to_defaults() {
        let settings: AppSettings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(settings.tray, TraySettings::default());
        assert!(settings.tray.git_actions);
        assert_eq!(settings.tray.recent_limit, 5);
        assert!(settings.tray.pinned_commands.is_empty());
    }

    #[test]
    fn tray_settings_round_trip() {
        let settings = AppSettings {
            tray: TraySettings {
                git_actions: false,
                recent_limit: 3,
                pinned_commands: vec!["preset:p1".to_string(), "saved:c1".to_string()],
                notifications: false,
                ..Default::default()
            },
            ..Default::default()
        };
        let json = serde_json::to_string(&settings).unwrap();
        let back: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.tray, settings.tray);
    }

    #[test]
    fn missing_language_deserializes_to_system() {
        let settings: AppSettings = serde_json::from_str(r#"{"theme":"dark"}"#).unwrap();
        assert_eq!(settings.language, "system");
        // Old files also keep working after a full round-trip.
        let json = serde_json::to_string(&settings).unwrap();
        let back: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.language, "system");
    }

    #[test]
    fn language_round_trips() {
        let settings = AppSettings {
            language: "zh-CN".to_string(),
            ..Default::default()
        };
        let json = serde_json::to_string(&settings).unwrap();
        let back: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.language, "zh-CN");
    }

    #[test]
    fn terminal_hotkey_round_trips() {
        let settings = AppSettings {
            terminal_hotkey: "Alt+Space".to_string(),
            terminal_hide_on_blur: true,
            ..Default::default()
        };
        let json = serde_json::to_string(&settings).unwrap();
        let back: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(back.terminal_hotkey, "Alt+Space");
        assert!(back.terminal_hide_on_blur);
    }
}
