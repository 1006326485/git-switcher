import { useEffect } from "react";

interface Handlers {
  onAddProject: () => void;
  onRefreshAll: () => void;
  onToggleSidebar: () => void;
  onExportImport: () => void;
  onToggleCommandPalette?: () => void;
  onOpenShortcutsHelp?: () => void;
  onNavigateUp?: () => void;
  onNavigateDown?: () => void;
  onSelectFocused?: () => void;
  onToggleQuickDiff?: () => void;
}

export function useKeyboardShortcuts(handlers: Handlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Escape handled by dialogs in App.tsx
      if (e.key === "Escape") return;

      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (
        ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) ||
        el.isContentEditable
      )
        return;

      // ── Meta shortcuts ─────────────────────────────────────────────

      // Cmd+N — add project
      if (isMeta && e.key === "n") {
        e.preventDefault();
        handlers.onAddProject();
        return;
      }

      // Cmd+R — refresh all
      if (isMeta && e.key === "r") {
        e.preventDefault();
        handlers.onRefreshAll();
        return;
      }

      // Cmd+F — focus search
      if (isMeta && e.key === "f") {
        e.preventDefault();
        document.getElementById("global-search-input")?.focus();
        return;
      }

      // Cmd+E — export/import
      if (isMeta && e.key === "e") {
        e.preventDefault();
        handlers.onExportImport();
        return;
      }

      // Cmd+B — toggle sidebar
      if (isMeta && e.key === "b") {
        e.preventDefault();
        handlers.onToggleSidebar();
        return;
      }

      // Cmd+K — toggle command palette
      if (isMeta && e.key === "k") {
        e.preventDefault();
        handlers.onToggleCommandPalette?.();
        return;
      }

      // Cmd+/ — toggle shortcuts help
      if (isMeta && e.key === "/") {
        e.preventDefault();
        handlers.onOpenShortcutsHelp?.();
        return;
      }

      // Cmd+D — quick diff overview
      if (isMeta && e.key === "d") {
        e.preventDefault();
        handlers.onToggleQuickDiff?.();
        return;
      }

      // ── Non-meta navigation shortcuts ──────────────────────────────

      // J — navigate down in project list
      if (e.key === "j") {
        e.preventDefault();
        handlers.onNavigateDown?.();
        return;
      }

      // K — navigate up in project list
      if (e.key === "k") {
        e.preventDefault();
        handlers.onNavigateUp?.();
        return;
      }

      // Enter — select/expand focused project
      if (e.key === "Enter") {
        e.preventDefault();
        handlers.onSelectFocused?.();
        return;
      }

      // Space — refresh focused project (handled in App)
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    handlers.onAddProject,
    handlers.onRefreshAll,
    handlers.onToggleSidebar,
    handlers.onExportImport,
    handlers.onToggleCommandPalette,
    handlers.onOpenShortcutsHelp,
    handlers.onNavigateUp,
    handlers.onNavigateDown,
    handlers.onSelectFocused,
    handlers.onToggleQuickDiff,
  ]);
}
