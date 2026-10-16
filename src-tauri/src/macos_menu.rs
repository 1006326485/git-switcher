//! Minimal macOS application menu (T1).
//!
//! Cmd+W only reaches the window's `CloseRequested` handler when a native menu
//! item owns the CmdOrCtrl+W accelerator; without an app menu the keystroke
//! stays in the webview and is swallowed by JS. Every item here is predefined
//! and handled by native selectors, so none of them emits a menu event.

use tauri::menu::{MenuBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::AppHandle;

pub(crate) fn install(app: &AppHandle) -> tauri::Result<()> {
    let name = app.package_info().name.clone();

    // App menu: About / Quit (CmdOrCtrl+Q, native terminate:).
    let app_menu = SubmenuBuilder::with_id(app, "appmenu-app", name.as_str())
        .about(None)
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    // File menu: Close Window carries CmdOrCtrl+W (native performClose:),
    // which reaches CloseRequested → hide-to-tray; no event handling needed.
    let close_item = PredefinedMenuItem::close_window(app, None)?;
    let file_menu = SubmenuBuilder::with_id(app, "appmenu-file", "File")
        .item(&close_item)
        .build()?;

    // Edit menu: keeps Cmd+Z/C/X/V/A working in inputs and the terminal.
    let edit_menu = SubmenuBuilder::with_id(app, "appmenu-edit", "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .separator()
        .select_all()
        .build()?;

    // Window menu: minimize / zoom (maximize → performZoom:) / fullscreen.
    let window_menu = SubmenuBuilder::with_id(app, "appmenu-window", "Window")
        .minimize()
        .maximize()
        .fullscreen()
        .build()?;

    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&edit_menu)
        .item(&window_menu)
        .build()?;

    app.set_menu(menu)?;
    Ok(())
}
