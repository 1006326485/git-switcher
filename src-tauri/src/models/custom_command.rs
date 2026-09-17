use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomCommand {
    pub id: String,
    pub name: String,
    pub command: String,
    pub shortcut: Option<String>,
    pub sort_order: i32,
    pub created_at: String,
}
