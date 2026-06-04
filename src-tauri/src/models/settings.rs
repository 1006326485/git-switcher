use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Light,
    Dark,
    System,
}

impl Default for Theme {
    fn default() -> Self {
        Theme::System
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ViewMode {
    Card,
    List,
    Compact,
    Table,
}

impl Default for ViewMode {
    fn default() -> Self {
        ViewMode::Card
    }
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default)]
    pub theme: Theme,
    #[serde(default = "default_true")]
    pub auto_refresh: bool,
    #[serde(default = "default_refresh_interval")]
    pub refresh_interval_secs: u32,
    #[serde(default)]
    pub view_mode: ViewMode,
    #[serde(default)]
    pub llm: LlmConfig,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: Theme::System,
            auto_refresh: true,
            refresh_interval_secs: 30,
            view_mode: ViewMode::Card,
            llm: LlmConfig::default(),
        }
    }
}

fn default_true() -> bool {
    true
}

fn default_refresh_interval() -> u32 {
    30
}
