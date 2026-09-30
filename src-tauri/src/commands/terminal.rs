use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

use base64::Engine;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

use crate::AppError;

/// Tab metadata for one terminal session, shared by every window.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub id: String,
    pub title: String,
    pub cwd: String,
    pub project_key: String,
    pub project_title: String,
    pub command: Option<String>,
    pub exited: bool,
}

#[derive(Serialize, Clone)]
struct TerminalDataEvent {
    id: String,
    data: String,
}

pub struct TerminalSession {
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    child: Mutex<Box<dyn Child + Send + Sync>>,
}

impl TerminalSession {
    /// Spawns the system default shell in a new pty; the returned reader streams its output.
    fn spawn(cwd: &str, cols: u16, rows: u16) -> Result<(Self, Box<dyn Read + Send>), AppError> {
        let pair = native_pty_system()
            .openpty(pty_size(cols, rows))
            .map_err(|e| AppError::Other(format!("failed to open pty: {}", e)))?;
        let mut cmd = CommandBuilder::new_default_prog();
        cmd.cwd(resolve_cwd(cwd));
        if std::env::var_os("TERM").is_none() {
            cmd.env("TERM", "xterm-256color");
        }
        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| AppError::Other(format!("failed to spawn shell: {}", e)))?;
        drop(pair.slave);
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| AppError::Other(format!("failed to open pty reader: {}", e)))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| AppError::Other(format!("failed to open pty writer: {}", e)))?;
        let session = Self {
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            child: Mutex::new(child),
        };
        Ok((session, reader))
    }

    fn kill(&self) {
        let mut child = self.child.lock().unwrap_or_else(PoisonError::into_inner);
        if let Err(e) = child.kill() {
            log::warn!("failed to kill terminal child: {}", e);
        }
    }
}

/// One tracked terminal. The pty is dropped when the shell exits but the
/// metadata stays as a tombstone until the session is explicitly closed,
/// so open tabs survive in every window.
struct TerminalEntry {
    session: Option<TerminalSession>,
    meta: SessionMeta,
}

#[derive(Default)]
pub struct TerminalManager(Mutex<Vec<TerminalEntry>>);

impl TerminalManager {
    fn entries(&self) -> MutexGuard<'_, Vec<TerminalEntry>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn insert(&self, session: TerminalSession, meta: SessionMeta) {
        self.entries().push(TerminalEntry {
            session: Some(session),
            meta,
        });
    }

    /// Session metadata in creation order — the shared tab list of all windows.
    pub fn list(&self) -> Vec<SessionMeta> {
        self.entries().iter().map(|e| e.meta.clone()).collect()
    }

    pub fn write(&self, id: &str, data: &str) -> Result<(), AppError> {
        let entries = self.entries();
        let entry = Self::get(&entries, id)?;
        let session = Self::live(entry)?;
        let mut writer = session
            .writer
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        writer.write_all(data.as_bytes()).map_err(AppError::Io)?;
        writer.flush().map_err(AppError::Io)
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), AppError> {
        let entries = self.entries();
        let entry = Self::get(&entries, id)?;
        let session = Self::live(entry)?;
        let master = session
            .master
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        master
            .resize(pty_size(cols, rows))
            .map_err(|e| AppError::Other(format!("failed to resize terminal: {}", e)))
    }

    pub fn kill_all(&self) {
        let mut entries = self.entries();
        for entry in entries.iter() {
            if let Some(session) = &entry.session {
                session.kill();
            }
        }
        entries.clear();
    }

    /// Removes the session (live or exited) for good.
    pub fn close(&self, id: &str) -> Result<(), AppError> {
        let mut entries = self.entries();
        let index = entries
            .iter()
            .position(|e| e.meta.id == id)
            .ok_or_else(|| AppError::NotFound(format!("terminal session {}", id)))?;
        let entry = entries.remove(index);
        if let Some(session) = entry.session {
            session.kill();
        }
        Ok(())
    }

    /// Shell exited: drop the pty, keep the tab metadata as a tombstone.
    pub fn mark_exited(&self, id: &str) {
        let mut entries = self.entries();
        if let Some(entry) = entries.iter_mut().find(|e| e.meta.id == id) {
            entry.session = None;
            entry.meta.exited = true;
        }
    }

    fn get<'a>(entries: &'a [TerminalEntry], id: &str) -> Result<&'a TerminalEntry, AppError> {
        entries
            .iter()
            .find(|e| e.meta.id == id)
            .ok_or_else(|| AppError::NotFound(format!("terminal session {}", id)))
    }

    fn live(entry: &TerminalEntry) -> Result<&TerminalSession, AppError> {
        entry
            .session
            .as_ref()
            .ok_or_else(|| AppError::NotFound(format!("terminal session {}", entry.meta.id)))
    }
}

fn pty_size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows: rows.max(1),
        cols: cols.max(1),
        pixel_width: 0,
        pixel_height: 0,
    }
}

fn resolve_cwd(cwd: &str) -> PathBuf {
    let path = Path::new(cwd);
    if !cwd.is_empty() && path.is_dir() {
        return path.to_path_buf();
    }
    if let Some(home) = dirs::home_dir() {
        return home;
    }
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn default_shell_name() -> String {
    #[cfg(unix)]
    let (var, fallback) = ("SHELL", "sh");
    #[cfg(windows)]
    let (var, fallback) = ("COMSPEC", "cmd");
    std::env::var(var)
        .ok()
        .and_then(|p| {
            Path::new(&p)
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
        })
        .unwrap_or_else(|| fallback.to_string())
}

fn broadcast_sessions(app: &AppHandle, manager: &TerminalManager) {
    if let Err(e) = app.emit("terminal-sessions", manager.list()) {
        log::warn!("failed to emit terminal-sessions: {}", e);
    }
}

fn spawn_reader_thread(app: AppHandle, id: String, mut reader: Box<dyn Read + Send>) {
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = base64::engine::general_purpose::STANDARD.encode(&buf[..n]);
                    // Broadcast: every window renders its own xterm for the
                    // same shared pty stream.
                    if let Err(e) = app.emit(
                        "terminal-data",
                        TerminalDataEvent {
                            id: id.clone(),
                            data,
                        },
                    ) {
                        log::warn!("failed to emit terminal-data: {}", e);
                    }
                }
            }
        }
        let state = app.state::<TerminalManager>();
        state.mark_exited(&id);
        broadcast_sessions(&app, &state);
    });
}

#[tauri::command]
pub async fn terminal_open(
    app: AppHandle,
    cwd: String,
    cols: u16,
    rows: u16,
    title: Option<String>,
    project_title: Option<String>,
    command: Option<String>,
) -> Result<SessionMeta, AppError> {
    let (session, reader) = TerminalSession::spawn(&cwd, cols, rows)?;
    let state = app.state::<TerminalManager>();
    let id = Uuid::new_v4().to_string();
    let meta = SessionMeta {
        id: id.clone(),
        title: title.unwrap_or_else(default_shell_name),
        project_key: cwd.clone(),
        project_title: project_title.unwrap_or_else(|| "Terminal".to_string()),
        cwd,
        command,
        exited: false,
    };
    state.insert(session, meta.clone());
    spawn_reader_thread(app.clone(), id, reader);
    broadcast_sessions(&app, &state);
    Ok(meta)
}

#[tauri::command]
pub async fn terminal_list(
    state: State<'_, TerminalManager>,
) -> Result<Vec<SessionMeta>, AppError> {
    Ok(state.list())
}

#[tauri::command]
pub async fn terminal_write(
    state: State<'_, TerminalManager>,
    id: String,
    data: String,
) -> Result<(), AppError> {
    state.write(&id, &data)
}

#[tauri::command]
pub async fn terminal_resize(
    state: State<'_, TerminalManager>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), AppError> {
    state.resize(&id, cols, rows)
}

#[tauri::command]
pub async fn terminal_close(
    app: AppHandle,
    state: State<'_, TerminalManager>,
    id: String,
) -> Result<(), AppError> {
    state.close(&id)?;
    broadcast_sessions(&app, &state);
    Ok(())
}

#[tauri::command]
pub async fn terminal_window_dismiss(app: AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window(crate::hotkeys::TERMINAL_WINDOW_LABEL) {
        crate::hotkeys::dismiss_terminal_window(&window);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn meta(id: &str) -> SessionMeta {
        SessionMeta {
            id: id.to_string(),
            title: "zsh".to_string(),
            cwd: String::new(),
            project_key: String::new(),
            project_title: "Terminal".to_string(),
            command: None,
            exited: false,
        }
    }

    #[test]
    fn unknown_session_operations_return_not_found() {
        let manager = TerminalManager::default();
        assert!(matches!(
            manager.write("missing", "ls\n"),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            manager.resize("missing", 80, 24),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            manager.close("missing"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn spawned_session_supports_write_resize_and_close() {
        let manager = TerminalManager::default();
        let (session, _reader) = TerminalSession::spawn("", 80, 24).unwrap();
        manager.insert(session, meta("t1"));
        assert!(manager.list().len() == 1);

        assert!(manager.write("t1", "").is_ok());
        assert!(manager.resize("t1", 100, 30).is_ok());
        assert!(manager.close("t1").is_ok());

        assert!(manager.list().is_empty());
    }

    #[test]
    fn kill_all_reaps_every_session() {
        let manager = TerminalManager::default();
        let (a, _reader_a) = TerminalSession::spawn("", 80, 24).unwrap();
        let (b, _reader_b) = TerminalSession::spawn("", 80, 24).unwrap();
        manager.insert(a, meta("a"));
        manager.insert(b, meta("b"));
        manager.kill_all();
        assert!(manager.list().is_empty());
    }

    #[test]
    fn list_preserves_insertion_order() {
        let manager = TerminalManager::default();
        let (a, _reader_a) = TerminalSession::spawn("", 80, 24).unwrap();
        let (b, _reader_b) = TerminalSession::spawn("", 80, 24).unwrap();
        manager.insert(a, meta("a"));
        manager.insert(b, meta("b"));
        let ids: Vec<String> = manager.list().into_iter().map(|m| m.id).collect();
        assert_eq!(ids, vec!["a".to_string(), "b".to_string()]);
    }

    #[test]
    fn exited_sessions_keep_meta_until_closed() {
        let manager = TerminalManager::default();
        let (session, _reader) = TerminalSession::spawn("", 80, 24).unwrap();
        manager.insert(session, meta("t1"));
        manager.mark_exited("t1");

        let list = manager.list();
        assert_eq!(list.len(), 1);
        assert!(list[0].exited);
        assert!(matches!(
            manager.write("t1", "ls\n"),
            Err(AppError::NotFound(_))
        ));
        assert!(manager.close("t1").is_ok());
        assert!(manager.list().is_empty());
    }

    #[test]
    fn resolve_cwd_falls_back_to_home_for_missing_paths() {
        assert_eq!(resolve_cwd(""), dirs::home_dir().unwrap());
        assert_eq!(resolve_cwd("/does/not/exist"), dirs::home_dir().unwrap());
    }

    #[test]
    fn default_shell_name_is_never_empty() {
        assert!(!default_shell_name().is_empty());
    }
}
