pub mod commands;
pub mod db;
#[cfg(target_os = "macos")]
pub mod dock;
pub mod error;
pub mod hotkeys;
pub mod i18n;
#[cfg(target_os = "macos")]
pub mod macos_menu;
pub mod models;
pub mod services;

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;

pub use error::*;

use commands::settings::SettingsStore;
use commands::ActiveOps;
use db::Database;
use services::BackgroundService;

use std::sync::Arc;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder};
use tauri::{Emitter, Listener, Manager, RunEvent};

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    let app_data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("git-switcher");

    let database = Database::new(&app_data_dir)?;

    let settings_store = SettingsStore::new(&app_data_dir);

    let bg_service = BackgroundService::new(300);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        hotkeys::handle_terminal_hotkey(app);
                    }
                })
                .build(),
        )
        .manage(database.clone())
        .manage(settings_store)
        .manage(ActiveOps::default())
        .manage(bg_service)
        .manage(commands::NotificationStore::new())
        .manage(commands::TerminalManager::default())
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            // ── Tray icon; the menu is built dynamically (see commands/tray) ──
            let tray = TrayIconBuilder::with_id(commands::TRAY_ID)
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Git Switcher")
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        #[cfg(target_os = "macos")]
                        {
                            crate::dock::toggle_main(app);
                        }
                        #[cfg(not(target_os = "macos"))]
                        if let Some(window) = app.get_webview_window(hotkeys::MAIN_WINDOW_LABEL)
                        {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;
            // The tray menu is translated on the Rust side; set the language
            // before the first build so it never renders in the wrong locale.
            let language = app
                .state::<SettingsStore>()
                .get_all()
                .map(|settings| settings.language)
                .unwrap_or_else(|_| "system".to_string());
            crate::i18n::set_language(&language);
            commands::rebuild(app.handle());

            // ── macOS app menu so Cmd+W hits CloseRequested (→ hide to tray) ──
            #[cfg(target_os = "macos")]
            if let Err(e) = macos_menu::install(app.handle()) {
                log::warn!("macOS app menu unavailable: {}", e);
            }

            // ── Menu event handler ────────────────────────────────────────
            app.on_menu_event(|app, event| {
                commands::handle_tray_action(app, event.id().as_ref());
            });

            // ── Hide to tray instead of closing; retake the terminal spotlight ──
            if let Some(window) = app.get_webview_window(hotkeys::MAIN_WINDOW_LABEL) {
                #[cfg(not(target_os = "macos"))]
                let window_clone = window.clone();
                let app_for_close = app.handle().clone();
                let app_for_focus = app.handle().clone();
                window.on_window_event(move |event| match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        api.prevent_close();
                        #[cfg(target_os = "macos")]
                        crate::dock::hide_main_to_tray(&app_for_close);
                        #[cfg(not(target_os = "macos"))]
                        let _ = window_clone.hide();
                        let _ = app_for_close.emit("window-hidden-to-tray", ());
                        // Project list / recency may have changed while the
                        // window was open; refresh the tray before it is used.
                        commands::rebuild(&app_for_close);
                    }
                    tauri::WindowEvent::Focused(focused) => {
                        log::info!("[debug] main window Focused({})", focused);
                        if *focused {
                            // Returning to the main window (e.g. via the app
                            // switcher) should hand the terminal spotlight back.
                            hotkeys::hide_terminal_window_if_visible(&app_for_focus);
                        }
                    }
                    _ => {}
                });
            }

            // ── Terminal window: close hides, sessions survive ────────────
            if let Some(window) = app.get_webview_window(hotkeys::TERMINAL_WINDOW_LABEL) {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::Focused(focused) = event {
                        log::info!("[debug] terminal window Focused({})", focused);
                    }
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        hotkeys::dismiss_terminal_window(&window_clone);
                    }
                });
            }

            // ── Global hotkey for summoning the terminal window ───────────
            {
                let store = app.state::<SettingsStore>();
                let hotkey = store
                    .get_all()
                    .map(|s| s.terminal_hotkey)
                    .unwrap_or_else(|_| models::settings::default_terminal_hotkey());
                if let Err(e) = hotkeys::apply_terminal_hotkey(app.handle(), &hotkey) {
                    log::warn!("terminal hotkey '{}' unavailable: {}", hotkey, e);
                }
            }

            // ── Drag & drop import ──────────────────────────────────────
            {
                let app_handle = app.handle().clone();
                let db = database.clone();
                if let Some(window) = app.get_webview_window(hotkeys::MAIN_WINDOW_LABEL) {
                    window.on_window_event(move |event| {
                        if let tauri::WindowEvent::DragDrop(drag_event) = event {
                            match drag_event {
                                tauri::DragDropEvent::Enter { paths, position } => {
                                    let _ = app_handle.emit("drag-drop-enter", serde_json::json!({
                                        "paths": paths.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>(),
                                        "x": position.x,
                                        "y": position.y,
                                    }));
                                }
                                tauri::DragDropEvent::Drop { paths, position: _ } => {
                                    let _ = app_handle.emit("drag-drop-leave", ());
                                    let mut imported = Vec::new();
                                    let mut skipped = 0u32;
                                    let mut errors = Vec::new();

                                    let groups = match db.get_all_groups() {
                                        Ok(g) if !g.is_empty() => g,
                                        _ => {
                                            let _ = app_handle.emit("drag-drop-result", serde_json::json!({
                                                "imported": [],
                                                "skipped": 0,
                                                "errors": ["No groups exist. Create a group first."],
                                            }));
                                            return;
                                        }
                                    };
                                    let group_id = &groups[0].id;

                                    for path_buf in paths {
                                        let path_str = path_buf.to_string_lossy().to_string();
                                        let path = match std::path::Path::new(&path_str).canonicalize() {
                                            Ok(p) => p.to_string_lossy().to_string(),
                                            Err(_) => {
                                                errors.push(format!("'{}': path not found", path_str));
                                                continue;
                                            }
                                        };
                                        if !crate::services::GitService::is_git_repo(&path) {
                                            errors.push(format!("'{}': not a git repository", path));
                                            continue;
                                        }
                                        if db.project_exists(&path).unwrap_or(false) {
                                            skipped += 1;
                                            continue;
                                        }
                                        let name = std::path::Path::new(&path)
                                            .file_name()
                                            .map(|n| n.to_string_lossy().to_string())
                                            .unwrap_or_else(|| "Unknown".to_string());
                                        let project = crate::models::GitProject::new(name, path, group_id.clone());
                                        if let Err(e) = db.insert_project(&project) {
                                            errors.push(format!("'{}': {}", project.name, e));
                                            continue;
                                        }
                                        let group = groups[0].clone();
                                        match crate::services::GitService::get_project_detail(&project, group) {
                                            Ok(detail) => imported.push(detail),
                                            Err(_) => {
                                                imported.push(crate::models::ProjectDetail::fallback(project, groups[0].clone()));
                                            }
                                        }
                                    }

                                    let has_imports = !imported.is_empty();
                                    let _ = app_handle.emit("drag-drop-result", serde_json::json!({
                                        "imported": imported,
                                        "skipped": skipped,
                                        "errors": errors,
                                    }));
                                    if has_imports {
                                        commands::rebuild(&app_handle);
                                    }
                                }
                                tauri::DragDropEvent::Leave => {
                                    let _ = app_handle.emit("drag-drop-leave", ());
                                }
                                _ => {}
                            }
                        }
                    });
                }
            }

            // ── Background refresh service ────────────────────────────────
            let bg = app.state::<BackgroundService>();
            let db_arc = Arc::new(database.clone());
            bg.start(app.handle().clone(), db_arc);

            // ── Listen for background-refresh-done to update tray tooltip ─
            let tray_clone = tray.clone();
            app.listen("background-refresh-done", move |event| {
                if let Ok(counts) = serde_json::from_str::<
                    crate::services::background::RefreshCounts,
                >(event.payload())
                {
                    let total =
                        counts.behind_count + counts.ahead_count + counts.dirty_count;
                    let tooltip = if total > 0 {
                        format!(
                            "Git Switcher — {} need attention",
                            total
                        )
                    } else {
                        "Git Switcher".to_string()
                    };
                    let _ = tray_clone.set_tooltip(Some(&tooltip));
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Projects
            commands::add_project,
            commands::remove_project,
            commands::list_projects,
            commands::import_workspace,
            commands::init_git_project,
            commands::export_projects,
            commands::import_projects,
            commands::set_project_alias,
            commands::set_project_color,
            commands::set_project_description,
            commands::set_project_notes,
            commands::reorder_projects,
            commands::scan_directory_for_repos,
            commands::bulk_import_projects,
            commands::open_in_terminal,
            commands::open_in_finder,
            commands::open_in_vscode,
            commands::get_readme_preview,
            commands::export_all_settings,
            commands::import_all_settings,
            commands::read_file_text,
            // Git operations
            commands::get_branches,
            commands::get_status,
            commands::switch_branch,
            commands::refresh_project,
            commands::git_get_log,
            commands::git_get_files,
            commands::git_stage_file,
            commands::git_unstage_file,
            commands::git_discard_file,
            commands::git_stage_all,
            commands::git_unstage_all,
            commands::git_get_staged_diff,
            commands::git_commit,
            commands::git_push,
            commands::git_pull,
            commands::git_fetch,
            commands::sync_project,
            commands::git_stash,
            commands::git_stash_apply,
            commands::git_stash_pop,
            commands::git_stash_show,
            commands::git_stash_list,
            commands::git_stash_drop,
            // Branch management
            commands::create_branch,
            commands::delete_branch,
            commands::merge_branch,
            commands::git_cherry_pick,
            commands::git_cherry_pick_range,
            commands::git_rebase,
            commands::git_reword_commit,
            commands::git_drop_commit,
            commands::git_revert_commit,
            commands::git_amend_commit,
            commands::git_operation_state,
            commands::git_rebase_continue,
            commands::git_rebase_skip,
            commands::git_rebase_abort,
            commands::git_revert_continue,
            commands::git_revert_abort,
            commands::git_delete_remote_branch,
            commands::git_reset,
            commands::git_squash_commits,
            // Notifications
            commands::get_notifications,
            commands::mark_notification_read,
            commands::clear_notifications,
            commands::get_unread_count,
            // Batch operations
            commands::fetch_all,
            commands::pull_all,
            commands::push_all,
            commands::git_auto_fetch_all,
            commands::pull_behind,
            commands::push_ahead,
            commands::sync_all,
            commands::cancel_git_op,
            // Tag management
            commands::git_list_tags,
            commands::git_create_tag,
            commands::git_delete_tag,
            commands::git_push_tag,
            // Remote management
            commands::git_list_remotes,
            commands::git_add_remote,
            commands::git_remove_remote,
            commands::git_set_remote_url,
            commands::get_file_diff,
            commands::get_file_diff_stats,
            commands::git_list_conflicts,
            commands::git_resolve_conflict,
            commands::git_abort_merge,
            commands::git_abort_cherry_pick,
            commands::git_clean_preview,
            commands::git_clean_execute,
            commands::git_create_patch,
            commands::git_check_patch,
            commands::git_apply_patch,
            commands::git_bisect_start,
            commands::git_bisect_good,
            commands::git_bisect_bad,
            commands::git_bisect_reset,
            commands::git_bisect_status,
            commands::git_log,
            commands::git_file_history,
            commands::blame_file,
            // Worktree management
            commands::git_list_worktrees,
            commands::git_add_worktree,
            commands::git_remove_worktree,
            commands::git_prune_worktrees,
            // Submodule management
            commands::git_list_submodules,
            commands::git_update_submodule,
            commands::git_init_submodules,
            // Branch health
            commands::analyze_branch_health,
            commands::delete_merged_branches,
            // Branch comparison
            commands::git_compare_branches,
            // Quick diff
            commands::git_quick_diff_all,
            // Project stats
            commands::get_project_stats,
            // Groups
            commands::create_group,
            commands::list_groups,
            commands::delete_group,
            commands::assign_to_group,
            commands::list_projects_in_group,
            commands::update_group,
            // Settings
            commands::get_settings,
            commands::update_settings,
            commands::update_settings_partial,
            commands::rebuild_tray_menu,
            commands::set_llm_api_key,
            commands::get_llm_api_key,
            // AI Review
            commands::get_branch_diff,
            commands::ai_review,
            commands::list_reviews,
            commands::delete_review,
            commands::ai_review_streaming,
            commands::generate_commit_msg,
            // Background refresh
            commands::pause_background_refresh,
            commands::resume_background_refresh,
            commands::set_background_interval,
            commands::get_background_status,
            // Global search
            commands::search_content,
            // Reflog
            commands::git_get_reflog,
            commands::git_checkout_commit,
            // Gitignore
            commands::get_gitignore,
            commands::save_gitignore,
            commands::get_gitignore_templates,
            // Archive
            commands::create_archive,
            // Git hooks
            commands::list_hooks,
            commands::toggle_hook,
            commands::get_hook_content,
            // Destructive operation policy
            commands::get_operation_preview,
            // Task Workspaces
            commands::create_task_workspace,
            commands::list_task_workspaces,
            commands::get_task_workspace,
            commands::update_task_workspace,
            commands::archive_task_workspace,
            commands::add_task_workspace_project,
            commands::remove_task_workspace_project,
            commands::update_task_workspace_entry,
            commands::reorder_task_workspace_entries,
            commands::preflight_task_workspace,
            commands::execute_task_workspace_plan,
            commands::list_task_workspace_outcomes,
            // Operation Log
            commands::log_operation,
            commands::get_operation_log,
            // Custom Commands
            commands::create_custom_command,
            commands::list_custom_commands,
            commands::delete_custom_command,

            commands::get_git_credentials,
            commands::upsert_git_credential,
            commands::delete_git_credential,
            // Project Scripts
            commands::list_project_scripts,
            // Run Presets
            commands::create_run_preset,
            commands::list_run_presets,
            commands::delete_run_preset,
            // Terminal
            commands::terminal_open,
            commands::terminal_list,
            commands::terminal_write,
            commands::terminal_resize,
            commands::terminal_close,
            commands::terminal_window_dismiss,
        ])
        .build(tauri::generate_context!())?;
    app.run(|app, event| {
        if let RunEvent::Exit = event {
            app.state::<commands::TerminalManager>().kill_all();
        }
        // Regular-state fallback: in Accessory (hidden to tray) Reopen never
        // fires — Dock and switcher entries are gone. Kept so a Regular app
        // with no visible windows still reopens on Dock click / Cmd+Tab.
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = event {
            crate::dock::show_main(app);
        }
    });
    Ok(())
}
