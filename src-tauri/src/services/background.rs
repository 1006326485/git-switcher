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

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
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

                        let counts = Self::do_refresh(&db);

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
    fn do_refresh(db: &Database) -> RefreshCounts {
        let projects = match db.get_all_projects() {
            Ok(p) => p,
            Err(_) => {
                return RefreshCounts {
                    behind_count: 0,
                    ahead_count: 0,
                    dirty_count: 0,
                }
            }
        };

        let mut behind = 0u32;
        let mut ahead = 0u32;
        let mut dirty = 0u32;

        for project in &projects {
            // Silent fetch
            let _ = GitService::fetch(&project.path, None);

            // Get status after fetch
            if let Ok(detail) = GitService::get_project_detail(
                project,
                crate::models::Group {
                    id: project.group_id.clone(),
                    name: String::new(),
                    color: None,
                    sort_order: 0,
                    created_at: String::new(),
                },
            ) {
                let s = &detail.status;
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
