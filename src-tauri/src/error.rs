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

    /// Machine-readable reason for a recognised failure, serialised as `code`.
    ///
    /// `None` when nothing matched, so a frontend can match on `code` instead of
    /// hunting for English substrings in `message` (which is now localised).
    pub fn code(&self) -> Option<&'static str> {
        match self {
            Self::NotFound(_) => Some("not_found"),
            _ => classify_message(&self.to_string()),
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
            hint_key => {
                let hint = crate::i18n::tl(hint_key, &[]);
                Self::Git(format!(
                    "{} failed in {}: {}. Hint: {}",
                    op, path, detail, hint
                ))
            }
        }
    }
}

/// Maps an error message onto the machine code the frontend matches on.
///
/// Order matters: specific phrases first, the bare `"conflict"` fallback last.
/// Matching stays on the lower-cased message, which still embeds git's own
/// English output, so it keeps working once the hint is localised.
fn classify_message(message: &str) -> Option<&'static str> {
    let lower = message.to_ascii_lowercase();
    if lower.contains("push rejected")
        || lower.contains("updates were rejected")
        || lower.contains("non-fast-forward")
    {
        Some("push_rejected")
    } else if lower.contains("detached head") {
        Some("detached_head")
    } else if lower.contains("nothing to commit") || lower.contains("no changes added") {
        Some("nothing_to_commit")
    } else if lower.contains("please commit your changes")
        || lower.contains("your local changes to the following files")
        || lower.contains("would be overwritten")
    {
        Some("dirty_tree")
    } else if lower.contains("merge conflict") {
        Some("merge_conflict")
    } else if lower.contains("authentication failed")
        || lower.contains("permission denied")
        || lower.contains("could not read username")
        || lower.contains("could not read password")
        || lower.contains("access denied")
        || lower.contains("403 forbidden")
        || lower.contains("401 unauthorized")
    {
        Some("auth_failed")
    } else if lower.contains("could not resolve host")
        || lower.contains("unable to access")
        || lower.contains("failed to connect")
        || lower.contains("connection refused")
        || lower.contains("network is unreachable")
    {
        Some("network_error")
    } else if lower.contains("timed out") {
        Some("timeout")
    } else if lower.contains("conflict") {
        Some("conflict")
    } else {
        None
    }
}

/// Catalogue key of the recovery hint for the git failures users hit most
/// often. Returns `""` when none apply.
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
        "backend.hint.credentials"
    } else if lower.contains("could not resolve host")
        || lower.contains("unable to access")
        || lower.contains("failed to connect")
        || lower.contains("connection refused")
        || lower.contains("network is unreachable")
    {
        "backend.hint.network"
    } else if lower.contains("index.lock") {
        "backend.hint.locked"
    } else if lower.contains("timed out") {
        "backend.hint.timeout"
    } else if lower.contains("please commit your changes")
        || lower.contains("your local changes to the following files")
    {
        "backend.hint.dirty"
    } else if lower.contains("conflict") {
        "backend.hint.conflict"
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
        let mut map = serializer.serialize_map(Some(3))?;
        map.serialize_entry("type", self.error_type())?;
        map.serialize_entry("message", &self.to_string())?;
        // `Option` serialises to `null`, so a frontend reading `code?: string`
        // stays compatible with payloads from an older backend.
        map.serialize_entry("code", &self.code())?;
        map.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_the_common_git_failures() {
        assert_eq!(
            AppError::Git("push failed: remote rejected: updates were rejected".to_string()).code(),
            Some("push_rejected")
        );
        assert_eq!(
            AppError::Git("fatal: HEAD is not a branch (detached head)".to_string()).code(),
            Some("detached_head")
        );
        assert_eq!(
            AppError::Git("nothing to commit, working tree clean".to_string()).code(),
            Some("nothing_to_commit")
        );
        assert_eq!(
            AppError::Git(
                "error: please commit your changes or stash them before you switch branch"
                    .to_string()
            )
            .code(),
            Some("dirty_tree")
        );
        assert_eq!(
            AppError::Git(
                "Automatic merge failed; fix conflicts and then commit the result.\nCONFLICT (add/add): Merge conflict in README.md"
                    .to_string(),
            )
            .code(),
            Some("merge_conflict")
        );
        assert_eq!(
            AppError::Git("fatal: could not read Username for 'https://github.com'".to_string())
                .code(),
            Some("auth_failed")
        );
        assert_eq!(
            AppError::Git("fatal: unable to access 'https://x/': Failed to connect".to_string())
                .code(),
            Some("network_error")
        );
        assert_eq!(
            AppError::Git("operation timed out after 30 seconds".to_string()).code(),
            Some("timeout")
        );
        // A bare "conflict" that is not a merge conflict falls through to the
        // generic `conflict` code.
        assert_eq!(
            AppError::Git("could not apply abc: conflict with notes.patch".to_string()).code(),
            Some("conflict")
        );
        assert_eq!(
            AppError::Git("merge: main - (conflict) README.md - HEAD".to_string()).code(),
            Some("conflict")
        );
    }

    #[test]
    fn not_found_and_unknown_details_have_expected_codes() {
        assert_eq!(
            AppError::NotFound("branch".to_string()).code(),
            Some("not_found")
        );
        // An unrecognised git output still carries no code.
        assert_eq!(
            AppError::Git("some opaque failure".to_string()).code(),
            None
        );
        // No hint and no code for an empty detail.
        let err = AppError::git_with_context("push", "/tmp/repo", "");
        assert_eq!(err.code(), None);
        assert!(err.to_string().contains("git reported no details"));
    }

    #[test]
    fn code_survives_serialisation() {
        let matching = serde_json::to_string(&AppError::Git(
            "fatal: could not read Username for 'https://github.com'".to_string(),
        ))
        .expect("AppError is serialisable");
        assert!(
            matching.contains("\"code\":\"auth_failed\""),
            "actual: {matching}"
        );
        let plain = serde_json::to_string(&AppError::Other("boom".to_string())).unwrap();
        assert!(plain.contains("\"code\":null"), "actual: {plain}");
        let git_plain =
            serde_json::to_string(&AppError::Git("some opaque failure".to_string())).unwrap();
        assert!(git_plain.contains("\"code\":null"), "actual: {git_plain}");
    }

    #[test]
    fn recovery_hint_embeds_the_catalogue_text() {
        use crate::i18n;
        // `recovery_hint` returns the catalogue key; `t` resolves it into text.
        assert_eq!(
            recovery_hint("fatal: could not read Username"),
            "backend.hint.credentials"
        );
        for hint_key in [
            "backend.hint.credentials",
            "backend.hint.network",
            "backend.hint.locked",
            "backend.hint.timeout",
            "backend.hint.dirty",
            "backend.hint.conflict",
        ] {
            assert_ne!(i18n::t("en", hint_key, &[]), hint_key);
            assert_ne!(i18n::t("zh-CN", hint_key, &[]), hint_key);
            assert_ne!(
                i18n::t("en", hint_key, &[]),
                i18n::t("zh-CN", hint_key, &[]),
                "{hint_key} should differ between languages"
            );
        }

        // Whatever language `tl` happens to be in, the resolved hint lands in
        // the message exactly once, after "Hint: ".
        let err = AppError::git_with_context("push", "/tmp/repo", "fatal: could not read Username");
        assert_eq!(err.code(), Some("auth_failed"));
        let en_hint = i18n::t("en", "backend.hint.credentials", &[]);
        let zh_hint = i18n::t("zh-CN", "backend.hint.credentials", &[]);
        let rendered = err.to_string();
        assert!(
            rendered.ends_with(en_hint.as_str()) || rendered.ends_with(zh_hint.as_str()),
            "unexpected message: {rendered}"
        );
        assert_eq!(rendered.matches("Hint: ").count(), 1);
    }
}
