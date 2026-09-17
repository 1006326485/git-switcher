use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationLogEntry {
    pub id: String,
    pub operation_type: String,
    pub project_path: String,
    pub project_name: Option<String>,
    pub details: Option<String>,
    pub status: String,
    pub error_message: Option<String>,
    pub created_at: String,
}
