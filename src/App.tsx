import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Header } from "./components/Header";
import { ProjectGrid } from "./components/ProjectGrid";
import { ProjectGroupsPanel } from "./components/ProjectGroupsPanel";
import { AddProjectDialog } from "./components/AddProjectDialog";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ExportImportDialog } from "./components/ExportImportDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { ToastContainer } from "./components/Toast";
import { ProjectProvider } from "./context/ProjectContext";
import { useProjects } from "./hooks/useProjects";
import { useTheme } from "./hooks/useTheme";
import { useToast } from "./hooks/useToast";
import { useBatchOps } from "./hooks/useBatchOps";
import type { ProjectDetail, ViewMode, GitOpEvent } from "./lib/types";
import { getSettings, updateSettings, listProjectsInGroup } from "./lib/tauri";
import { listen } from "@tauri-apps/api/event";

export default function App() {
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewModeState] = useState<ViewMode>("card");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [groupProjects, setGroupProjects] = useState<ProjectDetail[]>([]);
  const [exportImportOpen, setExportImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
  } = useProjects(toast, activeGroup);

  const { batchLoading, fetchAll, pullAll } = useBatchOps(toast, refreshAll, activeGroup);

  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  const busyOpsRef = useRef(0);

  // Track active git operations to skip auto-refresh during busy periods
  useEffect(() => {
    const unlistenStart = listen<GitOpEvent>("git-op-start", () => {
      busyOpsRef.current++;
    });
    const unlistenDone = listen<GitOpEvent>("git-op-done", () => {
      busyOpsRef.current = Math.max(0, busyOpsRef.current - 1);
    });
    const unlistenError = listen<GitOpEvent>("git-op-error", () => {
      busyOpsRef.current = Math.max(0, busyOpsRef.current - 1);
    });
    return () => {
      unlistenStart.then((fn) => fn()).catch(() => {});
      unlistenDone.then((fn) => fn()).catch(() => {});
      unlistenError.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // Load settings once: view mode + auto-refresh (pauses when window hidden)
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let onVisibility: (() => void) | null = null;

    getSettings().then((s) => {
      if (cancelled) return;
      setViewModeState(s.view_mode);
      if (s.auto_refresh && s.refresh_interval_secs > 0) {
        const ms = s.refresh_interval_secs * 1000;
        const startTimer = () => {
          timer = setInterval(() => {
            if (!document.hidden && busyOpsRef.current === 0) refreshAll();
          }, ms);
        };
        startTimer();
        onVisibility = () => {
          if (document.hidden) {
            if (timer) { clearInterval(timer); timer = null; }
          } else {
            if (!timer) startTimer();
          }
        };
        document.addEventListener("visibilitychange", onVisibility);
      }
    }).catch((e) => toastRef.current.error(`Failed to load settings: ${e}`));

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (onVisibility) document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshAll]);

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

  const committedViewMode = useRef(viewMode);
  const setViewMode = useCallback(async (mode: ViewMode) => {
    const prev = committedViewMode.current;
    setViewModeState(mode);
    try {
      const settings = await getSettings();
      await updateSettings({ ...settings, view_mode: mode });
      committedViewMode.current = mode;
    } catch (e) {
      setViewModeState(prev);
      toastRef.current.error(`Failed to save view mode: ${e}`);
    }
  }, []);

  // Filter projects by search query and group
  const filteredProjects = useMemo(() => {
    const source = activeGroup ? groupProjects : projects;
    if (!searchQuery.trim()) return source;
    const q = searchQuery.toLowerCase();
    return source.filter(
      (p) =>
        p.project.name.toLowerCase().includes(q) ||
        (p.project.alias || "").toLowerCase().includes(q) ||
        p.project.path.toLowerCase().includes(q) ||
        p.current_branch.toLowerCase().includes(q)
    );
  }, [projects, groupProjects, activeGroup, searchQuery]);

  const handleRemoveRequest = useCallback(async (id: string) => {
    const project = projectsRef.current.find((p) => p.project.id === id);
    if (project) {
      setConfirmDelete({ id, name: project.project.name });
    }
  }, []);

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
  const handleToggleSidebar = useCallback(() => setShowSidebar((s) => !s), []);
  const handleOpenExportImport = useCallback(() => setExportImportOpen(true), []);
  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);
  const handleCloseDialog = useCallback(() => setDialogOpen(false), []);
  const handleCloseExportImport = useCallback(() => setExportImportOpen(false), []);
  const handleCloseSettings = useCallback(() => setSettingsOpen(false), []);
  const handleCancelDelete = useCallback(() => setConfirmDelete(null), []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // Escape always works — close topmost dialog
      if (e.key === "Escape") {
        setDialogOpen(false);
        setConfirmDelete(null);
        setExportImportOpen(false);
        return;
      }

      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      const tag = el.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;

      // Skip meta shortcuts when user is typing in an input
      if (isInput) return;

      // Cmd+N: Add project
      if (isMeta && e.key === "n") {
        e.preventDefault();
        setDialogOpen(true);
      }
      // Cmd+R: Refresh all
      if (isMeta && e.key === "r") {
        e.preventDefault();
        refreshAll();
      }
      // Cmd+F: Focus search
      if (isMeta && e.key === "f") {
        e.preventDefault();
        document.getElementById("global-search-input")?.focus();
      }
      // Cmd+E: Export/Import
      if (isMeta && e.key === "e") {
        e.preventDefault();
        setExportImportOpen(true);
      }
      // Cmd+B: Toggle sidebar
      if (isMeta && e.key === "b") {
        e.preventDefault();
        setShowSidebar((s) => !s);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refreshAll]);

  const projectActions = useMemo(
    () => ({
      onSwitchBranch: switchBranch,
      onRefresh: refreshProject,
      onRemove: handleRemoveRequest,
      onSuccess: toast.success,
      onError: toast.error,
      onInfo: toast.info,
    }),
    [switchBranch, refreshProject, handleRemoveRequest, toast]
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      {/* Title bar — draggable, spans full width above sidebar */}
      <div
        data-tauri-drag-region
        role="presentation"
        className="h-6 bg-white dark:bg-gray-900 pl-20 select-none shrink-0"
      />

      <ProjectProvider value={projectActions}>
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          {showSidebar && (
            <aside className="w-56 shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4 overflow-y-auto">
              <ProjectGroupsPanel
                activeGroup={activeGroup}
                onGroupChange={setActiveGroup}
                onSuccess={toast.success}
                onError={toast.error}
              />
            </aside>
          )}

          {/* Main area: toolbar + content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header
              projectCount={filteredProjects.length}
              totalCount={projects.length}
              theme={theme}
              viewMode={viewMode}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onThemeChange={setTheme}
              onViewModeChange={setViewMode}
              onAddProject={handleAddProject}
              onToggleSidebar={handleToggleSidebar}
              onExportImport={handleOpenExportImport}
              onSettings={handleOpenSettings}
              batchLoading={batchLoading}
              onFetchAll={fetchAll}
              onPullAll={pullAll}
            />

            {/* Main content */}
            <main className="flex-1 p-6 overflow-y-auto">
              <ProjectGrid
                projects={filteredProjects}
                loading={loading}
                viewMode={viewMode}
                isFiltered={searchQuery.trim().length > 0}
              />
            </main>
          </div>
        </div>
      </ProjectProvider>

      <AddProjectDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        onAddProject={addProject}
        onImportWorkspace={importWorkspace}
        onInitProject={initProject}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remove Project"
        message={`Are you sure you want to remove "${confirmDelete?.name}"? This only removes it from the app, not from disk.`}
        confirmLabel="Remove"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />

      <ExportImportDialog
        open={exportImportOpen}
        onClose={handleCloseExportImport}
        onSuccess={toast.success}
        onError={toast.error}
        onImportDone={refreshAll}
        activeGroup={activeGroup}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={handleCloseSettings}
        onError={toast.error}
      />

      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} onPause={toast.pauseToast} onResume={toast.resumeToast} />
    </div>
  );
}
