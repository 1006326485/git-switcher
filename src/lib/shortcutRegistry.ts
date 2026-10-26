import type { ActionId } from "./inAppShortcuts";
import {
  bindingToDisplayParts,
  detectMac,
  digitRangeDisplayParts,
} from "./hotkey";

/**
 * Canonical shortcut registry (Phase 1 foundation).
 *
 * Every keyboard shortcut in the app lives in exactly one entry here: its
 * stable id, its localised description key, its default binding in
 * `CmdOrCtrl` notation (⌘ on macOS, Ctrl on Windows/Linux), the context it
 * belongs to, the help-panel group it renders under, whether the Shortcuts
 * panel may rebind it, and whether it deliberately overrides an OS/browser
 * default. Handlers look actions up in this table; they must not invent
 * their own key literals for actions listed here (see the exceptions noted
 * on individual entries).
 *
 * Phase 2 made the view modes, fetch-all, and terminal actions rebindable
 * and added the Open Settings action; no pre-existing default key changed.
 * Unbound-by-default actions (terminal focus input, clear screen) have an
 * empty defaultBinding and are bound only if the user records one.
 */

export type ShortcutPlatform = "mac" | "windows" | "linux";

/**
 * Context priority (FR2), highest first. When one keystroke could match in
 * several places, the highest-priority context wins:
 *
 * 1. recorder — the ShortcutRecorder is capturing a new binding
 *    (shortcutCapture.ts; every handler checks isShortcutCapturing() first).
 * 2. dialog — an open dialog/panel owns Escape and CmdOrCtrl+W
 *    (App.tsx dialog handler; CommandPalette owns its own Escape/Cmd+W
 *    while open, via a document-level listener that runs before App's
 *    window-level one).
 * 3. terminal — terminal-owned keys only, handled by TerminalWorkspace's
 *    capture-phase window listener, which runs before all bubble-phase
 *    handlers and stops propagation for the keys it owns (new tab, close
 *    tab, switch group/tab, jump by index/project, focus input, clear).
 *    "Terminal context" means keyboard focus is inside the workspace's
 *    own DOM (its window-root element): in the standalone window that is
 *    everything, in the main window it is only the terminal panel, so an
 *    open panel no longer steals app shortcuts while the user works in
 *    the project list (Phase 2 narrowing; before, workspace-open alone
 *    was enough).
 * 4. palette — while the command palette is open, its own component owns
 *    arrows/Enter/Escape; other app actions are already unreachable because
 *    the palette input holds focus and the in-app handler skips text
 *    fields (the palette summon itself is the one exception that fires
 *    while typing).
 * 5. list — project-list navigation (arrows, J/K, Enter, Space). The App
 *    navigation handler skips every open dialog/panel so list keys never
 *    fire underneath an overlay.
 * 6. app — app-global actions (the 12 rebindable actions, view modes,
 *    fetch-all) handled by useKeyboardShortcuts and App.tsx.
 * 7. global — the summon-terminal hotkey, owned by the backend
 *    (src-tauri/src/hotkeys.rs). useKeyboardShortcuts suppresses any
 *    in-app binding on the same chord so it can never double-fire.
 */
export type ShortcutContext =
  | "recorder"
  | "dialog"
  | "terminal"
  | "palette"
  | "list"
  | "app"
  | "global";

export const CONTEXT_PRIORITY: ShortcutContext[] = [
  "recorder",
  "dialog",
  "terminal",
  "palette",
  "list",
  "app",
  "global",
];

export type ShortcutGroup =
  | "global"
  | "general"
  | "navigation"
  | "git"
  | "view"
  | "terminal"
  | "inApp";

export const SHORTCUT_GROUP_ORDER: ShortcutGroup[] = [
  "global",
  "general",
  "navigation",
  "git",
  "view",
  "terminal",
];

export interface ShortcutDefinition {
  /** Stable id, used by handlers and tests. Never rename casually. */
  id: string;
  /** i18n key under `shortcuts.*` (en + zh-CN both filled). */
  descriptionKey: string;
  /**
   * Default binding in canonical `CmdOrCtrl` notation. "" means the row is
   * not a keyboard shortcut at all (see displayParts, e.g. middle click).
   */
  defaultBinding: string;
  /**
   * Per-platform defaults, for the day a default genuinely differs by
   * platform. Empty today: every current default is expressed through
   * `CmdOrCtrl` and therefore already resolves per platform. When set, the
   * platform entry wins over defaultBinding (see getDefaultBinding).
   */
  platformDefaults?: Partial<Record<ShortcutPlatform, string>>;
  context: ShortcutContext;
  /** Help-panel group this row renders under. */
  group: ShortcutGroup;
  /** Rebindable through the Shortcuts panel editor. */
  rebindable: boolean;
  /**
   * True when the binding is a digit range ("Alt+Digit"): the modifiers
   * plus any digit 1-9, matched by matchDigitRange, displayed as "1…9".
   * The digit in the stored string is a placeholder, never one tab.
   */
  digitRange?: boolean;
  /** True when the binding deliberately overrides an OS/browser default. */
  overridesOsOrBrowser: boolean;
  /**
   * True when the row is display-only: its binding string is a composite
   * (a pair of alternative keys, a numeric range) or is not expressible
   * in `+`-notation, so it must never be fed to matchesBinding. Handlers
   * for these actions keep their own matching logic.
   */
  displayOnly?: boolean;
  /**
   * Explicit display parts, only for non-keyboard rows (middle click).
   * Keyboard rows always derive their display from defaultBinding via
   * bindingToDisplayParts, so symbols stay platform-correct.
   */
  displayParts?: string[];
  /** Settings field backing a rebindable action (e.g. "in_app_add_project"). */
  settingsField?: string;
  /** The inAppShortcuts ActionId, for the 12 rebindable actions. */
  inAppActionId?: ActionId;
  /** Exceptions to the priority rules, or behaviour notes for the row. */
  note?: string;
}

export const SHORTCUT_REGISTRY: readonly ShortcutDefinition[] = [
  // ── Global (backend-owned) ──────────────────────────────────────────
  {
    id: "globalTerminal",
    descriptionKey: "shortcuts.global.terminal",
    defaultBinding: "CmdOrCtrl+Shift+`",
    context: "global",
    group: "global",
    rebindable: false,
    overridesOsOrBrowser: false,
    note: "Backend-owned global hotkey (terminal_hotkey setting). While the main window is focused it toggles the built-in panel instead of summoning the standalone window. Configurable in Settings, not in the Shortcuts editor.",
  },

  // ── Dialog ────────────────────────────────────────────────────────────
  {
    id: "dismissDialog",
    descriptionKey: "shortcuts.general.cancel",
    defaultBinding: "Escape",
    context: "dialog",
    group: "general",
    rebindable: false,
    overridesOsOrBrowser: false,
    note: "Escape is the one fixed key in the app: universal dismiss, never rebound.",
  },
  {
    id: "closeDialogPanel",
    descriptionKey: "shortcuts.general.closeWindow",
    defaultBinding: "CmdOrCtrl+W",
    context: "dialog",
    group: "general",
    rebindable: false,
    overridesOsOrBrowser: false,
    note: "Falls through to the native menu (hide-to-tray on macOS) when nothing is open, and the terminal capture handler wins first when a terminal tab exists. App.tsx intentionally accepts Shift/Alt variants of this chord (legacy behaviour); matchesBinding would be stricter, so the handler keeps its own check.",
  },

  // ── Rebindable in-app actions (context: app, except navigation) ──────
  {
    id: "addProject",
    descriptionKey: "shortcuts.inApp.addProject",
    defaultBinding: "CmdOrCtrl+N",
    context: "app",
    group: "inApp",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_add_project",
    inAppActionId: "addProject",
    note: "Terminal context overrides this when a terminal workspace is open (terminalNewTab, capture phase).",
  },
  {
    id: "refreshAll",
    descriptionKey: "shortcuts.inApp.refreshAll",
    defaultBinding: "CmdOrCtrl+R",
    context: "app",
    group: "inApp",
    rebindable: true,
    overridesOsOrBrowser: true,
    settingsField: "in_app_refresh_all",
    inAppActionId: "refreshAll",
    note: "Deliberately overrides the webview reload. SINGLE OWNER (Phase 1 fix): only useKeyboardShortcuts fires this; the former duplicate handler in App.tsx was removed, so a rebind can no longer leave a hardcoded CmdOrCtrl+R behind. A dirty chord is swallowed there, never passed to native reload.",
  },
  {
    id: "focusSearch",
    descriptionKey: "shortcuts.inApp.focusSearch",
    defaultBinding: "CmdOrCtrl+F",
    context: "app",
    group: "inApp",
    rebindable: true,
    overridesOsOrBrowser: true,
    settingsField: "in_app_focus_search",
    inAppActionId: "focusSearch",
    note: "Deliberately overrides browser find.",
  },
  {
    id: "exportImport",
    descriptionKey: "shortcuts.inApp.exportImport",
    defaultBinding: "CmdOrCtrl+E",
    context: "app",
    group: "inApp",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_export_import",
    inAppActionId: "exportImport",
  },
  {
    id: "toggleSidebar",
    descriptionKey: "shortcuts.inApp.toggleSidebar",
    defaultBinding: "CmdOrCtrl+B",
    context: "app",
    group: "inApp",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_toggle_sidebar",
    inAppActionId: "toggleSidebar",
  },
  {
    id: "commandPalette",
    descriptionKey: "shortcuts.inApp.commandPalette",
    defaultBinding: "CmdOrCtrl+K",
    context: "app",
    group: "inApp",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_command_palette",
    inAppActionId: "commandPalette",
    note: "Exception to the text-field rule: the only binding allowed to fire while typing in a field, so the palette can always be summoned.",
  },
  {
    id: "shortcutsHelp",
    descriptionKey: "shortcuts.inApp.shortcutsHelp",
    defaultBinding: "CmdOrCtrl+/",
    context: "app",
    group: "inApp",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_shortcuts_help",
    inAppActionId: "shortcutsHelp",
  },
  {
    id: "openSettings",
    descriptionKey: "shortcuts.inApp.openSettings",
    defaultBinding: "CmdOrCtrl+,",
    context: "app",
    group: "inApp",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_open_settings",
    inAppActionId: "openSettings",
    note: "PROPOSED default (Phase 2, review branch): the universal Settings convention (CmdOrCtrl+,). Flagged for the user's call — D2 in the requirements doc.",
  },
  {
    id: "quickDiff",
    descriptionKey: "shortcuts.inApp.quickDiff",
    defaultBinding: "CmdOrCtrl+D",
    context: "app",
    group: "inApp",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_quick_diff",
    inAppActionId: "quickDiff",
  },
  {
    id: "navigateDown",
    descriptionKey: "shortcuts.inApp.navigateDown",
    defaultBinding: "J",
    context: "list",
    group: "inApp",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_navigate_down",
    inAppActionId: "navigateDown",
    note: "Bare key: only acts in the list context (never in a text field). ArrowDown is the same movement (navigateArrows).",
  },
  {
    id: "navigateUp",
    descriptionKey: "shortcuts.inApp.navigateUp",
    defaultBinding: "K",
    context: "list",
    group: "inApp",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_navigate_up",
    inAppActionId: "navigateUp",
    note: "Bare key: only acts in the list context. ArrowUp is the same movement (navigateArrows).",
  },
  {
    id: "selectFocused",
    descriptionKey: "shortcuts.inApp.selectFocused",
    defaultBinding: "Enter",
    context: "list",
    group: "inApp",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_select_focused",
    inAppActionId: "selectFocused",
    note: "Expands/collapses the focused project. Shown again as navigateToggleDetails in the Navigation group for discoverability.",
  },
  {
    id: "toggleTerminal",
    descriptionKey: "shortcuts.inApp.toggleTerminal",
    defaultBinding: "Control+~",
    context: "app",
    group: "inApp",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_toggle_terminal",
    inAppActionId: "toggleTerminal",
    note: "In-app panel only. useKeyboardShortcuts suppresses this binding when the event equals the backend global hotkey, so the two never double-fire.",
  },

  // ── List navigation (non-rebindable in Phase 1) ───────────────────────
  {
    id: "navigateArrows",
    descriptionKey: "shortcuts.nav.arrows",
    defaultBinding: "ArrowUp+ArrowDown",
    context: "list",
    group: "navigation",
    rebindable: false,
    overridesOsOrBrowser: false,
    displayOnly: true,
    note: "Either arrow key; not a single chord, so this row is display-only and never fed to matchesBinding.",
  },
  {
    id: "navigateToggleDetails",
    descriptionKey: "shortcuts.nav.toggleDetails",
    defaultBinding: "Enter",
    context: "list",
    group: "navigation",
    rebindable: false,
    overridesOsOrBrowser: false,
    displayOnly: true,
    note: "Same key as selectFocused, shown in the Navigation group for discoverability. Rebinding selectFocused does not move this row (Phase 2 may merge the two).",
  },
  {
    id: "navigateRefreshProject",
    descriptionKey: "shortcuts.nav.refreshProject",
    defaultBinding: "Space",
    context: "list",
    group: "navigation",
    rebindable: false,
    overridesOsOrBrowser: false,
    displayOnly: true,
    note: "Matched in App.tsx by e.key === ' ' (the Space character is not expressible in '+'-notation), so this row is display-only.",
  },

  // ── Git: fetch-all (rebindable since Phase 2) ─────────────────────────
  {
    id: "fetchAll",
    descriptionKey: "shortcuts.git.fetchAll",
    defaultBinding: "CmdOrCtrl+Shift+G",
    context: "app",
    group: "git",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_fetch_all",
    inAppActionId: "fetchAll",
    note: "Handled by useKeyboardShortcuts (app context). Terminal context does not override it.",
  },

  // ── View modes (rebindable since Phase 2) ─────────────────────────────
  {
    id: "viewCard",
    descriptionKey: "shortcuts.view.card",
    defaultBinding: "CmdOrCtrl+1",
    context: "app",
    group: "view",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_view_card",
    inAppActionId: "viewCard",
    note: "Terminal context overrides digits 1-9 when focus is inside the terminal (terminalJumpProject, capture phase).",
  },
  {
    id: "viewList",
    descriptionKey: "shortcuts.view.list",
    defaultBinding: "CmdOrCtrl+2",
    context: "app",
    group: "view",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_view_list",
    inAppActionId: "viewList",
  },
  {
    id: "viewCompact",
    descriptionKey: "shortcuts.view.compact",
    defaultBinding: "CmdOrCtrl+3",
    context: "app",
    group: "view",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_view_compact",
    inAppActionId: "viewCompact",
  },
  {
    id: "viewTable",
    descriptionKey: "shortcuts.view.table",
    defaultBinding: "CmdOrCtrl+4",
    context: "app",
    group: "view",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_view_table",
    inAppActionId: "viewTable",
  },
  {
    id: "viewDashboard",
    descriptionKey: "shortcuts.view.dashboard",
    defaultBinding: "CmdOrCtrl+5",
    context: "app",
    group: "view",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_view_dashboard",
    inAppActionId: "viewDashboard",
  },

  // ── Terminal (capture phase, TerminalWorkspace; rebindable since ─────
  // Phase 2). Arrow-pair actions are split into directional single chords
  // so the single-chord recorder can capture them; digit actions are
  // digit-range bindings (see digitRange).
  {
    id: "terminalSwitchGroupPrev",
    descriptionKey: "shortcuts.terminal.switchGroupPrev",
    defaultBinding: "CmdOrCtrl+ArrowUp",
    context: "terminal",
    group: "terminal",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_terminal_switch_group_prev",
    inAppActionId: "terminalSwitchGroupPrev",
    note: "Capture-phase handler, wins over list navigation when focus is inside the terminal.",
  },
  {
    id: "terminalSwitchGroupNext",
    descriptionKey: "shortcuts.terminal.switchGroupNext",
    defaultBinding: "CmdOrCtrl+ArrowDown",
    context: "terminal",
    group: "terminal",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_terminal_switch_group_next",
    inAppActionId: "terminalSwitchGroupNext",
    note: "Capture-phase handler, wins over list navigation when focus is inside the terminal.",
  },
  {
    id: "terminalSwitchTabPrev",
    descriptionKey: "shortcuts.terminal.switchTabPrev",
    defaultBinding: "CmdOrCtrl+ArrowLeft",
    context: "terminal",
    group: "terminal",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_terminal_switch_tab_prev",
    inAppActionId: "terminalSwitchTabPrev",
    note: "Capture-phase handler.",
  },
  {
    id: "terminalSwitchTabNext",
    descriptionKey: "shortcuts.terminal.switchTabNext",
    defaultBinding: "CmdOrCtrl+ArrowRight",
    context: "terminal",
    group: "terminal",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_terminal_switch_tab_next",
    inAppActionId: "terminalSwitchTabNext",
    note: "Capture-phase handler.",
  },
  {
    id: "terminalJumpIndex",
    descriptionKey: "shortcuts.terminal.jumpIndex",
    defaultBinding: "Alt+Digit",
    context: "terminal",
    group: "terminal",
    rebindable: true,
    overridesOsOrBrowser: false,
    digitRange: true,
    settingsField: "in_app_terminal_jump_index",
    inAppActionId: "terminalJumpIndex",
    note: "Alt/Option + any digit 1-9 (digit-range binding). Capture-phase handler.",
  },
  {
    id: "terminalJumpProject",
    descriptionKey: "shortcuts.terminal.jumpProject",
    defaultBinding: "CmdOrCtrl+Digit",
    context: "terminal",
    group: "terminal",
    rebindable: true,
    overridesOsOrBrowser: false,
    digitRange: true,
    settingsField: "in_app_terminal_jump_project",
    inAppActionId: "terminalJumpProject",
    note: "Cmd/Ctrl + any digit 1-9 (digit-range binding). Capture-phase handler, wins over view modes 1-5 when focus is inside the terminal.",
  },
  {
    id: "terminalNewTab",
    descriptionKey: "shortcuts.terminal.newTab",
    defaultBinding: "CmdOrCtrl+N",
    context: "terminal",
    group: "terminal",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_terminal_new_tab",
    inAppActionId: "terminalNewTab",
    note: "Capture-phase handler, wins over app addProject when focus is inside the terminal. CmdOrCtrl resolves platform-aware (Cmd on macOS, Ctrl elsewhere), so Ctrl+N/Ctrl+W no longer leak to the shell on macOS and now work on Windows/Linux.",
  },
  {
    id: "terminalCloseTab",
    descriptionKey: "shortcuts.terminal.closeTabKey",
    defaultBinding: "CmdOrCtrl+W",
    context: "terminal",
    group: "terminal",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_terminal_close_tab",
    inAppActionId: "terminalCloseTab",
    note: "Capture-phase handler. With no tabs it propagates, so dialog-close (or the native menu) handles it.",
  },
  {
    id: "terminalFocusInput",
    descriptionKey: "shortcuts.terminal.focusInput",
    defaultBinding: "",
    context: "terminal",
    group: "terminal",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_terminal_focus_input",
    inAppActionId: "terminalFocusInput",
    note: "Unbound by default: no free universal convention exists (VS Code's Ctrl+` is this app's terminal toggle, and the clear convention Cmd+K is the palette). Bind it in the Shortcuts editor, or use the palette's Focus Terminal command.",
  },
  {
    id: "terminalClearScreen",
    descriptionKey: "shortcuts.terminal.clearScreen",
    defaultBinding: "",
    context: "terminal",
    group: "terminal",
    rebindable: true,
    overridesOsOrBrowser: false,
    settingsField: "in_app_terminal_clear_screen",
    inAppActionId: "terminalClearScreen",
    note: "Unbound by default: the usual clear-scrollback convention (Cmd+K, iTerm2) is taken by the command palette here. Clears scrollback only; the shell session keeps running. Bind it in the Shortcuts editor, or use the palette's Clear Terminal command.",
  },
  {
    id: "terminalCloseTabMouse",
    descriptionKey: "shortcuts.terminal.closeTab",
    defaultBinding: "",
    context: "terminal",
    group: "terminal",
    rebindable: false,
    overridesOsOrBrowser: false,
    displayOnly: true,
    displayParts: ["Middle click"],
    note: "Mouse action, not a keyboard shortcut; kept in the help panel for completeness.",
  },
];

export function definitionById(id: string): ShortcutDefinition | undefined {
  return SHORTCUT_REGISTRY.find((d) => d.id === id);
}

/** All rebindable actions, in Shortcuts-panel order (registry order). */
export function inAppDefinitions(): ShortcutDefinition[] {
  return SHORTCUT_REGISTRY.filter((d) => d.inAppActionId !== undefined);
}

/** Non-rebindable reference rows for one help-panel group. */
export function referenceDefinitions(group: ShortcutGroup): ShortcutDefinition[] {
  return SHORTCUT_REGISTRY.filter((d) => d.group === group && !d.rebindable);
}

export function detectPlatform(): ShortcutPlatform {
  if (typeof navigator === "undefined") return "linux";
  const platform = navigator.platform || navigator.userAgent || "";
  if (/mac/i.test(platform)) return "mac";
  if (/win/i.test(platform)) return "windows";
  return "linux";
}

export function getDefaultBinding(
  def: ShortcutDefinition,
  platform: ShortcutPlatform = detectPlatform()
): string {
  return def.platformDefaults?.[platform] ?? def.defaultBinding;
}

/**
 * Display parts for a registry row, always platform-correct: keyboard rows
 * derive from the canonical binding via bindingToDisplayParts (⌘/⌃/⌥/⇧ on
 * macOS, Ctrl/Alt/Shift on Windows/Linux), so no row can hardcode ⌘ on
 * Windows/Linux. Only non-keyboard rows use displayParts.
 */
export function getDisplayParts(
  def: ShortcutDefinition,
  isMac: boolean = detectMac()
): string[] {
  if (def.displayParts) return def.displayParts;
  if (!def.defaultBinding) return [];
  if (def.digitRange) return digitRangeDisplayParts(def.defaultBinding, isMac);
  return bindingToDisplayParts(def.defaultBinding, isMac);
}

/**
 * Editor display parts for a rebindable row's current binding: digit-range
 * rows render their modifiers + "1…9" instead of one recorded digit.
 */
export function getEditorDisplayParts(
  def: ShortcutDefinition,
  binding: string,
  isMac: boolean = detectMac()
): string[] {
  if (!binding) return [];
  if (def.digitRange) return digitRangeDisplayParts(binding, isMac);
  return bindingToDisplayParts(binding, isMac);
}

/** Defaults for all rebindable actions, keyed by ActionId ("": unbound). */
export function getInAppDefaults(): Record<ActionId, string> {
  const out = {} as Record<ActionId, string>;
  for (const def of SHORTCUT_REGISTRY) {
    if (def.inAppActionId) out[def.inAppActionId] = def.defaultBinding;
  }
  return out;
}

/** settingsField -> ActionId, for all rebindable actions. */
export function getSettingsFieldMap(): Record<string, ActionId> {
  const out: Record<string, ActionId> = {};
  for (const def of SHORTCUT_REGISTRY) {
    if (def.inAppActionId && def.settingsField) out[def.settingsField] = def.inAppActionId;
  }
  return out;
}
