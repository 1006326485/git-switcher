pub mod projects;
pub mod git;
pub mod settings;
pub mod groups;
pub mod ai_review;
pub mod op_tracker;
pub mod events;

pub use projects::*;
pub use git::*;
pub use settings::*;
pub use groups::*;
pub use ai_review::*;
pub use op_tracker::*;

use crate::db::Database;
use crate::models::{GitProject, Group, ProjectDetail};
use crate::services::GitService;

pub(crate) fn try_update_activity(db: &Database, project_id: &str, hash: Option<&str>) {
    if let Some(h) = hash {
        if let Err(e) = db.update_project_activity(project_id, h) {
            log::warn!("activity update failed: {}", e);
        }
    }
}

/// Batch-fetch project details: query group per project + parallel git I/O.
pub(crate) fn fetch_project_details_batch(
    db: &Database,
    projects: Vec<GitProject>,
) -> Vec<ProjectDetail> {
    if projects.is_empty() {
        return Vec::new();
    }

    // Pre-fetch groups for all projects, fixing orphaned ones
    let project_groups: Vec<(GitProject, Group)> = projects
        .into_iter()
        .filter_map(|p| {
            match db.get_project_group(&p.id) {
                Ok(group) => Some((p, group)),
                Err(_) => {
                    // Project references a non-existent group — reassign to first available group
                    let groups = db.get_all_groups().unwrap_or_default();
                    if let Some(fallback_group) = groups.first() {
                        let _ = db.assign_project_to_group(&p.id, &fallback_group.id);
                        let mut fixed = p;
                        fixed.group_id = fallback_group.id.clone();
                        Some((fixed, fallback_group.clone()))
                    } else {
                        None
                    }
                }
            }
        })
        .collect();

    // Parallel git2 I/O with bounded concurrency
    use std::panic::catch_unwind;
    use std::sync::mpsc;
    const MAX_CONCURRENT: usize = 8;

    let (tx, rx) = mpsc::channel();

    for chunk in project_groups.chunks(MAX_CONCURRENT) {
        let handles: Vec<_> = chunk
            .iter()
            .map(|(p, group)| {
                let p = p.clone();
                let group = group.clone();
                let tx = tx.clone();
                std::thread::spawn(move || {
                    let panic_p = p.clone();
                    let panic_group = group.clone();
                    let detail = catch_unwind(std::panic::AssertUnwindSafe(|| {
                        let fallback_p = p.clone();
                        let fallback_group = group.clone();
                        match GitService::get_project_detail(&p, group) {
                            Ok(detail) => detail,
                            Err(_) => ProjectDetail::fallback(fallback_p, fallback_group),
                        }
                    }))
                    .unwrap_or_else(|_| ProjectDetail::fallback(panic_p, panic_group));
                    let _ = tx.send(detail);
                })
            })
            .collect();

        for h in handles {
            let _ = h.join();
        }
    }
    drop(tx);

    let mut results = Vec::with_capacity(project_groups.len());
    while let Ok(item) = rx.recv() {
        results.push(item);
    }
    results
}
