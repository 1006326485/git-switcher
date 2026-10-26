import { useEffect } from "react";
import {
  bindingUsesModifier,
  matchesBinding,
  matchesGlobalHotkey,
  resolveInAppShortcuts,
  type ActionId,
} from "../lib/inAppShortcuts";
// Context priority (FR2, see shortcutRegistry.ts CONTEXT_PRIORITY): this
// handler owns the app/list levels. Recorder capture (1) is checked first,
// the backend global hotkey (7) is suppressed below so it never double-fires,
// and dialog (2) / terminal (3) / palette (4) contexts own their keys in
// their own handlers (App.tsx, TerminalWorkspace's capture-phase listener,
// CommandPalette) before this handler can act on them.
import { hasOtherKeyHeld, installHeldKeyTracking } from "../lib/heldKeys";
import { detectMac } from "../lib/hotkey";
import { isShortcutCapturing } from "../lib/shortcutCapture";
import type { ViewMode } from "../lib/types";

interface Handlers {
  onAddProject: () => void;
  onRefreshAll: () => void;
  onToggleSidebar: () => void;
  onExportImport: () => void;
  onToggleCommandPalette?: () => void;
  onToggleShortcutsHelp?: () => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onSelectFocused?: () => void;
  onToggleQuickDiff?: () => void;
  onToggleTerminal?: () => void;
  onViewModeChange?: (mode: ViewMode) => void;
  onFetchAll?: () => void;
  onOpenSettings?: () => void;
}

export interface KeyboardShortcutOptions {
  /**
   * FR6: when true, bare-key navigation is off — J/K bindings without a
   * modifier do not fire here (Space is handled in App's navigation
   * handler). A rebound chord binding still works: the setting disables
   * bare keys, not the navigate actions themselves.
   */
  bareKeysDisabled?: boolean;
}

export function useKeyboardShortcuts(
  handlers: Handlers,
  bindings?: Partial<Record<ActionId, string>>,
  globalHotkey?: string,
  options?: KeyboardShortcutOptions
) {
  const bindingsKey = JSON.stringify(bindings ?? null);
  const globalKey = globalHotkey ?? "";
  const bareKeysDisabled = options?.bareKeysDisabled ?? false;

  useEffect(() => {
    const overrides: Partial<Record<ActionId, string>> =
      (JSON.parse(bindingsKey) as Partial<Record<ActionId, string>> | null) ?? {};
    // Defaults come from the canonical registry via resolveInAppShortcuts;
    // this handler is the SINGLE OWNER of refreshAll (registry note), so a
    // rebind here cannot leave a second hardcoded handler behind.
    const merged = resolveInAppShortcuts(overrides);

    const handler = (e: KeyboardEvent) => {
      if (isShortcutCapturing()) return;
      // Escape handled by dialogs in App.tsx
      if (e.key === "Escape") return;

      // The global hotkey is owned by the backend; do not let in-app bindings
      // double-fire on the same chord.
      if (globalKey && matchesGlobalHotkey(e, globalKey, detectMac())) return;

      const match = (actionId: ActionId, run: () => void): boolean => {
        const binding = merged[actionId];
        // FR6: with bare-key navigation disabled, a bare J/K binding must
        // not fire at all — and must not swallow the keystroke either, so
        // it keeps whatever native meaning it has elsewhere.
        if (
          bareKeysDisabled &&
          (actionId === "navigateDown" || actionId === "navigateUp") &&
          binding &&
          !bindingUsesModifier(binding)
        ) {
          return false;
        }
        if (binding && matchesBinding(e, binding)) {
          // A chord only counts while nothing else is still down: `Ctrl` `z`
          // `~` is not `Ctrl+~`, but `Ctrl` `z` `z↑` `~` still is.
          //
          // Still swallow the keystroke: dropping the binding here must not
          // hand `Cmd+R`/`Cmd+W` back to the webview's native handling.
          e.preventDefault();
          if (bindingUsesModifier(binding) && hasOtherKeyHeld(e.code)) return true;
          run();
          return true;
        }
        return false;
      };

      // Checked before the text-field guard below: the palette is meant to be
      // summoned while typing (this is the only binding allowed to do so).
      if (match("commandPalette", () => handlers.onToggleCommandPalette?.()))
        return;

      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
        el.isContentEditable
      )
        return;

      if (match("addProject", handlers.onAddProject)) return;
      if (match("refreshAll", handlers.onRefreshAll)) return;
      if (
        match("focusSearch", () =>
          document.getElementById("global-search-input")?.focus()
        )
      )
        return;
      if (match("exportImport", handlers.onExportImport)) return;
      if (match("toggleSidebar", handlers.onToggleSidebar)) return;
      if (match("shortcutsHelp", () => handlers.onToggleShortcutsHelp?.())) return;
      if (match("quickDiff", () => handlers.onToggleQuickDiff?.())) return;

      if (match("toggleTerminal", () => handlers.onToggleTerminal?.())) return;

      // View modes, fetch-all, and Open Settings (Phase 2, FR3/FR10).
      // These used to live as hardcoded chords in App.tsx; they are now
      // rebindable actions owned here, with the same dirty-chord swallow
      // semantics as every other modifier binding in this table.
      if (match("viewCard", () => handlers.onViewModeChange?.("card"))) return;
      if (match("viewList", () => handlers.onViewModeChange?.("list"))) return;
      if (match("viewCompact", () => handlers.onViewModeChange?.("compact"))) return;
      if (match("viewTable", () => handlers.onViewModeChange?.("table"))) return;
      if (match("viewDashboard", () => handlers.onViewModeChange?.("dashboard"))) return;
      if (match("fetchAll", () => handlers.onFetchAll?.())) return;
      if (match("openSettings", () => handlers.onOpenSettings?.())) return;

      if (match("navigateDown", () => handlers.onNavigateDown?.())) return;
      if (match("navigateUp", () => handlers.onNavigateUp?.())) return;
      if (match("selectFocused", () => handlers.onSelectFocused?.())) return;

      // Space — refresh focused project (handled in App)
    };

    window.addEventListener("keydown", handler);
    const stopHeldKeyTracking = installHeldKeyTracking();
    return () => {
      window.removeEventListener("keydown", handler);
      stopHeldKeyTracking();
    };
  }, [
    handlers.onAddProject,
    handlers.onRefreshAll,
    handlers.onToggleSidebar,
    handlers.onExportImport,
    handlers.onToggleCommandPalette,
    handlers.onToggleShortcutsHelp,
    handlers.onNavigateUp,
    handlers.onNavigateDown,
    handlers.onSelectFocused,
    handlers.onToggleQuickDiff,
    handlers.onToggleTerminal,
    handlers.onViewModeChange,
    handlers.onFetchAll,
    handlers.onOpenSettings,
    bindingsKey,
    globalKey,
    bareKeysDisabled,
  ]);
}
