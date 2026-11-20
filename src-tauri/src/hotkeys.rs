use std::str::FromStr;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Monitor, WebviewWindow};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::window_placement::{self, Rect, Screen};
use crate::AppError;

pub const TERMINAL_WINDOW_LABEL: &str = "terminal";
pub const MAIN_WINDOW_LABEL: &str = "main";

/// Frontmost external app captured at summon time, so a dismiss can hand
/// focus straight back instead of the main window taking over the screen.
static PREVIOUS_APP_PID: Mutex<Option<i32>> = Mutex::new(None);

/// 每块显示器记住终端面板上次的位置与尺寸（本次运行内有效，不落盘）。
static PANEL_MEMORY: Mutex<Vec<(String, Rect)>> = Mutex::new(Vec::new());

/// When the standalone panel was last summoned.
static SUMMONED_AT: Mutex<Option<Instant>> = Mutex::new(None);

/// How long a fresh summon is immune to the main window's hide hook.
///
/// AppKit hands key status around over a few run-loop turns and, when the app
/// was inactive, it re-keys the main window first — so the summon's own
/// activation can report "main window focused" while the panel is still
/// becoming key. Hiding there is what made the panel flash and vanish instead
/// of appearing. A hide arriving this soon after a summon is part of the
/// summon, never a user decision.
const SUMMON_GRACE: Duration = Duration::from_millis(750);

/// How long the parked main window stays parked before it is put back.
///
/// The window ordering an activation triggers lands on a later window-server
/// pass than the `isActive` flip, so the restore has to wait one display cycle
/// (a few frames here) rather than a run-loop turn; nothing can raise the
/// window in the meantime, because it is ordered out.
const RESTORE_DELAY: Duration = Duration::from_millis(150);

/// Where the global hotkey sends the user.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HotkeyTarget {
    /// The main window is in front: toggle its built-in panel and never steal
    /// focus away from it.
    BuiltInPanel,
    /// Anything else owns the screen: summon the standalone panel.
    StandaloneWindow,
}

/// Routing contract of the global terminal hotkey: the built-in panel only
/// answers while the main window itself is focused, and every other case wakes
/// the standalone panel.
pub fn hotkey_target(main_focused: bool) -> HotkeyTarget {
    if main_focused {
        HotkeyTarget::BuiltInPanel
    } else {
        HotkeyTarget::StandaloneWindow
    }
}

/// Whether the main window is the window the user is actually looking at.
///
/// `WebviewWindow::is_focused()` alone is not enough on macOS. AppKit keeps
/// reporting the last key window while the app is deactivated and during the
/// key hand-off of an activation (the same lag `platform::focus_previous_app`
/// documents), so a bare is-focused check claims "the main window has focus"
/// while the user is in another app — and the hotkey then toggles a panel
/// nobody can see instead of waking the standalone one. Requiring the app
/// itself to be active, and the main window to be really on screen, tells
/// those states apart.
fn main_window_is_focused(app: &AppHandle) -> bool {
    let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) else {
        return false;
    };
    if !main.is_visible().unwrap_or(false) || main.is_minimized().unwrap_or(false) {
        return false;
    }
    platform::window_is_key(&main) && platform::app_is_active()
}

/// Records that the standalone panel was just summoned.
fn mark_summoned() {
    if let Ok(mut at) = SUMMONED_AT.lock() {
        *at = Some(Instant::now());
    }
}

/// Forgets the summon, so the next main-window focus takes the screen again.
fn clear_summoned() {
    if let Ok(mut at) = SUMMONED_AT.lock() {
        *at = None;
    }
}

/// Whether `now` still falls inside the summon grace window.
fn within_summon_grace(summoned_at: Option<Instant>, now: Instant, grace: Duration) -> bool {
    match summoned_at {
        Some(at) => now.saturating_duration_since(at) < grace,
        None => false,
    }
}

/// Whether a summon happened so recently that a main-window focus event still
/// belongs to it.
fn summon_in_flight() -> bool {
    let summoned_at = SUMMONED_AT.lock().ok().and_then(|at| *at);
    within_summon_grace(summoned_at, Instant::now(), SUMMON_GRACE)
}

/// Routes the global terminal hotkey: while the main window is focused, it
/// toggles the in-window terminal panel instead of summoning the standalone
/// window, so the shortcut never yanks focus away from the app you're in.
pub fn handle_terminal_hotkey(app: &AppHandle) {
    let main_focused = main_window_is_focused(app);
    let target = hotkey_target(main_focused);
    log::info!(
        "[debug] handle_terminal_hotkey: main_focused={} target={:?}",
        main_focused,
        target
    );
    match target {
        HotkeyTarget::BuiltInPanel => {
            let _ = app.emit("toggle-builtin-terminal", ());
        }
        HotkeyTarget::StandaloneWindow => toggle_terminal_window(app),
    }
}

/// Shows the standalone terminal window when hidden, hides it when focused,
/// and just focuses it when visible in the background — summon and go.
pub fn toggle_terminal_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(TERMINAL_WINDOW_LABEL) else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);
    log::info!(
        "[debug] toggle_terminal_window: visible={} focused={}",
        visible,
        focused
    );
    // 指针屏与面板屏相同时沿用 toggle，不同时搬到指针屏并保持显示。
    let panel_key = panel_screen_key(&window);
    let cursor_key = cursor_screen_key(app);
    let action = window_placement::summon_action(
        visible,
        focused,
        panel_key.as_deref(),
        cursor_key.as_deref(),
    );
    log::info!(
        "[probe] toggle: panel_screen={:?} cursor_screen={:?} action={:?}",
        panel_key,
        cursor_key,
        action
    );
    if action == window_placement::SummonAction::Dismiss {
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
        // 已经在用户面前：不要重新 show/focus 抢焦点，但指针换了屏就把面板搬过去。
        place_panel_on_cursor_screen(app, &window);
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

/// 该屏上次记住的位置尺寸，没有则 `None`。仅单测使用（落位查记忆走 `resolve_placement`）。
#[cfg(test)]
fn panel_memory_lookup(entries: &[(String, Rect)], key: &str) -> Option<Rect> {
    entries
        .iter()
        .find(|(stored, _)| stored == key)
        .map(|(_, rect)| *rect)
}

/// 记录该屏的位置尺寸：同 key 覆盖，不重复追加。
fn panel_memory_store(entries: &mut Vec<(String, Rect)>, key: &str, rect: Rect) {
    match entries.iter_mut().find(|(stored, _)| stored == key) {
        Some((_, stored)) => *stored = rect,
        None => entries.push((key.to_string(), rect)),
    }
}

/// 把面板几何记到指定屏；锁失败就静默跳过。
fn remember_for_screen(key: &str, rect: Rect) {
    if let Ok(mut entries) = PANEL_MEMORY.lock() {
        panel_memory_store(&mut entries, key, rect);
    }
}

/// `tauri::Monitor` → 纯逻辑用的 `Screen`（全部换成逻辑点）。
///
/// `Monitor::position()` / `work_area()` 是「点 × 该屏自己的 scale」，所以要
/// 用该屏的 scale 转回点；这样和 `cursor_position()`（点 × 主屏 scale，已换算）
/// 落在同一个坐标系里。
fn screen_from_monitor(monitor: &Monitor) -> Screen {
    let scale = monitor.scale_factor();
    let position = monitor.position().to_logical::<f64>(scale);
    let work_area = monitor.work_area();
    let work_area_position = work_area.position.to_logical::<f64>(scale);
    let work_area_size = work_area.size.to_logical::<f64>(scale);
    Screen {
        key: window_placement::monitor_key(
            monitor.name().map(String::as_str),
            (position.x, position.y),
        ),
        work_area: Rect {
            x: work_area_position.x,
            y: work_area_position.y,
            width: work_area_size.width,
            height: work_area_size.height,
        },
    }
}

/// 当前所有显示器（逻辑点 + 稳定 key）；取不到就返回空表。
fn screens_of(app: &AppHandle) -> Vec<Screen> {
    app.available_monitors()
        .map(|monitors| monitors.iter().map(screen_from_monitor).collect())
        .unwrap_or_default()
}

/// 面板矩形中心点所在屏的 key。
///
/// 不用 `current_monitor()`：窗口隐藏时 macOS 的 `NSWindow.screen` 是 nil（隐藏期间
/// 就记不下几何），镜像屏下 AppKit 与几何命中也可能指向不同的屏。中心点走和指针
/// 同一套 resolver，两侧口径才一致。
fn panel_screen_key_in(window: &WebviewWindow, screens: &[Screen]) -> Option<String> {
    let rect = panel_rect(window)?;
    let index = window_placement::screen_for_point(
        rect.x + rect.width / 2.0,
        rect.y + rect.height / 2.0,
        screens,
    )?;
    Some(screens[index].key.clone())
}

/// `panel_screen_key_in` 的便利包装：自己取一次显示器表。
fn panel_screen_key(window: &WebviewWindow) -> Option<String> {
    panel_screen_key_in(window, &screens_of(window.app_handle()))
}

/// 指针位置（逻辑点）。`cursor_position()` 是「点 × 主屏 scale」，用主屏 scale 还原。
fn cursor_points(app: &AppHandle) -> Option<(f64, f64)> {
    let primary_scale = app.primary_monitor().ok().flatten()?.scale_factor();
    let point = app.cursor_position().ok()?.to_logical::<f64>(primary_scale);
    Some((point.x, point.y))
}

/// macOS 的系统级命中测试：`tao` 的 `from_point` 直接拿 `CGDisplayBounds` 比 CG 点，
/// 所以落在 work_area 之外、却确实属于该屏的菜单栏 / Dock 条带也能认对。
#[cfg(target_os = "macos")]
fn native_screen_key_at_cursor(app: &AppHandle) -> Option<String> {
    let cursor = cursor_points(app)?;
    let monitor = app.monitor_from_point(cursor.0, cursor.1).ok()??;
    Some(screen_from_monitor(&monitor).key)
}

/// 非 macOS 的 `monitor_from_point` 期望物理像素，和这里的逻辑点不同源，故不启用。
#[cfg(not(target_os = "macos"))]
fn native_screen_key_at_cursor(_app: &AppHandle) -> Option<String> {
    None
}

/// 指针所在屏的下标：先系统级命中测试，取不到再退回纯几何命中。
fn cursor_screen_index(app: &AppHandle, screens: &[Screen]) -> Option<usize> {
    if let Some(key) = native_screen_key_at_cursor(app) {
        if let Some(index) = screens.iter().position(|screen| screen.key == key) {
            return Some(index);
        }
    }
    let cursor = cursor_points(app)?;
    window_placement::screen_for_point(cursor.0, cursor.1, screens)
}

/// 指针所在屏的 key；读不到指针或显示器就 `None`。
fn cursor_screen_key(app: &AppHandle) -> Option<String> {
    let screens = screens_of(app);
    let index = cursor_screen_index(app, &screens)?;
    Some(screens[index].key.clone())
}

/// 面板当前的位置与尺寸（逻辑点）。
///
/// 尺寸必须用 `inner_size()`：`set_size` 设的是 inner size，在 Windows/Linux 上
/// `outer_size()` 多一圈边框，用 outer 记、再 set inner 会逐次膨胀。
fn panel_rect(window: &WebviewWindow) -> Option<Rect> {
    let scale = window.scale_factor().ok()?;
    let position = window.outer_position().ok()?.to_logical::<f64>(scale);
    let size = window.inner_size().ok()?.to_logical::<f64>(scale);
    Some(Rect {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
    })
}

/// 把面板当前的位置尺寸记到它所在的屏；任一读取失败就静默返回。
fn remember_panel_geometry(window: &WebviewWindow) {
    let Some(key) = panel_screen_key(window) else {
        return;
    };
    let Some(rect) = panel_rect(window) else {
        return;
    };
    remember_for_screen(&key, rect);
}

/// 把面板搬到指针所在的屏并落位；任何一步拿不到数据就保持原位。
fn place_panel_on_cursor_screen(app: &AppHandle, window: &WebviewWindow) {
    let screens = screens_of(app);
    if screens.is_empty() {
        return;
    }
    let Some(target) = cursor_screen_index(app, &screens) else {
        return;
    };
    log::info!(
        "[probe] cursor={:?} target_screen={} of {} screens={:?}",
        cursor_points(app),
        target,
        screens.len(),
        screens
            .iter()
            .map(|s| (s.key.as_str(), s.work_area))
            .collect::<Vec<_>>()
    );
    // 记忆快照：持锁一次、clone 后立刻释放，落位过程中不持锁碰 tauri API。
    let memory: Vec<(String, Rect)> = PANEL_MEMORY
        .lock()
        .map(|entries| entries.clone())
        .unwrap_or_default();
    let Some(placement) = window_placement::resolve_placement(
        &screens,
        target,
        panel_screen_key_in(window, &screens).as_deref(),
        &memory,
        window_placement::default_panel_size(),
    ) else {
        return;
    };
    // 顺序要紧：先把原屏上的几何记下来，再挪到新屏。
    remember_panel_geometry(window);
    // 先尺寸后位置：避免 macOS 因尺寸变化再次调整位置。两者都是逻辑单位。
    if let Err(e) = window.set_size(LogicalSize::new(
        placement.rect.width,
        placement.rect.height,
    )) {
        log::warn!("[debug] panel set_size failed: {}", e);
    }
    if let Err(e) = window.set_position(LogicalPosition::new(placement.rect.x, placement.rect.y)) {
        log::warn!("[debug] panel set_position failed: {}", e);
    }
    let target_key = &screens[placement.index].key;
    remember_for_screen(target_key, placement.rect);
    log::info!(
        "[debug] panel placed on {} at {:?}",
        target_key,
        placement.rect
    );
}

/// 临时诊断探针：定位「召唤后面板闪现即消失／主窗被顶到前面」后删除。
fn probe_state(tag: &str, window: &WebviewWindow) {
    let main = window.app_handle().get_webview_window(MAIN_WINDOW_LABEL);
    let (main_visible, main_focused) = match main {
        Some(w) => (
            w.is_visible().unwrap_or(false),
            w.is_focused().unwrap_or(false),
        ),
        None => (false, false),
    };
    log::info!(
        "[probe] {}: terminal visible={} focused={} | main visible={} focused={}",
        tag,
        window.is_visible().unwrap_or(false),
        window.is_focused().unwrap_or(false),
        main_visible,
        main_focused
    );
}

/// Summoning activates the app, and an activation orders **every visible window
/// of the app** front — on every display, not just the one the panel lands on.
/// That is what woke the main UI on its own screen. Parking the main window
/// first (it cannot be raised while it is ordered out) and putting it back once
/// the activation has settled keeps the summon to the panel alone.
fn summon_terminal_window(app: &AppHandle, window: &WebviewWindow, visible: bool) {
    mark_summoned();
    probe_state("summon:before", window);
    // 落位在 show 之前，但 macOS 上 set_size/set_position 只是 exec_async 排进主
    // 队列 (tao .../macos/util/async.rs)，show() 却是同步的。所以 show/焦点也投一条
    // 主队列闭包：两个 setter 与它同队列，FIFO 保证闭包执行时窗口已在新屏的新位置上；
    // 被搬动的只是一个隐藏窗口，没有 key 可丢，跨屏搬动不再引发 key 闪断。
    place_panel_on_cursor_screen(app, window);
    probe_state("summon:after-place", window);
    let app_handle = app.clone();
    let target = window.clone();
    let queued = app.run_on_main_thread(move || {
        probe_state("summon:queued", &target);
        // 必须在主线程、且在 show/激活之前取锚点：AppKit 的窗口号与命中测试都只能在
        // 主线程问（拿不到 MainThreadMarker 就直接放弃锚点），而 show/激活之后再取，
        // 拿到的已经是抬高后的 z 序。
        let restore = platform::capture_main_restore(&app_handle, &target);
        if !visible {
            let _ = target.unminimize();
        }
        // Park before anything activates the app: the activation is what raises
        // the app's windows, and an ordered-out window is out of its reach.
        let parked = platform::park_main_window(&app_handle);
        let _ = target.show();
        probe_state("summon:after-show", &target);
        // 激活默认前移本应用的 main + key 窗口；先让面板成为它们。
        platform::make_panel_activation_target(&target);
        let _ = target.set_focus();
        probe_state("summon:after-focus", &target);
        if parked {
            schedule_main_restore(app_handle.clone(), restore);
        }
        probe_state("summon:restore-scheduled", &target);
    });
    if let Err(e) = queued {
        log::warn!("[debug] summon: run_on_main_thread failed: {}", e);
    }
}

/// 把停放着的主窗口放回原位，但等激活真正把窗口排完序之后再动手。
///
/// 激活引起的窗口前移落在**后续的窗口服务器批次**里：`set_focus()` 返回时没发生，
/// `NSApp.isActive` 翻转时也没发生，所以在同一轮 run loop 里做还原会被紧接着的
/// 前移覆盖。停放期间主窗口不在可视列表里，前移够不着它；这里用一次显示周期
/// （`RESTORE_DELAY`，主线程不阻塞）等前移落定，再把主窗口按原 z 序放回去。
fn schedule_main_restore(app: AppHandle, restore: Option<RestorePlan>) {
    std::thread::spawn(move || {
        std::thread::sleep(RESTORE_DELAY);
        let handle = app.clone();
        let queued =
            app.run_on_main_thread(move || platform::restore_main_window(&handle, restore));
        if let Err(e) = queued {
            log::warn!(
                "[debug] restore_main_window: run_on_main_thread failed: {}",
                e
            );
        }
    });
}

/// Hides the terminal window and hands focus back to the app the summon
/// interrupted. `focus_previous_app` waits until this app is no longer active
/// before returning, so by the time `hide()` runs the terminal has already
/// resigned key status and `orderOut:` removes the window without reassigning
/// anything — no key hand-off to the main window, which is what used to flash
/// it forward for a frame.
pub fn dismiss_terminal_window(window: &WebviewWindow) {
    clear_summoned();
    log::info!("[probe] dismiss_terminal_window entered");
    // 收起前记下当前屏的几何，下次在这块屏召唤时回到原处。
    remember_panel_geometry(window);
    let previous = PREVIOUS_APP_PID.lock().ok().and_then(|mut pid| pid.take());
    platform::focus_previous_app(previous, || {
        let _ = window.hide();
    });
}

/// Hides the standalone terminal window if visible, without touching focus
/// hand-off — used when the main window itself regains focus (e.g. via the
/// app switcher) and should take over from the standalone window.
pub fn hide_terminal_window_if_visible(app: &AppHandle) {
    // The summon's own activation can key the main window for a frame; that
    // focus event must not take down the panel the user just asked for.
    if summon_in_flight() {
        log::info!("[probe] hide_terminal_window_if_visible: skipped, summon in flight");
        return;
    }
    if let Some(window) = app.get_webview_window(TERMINAL_WINDOW_LABEL) {
        let visible = window.is_visible().unwrap_or(false);
        let main_focused = app
            .get_webview_window(MAIN_WINDOW_LABEL)
            .and_then(|w| w.is_focused().ok())
            .unwrap_or(false);
        log::info!(
            "[probe] hide_terminal_window_if_visible: terminal visible={} main_focused={}",
            visible,
            main_focused
        );
        if visible {
            // 主窗抢回焦点前先把面板几何存到它所在的屏。
            remember_panel_geometry(&window);
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

/// Whether the summon has to park the main window before it activates the app.
///
/// Only a window that is on screen can be raised by the activation, and only a
/// parked window has to be put back afterwards — a hidden or minimized one is
/// already out of the way.
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn should_park_main(visible: bool, minimized: bool) -> bool {
    visible && !minimized
}

/// Restore plan for the parked main window from the pre-park z-order of
/// on-screen window numbers (`front` to `back`), or `None` when nothing stable
/// can anchor it (then the window goes back to the front, which is where it
/// already was). `raised` is the terminal window the summon moved; its old slot
/// is not a stable anchor because it is on top now.
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
    use std::time::{Duration, Instant};

    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send, MainThreadMarker};
    use objc2_foundation::{NSPoint, NSRect};
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

    /// Reactivates the app the summon interrupted, and hides the terminal
    /// only once this app has actually stopped being active.
    ///
    /// Activation is asynchronous, and `NSWorkspace.frontmostApplication`
    /// flips to the target app before AppKit finishes deactivating this one:
    /// at that instant the terminal window is still key. Hiding it there
    /// leaves AppKit reassigning key status to the main window while the app
    /// is still active, which orders the main window forward for a frame — the
    /// flash on close. `NSApp.isActive` is the signal that actually matters:
    /// once it is false the terminal has resigned key, so `orderOut:` has
    /// nothing to hand off and the close is invisible. Bounded so a refused
    /// or stalled activation can never wedge the main thread.
    pub fn focus_previous_app(pid: Option<i32>, hide: impl FnOnce()) {
        let Some(pid) = pid else {
            hide();
            return;
        };
        let Some(_mtm) = MainThreadMarker::new() else {
            hide();
            return;
        };
        let activation_requested = unsafe {
            let app: *mut AnyObject = msg_send![
                class!(NSRunningApplication),
                runningApplicationWithProcessIdentifier: pid
            ];
            if app.is_null() {
                false
            } else {
                let activated: bool =
                    msg_send![app, activateWithOptions: ACTIVATE_IGNORING_OTHER_APPS];
                activated
            }
        };
        if !activation_requested {
            hide();
            return;
        }
        let deactivated =
            hide_after_deactivation(app_is_active, pump_once, hide, ACTIVATION_TIMEOUT);
        if !deactivated {
            log::warn!(
                "[debug] focus_previous_app: timed out after {:?} waiting for pid {} to deactivate this app",
                ACTIVATION_TIMEOUT,
                pid
            );
        }
    }

    /// Runs `hide` only after `is_active` has reported that this app is no
    /// longer active. `pump` advances the run loop between probes. On timeout
    /// `hide` still runs: the user asked to dismiss, so the window must not
    /// stay up.
    fn hide_after_deactivation(
        mut is_active: impl FnMut() -> bool,
        mut pump: impl FnMut(),
        hide: impl FnOnce(),
        timeout: Duration,
    ) -> bool {
        let deadline = Instant::now() + timeout;
        while is_active() {
            if Instant::now() >= deadline {
                hide();
                return false;
            }
            pump();
        }
        hide();
        true
    }

    /// Whether this app is still the active (frontmost) application. More
    /// precise than comparing `NSWorkspace.frontmostApplication`: the
    /// workspace property can name another app while this one is still active
    /// and still holds a key window.
    pub fn app_is_active() -> bool {
        unsafe {
            let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
            if app.is_null() {
                return false;
            }
            msg_send![app, isActive]
        }
    }

    /// Whether `window` currently holds keyboard focus. Combined with
    /// [`app_is_active`] this answers "is the user actually typing in this
    /// window": key status alone survives an inactive app for a moment.
    pub fn window_is_key(window: &WebviewWindow) -> bool {
        let Some(_mtm) = MainThreadMarker::new() else {
            return false;
        };
        let Some(win) = ns_window(window) else {
            return false;
        };
        unsafe { msg_send![win, isKeyWindow] }
    }

    /// Pumps the main run loop once. Pumping (rather than sleeping) matters:
    /// AppKit performs the deactivation on a run loop turn, so nothing lands
    /// while we just wait.
    fn pump_once() {
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

    /// Main-window z-order undo to perform after the raise, captured before it.
    ///
    /// The window-number list only spans the space the summon happens in, so a
    /// main window sitting on another display is missing from it exactly when
    /// it matters most; the window server can still be asked per point, which
    /// is display- and space-aware.
    pub fn capture_main_restore(app: &AppHandle, terminal: &WebviewWindow) -> Option<RestorePlan> {
        let _mtm = MainThreadMarker::new()?;
        let main_window = main_ns_window(app)?;
        let main = window_number(main_window)?;
        let raised = window_number(ns_window(terminal)?)?;
        if let Some(plan) = main_restore_plan(&global_window_order(), main, raised) {
            return Some(plan);
        }
        let anchor = window_behind(main_window, main)?;
        (anchor != raised).then_some(RestorePlan::Above(anchor))
    }

    /// The window directly behind `window` at its own centre, or `None` when it
    /// is frontmost there (nothing was above it to lose).
    fn window_behind(window: *mut AnyObject, number: isize) -> Option<isize> {
        let frame: NSRect = unsafe { msg_send![window, frame] };
        let point = NSPoint {
            x: frame.origin.x + frame.size.width / 2.0,
            y: frame.origin.y + frame.size.height / 2.0,
        };
        let behind: isize = unsafe {
            msg_send![
                class!(NSWindow),
                windowNumberAtPoint: point,
                belowWindowWithWindowNumber: number
            ]
        };
        (behind != 0).then_some(behind)
    }

    /// Takes the main window off screen for the duration of the activation, and
    /// reports whether it was parked.
    ///
    /// Activating the app is what gives the panel the keyboard, and an
    /// activation orders every visible window of the app front — so the main UI
    /// reappears on its own display even though the user was working in another
    /// app. A window that is ordered out cannot be raised, which is the only
    /// reliable way to keep it asleep; [`restore_main_window`] puts it back.
    pub fn park_main_window(app: &AppHandle) -> bool {
        let Some(_mtm) = MainThreadMarker::new() else {
            return false;
        };
        let Some(win) = main_ns_window(app) else {
            return false;
        };
        let visible: bool = unsafe { msg_send![win, isVisible] };
        let minimized: bool = unsafe { msg_send![win, isMiniaturized] };
        if !super::should_park_main(visible, minimized) {
            log::info!(
                "[probe] park_main_window: visible={} minimized={} parked=false",
                visible,
                minimized
            );
            return false;
        }
        unsafe {
            let _: () = msg_send![win, orderOut: ptr::null::<AnyObject>()];
        }
        log::info!(
            "[probe] park_main_window: visible={} minimized={} parked=true",
            visible,
            minimized
        );
        true
    }

    /// Puts a parked main window back, in the slot it occupied before the park.
    ///
    /// Runs one display cycle after the summon (`super::schedule_main_restore`),
    /// by which time the window ordering the activation triggered has landed —
    /// undoing it sooner only got overwritten by that ordering, which is why the
    /// main window still jumped in front even though an undo was planned.
    ///
    /// The window is ordered front and then slid back into its slot inside the
    /// same run loop turn: ordering calls only take effect on a visible window,
    /// and both calls reach the window server together, so the window never
    /// draws in the wrong place.
    pub fn restore_main_window(app: &AppHandle, restore: Option<RestorePlan>) {
        let Some(_mtm) = MainThreadMarker::new() else {
            return;
        };
        let Some(win) = main_ns_window(app) else {
            return;
        };
        unsafe {
            let _: () = msg_send![win, orderFront: ptr::null::<AnyObject>()];
            match restore {
                Some(RestorePlan::Above(other)) => {
                    let _: () = msg_send![win, orderWindow: ORDER_ABOVE, relativeTo: other];
                }
                Some(RestorePlan::Below(other)) => {
                    let _: () = msg_send![win, orderWindow: ORDER_BELOW, relativeTo: other];
                }
                // Everything above it is gone: its old slot was the back.
                Some(RestorePlan::Back) => {
                    let _: () = msg_send![win, orderBack: ptr::null::<AnyObject>()];
                }
                // No anchor captured: it was the frontmost window on screen, and
                // ordering it front has just restored exactly that.
                None => {}
            }
            // Whatever AppKit made of the anchor, a parked window has to be back
            // on screen — never leave the main UI hidden because an ordering was
            // refused (a foreign anchor, say).
            let visible: bool = msg_send![win, isVisible];
            // Where the window server actually put it: front is index 0, so an
            // `Above(a)` restore must leave main one slot in front of `a`.
            let order = global_window_order();
            let main_pos = window_number(win).and_then(|n| order.iter().position(|&x| x == n));
            let anchor = match restore {
                Some(RestorePlan::Above(other)) | Some(RestorePlan::Below(other)) => Some(other),
                _ => None,
            };
            let anchor_pos = anchor.and_then(|a| order.iter().position(|&x| x == a));
            log::info!(
                "[probe] restore_main_window: restore={:?} visible={} main_pos={:?} anchor_pos={:?}",
                restore,
                visible,
                main_pos,
                anchor_pos
            );
            if !visible {
                log::warn!("[debug] restore_main_window: still hidden, ordering front");
                let _: () = msg_send![win, orderFront: ptr::null::<AnyObject>()];
            }
        }
    }

    /// 让面板成为本应用的 main+key 窗口，即激活时该拿到键盘的那个窗口。
    ///
    /// `makeKeyWindow` 把窗口设为 key 与 main（若 eligible）并更新
    /// `NSApp.keyWindow`/`NSApp.mainWindow`。注意它**不**限制激活的前移范围：
    /// `activateIgnoringOtherApps:` 会把本应用**所有可见窗口**在各自所在屏幕上
    /// 一并提到最前，所以「主窗口不被顶到前面」只能靠先 `park_main_window`
    /// 把它 order out（见 `summon_terminal_window`），不能靠这个 key/main 指派。
    pub fn make_panel_activation_target(window: &WebviewWindow) {
        let Some(_mtm) = MainThreadMarker::new() else {
            return;
        };
        let Some(win) = ns_window(window) else {
            return;
        };
        unsafe {
            let _: () = msg_send![win, makeKeyAndOrderFront: ptr::null::<AnyObject>()];
            let _: () = msg_send![win, makeKeyWindow];
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

    #[cfg(test)]
    mod tests {
        use std::cell::Cell;
        use std::time::Duration;

        use super::hide_after_deactivation;

        #[test]
        fn hide_waits_for_the_app_to_deactivate() {
            // `NSWorkspace.frontmostApplication` can name the previous app
            // while this one is still active and still holds the terminal as
            // key. The hide must wait for NSApp.isActive to go false, not for
            // that earlier workspace signal.
            let workspace_says_other_foremost = Cell::new(false);
            let app_active = Cell::new(true);
            let pumps = Cell::new(0);
            let active_when_hidden = Cell::new(None);

            let deactivated = hide_after_deactivation(
                || app_active.get(),
                || {
                    pumps.set(pumps.get() + 1);
                    if pumps.get() == 1 {
                        workspace_says_other_foremost.set(true);
                    }
                    if pumps.get() == 3 {
                        app_active.set(false);
                    }
                },
                || active_when_hidden.set(Some(app_active.get())),
                Duration::from_millis(200),
            );

            assert!(workspace_says_other_foremost.get());
            assert!(deactivated);
            assert_eq!(
                active_when_hidden.get(),
                Some(false),
                "the terminal must not hide while the app is still active"
            );
        }

        #[test]
        fn hide_still_runs_when_deactivation_times_out() {
            // A refused activation must not leave the terminal on screen.
            let mut hidden = false;
            let deactivated =
                hide_after_deactivation(|| true, || {}, || hidden = true, Duration::from_millis(1));

            assert!(!deactivated);
            assert!(hidden, "the dismiss request must still hide the window");
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

    /// Non-macOS: activation does not order the app's other windows front, so
    /// there is nothing to park.
    pub fn park_main_window(_app: &AppHandle) -> bool {
        false
    }

    pub fn restore_main_window(_app: &AppHandle, _restore: Option<RestorePlan>) {}

    /// Non-macOS: activation does not order the app's other windows front, so
    /// there is nothing to redirect.
    pub fn make_panel_activation_target(_window: &WebviewWindow) {}

    /// Non-macOS: an inactive app owns no focused window at all, so the
    /// per-window check already says whether the app is in front.
    pub fn app_is_active() -> bool {
        true
    }

    pub fn window_is_key(window: &WebviewWindow) -> bool {
        window.is_focused().unwrap_or(false)
    }

    pub fn frontmost_other_app() -> Option<i32> {
        None
    }

    pub fn focus_previous_app(_pid: Option<i32>, hide: impl FnOnce()) {
        hide();
    }
}

#[cfg(test)]
mod tests {
    use super::{
        hotkey_target, main_restore_plan, panel_memory_lookup, panel_memory_store,
        should_park_main, within_summon_grace, HotkeyTarget, RestorePlan, ORDER_ABOVE, ORDER_BELOW,
        RESTORE_DELAY,
    };
    use crate::window_placement::Rect;
    use std::time::{Duration, Instant};

    fn rect(x: f64, y: f64, width: f64, height: f64) -> Rect {
        Rect {
            x,
            y,
            width,
            height,
        }
    }

    #[test]
    fn the_hotkey_uses_the_built_in_panel_only_while_the_main_window_has_focus() {
        // Focused main window: the panel belongs inside it, and the shortcut
        // must not summon a standalone window that steals the focus.
        assert_eq!(hotkey_target(true), HotkeyTarget::BuiltInPanel);
        // Hidden, background, or another app in front: the standalone panel is
        // the only surface the user can actually see.
        assert_eq!(hotkey_target(false), HotkeyTarget::StandaloneWindow);
    }

    #[test]
    fn a_fresh_summon_survives_the_main_window_focus_hook() {
        let now = Instant::now();
        let grace = Duration::from_millis(750);

        // The summon's own activation keys the main window for a frame.
        assert!(within_summon_grace(
            Some(now - Duration::from_millis(100)),
            now,
            grace
        ));
        // Long after the summon, a main-window focus is a real user decision.
        assert!(!within_summon_grace(
            Some(now - Duration::from_millis(900)),
            now,
            grace
        ));
        // Never summoned: nothing to protect.
        assert!(!within_summon_grace(None, now, grace));
    }

    #[test]
    fn window_ordering_mode_values_follow_appkit_abi() {
        assert_eq!(ORDER_ABOVE, 1);
        assert_eq!(ORDER_BELOW, -1);
    }

    #[test]
    fn only_a_main_window_that_is_on_screen_gets_parked() {
        // On screen: the summon's activation would raise it, so park it.
        assert!(should_park_main(true, false));
        // Hidden to the tray: already out of the activation's reach.
        assert!(!should_park_main(false, false));
        // Minimized: off screen already, and parking it would lose the
        // minimized state the user left it in.
        assert!(!should_park_main(true, true));
    }

    #[test]
    fn the_parked_window_waits_for_the_activation_ordering_to_land() {
        // A single run-loop turn is too early: the ordering an activation
        // triggers lands on a later window-server pass, so a shorter wait would
        // put the window back in time to be raised again.
        assert!(RESTORE_DELAY >= Duration::from_millis(50));
        // Anything longer parks the main window for no reason: that is a blink
        // the user would notice on the main window's own display.
        assert!(RESTORE_DELAY <= Duration::from_millis(400));
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

    #[test]
    fn panel_memory_store_overwrites_the_entry_for_the_same_screen() {
        // The user moves the panel twice on the laptop: one entry, newest rect.
        let mut entries = Vec::new();
        panel_memory_store(&mut entries, "laptop", rect(260.0, 130.0, 920.0, 560.0));
        panel_memory_store(&mut entries, "laptop", rect(0.0, 0.0, 1200.0, 800.0));

        assert_eq!(entries.len(), 1);
        assert_eq!(
            panel_memory_lookup(&entries, "laptop"),
            Some(rect(0.0, 0.0, 1200.0, 800.0))
        );
    }

    #[test]
    fn panel_memory_store_keeps_a_separate_entry_per_screen() {
        // Panel used on the laptop, then on the external monitor, then the
        // laptop again: each display keeps its own geometry.
        let mut entries = Vec::new();
        panel_memory_store(&mut entries, "laptop", rect(260.0, 130.0, 920.0, 560.0));
        panel_memory_store(&mut entries, "external", rect(2000.0, 400.0, 1400.0, 900.0));

        assert_eq!(entries.len(), 2);
        assert_eq!(
            panel_memory_lookup(&entries, "laptop"),
            Some(rect(260.0, 130.0, 920.0, 560.0))
        );
        assert_eq!(
            panel_memory_lookup(&entries, "external"),
            Some(rect(2000.0, 400.0, 1400.0, 900.0))
        );
    }

    #[test]
    fn panel_memory_lookup_returns_none_for_a_screen_never_used() {
        // Fresh launch: no display has a remembered panel yet.
        let entries = vec![("laptop".to_string(), rect(260.0, 130.0, 920.0, 560.0))];

        assert_eq!(panel_memory_lookup(&entries, "external"), None);
        assert_eq!(panel_memory_lookup(&[], "laptop"), None);
    }
}
