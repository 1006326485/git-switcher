use tauri::{AppHandle, Emitter};

#[derive(serde::Serialize, Clone)]
pub(crate) struct GitOpEvent {
    pub id: u64,
    pub op: String,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Emit a git-op-start event.
pub(crate) fn emit_op_start(app: &AppHandle, id: u64, op: &str, path: &str) {
    if let Err(e) = app.emit("git-op-start", GitOpEvent {
        id,
        op: op.to_string(),
        path: path.to_string(),
        error: None,
    }) {
        log::warn!("failed to emit git-op-start: {}", e);
    }
}

/// Emit a git-op-done event.
pub(crate) fn emit_op_done(app: &AppHandle, id: u64, op: &str, path: &str) {
    if let Err(e) = app.emit("git-op-done", GitOpEvent {
        id,
        op: op.to_string(),
        path: path.to_string(),
        error: None,
    }) {
        log::warn!("failed to emit git-op-done: {}", e);
    }
}

/// Emit a git-op-error event.
pub(crate) fn emit_op_error(app: &AppHandle, id: u64, op: &str, path: &str, error: &str) {
    if let Err(e) = app.emit("git-op-error", GitOpEvent {
        id,
        op: op.to_string(),
        path: path.to_string(),
        error: Some(error.to_string()),
    }) {
        log::warn!("failed to emit git-op-error: {}", e);
    }
}
