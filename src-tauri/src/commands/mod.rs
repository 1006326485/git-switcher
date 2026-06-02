pub mod projects;
pub mod git;
pub mod settings;
pub mod groups;
pub mod ai_review;

pub use projects::*;
pub use git::*;
pub use settings::*;
pub use groups::*;
pub use ai_review::*;

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use dashmap::DashMap;
use tauri::{AppHandle, Emitter};

use crate::db::Database;
use crate::models::{GitProject, Group, ProjectDetail};
use crate::services::GitService;

/// Global operation counter for generating unique IDs.
static OP_COUNTER: AtomicU64 = AtomicU64::new(1);

/// Tracks active operations for cancellation support.
pub type ActiveOps = DashMap<u64, Arc<AtomicBool>>;

pub fn next_op_id() -> u64 {
    OP_COUNTER.fetch_add(1, Ordering::Relaxed)
}

pub(crate) fn try_update_activity(db: &Database, project_id: &str, hash: Option<&str>) {
    if let Some(h) = hash {
        if let Err(e) = db.update_project_activity(project_id, h) {
            log::warn!("activity update failed: {}", e);
        }
    }
}

/// Emit a git-op-start event.
pub(crate) fn emit_op_start(app: &AppHandle, id: u64, op: &str, path: &str) {
    #[derive(serde::Serialize, Clone)]
    struct OpStart {
        id: u64,
        op: String,
        path: String,
    }
    let _ = app.emit("git-op-start", OpStart {
        id,
        op: op.to_string(),
        path: path.to_string(),
    });
}

/// Emit a git-op-done event.
pub(crate) fn emit_op_done(app: &AppHandle, id: u64, op: &str, path: &str) {
    #[derive(serde::Serialize, Clone)]
    struct OpDone {
        id: u64,
        op: String,
        path: String,
    }
    let _ = app.emit("git-op-done", OpDone {
        id,
        op: op.to_string(),
        path: path.to_string(),
    });
}

/// Emit a git-op-error event.
pub(crate) fn emit_op_error(app: &AppHandle, id: u64, op: &str, path: &str, error: &str) {
    #[derive(serde::Serialize, Clone)]
    struct OpError {
        id: u64,
        op: String,
        path: String,
        error: String,
    }
    let _ = app.emit("git-op-error", OpError {
        id,
        op: op.to_string(),
        path: path.to_string(),
        error: error.to_string(),
    });
}

/// Check if an operation has been cancelled.
pub(crate) fn is_cancelled(active_ops: &ActiveOps, id: u64) -> bool {
    active_ops
        .get(&id)
        .map(|flag| !flag.load(Ordering::SeqCst))
        .unwrap_or(false)
}

/// Batch-fetch project details: query group per project + parallel git I/O.
pub(crate) fn fetch_project_details_batch(
    db: &Database,
    projects: Vec<GitProject>,
) -> Vec<ProjectDetail> {
    if projects.is_empty() {
        return Vec::new();
    }

    // Pre-fetch groups for all projects
    let project_groups: Vec<(GitProject, Group)> = projects
        .into_iter()
        .filter_map(|p| {
            match db.get_project_group(&p.id) {
                Ok(group) => Some((p, group)),
                Err(e) => {
                    log::warn!("skipping project {} (no group): {}", p.name, e);
                    None
                }
            }
        })
        .collect();

    // Parallel git2 I/O via std::thread::scope
    std::thread::scope(|s| {
        let handles: Vec<_> = project_groups
            .into_iter()
            .map(|(p, group)| {
                s.spawn(move || {
                    let fallback_group = group.clone();
                    match GitService::get_project_detail(&p, group) {
                        Ok(detail) => detail,
                        Err(_) => ProjectDetail::fallback(p, fallback_group),
                    }
                })
            })
            .collect();

        handles.into_iter().filter_map(|h| h.join().ok()).collect()
    })
}
