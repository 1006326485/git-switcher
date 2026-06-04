pub mod commands;
pub mod db;
pub mod error;
pub mod models;
pub mod services;

pub use error::*;

use commands::settings::SettingsStore;
use commands::ActiveOps;
use db::Database;

pub fn run() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    let app_data_dir = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("git-switcher");

    let database = Database::new(&app_data_dir)?;

    let settings_store = SettingsStore::new(&app_data_dir);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(database)
        .manage(settings_store)
        .manage(ActiveOps::default())
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
            commands::reorder_projects,
            commands::open_in_terminal,
            commands::open_in_finder,
            commands::open_in_vscode,
            // Git operations
            commands::get_branches,
            commands::get_status,
            commands::switch_branch,
            commands::refresh_project,
            commands::git_get_log,
            commands::git_get_files,
            commands::git_stage_file,
            commands::git_unstage_file,
            commands::git_commit,
            commands::git_push,
            commands::git_pull,
            commands::git_fetch,
            commands::git_stash,
            commands::git_stash_pop,
            commands::git_stash_list,
            commands::git_stash_drop,
            // Branch management
            commands::create_branch,
            commands::delete_branch,
            commands::merge_branch,
            // Batch operations
            commands::fetch_all,
            commands::pull_all,
            commands::cancel_git_op,
            // Tag management
            commands::git_list_tags,
            commands::git_create_tag,
            commands::git_delete_tag,
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
            commands::set_llm_api_key,
            commands::get_llm_api_key,
            // AI Review
            commands::get_branch_diff,
            commands::ai_review,
            commands::generate_commit_msg,
        ])
        .run(tauri::generate_context!())?;
    Ok(())
}
