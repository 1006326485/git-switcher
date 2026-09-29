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

    /// Build a git error carrying the operation and repository path, plus an
    /// actionable recovery hint derived from git's output.
    pub fn git_with_context(op: &str, path: &str, detail: impl std::fmt::Display) -> Self {
        let detail = detail.to_string();
        let detail = detail.trim();
        let detail = if detail.is_empty() {
            "git reported no details"
        } else {
            detail
        };
        match recovery_hint(detail) {
            "" => Self::Git(format!("{} failed in {}: {}", op, path, detail)),
            hint => Self::Git(format!(
                "{} failed in {}: {}. Hint: {}",
                op, path, detail, hint
            )),
        }
    }
}

/// Actionable recovery hints for the git failures users hit most often.
fn recovery_hint(detail: &str) -> &'static str {
    let lower = detail.to_ascii_lowercase();
    if lower.contains("authentication failed")
        || lower.contains("permission denied")
        || lower.contains("could not read username")
        || lower.contains("could not read password")
        || lower.contains("access denied")
        || lower.contains("403 forbidden")
        || lower.contains("401 unauthorized")
    {
        "check the credentials for this remote in Settings, or use an SSH key"
    } else if lower.contains("could not resolve host")
        || lower.contains("unable to access")
        || lower.contains("failed to connect")
        || lower.contains("connection refused")
        || lower.contains("network is unreachable")
    {
        "check your network connection and proxy settings, then retry"
    } else if lower.contains("index.lock") {
        "another Git operation holds the repository lock — wait for it to finish, then retry"
    } else if lower.contains("timed out") {
        "the operation exceeded its time budget — the repository may be very large or the remote slow; retry or run the command in a terminal"
    } else if lower.contains("please commit your changes")
        || lower.contains("your local changes to the following files")
    {
        "commit, stash or discard the listed local changes first"
    } else if lower.contains("conflict") {
        "resolve or abort the in-progress merge from the conflicts panel"
    } else {
        ""
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
