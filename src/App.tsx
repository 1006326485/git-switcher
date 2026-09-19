import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { listen } from "@tauri-apps/api/event";
import { ScrollParentProvider } from "./hooks/useVirtualList";
import { Header } from "./components/Header";
import { ProjectGrid } from "./components/ProjectGrid";
import { ProjectGroupsPanel } from "./components/ProjectGroupsPanel";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { ToastContainer } from "./components/Toast";
import { ProjectProvider } from "./context/ProjectContext";

const AddProjectDialog = lazy(() => import("./components/AddProjectDialog"));
const BulkImportDialog = lazy(() => import("./components/BulkImportDialog"));
import { ConfirmDialog } from "./components/ConfirmDialog";
const ExportImportDialog = lazy(() => import("./components/ExportImportDialog"));
const ExportArchiveDialog = lazy(() => import("./components/ExportArchiveDialog"));
const SettingsDialog = lazy(() => import("./components/SettingsDialog"));
const ShortcutsHelp = lazy(() => import("./components/ShortcutsHelp"));
const QuickDiffPanel = lazy(() => import("./components/QuickDiffPanel"));
const CommandPalette = lazy(() => import("./components/CommandPalette"));
const TaskWorkspaceDialog = lazy(() => import("./components/TaskWorkspaceDialog").then((module) => ({ default: module.TaskWorkspaceDialog })));
import { useProjects } from "./hooks/useProjects";
import { useTheme } from "./hooks/useTheme";
import { useToast } from "./hooks/useToast";
import { useBatchOps } from "./hooks/useBatchOps";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useAutoRefresh } from "./hooks/useAutoRefresh";
import { useAppSettings } from "./hooks/useAppSettings";
import { useCommandPalette } from "./hooks/useCommandPalette";
import { useRecentProjects } from "./hooks/useRecentProjects";
import { useGitOpTracker } from "./hooks/useGitOpTracker";
import type { ProjectDetail, ViewMode, SortOption } from "./lib/types";
import type { DashboardFilter } from "./components/DashboardView";
import { listProjectsInGroup, gitFetch, gitPull, gitPush, gitStash, gitAutoFetchAll, getSettings, onDragDropEnter, onDragDropLeave, onDragDropResult, logOperation } from "./lib/tauri";
import { scrimAnimation } from "./components/ui/primitives";
import { useScrollEdge } from "./hooks/useScrollEdge";

export default function App() {
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showSidebar, setShowSidebar] = useState(() => localStorage.getItem("showSidebar") === "true");
  const [activeGroup, setActiveGroup] = useState<string | null>(() => localStorage.getItem("activeGroup"));
  const [sortBy, setSortBy] = useState<SortOption>("custom");
  const [groupProjects, setGroupProjects] = useState<ProjectDetail[]>([]);
  const [exportImportOpen, setExportImportOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [taskWorkspacesOpen, setTaskWorkspacesOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [quickDiffOpen, setQuickDiffOpen] = useState(false);
  const [exportArchiveOpen, setExportArchiveOpen] = useState(false);
  const [exportArchivePath, setExportArchivePath] = useState("");
  const scrollParentRef = useRef<HTMLElement>(null);
  const mainScrolled = useScrollEdge(scrollParentRef);
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerHeight, setHeaderHeight] = useState(52);

  // Content scrolls *underneath* the material header (chrome-overlay
  // layout): the header floats above the scroll area, and main's top
  // padding tracks the header's live height so nothing starts hidden.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const update = () => setHeaderHeight(el.getBoundingClientRect().height);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);
  const [focusIndex, setFocusIndex] = useState(-1);
  const [dragOver, setDragOver] = useState(false);

  // Keep the persistent sidebar from consuming the entire narrow viewport. It
  // remains available through the header toggle as an overlay drawer.
  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const closePersistentSidebar = () => {
      if (mediaQuery.matches) setShowSidebar(false);
    };
    closePersistentSidebar();
    mediaQuery.addEventListener("change", closePersistentSidebar);
    return () => mediaQuery.removeEventListener("change", closePersistentSidebar);
  }, []);

  const {
    projects,
    loading,
    projectsVersion,
    addProject,
    removeProject,
    importWorkspace,
    initProject,
    switchBranch,
    refreshProject,
    refreshAll,
    updateAlias,
    setProjectColorLocally,
    reorderProjects,
  } = useProjects(toast, activeGroup);

  const { batchLoading, batchProgress, fetchAll, pullAll, pushAll, pullBehind, pushAhead, syncAll } = useBatchOps(toast, refreshAll, activeGroup);

  const { viewMode, setViewMode, settingsVersion, notifySettingsChanged, accentColor, setAccentColor } = useAppSettings(
    useCallback((msg: string) => toastRef.current.error(msg), [])
  );

  useAutoRefresh(refreshAll, useCallback((msg: string) => toastRef.current.error(msg), []), settingsVersion);

  // ── Background refresh & tray events ────────────────────────────────
  useEffect(() => {
    const unlistenRefresh = listen("background-refresh-done", () => {
      if (!document.hidden) {
        refreshAll();
      }
    });
    const unlistenTrayRefresh = listen("request-refresh-all", () => {
      refreshAll();
    });
    const unlistenHidden = listen("window-hidden-to-tray", () => {
      if (!localStorage.getItem("tray-hint-shown")) {
        toastRef.current.info("App running in background");
        localStorage.setItem("tray-hint-shown", "1");
      }
    });
    return () => {
      unlistenRefresh.then((f) => f());
      unlistenTrayRefresh.then((f) => f());
      unlistenHidden.then((f) => f());
    };
  }, [refreshAll]);

  // ── Drag & drop import ───────────────────────────────────────────────
  useEffect(() => {
    const unlistenFns: (() => void)[] = [];

    onDragDropEnter(() => {
      setDragOver(true);
    }).then((f) => unlistenFns.push(f));

    onDragDropLeave(() => {
      setDragOver(false);
    }).then((f) => unlistenFns.push(f));

    onDragDropResult((result) => {
      setDragOver(false);
      for (const p of result.imported) {
        toastRef.current.success(`Imported "${p.project.name}"`);
      }
      if (result.skipped > 0) {
        toastRef.current.info(`${result.skipped} project(s) already added`);
      }
      for (const err of result.errors) {
        toastRef.current.error(err);
      }
      if (result.imported.length > 0) {
        refreshAll();
      }
    }).then((f) => unlistenFns.push(f));

    return () => {
      unlistenFns.forEach((f) => f());
    };
  }, [refreshAll]);

  const { cancelOp, isOpActive, getActiveOp, getAnyActiveOp } = useGitOpTracker();

  // ── Auto-fetch on launch ─────────────────────────────────────────────
  const autoFetchDoneRef = useRef(false);
  useEffect(() => {
    if (loading || projects.length === 0 || autoFetchDoneRef.current) return;
    autoFetchDoneRef.current = true;

    getSettings()
      .then((s) => {
        if (!s.auto_fetch_on_launch) return;
        gitAutoFetchAll().then(() => {
          refreshAll();
        }).catch(() => {});
      })
      .catch(() => {});
  }, [loading, projects.length, refreshAll]);

  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  // Compute status stats for batch toolbar and attention badge
  const { behindCount, aheadCount, needsAttention } = useMemo(() => {
    let behind = 0, ahead = 0, attention = 0;
    for (const p of projects) {
      if (p.status.behind > 0) behind++;
      if (p.status.ahead > 0) ahead++;
      if (p.status.behind > 0 || p.status.modified + p.status.staged + p.status.untracked > 0) attention++;
    }
    return { behindCount: behind, aheadCount: ahead, needsAttention: attention };
  }, [projects]);

  const filterCounts = useMemo(() => {
    let changed = 0, behind = 0, ahead = 0, stale = 0;
    const staleThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const p of projects) {
      if (p.status.modified + p.status.staged + p.status.untracked > 0) changed++;
      if (p.status.behind > 0) behind++;
      if (p.status.ahead > 0) ahead++;
      if (!p.project.last_active_at || new Date(p.project.last_active_at).getTime() < staleThreshold) stale++;
    }
    return { all: projects.length, changed, behind, ahead, stale };
  }, [projects]);

  // Load group projects when active group changes
  useEffect(() => {
    let cancelled = false;
    if (activeGroup) {
      listProjectsInGroup(activeGroup).then((data) => {
        if (!cancelled) setGroupProjects(data);
      }).catch((e) => {
        if (!cancelled) toastRef.current.error(`Failed to load group projects: ${e}`);
      });
    } else {
      setGroupProjects([]);
    }
    return () => { cancelled = true; };
  }, [activeGroup, projectsVersion]);

  // Filter projects by active filter, search query, and group
  const filteredProjects = useMemo(() => {
    const staleThreshold = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let source = activeGroup ? groupProjects : projects;

    if (activeFilter === "changed") {
      source = source.filter((p) => p.status.modified + p.status.staged + p.status.untracked > 0);
    } else if (activeFilter === "behind") {
      source = source.filter((p) => p.status.behind > 0);
    } else if (activeFilter === "ahead") {
      source = source.filter((p) => p.status.ahead > 0);
    } else if (activeFilter === "stale") {
      source = source.filter((p) => !p.project.last_active_at || new Date(p.project.last_active_at).getTime() < staleThreshold);
    }

    if (!searchQuery.trim()) return source;
    const q = searchQuery.toLowerCase();
    return source.filter(
      (p) =>
        p.project.name.toLowerCase().includes(q) ||
        (p.project.alias || "").toLowerCase().includes(q) ||
        p.project.path.toLowerCase().includes(q) ||
        p.current_branch.toLowerCase().includes(q)
    );
  }, [projects, groupProjects, activeGroup, activeFilter, searchQuery]);

  const collator = useMemo(() => new Intl.Collator(undefined, { sensitivity: "base", numeric: true }), []);

  const sortedProjects = useMemo(() => {
    if (sortBy === "custom") return filteredProjects;
    const copy = [...filteredProjects];
    switch (sortBy) {
      case "name-asc":
        copy.sort((a, b) => collator.compare(a.project.name, b.project.name));
        break;
      case "name-desc":
        copy.sort((a, b) => collator.compare(b.project.name, a.project.name));
        break;
      case "modified":
        copy.sort((a, b) => {
          const ta = a.project.last_active_at ? new Date(a.project.last_active_at).getTime() : 0;
          const tb = b.project.last_active_at ? new Date(b.project.last_active_at).getTime() : 0;
          return tb - ta;
        });
        break;
      case "changes":
        copy.sort((a, b) => {
          const ca = a.status.modified + a.status.staged + a.status.untracked;
          const cb = b.status.modified + b.status.staged + b.status.untracked;
          return cb - ca;
        });
        break;
      case "branch":
        copy.sort((a, b) => collator.compare(a.current_branch, b.current_branch));
        break;
    }
    return copy;
  }, [filteredProjects, sortBy, collator]);

  const handleRemoveRequest = useCallback(async (id: string) => {
    const project = projectsRef.current.find((p) => p.project.id === id);
    if (project) {
      if (localStorage.getItem("skip-remove-confirm") === "skip") {
        try {
          await removeProject(id);
          toastRef.current.success(`Removed "${project.project.name}"`);
        } catch (e) {
          toastRef.current.error(`Failed to remove: ${e}`);
        }
      } else {
        setConfirmDelete({ id, name: project.project.name });
      }
    }
  }, [removeProject]);

  const confirmDeleteRef = useRef(confirmDelete);
  confirmDeleteRef.current = confirmDelete;

  const handleConfirmDelete = useCallback(async () => {
    const item = confirmDeleteRef.current;
    if (!item) return;
    try {
      await removeProject(item.id);
      toastRef.current.success(`Removed "${item.name}"`);
    } catch (e) {
      toastRef.current.error(`Failed to remove: ${e}`);
    }
    setConfirmDelete(null);
  }, [removeProject]);

  const handleAddProject = useCallback(() => setDialogOpen(true), []);
  const handleToggleSidebar = useCallback(() => setShowSidebar((s) => {
    localStorage.setItem("showSidebar", String(!s));
    return !s;
  }), []);
  const handleGroupChange = useCallback((groupId: string | null) => {
    setActiveGroup(groupId);
    if (groupId) {
      localStorage.setItem("activeGroup", groupId);
    } else {
      localStorage.removeItem("activeGroup");
    }
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setShowSidebar(false);
    }
  }, []);
  const handleOpenExportImport = useCallback(() => setExportImportOpen(true), []);
  const handleOpenBulkImport = useCallback(() => setBulkImportOpen(true), []);
  const handleCloseBulkImport = useCallback(() => setBulkImportOpen(false), []);
  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);
  const handleCloseDialog = useCallback(() => setDialogOpen(false), []);
  const handleCloseExportImport = useCallback(() => setExportImportOpen(false), []);
  const handleCloseSettings = useCallback(() => {
    setSettingsOpen(false);
    notifySettingsChanged();
  }, [notifySettingsChanged]);
  const handleOpenShortcutsHelp = useCallback(() => setShortcutsHelpOpen(true), []);
  const handleOpenQuickDiff = useCallback(() => setQuickDiffOpen(true), []);
  const handleCloseQuickDiff = useCallback(() => setQuickDiffOpen(false), []);
  const handleOpenExportArchive = useCallback((path: string) => {
    setExportArchivePath(path);
    setExportArchiveOpen(true);
  }, []);
  const handleCloseExportArchive = useCallback(() => {
    setExportArchiveOpen(false);
    setExportArchivePath("");
  }, []);
  const handleFilterChange = useCallback((filter: string) => setActiveFilter(filter), []);
  const handleDashboardDrillDown = useCallback((filter: DashboardFilter) => {
    setActiveFilter(filter);
    setViewMode("list");
  }, [setViewMode]);
  const handleCancelDelete = useCallback(() => setConfirmDelete(null), []);

  const scrollToProject = useCallback((id: string) => {
    const el = document.querySelector(`[data-project-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("project-pulse");
    setTimeout(() => el.classList.remove("project-pulse"), 1500);
    const toggleBtn = el.querySelector('button[aria-expanded]') as HTMLButtonElement | null;
    if (toggleBtn && toggleBtn.getAttribute("aria-expanded") === "false") {
      toggleBtn.click();
    }
  }, []);

  const { recent: recentProjectsList, addRecent } = useRecentProjects();

  const { open: paletteOpen, toggle: togglePalette, setOpen: setPaletteOpen, commands: paletteCommands, query: paletteQuery, setQuery: setPaletteQuery, matchedProjects, recentProjects } = useCommandPalette(
    {
      onAddProject: handleAddProject,
      onRefreshAll: refreshAll,
      onToggleSidebar: handleToggleSidebar,
      onExportImport: handleOpenExportImport,
      onBulkImport: handleOpenBulkImport,
      onSettings: handleOpenSettings,
      onExportArchive: handleOpenExportArchive,
      onFetchAll: fetchAll,
      onPullAll: pullAll,
      onPushAll: pushAll,
      onQuickDiff: handleOpenQuickDiff,
      onThemeChange: setTheme,
      onViewModeChange: setViewMode,
      currentTheme: theme,
    },
    projects,
    recentProjectsList,
    addRecent,
  );

  const handleAttentionClick = useCallback(() => {
    setPaletteQuery("behind");
    setPaletteOpen(true);
  }, [setPaletteOpen, setPaletteQuery]);

  const handleReorder = useCallback(async (orderedIds: string[]) => {
    try {
      await reorderProjects(orderedIds);
    } catch {
      // Error already handled in useProjects
    }
  }, [reorderProjects]);

  const handleFetchProject = useCallback(async (path: string) => {
    try {
      await gitFetch(path);
      await refreshProject(path);
      logOperation("fetch", path, undefined, undefined, "success").catch(() => {});
      toastRef.current.success("Fetch completed");
    } catch (e) {
      logOperation("fetch", path, undefined, undefined, "error", String(e)).catch(() => {});
      toastRef.current.error(`Fetch failed: ${e}`, undefined, e, path);
    }
  }, [refreshProject]);

  const handlePullProject = useCallback(async (path: string) => {
    try {
      await gitPull(path);
      await refreshProject(path);
      logOperation("pull", path, undefined, undefined, "success").catch(() => {});
      toastRef.current.success("Pull completed");
    } catch (e) {
      logOperation("pull", path, undefined, undefined, "error", String(e)).catch(() => {});
      toastRef.current.error(`Pull failed: ${e}`, undefined, e, path);
    }
  }, [refreshProject]);

  const handlePushProject = useCallback(async (path: string) => {
    try {
      await gitPush(path);
      await refreshProject(path);
      logOperation("push", path, undefined, undefined, "success").catch(() => {});
      toastRef.current.success("Push completed");
    } catch (e) {
      logOperation("push", path, undefined, undefined, "error", String(e)).catch(() => {});
      toastRef.current.error(`Push failed: ${e}`, undefined, e, path);
    }
  }, [refreshProject]);

  const handleToastAction = useCallback(async (actionType: string, path?: string) => {
    if (!path) return;
    try {
      switch (actionType) {
        case "pull":
          await gitPull(path);
          await refreshProject(path);
          toastRef.current.success("Pull completed");
          break;
        case "fetch":
          await gitFetch(path);
          await refreshProject(path);
          toastRef.current.success("Fetch completed");
          break;
        case "stash":
          await gitStash(path);
          await refreshProject(path);
          toastRef.current.success("Changes stashed");
          break;
        case "abort_merge":
          toastRef.current.info("Use 'git merge --abort' in terminal to abort the merge");
          break;
        default:
          break;
      }
    } catch (e) {
      toastRef.current.error(`Action failed: ${e}`);
    }
  }, [refreshProject]);

  // Keyboard shortcuts — Escape stays here (closes multiple dialogs)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      // View mode shortcuts: Ctrl/Cmd+1 through Ctrl/Cmd+5
      if (e.ctrlKey || e.metaKey) {
        const viewModes: ViewMode[] = ["card", "list", "compact", "table", "dashboard"];
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 5) {
          e.preventDefault();
          setViewMode(viewModes[num - 1]);
          return;
        }

        // Cmd+/ — toggle keyboard shortcuts help
        if (e.key === "/" ) {
          e.preventDefault();
          setShortcutsHelpOpen((v) => !v);
          return;
        }

        // Cmd+D — quick diff overview
        if (e.key === "d" ) {
          e.preventDefault();
          setQuickDiffOpen((v) => !v);
          return;
        }

        // Cmd+R — refresh all projects
        if (e.key === "r" && !e.shiftKey) {
          e.preventDefault();
          refreshAll();
          return;
        }

        // Cmd+Shift+G — fetch all projects
        if (e.shiftKey && e.key === "G") {
          e.preventDefault();
          fetchAll();
          return;
        }
      }

      if (e.key === "Escape") {
        setDialogOpen(false);
        setConfirmDelete(null);
        setExportImportOpen(false);
        setBulkImportOpen(false);
        setSettingsOpen(false);
        setPaletteOpen(false);
        setShortcutsHelpOpen(false);
        setQuickDiffOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setViewMode, refreshAll, fetchAll]);

  // Project keyboard navigation (↑/↓/Enter/Space)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable) return;
      // Skip if any dialog or palette is open
      if (paletteOpen || dialogOpen || settingsOpen || exportImportOpen || confirmDelete) return;

      const count = sortedProjects.length;
      if (count === 0) return;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(i + 1, count - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && focusIndex >= 0 && focusIndex < count) {
        e.preventDefault();
        const projectEl = document.querySelector(`[data-project-index="${focusIndex}"]`);
        if (projectEl) {
          const toggleBtn = projectEl.querySelector('button[aria-expanded]') as HTMLButtonElement | null;
          toggleBtn?.click();
        }
      } else if (e.key === " " && focusIndex >= 0 && focusIndex < count) {
        e.preventDefault();
        const project = sortedProjects[focusIndex];
        if (project) refreshProject(project.project.path);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paletteOpen, dialogOpen, settingsOpen, exportImportOpen, confirmDelete, sortedProjects, focusIndex, refreshProject]);

  // Scroll focused project into view
  useEffect(() => {
    if (focusIndex < 0) return;
    const el = document.querySelector(`[data-project-index="${focusIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusIndex]);

  useKeyboardShortcuts({
    onAddProject: handleAddProject,
    onRefreshAll: refreshAll,
    onToggleSidebar: handleToggleSidebar,
    onExportImport: handleOpenExportImport,
    onToggleCommandPalette: togglePalette,
    onOpenShortcutsHelp: handleOpenShortcutsHelp,
    onToggleQuickDiff: handleOpenQuickDiff,
  });

  const projectActions = useMemo(
    () => ({
      onSwitchBranch: switchBranch,
      onRefresh: refreshProject,
      onRemove: handleRemoveRequest,
      onSuccess: toast.success,
      onError: (msg: string, rawError?: unknown, path?: string) => toast.error(msg, undefined, rawError, path),
      onInfo: toast.info,
      onReorder: handleReorder,
      onAliasChange: updateAlias,
      onColorChange: setProjectColorLocally,
      isOpActive,
      getActiveOp,
      getAnyActiveOp,
      cancelOp,
      onFetch: handleFetchProject,
      onPull: handlePullProject,
      onPush: handlePushProject,
    }),
    [switchBranch, refreshProject, handleRemoveRequest, toast, handleReorder, updateAlias, setProjectColorLocally, isOpActive, getActiveOp, getAnyActiveOp, cancelOp, handleFetchProject, handlePullProject, handlePushProject]
  );

  return (
    <div className="app-root h-screen min-w-0 bg-[var(--surface-0)] flex flex-col">
      {/* Title bar — draggable, spans full width above sidebar */}
      <div
        data-tauri-drag-region
        role="presentation"
        className="app-titlebar h-8 pl-20 select-none shrink-0"
      />

      {/* Drag & drop overlay */}
      {dragOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--accent)]/10 backdrop-blur-sm pointer-events-none">
          <div className="flex max-w-[calc(100vw-2rem)] flex-col items-center gap-3 px-6 py-6 text-center sm:px-12 sm:py-8 rounded-2xl border-2 border-dashed border-[var(--accent)] bg-[var(--surface-1)]/90 shadow-2xl">
            <svg className="w-10 h-10 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
            </svg>
            <span className="text-base font-medium text-[var(--text-1)]">Drop folders to import</span>
            <span className="text-xs text-[var(--text-2)]">Git repositories will be detected automatically</span>
          </div>
        </div>
      )}

      <ProjectProvider value={projectActions}>
        <div className="flex flex-1 min-w-0 overflow-hidden">
          {/* Sidebar: docked on wide windows, drawer on narrow windows. */}
          {showSidebar && (
            <>
              <button
                type="button"
                className={`fixed inset-0 top-8 z-30 bg-black/30 lg:hidden ${scrimAnimation}`}
                aria-label="Close sidebar"
                onClick={handleToggleSidebar}
              />
              <aside className="material-heavy fixed inset-y-0 left-0 top-8 z-40 w-72 max-w-[85vw] overflow-y-auto p-4 shadow-2xl animate-[drawerIn_280ms_var(--ease-spring)] lg:relative lg:top-auto lg:z-auto lg:w-56 lg:max-w-none lg:shrink-0 lg:shadow-none lg:animate-none">
                {/* Material depth edge — replaces a hard border-r */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-y-0 right-0 hidden w-8 bg-gradient-to-r from-transparent to-black/5 dark:to-white/5 lg:block"
                />
                <ProjectGroupsPanel
                  activeGroup={activeGroup}
                  onGroupChange={handleGroupChange}
                  onSuccess={toast.success}
                  onError={toast.error}
                />
              </aside>
            </>
          )}

        {/* Main area: toolbar + content */}
        <div
          className="relative flex-1 min-w-0 flex flex-col overflow-hidden"
          style={{ "--header-h": `${headerHeight}px` } as React.CSSProperties}
        >
          {/* Floating material header — content scrolls beneath it */}
          <div ref={headerRef} className="absolute inset-x-0 top-0 z-20">
            <Header
            projectCount={sortedProjects.length}
            totalCount={projects.length}
            theme={theme}
            viewMode={viewMode}
            searchQuery={searchQuery}
            activeFilter={activeFilter}
            filterCounts={filterCounts}
            sortBy={sortBy}
            onSearchChange={setSearchQuery}
            onFilterChange={handleFilterChange}
            onThemeChange={setTheme}
            onViewModeChange={setViewMode}
            onSortChange={setSortBy}
            onAddProject={handleAddProject}
            onToggleSidebar={handleToggleSidebar}
            onExportImport={handleOpenExportImport}
            onBulkImport={handleOpenBulkImport}
            onSettings={handleOpenSettings}
            onTaskWorkspaces={() => setTaskWorkspacesOpen(true)}
            onToggleCommandPalette={togglePalette}
            batchLoading={batchLoading}
            batchProgress={batchProgress}
            onFetchAll={fetchAll}
            onPullAll={pullAll}
            onPushAll={pushAll}
            onPullBehind={pullBehind}
            onPushAhead={pushAhead}
            onSyncAll={syncAll}
            behindCount={behindCount}
            aheadCount={aheadCount}
            needsAttention={needsAttention}
            onAttentionClick={handleAttentionClick}
            onOpenShortcutsHelp={handleOpenShortcutsHelp}
            elevated={mainScrolled}
          />
          </div>

          {/* Main content */}
          <main
            ref={scrollParentRef}
            style={{ paddingTop: "calc(var(--header-h, 3.25rem) + 0.75rem)" }}
            className="flex-1 min-w-0 overflow-y-auto bg-[var(--surface-0)] px-3 pb-3 sm:px-4 sm:pb-4 lg:px-6 lg:pb-6"
          >
            <ErrorBoundary>
              <ScrollParentProvider value={scrollParentRef}>
                <ProjectGrid
                  projects={sortedProjects}
                  loading={loading}
                  viewMode={viewMode}
                  isFiltered={searchQuery.trim().length > 0 || activeFilter !== "all" || activeGroup !== null}
                  sortBy={sortBy}
                  onSortChange={setSortBy}
                  onAddProject={handleAddProject}
                  onBulkImport={handleOpenBulkImport}
                  onDashboardDrillDown={handleDashboardDrillDown}
                  onReorder={!searchQuery.trim() && !activeGroup && sortBy === "custom" ? handleReorder : undefined}
                  focusedIndex={focusIndex}
                />
              </ScrollParentProvider>
            </ErrorBoundary>
          </main>
        </div>
        </div>
      </ProjectProvider>

      <Suspense fallback={null}>
        <AddProjectDialog
          open={dialogOpen}
          onClose={handleCloseDialog}
          onAddProject={addProject}
          onImportWorkspace={importWorkspace}
          onInitProject={initProject}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ConfirmDialog
          open={confirmDelete !== null}
          title="Remove Project"
          skipKey="skip-remove-confirm"
          message={
            <>
              Are you sure you want to remove{" "}
              <span className="font-semibold text-(--accent)">{confirmDelete?.name}</span>
              ? This only removes it from the app, not from disk.
            </>
          }
          confirmLabel="Remove"
          onConfirm={handleConfirmDelete}
          onCancel={handleCancelDelete}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ExportImportDialog
          open={exportImportOpen}
          onClose={handleCloseExportImport}
          onSuccess={toast.success}
          onError={(msg: string, rawError?: unknown) => toast.error(msg, undefined, rawError)}
          onImportDone={refreshAll}
          activeGroup={activeGroup}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ExportArchiveDialog
          open={exportArchiveOpen}
          onClose={handleCloseExportArchive}
          repoPath={exportArchivePath}
          onSuccess={toast.success}
          onError={(msg: string, rawError?: unknown) => toast.error(msg, undefined, rawError)}
        />
      </Suspense>

      <Suspense fallback={null}>
        <BulkImportDialog
          open={bulkImportOpen}
          onClose={handleCloseBulkImport}
          onSuccess={toast.success}
          onError={(msg: string, rawError?: unknown) => toast.error(msg, undefined, rawError)}
          onImportDone={refreshAll}
          activeGroup={activeGroup}
        />
      </Suspense>

      <Suspense fallback={null}>
        <TaskWorkspaceDialog
          open={taskWorkspacesOpen}
          projects={projects}
          onClose={() => setTaskWorkspacesOpen(false)}
          onSuccess={toast.success}
          onError={(msg: string, rawError?: unknown) => toast.error(msg, undefined, rawError)}
        />
      </Suspense>

      <Suspense fallback={null}>
        <SettingsDialog
          open={settingsOpen}
          onClose={handleCloseSettings}
          onSuccess={toast.success}
          onError={(msg: string, rawError?: unknown) => toast.error(msg, undefined, rawError)}
          accentColor={accentColor}
          onAccentChange={setAccentColor}
        />
      </Suspense>

      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} onPause={toast.pauseToast} onResume={toast.resumeToast} onAction={handleToastAction} />

      <Suspense fallback={null}>
        <ShortcutsHelp
          open={shortcutsHelpOpen}
          onClose={() => setShortcutsHelpOpen(false)}
        />
      </Suspense>

      <Suspense fallback={null}>
        <QuickDiffPanel
          open={quickDiffOpen}
          onClose={handleCloseQuickDiff}
        />
      </Suspense>

      <Suspense fallback={null}>
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          commands={paletteCommands}
          matchedProjects={matchedProjects}
          recentProjects={recentProjects}
          query={paletteQuery}
          onQueryChange={setPaletteQuery}
          onScrollToProject={scrollToProject}
          onAddRecent={addRecent}
        />
      </Suspense>
    </div>
  );
}
