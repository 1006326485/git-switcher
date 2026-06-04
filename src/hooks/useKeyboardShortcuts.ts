import { useEffect } from "react";

interface Handlers {
  onAddProject: () => void;
  onRefreshAll: () => void;
  onToggleSidebar: () => void;
  onExportImport: () => void;
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

      if (isMeta && e.key === "n") {
        e.preventDefault();
        handlers.onAddProject();
      }
      if (isMeta && e.key === "r") {
        e.preventDefault();
        handlers.onRefreshAll();
      }
      if (isMeta && e.key === "f") {
        e.preventDefault();
        document.getElementById("global-search-input")?.focus();
      }
      if (isMeta && e.key === "e") {
        e.preventDefault();
        handlers.onExportImport();
      }
      if (isMeta && e.key === "b") {
        e.preventDefault();
        handlers.onToggleSidebar();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    handlers.onAddProject,
    handlers.onRefreshAll,
    handlers.onToggleSidebar,
    handlers.onExportImport,
  ]);
}
