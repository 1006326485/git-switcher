#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(e) = git_switcher_lib::run() {
        eprintln!("Fatal: {}", e);
        std::process::exit(1);
    }
}
