//! Pure placement logic for the global terminal panel.
//!
//! Nothing here touches Tauri: the caller converts `Monitor`/cursor data into
//! [`Screen`] and hands the returned [`Rect`] to `set_position`/`set_size`.
//!
//! Everything is expressed in **logical points**, never in physical pixels.
//! Mixing the two is what used to break mixed-DPI setups: `cursor_position()`
//! is points-times-primary-scale, `Monitor::position()` is points-times-own-
//! scale, while the window setters take logical units and re-derive the
//! conversion themselves. Feeding logical values to those setters is the
//! identity transform, so a panel can cross displays with different scales.

/// A rectangle in logical points (origin top-left, y grows down; secondary
/// displays may have negative coordinates).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    /// Right edge, exclusive.
    pub fn right(&self) -> f64 {
        self.x + self.width
    }

    /// Bottom edge, exclusive.
    pub fn bottom(&self) -> f64 {
        self.y + self.height
    }

    /// Half-open hit test: the right/bottom edges belong to the next rectangle.
    pub fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x < self.right() && y >= self.y && y < self.bottom()
    }
}

/// One display's usable work area in points (menu bar / Dock / taskbar already
/// subtracted), plus a stable key.
///
/// Only the work area is kept: `Monitor::size()` is reported in a different
/// space than the cursor on scaled displays, so full bounds would be a lie.
#[derive(Debug, Clone, PartialEq)]
pub struct Screen {
    pub key: String,
    pub work_area: Rect,
}

/// Panel logical size in points.
pub const DEFAULT_PANEL_WIDTH: f64 = 920.0;
pub const DEFAULT_PANEL_HEIGHT: f64 = 560.0;

/// Default panel size in points, independent of any display scale.
pub fn default_panel_size() -> (f64, f64) {
    (DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT)
}

/// Stable per-display key: trimmed system name plus position, so two identical
/// monitors with the same name still get distinct keys. Without a name the key
/// is the position alone.
pub fn monitor_key(name: Option<&str>, position: (f64, f64)) -> String {
    let at = format!("{:.0},{:.0}", position.0, position.1);
    match name.map(str::trim) {
        Some(trimmed) if !trimmed.is_empty() => format!("{}@{}", trimmed, at),
        _ => format!("@{}", at),
    }
}

/// Clamp `v` into `lo..=hi`, tolerating a degenerate `hi < lo` range (a work
/// area read mid display-change can have a negative width/height).
fn clamp_axis(v: f64, lo: f64, hi: f64) -> f64 {
    // `f64::clamp` asserts on NaN bounds, and a monitor read mid hot-plug can
    // hand us one. Leaving the value alone is safer than panicking inside the
    // global-hotkey handler; `place_panel` bails out on such a work area anyway.
    if !lo.is_finite() || !hi.is_finite() {
        return v;
    }
    if hi < lo {
        lo
    } else {
        v.clamp(lo, hi)
    }
}

/// Index of the display the point belongs to.
///
/// An exact work-area hit wins; otherwise (cursor parked on the menu bar, the
/// Dock strip, or in the gap between two displays) the display whose work area
/// is nearest to the point — measuring the point clamped into each work area,
/// so the closest edge decides. Ties keep the first display.
pub fn screen_for_point(x: f64, y: f64, screens: &[Screen]) -> Option<usize> {
    if screens.is_empty() {
        return None;
    }
    if let Some(index) = screens.iter().position(|s| s.work_area.contains(x, y)) {
        return Some(index);
    }
    let mut best: Option<(usize, f64)> = None;
    for (index, screen) in screens.iter().enumerate() {
        let area = &screen.work_area;
        let clamped_x = clamp_axis(x, area.x, area.right());
        let clamped_y = clamp_axis(y, area.y, area.bottom());
        let distance = ((clamped_x - x).powi(2) + (clamped_y - y).powi(2)).sqrt();
        match best {
            Some((_, best_distance)) if best_distance <= distance => {}
            _ => best = Some((index, distance)),
        }
    }
    best.map(|(index, _)| index)
}

/// Geometry for the panel on one display.
///
/// `None` for a degenerate work area (read mid display-change): the caller
/// skips that placement instead of setting a 1x1 window.
pub fn place_panel(
    work_area: Rect,
    remembered: Option<Rect>,
    default_size: (f64, f64),
) -> Option<Rect> {
    // `is_finite` keeps a NaN / infinite work area out as well. The origin is
    // checked too: `clamp_axis` cannot pull a rect back inside an area whose
    // origin is NaN (it would have nothing to clamp against).
    let usable = |value: f64| value.is_finite() && value > 0.0;
    if !usable(work_area.width)
        || !usable(work_area.height)
        || !work_area.x.is_finite()
        || !work_area.y.is_finite()
    {
        return None;
    }

    let (wanted_width, wanted_height) = remembered
        .map(|r| (r.width, r.height))
        .unwrap_or(default_size);
    let width = wanted_width.max(1.0).min(work_area.width);
    let height = wanted_height.max(1.0).min(work_area.height);

    let (x, y) = match remembered {
        Some(r) => (r.x, r.y),
        None => (
            work_area.x + (work_area.width - width) / 2.0,
            work_area.y + (work_area.height - height) / 2.0,
        ),
    };

    // A rect remembered on a display that is gone (or at another resolution)
    // can sit far outside this work area: pull it back inside.
    Some(Rect {
        x: clamp_axis(x, work_area.x, work_area.x + (work_area.width - width)),
        y: clamp_axis(y, work_area.y, work_area.y + (work_area.height - height)),
        width,
        height,
    })
}

/// What a summon hotkey should do.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SummonAction {
    /// Hide the panel (existing toggle semantics).
    Dismiss,
    /// Show or focus the panel.
    Show,
}

/// Decide the summon action. `panel_screen` / `cursor_screen` are display keys.
///
/// Only hide when the panel is visible, focused *and* already on the cursor's
/// display. If either screen is unknown, fall back to the plain toggle: a
/// visible+focused panel whose display cannot be read must still be
/// dismissable, otherwise the hotkey can never close it.
pub fn summon_action(
    visible: bool,
    focused: bool,
    panel_screen: Option<&str>,
    cursor_screen: Option<&str>,
) -> SummonAction {
    match (panel_screen, cursor_screen) {
        (Some(panel), Some(cursor)) => {
            if visible && focused && panel == cursor {
                SummonAction::Dismiss
            } else {
                SummonAction::Show
            }
        }
        _ => {
            if visible && focused {
                SummonAction::Dismiss
            } else {
                SummonAction::Show
            }
        }
    }
}

/// Whether the panel must be moved to the cursor's display. An unknown panel
/// display counts as "must move".
pub fn should_reposition(panel_screen: Option<&str>, cursor_screen: Option<&str>) -> bool {
    matches!((panel_screen, cursor_screen), (panel, Some(cursor)) if panel != Some(cursor))
}

/// Pure decision result: which display to land on, and the geometry there.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Placement {
    pub index: usize,
    pub rect: Rect,
}

/// Decide whether the panel should move to `screens[target]`, and to which
/// geometry. `None` means "leave the panel where it is".
///
/// The caller picks `target` — on macOS it first asks the platform to hit-test
/// the cursor (which also claims the menu bar and Dock strips that sit outside
/// the work area), falling back to [`screen_for_point`].
pub fn resolve_placement(
    screens: &[Screen],
    target: usize,
    panel_screen: Option<&str>,
    memory: &[(String, Rect)],
    default_size: (f64, f64),
) -> Option<Placement> {
    let screen = screens.get(target)?;
    if !should_reposition(panel_screen, Some(screen.key.as_str())) {
        return None;
    }
    let remembered = memory
        .iter()
        .find(|(key, _)| key == &screen.key)
        .map(|(_, rect)| *rect);
    let rect = place_panel(screen.work_area, remembered, default_size)?;
    Some(Placement {
        index: target,
        rect,
    })
}

#[cfg(test)]
mod tests {
    use super::{
        default_panel_size, monitor_key, place_panel, resolve_placement, screen_for_point,
        should_reposition, summon_action, Placement, Rect, Screen, SummonAction,
    };

    fn rect(x: f64, y: f64, width: f64, height: f64) -> Rect {
        Rect {
            x,
            y,
            width,
            height,
        }
    }

    fn screen(key: &str, work_area: Rect) -> Screen {
        Screen {
            key: key.to_string(),
            work_area,
        }
    }

    #[test]
    fn default_panel_size_is_logical_points_and_scale_free() {
        // The panel is 920x560 points everywhere: the display scale is applied
        // by the window setter, not by us.
        assert_eq!(default_panel_size(), (920.0, 560.0));
    }

    #[test]
    fn monitor_key_separates_two_identical_monitors_by_position() {
        // Same model, same name, stacked or side by side: the position is what
        // tells them apart.
        let left = monitor_key(Some("DELL U2720Q"), (0.0, -1152.0));
        let right = monitor_key(Some("DELL U2720Q"), (0.0, 0.0));
        assert_eq!(left, "DELL U2720Q@0,-1152");
        assert_eq!(right, "DELL U2720Q@0,0");
        assert_ne!(left, right);
    }

    #[test]
    fn monitor_key_trims_the_name_and_falls_back_to_the_position() {
        // Padding around a real name must not produce a different key on
        // re-read; a nameless display keeps only its position.
        assert_eq!(
            monitor_key(Some("  Built-in Retina Display  "), (0.0, 0.0)),
            "Built-in Retina Display@0,0"
        );
        assert_eq!(monitor_key(None, (0.0, 0.0)), "@0,0");
        assert_eq!(monitor_key(Some("   "), (-1512.0, 0.0)), "@-1512,0");
    }

    #[test]
    fn monitor_key_rounds_fractional_positions_to_whole_points() {
        // `to_logical` can leave a fraction; 0.4 vs 0.0 must not churn the key.
        assert_eq!(
            monitor_key(Some("side"), (1512.4, -1152.0)),
            "side@1512,-1152"
        );
    }

    #[test]
    fn screen_for_point_finds_the_display_under_the_cursor() {
        let screens = [
            screen("laptop", rect(0.0, 0.0, 1440.0, 900.0)),
            screen("external", rect(1440.0, 0.0, 2560.0, 1400.0)),
        ];
        assert_eq!(screen_for_point(10.0, 10.0, &screens), Some(0));
        assert_eq!(screen_for_point(2000.0, 500.0, &screens), Some(1));
    }

    #[test]
    fn screen_for_point_handles_a_secondary_display_with_negative_coordinates() {
        // Monitor arranged to the left of the laptop: negative desktop points.
        let screens = [
            screen("left", rect(-1920.0, -200.0, 1920.0, 1080.0)),
            screen("laptop", rect(0.0, 0.0, 1440.0, 900.0)),
        ];
        assert_eq!(screen_for_point(-1000.0, -100.0, &screens), Some(0));
        assert_eq!(screen_for_point(-1920.0, -200.0, &screens), Some(0));
    }

    #[test]
    fn screen_for_point_maps_a_mixed_scale_setup_in_points() {
        // Retina built-in (1512x982 points) at the origin, 1x external
        // (2048x1152 points) above it: in points the external owns
        // y in [-1152, 0). Described in physical pixels the external would
        // span y in [-2304, 0) and its right half would resolve to no display.
        let screens = [
            screen("external", rect(0.0, -1152.0, 2048.0, 1152.0)),
            screen("built-in", rect(0.0, 0.0, 1512.0, 982.0)),
        ];
        assert_eq!(screen_for_point(1800.0, -600.0, &screens), Some(0));
        assert_eq!(screen_for_point(1500.0, -20.0, &screens), Some(0));
        assert_eq!(screen_for_point(700.0, 400.0, &screens), Some(1));
    }

    #[test]
    fn screen_for_point_falls_back_to_the_nearest_display_for_the_menu_bar_strip() {
        // The menu bar sits above the work area but still on that display, so
        // an exact hit misses and the nearest-work-area fallback must answer.
        let screens = [
            screen("external", rect(0.0, -1152.0, 2048.0, 1120.0)),
            screen("built-in", rect(0.0, 25.0, 1512.0, 950.0)),
        ];
        assert_eq!(screen_for_point(700.0, 5.0, &screens), Some(1));
    }

    #[test]
    fn screen_for_point_falls_back_to_the_nearest_display_for_a_gap() {
        // Cursor in the empty corner beside a shorter display: nearest wins,
        // and the nearer one is measured from the clamped edge, not the centre.
        let screens = [
            screen("laptop", rect(0.0, 0.0, 1440.0, 900.0)),
            screen("external", rect(1440.0, -1152.0, 2048.0, 1152.0)),
        ];
        assert_eq!(screen_for_point(1500.0, 880.0, &screens), Some(0));
        assert_eq!(screen_for_point(1500.0, -100.0, &screens), Some(1));
    }

    #[test]
    fn screen_for_point_returns_none_for_an_empty_screen_list() {
        assert_eq!(screen_for_point(10.0, 10.0, &[]), None);
    }

    #[test]
    fn place_panel_centers_a_panel_that_has_no_memory_on_the_target_screen() {
        // First summon on a 1440x900 laptop whose Dock eats 80 points.
        let placed = place_panel(rect(0.0, 0.0, 1440.0, 820.0), None, (920.0, 560.0));
        assert_eq!(placed, Some(rect(260.0, 130.0, 920.0, 560.0)));
    }

    #[test]
    fn place_panel_centers_on_a_secondary_display_with_a_menu_bar_offset() {
        // External display starts at y=25 (menu bar): centering is relative to
        // the work area, not to the desktop origin.
        let placed = place_panel(rect(1440.0, 25.0, 2560.0, 1380.0), None, (920.0, 560.0));
        assert_eq!(placed, Some(rect(2260.0, 435.0, 920.0, 560.0)));
    }

    #[test]
    fn place_panel_reuses_the_geometry_remembered_on_that_screen() {
        // The user dragged the panel to the bottom-right corner; the next
        // summon must land exactly there again.
        let remembered = rect(500.0, 300.0, 920.0, 560.0);
        let placed = place_panel(
            rect(0.0, 0.0, 1440.0, 900.0),
            Some(remembered),
            (920.0, 560.0),
        );
        assert_eq!(placed, Some(remembered));
    }

    #[test]
    fn place_panel_clamps_a_remembered_panel_that_no_longer_fits_the_screen() {
        // Remembered at (3000, 2000) on a display that is gone: the panel must
        // stay fully inside the current work area instead of off-screen.
        let remembered = rect(3000.0, 2000.0, 920.0, 560.0);
        let placed = place_panel(
            rect(0.0, 0.0, 1440.0, 900.0),
            Some(remembered),
            (920.0, 560.0),
        );
        assert_eq!(placed, Some(rect(520.0, 340.0, 920.0, 560.0)));
    }

    #[test]
    fn place_panel_shrinks_a_remembered_panel_larger_than_the_work_area() {
        // Older 4K placement carried over to a small laptop screen.
        let remembered = rect(-50.0, -20.0, 3840.0, 2160.0);
        let placed = place_panel(
            rect(0.0, 0.0, 1440.0, 900.0),
            Some(remembered),
            (920.0, 560.0),
        );
        assert_eq!(placed, Some(rect(0.0, 0.0, 1440.0, 900.0)));
    }

    #[test]
    fn place_panel_shrinks_the_default_size_when_the_screen_is_very_small() {
        // Tiny virtual display: the default 920x560 does not fit, so it shrinks.
        let placed = place_panel(rect(0.0, 0.0, 800.0, 500.0), None, default_panel_size());
        assert_eq!(placed, Some(rect(0.0, 0.0, 800.0, 500.0)));
    }

    #[test]
    fn place_panel_returns_none_for_a_degenerate_work_area() {
        // Mid display-change the work area can be zero or negative in a
        // dimension; never set (or remember) a 1x1 window instead.
        let default = default_panel_size();
        assert_eq!(
            place_panel(rect(100.0, 200.0, 0.0, 0.0), None, default),
            None
        );
        assert_eq!(
            place_panel(rect(100.0, 200.0, 1440.0, 0.0), None, default),
            None
        );
        assert_eq!(
            place_panel(rect(100.0, 200.0, 0.0, 900.0), None, default),
            None
        );
        assert_eq!(
            place_panel(
                rect(100.0, 200.0, -5.0, -5.0),
                Some(rect(0.0, 0.0, 920.0, 560.0)),
                default
            ),
            None
        );
    }

    #[test]
    fn summon_action_shows_the_panel_when_it_is_hidden() {
        // Hotkey pressed while the panel is not on screen.
        let action = summon_action(false, false, Some("laptop"), Some("laptop"));
        assert_eq!(action, SummonAction::Show);
    }

    #[test]
    fn summon_action_dismisses_a_focused_panel_on_the_cursor_screen() {
        // Panel open and focused on the display the pointer is on: toggle away.
        let action = summon_action(true, true, Some("laptop"), Some("laptop"));
        assert_eq!(action, SummonAction::Dismiss);
    }

    #[test]
    fn summon_action_shows_and_moves_a_focused_panel_on_another_screen() {
        // Panel focused on the laptop but the user is on the external display:
        // the hotkey must bring it over instead of hiding it.
        let action = summon_action(true, true, Some("laptop"), Some("external"));
        assert_eq!(action, SummonAction::Show);
    }

    #[test]
    fn summon_action_keeps_the_old_toggle_when_the_cursor_screen_is_unknown() {
        // Cursor position unavailable: plain toggle, no moving.
        assert_eq!(summon_action(true, true, None, None), SummonAction::Dismiss);
        assert_eq!(
            summon_action(true, true, Some("laptop"), None),
            SummonAction::Dismiss
        );
        assert_eq!(summon_action(true, false, None, None), SummonAction::Show);
        assert_eq!(summon_action(false, false, None, None), SummonAction::Show);
    }

    #[test]
    fn summon_action_dismisses_a_focused_panel_with_an_unknown_screen() {
        // Regression: a visible, focused panel whose display cannot be read
        // used to answer Show forever, so the hotkey could never close it.
        assert_eq!(
            summon_action(true, true, None, Some("b")),
            SummonAction::Dismiss
        );
        assert_eq!(
            summon_action(true, true, None, Some("external")),
            SummonAction::Dismiss
        );
    }

    #[test]
    fn should_reposition_moves_the_panel_to_the_screen_under_the_cursor() {
        // Panel remembered on the laptop, pointer on the external display.
        assert!(should_reposition(Some("laptop"), Some("external")));
    }

    #[test]
    fn should_reposition_is_false_when_the_panel_already_sits_on_the_cursor_screen() {
        assert!(!should_reposition(Some("laptop"), Some("laptop")));
    }

    #[test]
    fn should_reposition_is_false_without_a_cursor_screen_and_true_without_a_panel_screen() {
        // No cursor data means "do not move"; an unplaced panel must still move.
        assert!(!should_reposition(Some("laptop"), None));
        assert!(!should_reposition(None, None));
        assert!(should_reposition(None, Some("external")));
    }

    #[test]
    fn resolve_placement_moves_the_panel_to_the_target_screen_with_its_memory() {
        let screens = [
            screen("laptop", rect(0.0, 0.0, 1440.0, 900.0)),
            screen("external", rect(1440.0, 25.0, 2560.0, 1380.0)),
        ];
        let memory = [("external".to_string(), rect(1600.0, 100.0, 1200.0, 800.0))];

        let placement =
            resolve_placement(&screens, 1, Some("laptop"), &memory, default_panel_size());
        assert_eq!(
            placement,
            Some(Placement {
                index: 1,
                rect: rect(1600.0, 100.0, 1200.0, 800.0),
            })
        );
    }

    #[test]
    fn resolve_placement_returns_none_when_the_panel_is_already_there() {
        let screens = [screen("laptop", rect(0.0, 0.0, 1440.0, 900.0))];
        assert_eq!(
            resolve_placement(&screens, 0, Some("laptop"), &[], default_panel_size()),
            None
        );
    }

    #[test]
    fn resolve_placement_returns_none_for_a_degenerate_work_area() {
        let screens = [screen("laptop", rect(0.0, 0.0, 0.0, 0.0))];
        assert_eq!(
            resolve_placement(&screens, 0, Some("external"), &[], default_panel_size()),
            None
        );
    }

    #[test]
    fn resolve_placement_returns_none_without_screens() {
        assert_eq!(
            resolve_placement(&[], 0, Some("laptop"), &[], default_panel_size()),
            None
        );
    }
}
