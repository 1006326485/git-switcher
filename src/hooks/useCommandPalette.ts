import { useState, useCallback, useEffect, useMemo } from "react";
import type { Command } from "../components/CommandPalette";

interface Actions {
  onAddProject: () => void;
  onRefreshAll: () => void;
  onToggleSidebar: () => void;
  onExportImport: () => void;
  onSettings: () => void;
  onFetchAll: () => void;
  onPullAll: () => void;
}

export function useCommandPalette(actions: Actions) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  // Global Cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const commands: Command[] = useMemo(
    () => [
      {
        id: "add",
        label: "Add Project",
        category: "Projects",
        shortcut: "⌘N",
        action: actions.onAddProject,
      },
      {
        id: "refresh",
        label: "Refresh All",
        category: "Projects",
        shortcut: "⌘R",
        action: actions.onRefreshAll,
      },
      {
        id: "sidebar",
        label: "Toggle Sidebar",
        category: "View",
        shortcut: "⌘B",
        action: actions.onToggleSidebar,
      },
      {
        id: "export",
        label: "Export/Import",
        category: "Data",
        shortcut: "⌘E",
        action: actions.onExportImport,
      },
      {
        id: "settings",
        label: "Settings",
        category: "App",
        action: actions.onSettings,
      },
      {
        id: "fetch",
        label: "Fetch All",
        category: "Git",
        action: actions.onFetchAll,
      },
      {
        id: "pull",
        label: "Pull All",
        category: "Git",
        action: actions.onPullAll,
      },
    ],
    [actions]
  );

  return { open, toggle, setOpen, commands };
}
