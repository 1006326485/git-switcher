use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::{watch, Mutex};
use tokio::time::{self, Duration};

use crate::db::Database;
use crate::services::GitService;

#[derive(Debug, Clone, serde::Serialize)]
pub struct BackgroundStatus {
    pub active: bool,
    pub interval_secs: u64,
    pub last_refresh: Option<i64>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct RefreshCounts {
    pub behind_count: u32,
    pub ahead_count: u32,
    pub dirty_count: u32,
}

struct BackgroundInner {
    active: bool,
    interval_secs: u64,
    last_refresh: Option<i64>,
}

pub struct BackgroundService {
    inner: Arc<Mutex<BackgroundInner>>,
    pause: Arc<AtomicBool>,
    /// Sends a new interval whenever it changes so the loop can reschedule.
    interval_tx: watch::Sender<u64>,
}

impl BackgroundService {
    pub fn new(default_interval: u64) -> Self {
        let (interval_tx, _) = watch::channel(default_interval);
        Self {
            inner: Arc::new(Mutex::new(BackgroundInner {
                active: true,
                interval_secs: default_interval,
                last_refresh: None,
            })),
            pause: Arc::new(AtomicBool::new(false)),
            interval_tx,
        }
    }

    /// Start the background loop. Call once during app setup.
    pub fn start(&self, app: tauri::AppHandle, db: Arc<Database>) {
        let inner = self.inner.clone();
        let pause = self.pause.clone();
        let mut interval_rx = self.interval_tx.subscribe();

        tauri::async_runtime::spawn(async move {
            // Initial interval value
            let mut secs = *interval_rx.borrow();
            let mut ticker = time::interval(Duration::from_secs(secs));
            ticker.set_missed_tick_behavior(time::MissedTickBehavior::Skip);

            loop {
                tokio::select! {
                    // If the interval changed, recreate ticker
                    _ = interval_rx.changed() => {
                        secs = *interval_rx.borrow();
                        ticker = time::interval(Duration::from_secs(secs));
                        ticker.set_missed_tick_behavior(time::MissedTickBehavior::Skip);
                    }
                    _ = ticker.tick() => {
                        // Skip if paused
                        if pause.load(Ordering::Relaxed) {
                            continue;
                        }
                        // Skip if inactive
                        {
                            let state = inner.lock().await;
                            if !state.active {
                                continue;
                            }
                        }

                        // The refresh walks every repository, so keep it off the
                        // async worker threads instead of blocking a runtime
                        // thread for the whole pass.
                        let db_for_tick = db.clone();
                        let counts = tauri::async_runtime::spawn_blocking(move || {
                            Self::do_refresh(&db_for_tick)
                        })
                        .await
                        .unwrap_or_default();

                        // Update last_refresh
                        {
                            let mut state = inner.lock().await;
                            state.last_refresh = Some(chrono::Utc::now().timestamp());
                        }

                        // Emit event to frontend
                        let _ = app.emit("background-refresh-done", &counts);
                    }
                }
            }
        });
    }

    /// Perform a silent fetch across all projects and return counts.
    pub(crate) fn do_refresh(db: &Database) -> RefreshCounts {
        let projects = match db.get_all_projects() {
            Ok(p) => p,
            Err(_) => return RefreshCounts::default(),
        };

        let mut behind = 0u32;
        let mut ahead = 0u32;
        let mut dirty = 0u32;

        for project in &projects {
            // Silent fetch
            let _ = GitService::fetch(&project.path, None);

            // Only the counts are needed here, so read the summary instead of
            // the full detail: the branch list and stash scan exist for project
            // rows, and computing them here doubled the cost of every tick.
            if let Ok(summary) = GitService::get_project_summary(&project.path) {
                let s = &summary.status;
                if s.behind > 0 {
                    behind += 1;
                }
                if s.ahead > 0 {
                    ahead += 1;
                }
                if s.modified + s.staged + s.untracked > 0 {
                    dirty += 1;
                }
            }
        }

        RefreshCounts {
            behind_count: behind,
            ahead_count: ahead,
            dirty_count: dirty,
        }
    }

    pub async fn pause(&self) {
        self.pause.store(true, Ordering::Relaxed);
        let mut state = self.inner.lock().await;
        state.active = false;
    }

    pub async fn resume(&self) {
        self.pause.store(false, Ordering::Relaxed);
        let mut state = self.inner.lock().await;
        state.active = true;
    }

    pub async fn set_interval(&self, secs: u64) {
        let clamped = secs.max(60);
        let mut state = self.inner.lock().await;
        state.interval_secs = clamped;
        let _ = self.interval_tx.send(clamped);
    }

    pub async fn get_status(&self) -> BackgroundStatus {
        let state = self.inner.lock().await;
        BackgroundStatus {
            active: state.active,
            interval_secs: state.interval_secs,
            last_refresh: state.last_refresh,
        }
    }
}
