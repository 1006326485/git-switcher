//! Main-window show/hide with macOS activation-policy switching.
//!
//! Closing the main window hides it to the tray and drops the app to
//! `Accessory` so it leaves the Dock and the Cmd+Tab switcher (pure
//! tray-app behavior). Showing it again restores `Regular` first so the
//! Dock icon, switcher entry, and menu bar come back with the window.
//!
//! After an Accessory → Regular flip AppKit rebuilds the Dock/switcher tile
//! without the app's icon, so `show_main` also re-applies it explicitly
//! (see `restore_app_icon`).

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::hotkeys::MAIN_WINDOW_LABEL;

/// Hides the main window to the tray and removes the app from the Dock and
/// the Cmd+Tab switcher. No-op when the window is already hidden.
pub fn hide_main_to_tray(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    if !window.is_visible().unwrap_or(false) {
        return;
    }
    let _ = window.hide();
    if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Accessory) {
        log::warn!("dock: failed to switch to Accessory: {}", e);
    }
}

/// Shows the main window, restoring the Regular policy first so the Dock
/// icon, switcher entry, and menu bar return with it.
pub fn show_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Regular) {
        log::warn!("dock: failed to restore Regular policy: {}", e);
    }
    restore_app_icon();
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}

/// Toggles the main window between tray-hidden (Accessory) and shown
/// (Regular). Used by tray left-click.
pub fn toggle_main(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        hide_main_to_tray(app);
    } else {
        show_main(app);
    }
}

/// Re-applies the app icon after an Accessory → Regular flip.
///
/// Tauri only calls `setApplicationIconImage:` in dev builds (one-shot at
/// startup) and never in release; after a policy flip AppKit recreates the
/// Dock/switcher tile without the bundle icon, leaving the generic
/// executable glyph. Re-setting it from the bundled `.icns` makes the real
/// icon survive hide → show cycles in both dev and release. Missing icon
/// file just means "skip" — same behavior as before, never an error.
fn restore_app_icon() {
    use objc2::{AllocAnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::NSData;

    let bytes = icon_candidates()
        .into_iter()
        .find_map(|p| std::fs::read(p).ok());
    let Some(bytes) = bytes else {
        return;
    };
    // Must run on the main thread; silently skip otherwise rather than risk
    // an AppKit fault from a background thread.
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let data = NSData::with_bytes(&bytes);
    let Some(icon) = NSImage::initWithData(NSImage::alloc(), &data) else {
        log::warn!("dock: failed to decode app icon image");
        return;
    };
    unsafe {
        NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&icon));
    }
}

/// Candidate locations for the app icon, first hit wins:
/// the release bundle's Resources dir, then the repo's icon sources for
/// `cargo run` / `cargo tauri dev` (cwd is either the workspace root or
/// `src-tauri` depending on how the app was launched).
fn icon_candidates() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        // Bundle layout: <App>.app/Contents/MacOS/<bin>.
        if let Some(contents) = exe.parent().and_then(|p| p.parent()) {
            out.push(contents.join("Resources/icon.icns"));
        }
    }
    out.push(PathBuf::from("src-tauri/icons/icon.icns"));
    out.push(PathBuf::from("icons/icon.icns"));
    out.push(PathBuf::from("src-tauri/icons/icon.png"));
    out.push(PathBuf::from("icons/icon.png"));
    out
}
