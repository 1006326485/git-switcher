use std::str::FromStr;
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::AppError;

pub const TERMINAL_WINDOW_LABEL: &str = "terminal";
pub const MAIN_WINDOW_LABEL: &str = "main";

/// Frontmost external app captured at summon time, so a dismiss can hand
/// focus straight back instead of the main window taking over the screen.
static PREVIOUS_APP_PID: Mutex<Option<i32>> = Mutex::new(None);

/// Routes the global terminal hotkey: while the main window is focused, it
/// toggles the in-window terminal panel instead of summoning the standalone
/// window, so the shortcut never yanks focus away from the app you're in.
pub fn handle_terminal_hotkey(app: &AppHandle) {
    let main_focused = app
        .get_webview_window(MAIN_WINDOW_LABEL)
        .and_then(|w| w.is_focused().ok())
        .unwrap_or(false);
    log::info!(
        "[debug] handle_terminal_hotkey called, main_focused={}",
        main_focused
    );
    if main_focused {
        let _ = app.emit("toggle-builtin-terminal", ());
        return;
    }
    toggle_terminal_window(app);
}

/// Shows the standalone terminal window when hidden, hides it when focused,
/// and just focuses it when visible in the background — summon and go.
pub fn toggle_terminal_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(TERMINAL_WINDOW_LABEL) else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    log::info!(
        "[debug] toggle_terminal_window: visible={} focused={:?}",
        visible,
        window.is_focused()
    );
    if visible && window.is_focused().unwrap_or(false) {
        dismiss_terminal_window(&window);
        return;
    }
    remember_previous_app();
    log::info!("[debug] toggle_terminal_window: about to show+focus terminal window");
    summon_terminal_window(app, &window, visible);
}

/// Shows or focuses the standalone terminal window and never hides it — tray
/// quick-launch hands the user a running terminal, not a toggle.
pub fn show_terminal_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(TERMINAL_WINDOW_LABEL) else {
        return;
    };
    if window.is_visible().unwrap_or(false) && window.is_focused().unwrap_or(false) {
        return;
    }
    remember_previous_app();
    let visible = window.is_visible().unwrap_or(false);
    summon_terminal_window(app, &window, visible);
}

/// Remembers the frontmost app so a later dismiss can hand focus back to it.
fn remember_previous_app() {
    if let Ok(mut pid) = PREVIOUS_APP_PID.lock() {
        *pid = platform::frontmost_other_app();
    }
}

/// Summoning activates the app, which orders every visible window of it
/// front — the main UI must not wake with the terminal, so undo its move.
fn summon_terminal_window(app: &AppHandle, window: &WebviewWindow, visible: bool) {
    let restore = platform::capture_main_restore(app, window);
    if !visible {
        let _ = window.unminimize();
    }
    let _ = window.show();
    let _ = window.set_focus();
    platform::apply_main_restore(app, restore);
}

/// Hides the terminal window and hands focus back to the app the summon
/// interrupted. `focus_previous_app` waits for the reactivation to actually
/// land first, so by the time `hide()` runs the terminal no longer holds key
/// status (the interrupted app owns it now) and `orderOut:` removes the
/// window without reassigning anything — no key hand-off to the main window,
/// which is what used to flash it forward for a frame.
pub fn dismiss_terminal_window(window: &WebviewWindow) {
    let previous = PREVIOUS_APP_PID.lock().ok().and_then(|mut pid| pid.take());
    platform::focus_previous_app(previous);
    let _ = window.hide();
}

/// Hides the standalone terminal window if visible, without touching focus
/// hand-off — used when the main window itself regains focus (e.g. via the
/// app switcher) and should take over from the standalone window.
pub fn hide_terminal_window_if_visible(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(TERMINAL_WINDOW_LABEL) {
        let visible = window.is_visible().unwrap_or(false);
        log::info!(
            "[debug] hide_terminal_window_if_visible called, terminal visible={}",
            visible
        );
        if visible {
            let hide_result = window.hide();
            log::info!("[debug] terminal window.hide() result={:?}", hide_result);
        }
    }
}

/// Registers `hotkey` as the single global shortcut (replacing any previous
/// one). Fails without touching the previous registration when unparsable.
pub fn apply_terminal_hotkey(app: &AppHandle, hotkey: &str) -> Result<(), AppError> {
    let shortcut = Shortcut::from_str(hotkey)
        .map_err(|e| AppError::Config(format!("Invalid shortcut '{}': {}", hotkey, e)))?;
    let manager = app.global_shortcut();
    manager
        .unregister_all()
        .map_err(|e| AppError::Config(format!("Failed to clear shortcuts: {}", e)))?;
    manager
        .register(shortcut)
        .map_err(|e| AppError::Config(format!("Failed to register shortcut '{}': {}", hotkey, e)))
}

/// Where the main window must be ordered back after the terminal raise.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RestorePlan {
    /// Immediately above this window number.
    Above(isize),
    /// Immediately below this window number.
    Below(isize),
    /// To the back of the stack.
    Back,
}

/// `NSWindowOrderingMode` raw values: NSWindowAbove = 1, NSWindowBelow = -1,
/// NSWindowOut = 0.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
const ORDER_ABOVE: isize = 1;
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
const ORDER_BELOW: isize = -1;

/// Restore plan for the main window from the pre-raise z-order of on-screen
/// window numbers (`front` to `back`), or `None` to leave the raise result.
/// `raised` is the terminal window the raise just moved; its old slot is not a
/// stable anchor because it is on top now.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn main_restore_plan(order: &[isize], main: isize, raised: isize) -> Option<RestorePlan> {
    let pos = order.iter().position(|&n| n == main)?;
    let front = pos.checked_sub(1).map(|i| order[i]);
    let back = order.get(pos + 1).copied();
    match (back, front) {
        (Some(b), _) if b != raised => Some(RestorePlan::Above(b)),
        (_, Some(f)) if f != raised => Some(RestorePlan::Below(f)),
        (None, Some(_)) => Some(RestorePlan::Back),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use std::ptr;
    use std::time::Duration;

    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send, MainThreadMarker};
    use tauri::{AppHandle, Manager, WebviewWindow};

    use super::{main_restore_plan, RestorePlan, MAIN_WINDOW_LABEL, ORDER_ABOVE, ORDER_BELOW};

    const LIST_ALL_APPS: usize = 1; // NSWindowNumberListAllApplications
    const ACTIVATE_IGNORING_OTHER_APPS: usize = 1 << 1; // NSApplicationActivateIgnoringOtherApps
    /// Cap on waiting for the async activation, so a wedged system can only
    /// cost a snappy close, never a frozen main thread.
    const ACTIVATION_TIMEOUT: Duration = Duration::from_millis(200);

    /// Pid of the frontmost app, unless that app is this one.
    pub fn frontmost_other_app() -> Option<i32> {
        let _mtm = MainThreadMarker::new()?;
        unsafe {
            let workspace: *mut AnyObject = msg_send![class!(NSWorkspace), sharedWorkspace];
            let app: *mut AnyObject = msg_send![workspace, frontmostApplication];
            if app.is_null() {
                return None;
            }
            let pid: i32 = msg_send![app, processIdentifier];
            (pid != std::process::id() as i32).then_some(pid)
        }
    }

    /// Reactivates the app the summon interrupted, and waits until the system
    /// has actually done it.
    ///
    /// Activation is asynchronous: `activateWithOptions` only posts the
    /// request — the window server raises that app's windows a beat later.
    /// Hiding the terminal in that gap leaves it key, so AppKit reassigns key
    /// status to the main window and orders it forward, which is the frame of
    /// the main window that flashes by on close. Once the switch has landed
    /// the terminal has already resigned key and `orderOut:` has nothing to
    /// hand off, so the close is invisible. Bounded so a refused or stalled
    /// activation can never wedge the main thread.
    pub fn focus_previous_app(pid: Option<i32>) {
        let Some(pid) = pid else {
            return;
        };
        let Some(_mtm) = MainThreadMarker::new() else {
            return;
        };
        unsafe {
            let app: *mut AnyObject = msg_send![
                class!(NSRunningApplication),
                runningApplicationWithProcessIdentifier: pid
            ];
            if app.is_null() {
                return;
            }
            let activated: bool = msg_send![app, activateWithOptions: ACTIVATE_IGNORING_OTHER_APPS];
            if !activated {
                return;
            }
        }
        wait_until_frontmost(pid);
    }

    /// Pumps the main run loop until `pid` is frontmost or the deadline hits.
    /// Pumping (rather than sleeping) matters: AppKit may defer the actual
    /// activation onto a run loop turn, so nothing lands while we just wait.
    fn wait_until_frontmost(pid: i32) {
        let deadline = std::time::Instant::now() + ACTIVATION_TIMEOUT;
        loop {
            if frontmost_other_app() == Some(pid) {
                return;
            }
            if std::time::Instant::now() >= deadline {
                log::warn!(
                    "[debug] wait_until_frontmost: timed out after {:?} waiting for pid {}",
                    ACTIVATION_TIMEOUT,
                    pid
                );
                return;
            }
            unsafe {
                let run_loop: *mut AnyObject = msg_send![class!(NSRunLoop), currentRunLoop];
                let mode: *mut AnyObject = msg_send![
                    class!(NSString),
                    stringWithUTF8String: c"NSDefaultRunLoopMode".as_ptr()
                ];
                let limit: *mut AnyObject =
                    msg_send![class!(NSDate), dateWithTimeIntervalSinceNow: 0.008f64];
                let _: bool = msg_send![run_loop, runMode: mode, beforeDate: limit];
            }
        }
    }

    /// Main-window z-order undo to perform after the raise, captured before it.
    pub fn capture_main_restore(app: &AppHandle, terminal: &WebviewWindow) -> Option<RestorePlan> {
        let _mtm = MainThreadMarker::new()?;
        let main = window_number(main_ns_window(app)?)?;
        let raised = window_number(ns_window(terminal)?)?;
        main_restore_plan(&global_window_order(), main, raised)
    }

    pub fn apply_main_restore(app: &AppHandle, restore: Option<RestorePlan>) {
        let Some(restore) = restore else {
            return;
        };
        let Some(_mtm) = MainThreadMarker::new() else {
            return;
        };
        let Some(win) = main_ns_window(app) else {
            return;
        };
        unsafe {
            match restore {
                RestorePlan::Above(other) => {
                    let _: () = msg_send![win, orderWindow: ORDER_ABOVE, relativeTo: other];
                }
                RestorePlan::Below(other) => {
                    let _: () = msg_send![win, orderWindow: ORDER_BELOW, relativeTo: other];
                }
                RestorePlan::Back => {
                    let _: () = msg_send![win, orderBack: ptr::null::<AnyObject>()];
                }
            }
        }
    }

    fn main_ns_window(app: &AppHandle) -> Option<*mut AnyObject> {
        ns_window(&app.get_webview_window(MAIN_WINDOW_LABEL)?)
    }

    fn ns_window(window: &WebviewWindow) -> Option<*mut AnyObject> {
        Some(window.ns_window().ok()?.cast())
    }

    fn window_number(win: *mut AnyObject) -> Option<isize> {
        let number: isize = unsafe { msg_send![win, windowNumber] };
        (number != 0).then_some(number)
    }

    /// On-screen windows of every app on the active space, front to back.
    fn global_window_order() -> Vec<isize> {
        unsafe {
            let list: *mut AnyObject =
                msg_send![class!(NSWindow), windowNumbersWithOptions: LIST_ALL_APPS];
            if list.is_null() {
                return Vec::new();
            }
            let count: usize = msg_send![list, count];
            (0..count)
                .map(|i| {
                    let number: *mut AnyObject = msg_send![list, objectAtIndex: i];
                    msg_send![number, integerValue]
                })
                .collect()
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use tauri::{AppHandle, WebviewWindow};

    use super::RestorePlan;

    pub fn capture_main_restore(
        _app: &AppHandle,
        _terminal: &WebviewWindow,
    ) -> Option<RestorePlan> {
        None
    }

    pub fn apply_main_restore(_app: &AppHandle, _restore: Option<RestorePlan>) {}

    pub fn frontmost_other_app() -> Option<i32> {
        None
    }

    pub fn focus_previous_app(_pid: Option<i32>) {}
}

#[cfg(test)]
mod tests {
    use super::{main_restore_plan, RestorePlan, ORDER_ABOVE, ORDER_BELOW};

    #[test]
    fn window_ordering_mode_values_follow_appkit_abi() {
        assert_eq!(ORDER_ABOVE, 1);
        assert_eq!(ORDER_BELOW, -1);
    }

    #[test]
    fn summon_keeps_main_behind_the_window_above_it() {
        // main(3) behind browser(5); the hidden terminal(7) joins the stack
        assert_eq!(
            main_restore_plan(&[5, 3], 3, 7),
            Some(RestorePlan::Below(5))
        );
    }

    #[test]
    fn main_follows_its_front_neighbor_when_the_back_neighbor_was_raised() {
        assert_eq!(
            main_restore_plan(&[3, 2, 1], 2, 1),
            Some(RestorePlan::Below(3))
        );
    }

    #[test]
    fn main_stays_above_its_untouched_back_neighbor() {
        assert_eq!(
            main_restore_plan(&[3, 2, 1], 2, 9),
            Some(RestorePlan::Above(1))
        );
    }

    #[test]
    fn main_goes_to_the_back_when_only_the_raised_terminal_was_in_front() {
        assert_eq!(main_restore_plan(&[3, 2], 2, 3), Some(RestorePlan::Back));
    }

    #[test]
    fn no_restore_when_main_is_frontmost_or_off_screen() {
        assert_eq!(main_restore_plan(&[2, 1], 2, 1), None);
        assert_eq!(main_restore_plan(&[3, 1], 2, 3), None);
    }
}
