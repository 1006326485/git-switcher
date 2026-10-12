use tauri::menu::{Menu, MenuBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_notification::NotificationExt;

use super::settings::SettingsStore;
use super::{git, terminal, NotificationStore};
use crate::db::Database;
use crate::models::TraySettings;
use crate::services::{BackgroundService, GitService};

pub const TRAY_ID: &str = "main-tray";

const ID_SHOW: &str = "show";
const ID_TERMINAL: &str = "terminal";
const ID_QUIT: &str = "quit";

/// (kind, label-key suffix) for the Git submenu; also drives id parsing.
/// Labels resolve through `crate::i18n::tl("tray.git.<suffix>")` so the
/// tray follows the persisted UI language. Machine ids never change.
const GIT_MENU: [(&str, &str); 4] = [
    ("fetch", "fetchAll"),
    ("pull", "pullAll"),
    ("push", "pushAll"),
    ("refresh", "refreshAll"),
];

/// (target, label-key suffix); labels resolve through
/// `crate::i18n::tl("tray.recent.<suffix>")`.
const RECENT_TARGETS: [(&str, &str); 3] = [
    ("terminal", "openTerminal"),
    ("vscode", "openVscode"),
    ("finder", "openFinder"),
];

const MAX_PINNED: usize = 10;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum OpenTarget {
    Terminal,
    Vscode,
    Finder,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum TrayAction {
    Show,
    SummonTerminal,
    Quit,
    GitBatch(&'static str),
    RecentOpen {
        project_id: String,
        target: OpenTarget,
    },
    LaunchPreset(String),
    LaunchSaved(String),
}

pub(crate) fn parse_action(id: &str) -> Option<TrayAction> {
    match id {
        ID_SHOW => return Some(TrayAction::Show),
        ID_TERMINAL => return Some(TrayAction::SummonTerminal),
        ID_QUIT => return Some(TrayAction::Quit),
        _ => {}
    }
    if let Some(kind) = id.strip_prefix("git:") {
        let kind = GIT_MENU.iter().find(|(k, _)| *k == kind).map(|(k, _)| *k)?;
        return Some(TrayAction::GitBatch(kind));
    }
    if let Some(rest) = id.strip_prefix("recent:") {
        let (project_id, target) = rest.split_once(':')?;
        if project_id.is_empty() {
            return None;
        }
        let target = match target {
            "terminal" => OpenTarget::Terminal,
            "vscode" => OpenTarget::Vscode,
            "finder" => OpenTarget::Finder,
            _ => return None,
        };
        return Some(TrayAction::RecentOpen {
            project_id: project_id.to_string(),
            target,
        });
    }
    if let Some(rest) = id.strip_prefix("run:") {
        let (kind, command_id) = rest.split_once(':')?;
        if command_id.is_empty() {
            return None;
        }
        return match kind {
            "preset" => Some(TrayAction::LaunchPreset(command_id.to_string())),
            "saved" => Some(TrayAction::LaunchSaved(command_id.to_string())),
            _ => None,
        };
    }
    None
}

/// Rebuilds the tray menu from current settings and data. Cheap (a few local
/// queries), so callers invoke it whenever either side may have changed.
pub fn rebuild(app: &AppHandle) {
    let settings = match app.state::<SettingsStore>().get_all() {
        Ok(s) => s.tray,
        Err(e) => {
            log::warn!("tray: failed to read settings, using defaults: {}", e);
            TraySettings::default()
        }
    };
    let db = app.state::<Database>().inner().clone();
    match build_menu(app, &settings, &db) {
        Ok(menu) => match app.tray_by_id(TRAY_ID) {
            Some(tray) => {
                if let Err(e) = tray.set_menu(Some(menu)) {
                    log::warn!("tray: failed to set menu: {}", e);
                }
            }
            None => log::warn!("tray: icon {} not found", TRAY_ID),
        },
        Err(e) => log::warn!("tray: failed to build menu: {}", e),
    }
}

#[tauri::command]
pub fn rebuild_tray_menu(app: AppHandle) -> Result<(), crate::AppError> {
    rebuild(&app);
    Ok(())
}

fn build_menu<R: Runtime>(
    app: &AppHandle<R>,
    cfg: &TraySettings,
    db: &Database,
) -> tauri::Result<Menu<R>> {
    let mut menu = MenuBuilder::new(app)
        .text(ID_SHOW, crate::i18n::tl("tray.showWindow", &[]))
        .text(ID_TERMINAL, crate::i18n::tl("tray.summonTerminal", &[]))
        .separator();

    if cfg.git_actions {
        let mut git_menu = SubmenuBuilder::new(app, crate::i18n::tl("tray.gitMenu", &[]));
        for (kind, suffix) in GIT_MENU {
            git_menu = git_menu.text(
                format!("git:{}", kind),
                crate::i18n::tl(&format!("tray.git.{}", suffix), &[]),
            );
        }
        menu = menu.item(&git_menu.build()?);
    }

    if cfg.recent_projects {
        if let Ok(projects) = db.get_recent_projects(cfg.recent_limit) {
            if !projects.is_empty() {
                let mut recent_menu =
                    SubmenuBuilder::new(app, crate::i18n::tl("tray.recentMenu", &[]));
                for project in projects {
                    let mut project_menu = SubmenuBuilder::new(app, project.name.as_str());
                    for (target, suffix) in RECENT_TARGETS {
                        project_menu = project_menu.text(
                            format!("recent:{}:{}", project.id, target),
                            crate::i18n::tl(&format!("tray.recent.{}", suffix), &[]),
                        );
                    }
                    recent_menu = recent_menu.item(&project_menu.build()?);
                }
                menu = menu.item(&recent_menu.build()?);
            }
        }
    }

    if cfg.quick_launch {
        if let Some(pins) = pinned_labels(db, &cfg.pinned_commands) {
            if !pins.is_empty() {
                let mut launch_menu =
                    SubmenuBuilder::new(app, crate::i18n::tl("tray.quickLaunch", &[]));
                for (id, label) in pins {
                    launch_menu = launch_menu.text(format!("run:{}", id), label);
                }
                menu = menu.item(&launch_menu.build()?);
            }
        }
    }

    menu.separator()
        .text(ID_QUIT, crate::i18n::tl("tray.quit", &[]))
        .build()
}

/// Resolves pinned ids to display labels, dropping pins whose target is gone.
fn pinned_labels(db: &Database, pinned: &[String]) -> Option<Vec<(String, String)>> {
    if pinned.is_empty() {
        return None;
    }
    let presets = db.get_all_run_presets().unwrap_or_default();
    let saved = db.get_all_custom_commands().unwrap_or_default();
    let labels: Vec<(String, String)> = pinned
        .iter()
        .filter_map(|id| match id.split_once(':') {
            Some(("preset", pid)) => presets
                .iter()
                .find(|p| p.id == pid)
                .map(|p| (id.clone(), p.name.clone())),
            Some(("saved", cid)) => saved
                .iter()
                .find(|c| c.id == cid)
                .map(|c| (id.clone(), c.name.clone())),
            _ => None,
        })
        .take(MAX_PINNED)
        .collect();
    if labels.is_empty() {
        None
    } else {
        Some(labels)
    }
}

pub fn handle_tray_action(app: &AppHandle, id: &str) {
    let Some(action) = parse_action(id) else {
        log::debug!("tray: ignoring unknown menu id: {}", id);
        return;
    };
    match action {
        TrayAction::Show => {
            if let Some(window) = app.get_webview_window(crate::hotkeys::MAIN_WINDOW_LABEL) {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        TrayAction::SummonTerminal => crate::hotkeys::toggle_terminal_window(app),
        TrayAction::Quit => app.exit(0),
        TrayAction::GitBatch(kind) => run_git_batch(app, kind),
        TrayAction::RecentOpen { project_id, target } => open_recent(app, &project_id, target),
        TrayAction::LaunchPreset(id) => launch_preset(app, &id),
        TrayAction::LaunchSaved(id) => launch_saved(app, &id),
    }
}

fn git_label(kind: &str) -> String {
    GIT_MENU
        .iter()
        .find(|(k, _)| *k == kind)
        .map(|(_, suffix)| crate::i18n::tl(&format!("tray.git.{}", suffix), &[]))
        .unwrap_or_else(|| crate::i18n::tl("tray.gitOperation", &[]))
}

fn run_git_batch(app: &AppHandle, kind: &'static str) {
    let app = app.clone();
    let label = git_label(kind);
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<Database>().inner().clone();
        let outcome = match kind {
            "fetch" => {
                git::run_batch_sync(&app, &db, "fetch", None, GitService::fetch_all_projects)
            }
            "pull" => git::run_batch_sync(&app, &db, "pull", None, GitService::pull_all_projects),
            "push" => git::run_batch_sync(&app, &db, "push", None, GitService::push_all_projects),
            "refresh" => {
                let counts = BackgroundService::do_refresh(&db);
                let _ = app.emit("background-refresh-done", &counts);
                let _ = app.emit("request-refresh-all", ());
                notify(
                    &app,
                    "info",
                    &crate::i18n::tl(
                        "tray.refreshedAll",
                        &[
                            ("behind", &counts.behind_count.to_string()),
                            ("ahead", &counts.ahead_count.to_string()),
                            ("dirty", &counts.dirty_count.to_string()),
                        ],
                    ),
                );
                return;
            }
            _ => return,
        };
        match outcome {
            Ok(o) => notify(
                &app,
                "info",
                &crate::i18n::tl(
                    "tray.finished",
                    &[
                        ("label", label.as_str()),
                        ("ok", &o.ok.to_string()),
                        ("failed", &o.failed.to_string()),
                    ],
                ),
            ),
            Err(e) => notify(
                &app,
                "error",
                &crate::i18n::tl(
                    "tray.operationFailed",
                    &[("label", label.as_str()), ("error", e.to_string().as_str())],
                ),
            ),
        }
    });
}

fn open_recent(app: &AppHandle, project_id: &str, target: OpenTarget) {
    let db = app.state::<Database>().inner().clone();
    let project = match db.get_project_by_id(project_id) {
        Ok(p) => p,
        Err(e) => {
            notify(
                app,
                "error",
                &crate::i18n::tl(
                    "tray.projectUnregistered",
                    &[("error", e.to_string().as_str())],
                ),
            );
            rebuild(app);
            return;
        }
    };
    let _ = db.touch_project_opened(&project.id);

    match target {
        OpenTarget::Terminal => {
            match terminal::open_and_run(app, &project.path, &project.name, &project.name, None) {
                Ok(meta) => focus_session(app, &meta.id),
                Err(e) => {
                    notify(
                        app,
                        "error",
                        &crate::i18n::tl(
                            "tray.failedOpenTerminal",
                            &[("error", e.to_string().as_str())],
                        ),
                    );
                    return;
                }
            }
            crate::hotkeys::show_terminal_window(app);
        }
        OpenTarget::Vscode => {
            let path = project.path.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = super::open_in_vscode_impl(path).await {
                    log::warn!("tray: open in VS Code failed: {}", e);
                }
            });
        }
        OpenTarget::Finder => {
            let path = project.path.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = super::open_in_finder_impl(path).await {
                    log::warn!("tray: open in Finder failed: {}", e);
                }
            });
        }
    }
    rebuild(app);
}

fn launch_preset(app: &AppHandle, id: &str) {
    let db = app.state::<Database>().inner().clone();
    let preset = db
        .get_all_run_presets()
        .unwrap_or_default()
        .into_iter()
        .find(|p| p.id == id);
    let Some(preset) = preset else {
        notify(app, "error", &crate::i18n::tl("tray.presetGone", &[]));
        return;
    };

    let mut launched = 0usize;
    let mut failed = 0usize;
    let mut last_session: Option<String> = None;
    for item in &preset.items {
        match terminal::open_and_run(
            app,
            &item.cwd,
            &item.project_title,
            &item.title,
            item.command.as_deref(),
        ) {
            Ok(meta) => {
                launched += 1;
                last_session = Some(meta.id);
            }
            Err(e) => {
                log::warn!("tray: failed to launch {}: {}", item.title, e);
                failed += 1;
            }
        }
        if let Ok(project) = db.get_project_by_path(&item.cwd) {
            let _ = db.touch_project_opened(&project.id);
        }
    }
    if let Some(id) = &last_session {
        focus_session(app, id);
    }
    crate::hotkeys::show_terminal_window(app);
    notify(
        app,
        "info",
        &crate::i18n::tl(
            "tray.launched",
            &[
                ("name", preset.name.as_str()),
                ("count", &launched.to_string()),
            ],
        ),
    );
    if failed > 0 {
        notify(
            app,
            "error",
            &crate::i18n::tl("tray.launchFailed", &[("count", &failed.to_string())]),
        );
    }
    rebuild(app);
}

fn launch_saved(app: &AppHandle, id: &str) {
    let db = app.state::<Database>().inner().clone();
    let command = db
        .get_all_custom_commands()
        .unwrap_or_default()
        .into_iter()
        .find(|c| c.id == id);
    let Some(command) = command else {
        notify(app, "error", &crate::i18n::tl("tray.commandGone", &[]));
        return;
    };

    let (cwd, project_title) = match &command.project_path {
        Some(path) => match db.get_project_by_path(path) {
            Ok(project) => {
                let _ = db.touch_project_opened(&project.id);
                (project.path, project.name)
            }
            Err(_) => (path.clone(), path.clone()),
        },
        None => (String::new(), crate::i18n::tl("tray.homeTarget", &[])),
    };

    match terminal::open_and_run(
        app,
        &cwd,
        &project_title,
        &command.name,
        Some(&command.command),
    ) {
        Ok(meta) => {
            focus_session(app, &meta.id);
            crate::hotkeys::show_terminal_window(app);
            notify(
                app,
                "info",
                &crate::i18n::tl("tray.running", &[("name", command.name.as_str())]),
            );
            rebuild(app);
        }
        Err(e) => notify(
            app,
            "error",
            &crate::i18n::tl(
                "tray.failedRun",
                &[
                    ("name", command.name.as_str()),
                    ("error", e.to_string().as_str()),
                ],
            ),
        ),
    }
}

/// Asks every window to select a freshly launched session.
fn focus_session(app: &AppHandle, id: &str) {
    let _ = app.emit("terminal-focus-session", serde_json::json!({ "id": id }));
}

/// Feedback for tray actions: in-app notification, tray tooltip, and (when
/// enabled) a system notification — the main window may be hidden throughout.
fn notify(app: &AppHandle, event_type: &str, message: &str) {
    if let Some(store) = app.try_state::<NotificationStore>() {
        let store = store.inner().clone();
        let name = "Status Bar".to_string();
        let event_type = event_type.to_string();
        let message = message.to_string();
        tauri::async_runtime::spawn(async move {
            store.push(name, event_type, message).await;
        });
    }
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(format!("Git Switcher · {}", message)));
    }
    if system_notifications_enabled(app) {
        if let Err(e) = app
            .notification()
            .builder()
            .title("Git Switcher")
            .body(message)
            .show()
        {
            log::warn!("tray: system notification failed: {}", e);
        }
    }
}

fn system_notifications_enabled(app: &AppHandle) -> bool {
    app.try_state::<SettingsStore>()
        .and_then(|store| store.get_all().ok())
        .map(|settings| settings.tray.notifications)
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_static_items() {
        assert_eq!(parse_action("show"), Some(TrayAction::Show));
        assert_eq!(parse_action("terminal"), Some(TrayAction::SummonTerminal));
        assert_eq!(parse_action("quit"), Some(TrayAction::Quit));
    }

    #[test]
    fn parses_git_batch_kinds() {
        assert_eq!(
            parse_action("git:fetch"),
            Some(TrayAction::GitBatch("fetch"))
        );
        assert_eq!(
            parse_action("git:refresh"),
            Some(TrayAction::GitBatch("refresh"))
        );
        assert_eq!(parse_action("git:explode"), None);
        assert_eq!(parse_action("git:"), None);
    }

    #[test]
    fn parses_recent_targets() {
        assert_eq!(
            parse_action("recent:p1:vscode"),
            Some(TrayAction::RecentOpen {
                project_id: "p1".into(),
                target: OpenTarget::Vscode
            })
        );
        assert_eq!(
            parse_action("recent:p1:terminal"),
            Some(TrayAction::RecentOpen {
                project_id: "p1".into(),
                target: OpenTarget::Terminal
            })
        );
        assert_eq!(parse_action("recent:p1:rm"), None);
        assert_eq!(parse_action("recent::finder"), None);
        assert_eq!(parse_action("recent:p1"), None);
    }

    #[test]
    fn parses_pinned_launch_ids() {
        assert_eq!(
            parse_action("run:preset:abc"),
            Some(TrayAction::LaunchPreset("abc".into()))
        );
        assert_eq!(
            parse_action("run:saved:abc"),
            Some(TrayAction::LaunchSaved("abc".into()))
        );
        assert_eq!(parse_action("run:script:abc"), None);
        assert_eq!(parse_action("run:preset:"), None);
        assert_eq!(parse_action("unrelated"), None);
    }

    #[test]
    fn git_menu_covers_every_dispatchable_kind() {
        for (kind, suffix) in GIT_MENU {
            assert_eq!(
                parse_action(&format!("git:{}", kind)),
                Some(TrayAction::GitBatch(kind))
            );
            // Every kind resolves to a real label for both shipped languages
            // (using the pure `t` so the process-wide language is untouched).
            let key = format!("tray.git.{}", suffix);
            assert_ne!(crate::i18n::t("en", &key, &[]), "Git operation");
            assert_ne!(
                crate::i18n::t("zh-CN", &key, &[]),
                crate::i18n::t("en", &key, &[])
            );
        }
    }
}
