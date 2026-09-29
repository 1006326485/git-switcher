use crate::db::Database;
use crate::models::GitCredential;
use crate::services::GitService;
use crate::AppError;
use tauri::State;

/// List every stored git credential. The secret is returned so the settings UI can
/// round-trip an edit; the UI masks it before display.
#[tauri::command]
pub async fn get_git_credentials(db: State<'_, Database>) -> Result<Vec<GitCredential>, AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || db.get_git_credentials())
        .await
        .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

/// Create or update a credential, then refresh the in-memory cache the git
/// subprocess paths read from so the next fetch/pick uses it immediately.
#[tauri::command]
pub async fn upsert_git_credential(
    db: State<'_, Database>,
    id: String,
    project_path: String,
    remote_url: String,
    username: String,
    secret: String,
) -> Result<(), AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        db.upsert_git_credential(&id, &project_path, &remote_url, &username, &secret)?;
        refresh_credential_cache(&db)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

/// Delete a credential by id and refresh the in-memory cache.
#[tauri::command]
pub async fn delete_git_credential(db: State<'_, Database>, id: String) -> Result<(), AppError> {
    let db = db.inner().clone();
    tokio::task::spawn_blocking(move || {
        db.delete_git_credential(&id)?;
        refresh_credential_cache(&db)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

/// Reload every stored credential into the git subprocess credential cache.
fn refresh_credential_cache(db: &Database) -> Result<(), AppError> {
    let all = db.get_git_credentials()?;
    GitService::set_git_credentials(all);
    Ok(())
}
