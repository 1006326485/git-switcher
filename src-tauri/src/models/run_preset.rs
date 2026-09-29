use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunPresetItem {
    pub cwd: String,
    #[serde(rename = "projectTitle")]
    pub project_title: String,
    pub title: String,
    pub command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunPreset {
    pub id: String,
    pub name: String,
    pub items: Vec<RunPresetItem>,
    pub sort_order: i32,
    pub created_at: String,
}
