import { useState, useCallback, useEffect, useMemo } from "react";
import type { Command } from "../components/CommandPalette";
import type { ProjectDetail, Theme, ViewMode } from "../lib/types";
import type { RecentProject } from "./useRecentProjects";

export interface ProjectMatch {
  detail: ProjectDetail;
  statusColor: "green" | "yellow" | "red";
}

interface Actions {
  onAddProject: () => void;
  onRefreshAll: () => void;
  onToggleSidebar: () => void;
  onExportImport: () => void;
  onBulkImport: () => void;
  onSettings: () => void;
  onExportArchive: (projectPath: string) => void;
  onFetchAll: () => void;
  onPullAll: () => void;
  onPushAll: () => void;
  onQuickDiff: () => void;
  onThemeChange: (theme: Theme) => void;
  onViewModeChange: (mode: ViewMode) => void;
  currentTheme: Theme;
}

const QUICK_TAGS = [
  { label: "behind", description: "Projects behind remote" },
  { label: "changes", description: "Projects with modifications" },
  { label: "stale", description: "Inactive for 30+ days" },
];

function getProjectStatusColor(p: ProjectDetail): "green" | "yellow" | "red" {
  const s = p.status;
  if (s.modified > 0 || s.staged > 0 || s.untracked > 0) return "yellow";
  if (s.behind > 0) return "red";
  return "green";
}

function matchProject(p: ProjectDetail, query: string): boolean {
  const q = query.toLowerCase();
  const { project, current_branch } = p;
  return (
    project.name.toLowerCase().includes(q) ||
    (project.alias || "").toLowerCase().includes(q) ||
    project.path.toLowerCase().includes(q) ||
    current_branch.toLowerCase().includes(q)
  );
}

function filterByQuickTag(projects: ProjectDetail[], tag: string): ProjectDetail[] {
  const now = Date.now();
  switch (tag) {
    case "behind":
      return projects.filter((p) => p.status.behind > 0);
    case "changes":
      return projects.filter((p) => p.status.modified + p.status.staged + p.status.untracked > 0);
    case "stale":
      return projects.filter((p) => {
        if (!p.project.last_active_at) return true;
        const lastActive = new Date(p.project.last_active_at).getTime();
        return now - lastActive > 30 * 24 * 60 * 60 * 1000;
      });
    default:
      return [];
  }
}

export function useCommandPalette(
  actions: Actions,
  projects: ProjectDetail[],
  recent: RecentProject[],
  addRecent: (id: string, name: string, lastBranch: string) => void,
) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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

  // Global Cmd+Shift+F shortcut — open in content search mode
  const setOpenWithSearch = useCallback(() => {
    setQuery("/");
    setOpen(true);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setOpenWithSearch();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpenWithSearch]);

  const commands: Command[] = useMemo(
    () => [
      // Projects
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

      // Git
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
      {
        id: "push",
        label: "Push All",
        category: "Git",
        action: actions.onPushAll,
      },
      {
        id: "quick-diff",
        label: "Quick Diff Overview",
        category: "Git",
        shortcut: "⌘D",
        action: actions.onQuickDiff,
      },

      // View
      {
        id: "sidebar",
        label: "Toggle Sidebar",
        category: "View",
        shortcut: "⌘B",
        action: actions.onToggleSidebar,
      },
      {
        id: "view-card",
        label: "Card View",
        category: "View",
        shortcut: "⌘1",
        action: () => actions.onViewModeChange("card"),
      },
      {
        id: "view-list",
        label: "List View",
        category: "View",
        shortcut: "⌘2",
        action: () => actions.onViewModeChange("list"),
      },
      {
        id: "view-compact",
        label: "Compact View",
        category: "View",
        shortcut: "⌘3",
        action: () => actions.onViewModeChange("compact"),
      },
      {
        id: "view-table",
        label: "Table View",
        category: "View",
        shortcut: "⌘4",
        action: () => actions.onViewModeChange("table"),
      },
      {
        id: "view-dashboard",
        label: "Dashboard View",
        category: "View",
        shortcut: "⌘5",
        action: () => actions.onViewModeChange("dashboard"),
      },

      // Theme
      {
        id: "theme-light",
        label: "Light Theme",
        category: "Theme",
        action: () => actions.onThemeChange("light"),
      },
      {
        id: "theme-dark",
        label: "Dark Theme",
        category: "Theme",
        action: () => actions.onThemeChange("dark"),
      },
      {
        id: "theme-system",
        label: "System Theme",
        category: "Theme",
        action: () => actions.onThemeChange("system"),
      },

      // Data
      {
        id: "export",
        label: "Export/Import",
        category: "Data",
        shortcut: "⌘E",
        action: actions.onExportImport,
      },
      {
        id: "bulk-import",
        label: "Bulk Import",
        category: "Data",
        action: actions.onBulkImport,
      },

      // Archive
      {
        id: "export-archive",
        label: "Export Archive",
        category: "Archive",
        action: () => {},
        _needsProject: true,
        _projectAction: actions.onExportArchive,
      },

      // App
      {
        id: "settings",
        label: "Settings",
        category: "App",
        action: actions.onSettings,
      },
    ],
    [actions]
  );

  const matchedProjects: ProjectMatch[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const quickTag = QUICK_TAGS.find((t) => t.label === q);
    const matched = quickTag
      ? filterByQuickTag(projects, quickTag.label)
      : projects.filter((p) => matchProject(p, q));

    return matched.map((detail) => ({
      detail,
      statusColor: getProjectStatusColor(detail),
    }));
  }, [query, projects]);

  const recentProjects: ProjectMatch[] = useMemo(() => {
    if (query.trim()) return [];
    const projectMap = new Map(projects.map((p) => [p.project.id, p]));
    return recent
      .map((r) => projectMap.get(r.id))
      .filter((p): p is ProjectDetail => !!p)
      .map((detail) => ({
        detail,
        statusColor: getProjectStatusColor(detail),
      }));
  }, [query, projects, recent]);

  return { open, toggle, setOpen, setOpenWithSearch, commands, query, setQuery, matchedProjects, recentProjects, addRecent };
}
