use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("not found: {0}")]
    NotFound(String),

    #[error("git error: {0}")]
    Git(String),

    #[error("database error: {0}")]
    Database(String),

    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),

    #[error("configuration error: {0}")]
    Config(String),

    #[error("LLM error: {0}")]
    Llm(String),

    #[error("{0}")]
    Other(String),
}

impl AppError {
    fn error_type(&self) -> &'static str {
        match self {
            Self::NotFound(_) => "not_found",
            Self::Git(_) => "git",
            Self::Database(_) => "database",
            Self::Io(_) => "io",
            Self::Config(_) => "config",
            Self::Llm(_) => "llm",
            Self::Other(_) => "other",
        }
    }
}

// Tauri requires errors to implement Serialize
impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeMap;
        let mut map = serializer.serialize_map(Some(2))?;
        map.serialize_entry("type", self.error_type())?;
        map.serialize_entry("message", &self.to_string())?;
        map.end()
    }
}
