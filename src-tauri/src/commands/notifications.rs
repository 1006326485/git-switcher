use std::sync::Arc;
use tokio::sync::RwLock;

use crate::AppError;

const MAX_NOTIFICATIONS: usize = 100;

#[derive(Clone, serde::Serialize)]
pub struct GitNotification {
    pub id: String,
    pub project_name: String,
    pub event_type: String,
    pub message: String,
    pub timestamp: i64,
    pub read: bool,
}

#[derive(Clone, Default)]
pub struct NotificationStore {
    inner: Arc<RwLock<Vec<GitNotification>>>,
}

impl NotificationStore {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn push(&self, project_name: String, event_type: String, message: String) {
        let mut lock = self.inner.write().await;
        let id = uuid::Uuid::new_v4().to_string();
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        lock.insert(
            0,
            GitNotification {
                id,
                project_name,
                event_type,
                message,
                timestamp: ts,
                read: false,
            },
        );
        if lock.len() > MAX_NOTIFICATIONS {
            lock.truncate(MAX_NOTIFICATIONS);
        }
    }

    pub async fn get_all(&self) -> Vec<GitNotification> {
        self.inner.read().await.clone()
    }

    pub async fn mark_read(&self, id: &str) -> Result<(), AppError> {
        let mut lock = self.inner.write().await;
        if let Some(n) = lock.iter_mut().find(|n| n.id == id) {
            n.read = true;
            Ok(())
        } else {
            Err(AppError::NotFound(format!(
                "Notification not found: {}",
                id
            )))
        }
    }

    pub async fn clear(&self) {
        self.inner.write().await.clear();
    }

    pub async fn unread_count(&self) -> usize {
        self.inner.read().await.iter().filter(|n| !n.read).count()
    }
}

#[tauri::command]
pub async fn get_notifications(
    store: tauri::State<'_, NotificationStore>,
) -> Result<Vec<GitNotification>, AppError> {
    Ok(store.get_all().await)
}

#[tauri::command]
pub async fn mark_notification_read(
    id: String,
    store: tauri::State<'_, NotificationStore>,
) -> Result<(), AppError> {
    store.mark_read(&id).await
}

#[tauri::command]
pub async fn clear_notifications(
    store: tauri::State<'_, NotificationStore>,
) -> Result<(), AppError> {
    store.clear().await;
    Ok(())
}

#[tauri::command]
pub async fn get_unread_count(
    store: tauri::State<'_, NotificationStore>,
) -> Result<usize, AppError> {
    Ok(store.unread_count().await)
}
