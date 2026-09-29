import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as api from "../lib/tauri";
import {
  parseError,
  type ProjectDetail,
  type RunPreset,
  type RunPresetItem,
} from "../lib/types";
import { useTerminal } from "../hooks/useTerminal";
import { useTheme } from "../hooks/useTheme";
import {
  findCommandSession,
  latestSessionOfProject,
  projectKeys,
  sessionsOfProject,
  type TerminalTabsState,
} from "../lib/terminalTabs";
import { Modal, DropdownMenu, MenuItem, KbdBadge } from "./ui/primitives";
import { ConfirmDialog } from "./ConfirmDialog";
import { SelectDropdown } from "./ui/SelectDropdown";
import { CloseIcon, PlusIcon, TerminalIcon } from "./ui/icons";

const HOME_TARGET = "__home__";

export interface TerminalLaunchTarget {
  cwd: string;
  title: string;
  command?: string;
  tabTitle?: string;
}

export interface WorkspaceLaunch {
  items: RunPresetItem[];
  token: number;
}

interface TerminalWorkspaceProps {
  open: boolean;
  initial: TerminalLaunchTarget | null;
  workspaceLaunch: WorkspaceLaunch | null;
  onClose: () => void;
  /** Extra content on the title band (e.g. the summon hotkey hint). */
  headerExtra?: ReactNode;
  /** Render the header as the window title bar: draggable, red-light inset. */
  headerDraggable?: boolean;
}

interface TerminalCanvasProps {
  id: string;
  active: boolean;
  onAttach: (id: string, container: HTMLElement) => void;
  onDetach: (id: string) => void;
  onFit: (id: string) => void;
}

const TerminalCanvas = memo(function TerminalCanvas({
  id,
  active,
  onAttach,
  onDetach,
  onFit,
}: TerminalCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    onAttach(id, el);
    return () => onDetach(id);
  }, [id, onAttach, onDetach]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !active) return;
    const observer = new ResizeObserver(() => onFit(id));
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, active, onFit]);

  return <div ref={containerRef} className={`absolute inset-0 ${active ? "" : "hidden"}`} />;
});

export const TerminalWorkspace = memo(function TerminalWorkspace({
  open,
  initial,
  workspaceLaunch,
  onClose,
  headerExtra,
  headerDraggable,
}: TerminalWorkspaceProps) {
  const {
    sessions,
    activeId,
    activeProject,
    openTerminal,
    closeTerminal,
    restartTerminal,
    closeAllTerminals,
    selectTerminal,
    setActiveProject,
    selectAdjacentProject,
    selectTerminalByIndex,
    selectAdjacentTerminal,
    attachTerminal,
    detachTerminal,
    fitTerminal,
    focusTerminal,
    setTerminalDark,
  } = useTerminal();
  const { theme } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [presets, setPresets] = useState<RunPreset[]>([]);
  const [killAllOpen, setKillAllOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [projects, setProjects] = useState<ProjectDetail[]>([]);
  const [projectFilter, setProjectFilter] = useState("");
  const consumedInitial = useRef<TerminalLaunchTarget | null>(null);
  const consumedWorkspace = useRef<number | null>(null);

  const dark =
    theme === "dark" ||
    (theme === "system" && (window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false));

  const state: TerminalTabsState = { sessions, activeId, activeProject };
  const keys = projectKeys(state);
  const activeGroup = activeProject != null ? sessionsOfProject(state, activeProject) : [];
  const activeGroupTitle = activeGroup[0]?.projectTitle || "Terminal";
  const activeSession = sessions.find((s) => s.id === activeId) ?? null;

  useEffect(() => {
    setTerminalDark(dark);
  }, [dark, setTerminalDark]);

  const visibleKeys = useMemo(() => {
    const q = projectFilter.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((key) => {
      const group = sessionsOfProject(state, key);
      const title = group[0]?.projectTitle || "Terminal";
      return title.toLowerCase().includes(q) || (group[0]?.cwd || "").toLowerCase().includes(q);
    });
  }, [keys, projectFilter, state]);

  const handleNewTerminal = useCallback(
    async (cwd: string, projectTitle: string, tabTitle?: string, command?: string) => {
      setOpening(true);
      setError(null);
      try {
        await openTerminal(cwd, projectTitle, tabTitle, command);
      } catch (e) {
        setError(parseError(e));
      } finally {
        setOpening(false);
      }
    },
    [openTerminal]
  );

  useEffect(() => {
    if (!open || !initial || consumedInitial.current === initial) return;
    consumedInitial.current = initial;
    if (initial.command) {
      const existing = findCommandSession(sessions, initial.cwd, initial.command);
      if (existing && !existing.exited) {
        selectTerminal(existing.id);
        fitTerminal(existing.id);
        focusTerminal(existing.id);
        return;
      }
      if (existing) {
        void closeTerminal(existing.id).then(() =>
          handleNewTerminal(initial.cwd, initial.title, initial.tabTitle, initial.command)
        );
        return;
      }
      void handleNewTerminal(initial.cwd, initial.title, initial.tabTitle, initial.command);
      return;
    }
    const existing = latestSessionOfProject(state, initial.cwd);
    if (existing) {
      selectTerminal(existing.id);
      fitTerminal(existing.id);
      focusTerminal(existing.id);
      return;
    }
    void handleNewTerminal(initial.cwd, initial.title);
  }, [
    open,
    initial,
    handleNewTerminal,
    closeTerminal,
    selectTerminal,
    fitTerminal,
    focusTerminal,
    sessions,
    activeId,
    activeProject,
  ]);

  useEffect(() => {
    if (!open || !activeId) return;
    fitTerminal(activeId);
    focusTerminal(activeId);
  }, [open, activeId, fitTerminal, focusTerminal]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && !e.ctrlKey && !e.altKey) {
        const digit = /^Digit([1-9])$/.exec(e.code);
        if (digit) {
          e.preventDefault();
          selectTerminalByIndex(Number(digit[1]) - 1);
        }
        return;
      }
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
        selectAdjacentProject(e.code === "ArrowUp" ? -1 : 1);
        return;
      }
      if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
        e.preventDefault();
        selectAdjacentTerminal(e.code === "ArrowLeft" ? -1 : 1);
        return;
      }
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (digit) {
        e.preventDefault();
        selectTerminalByIndex(Number(digit[1]) - 1);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, selectAdjacentProject, selectTerminalByIndex, selectAdjacentTerminal]);

  const handleOpenSystemTerminal = useCallback(() => {
    if (!activeSession?.cwd) return;
    api.openInTerminal(activeSession.cwd).catch((e) => setError(parseError(e)));
  }, [activeSession]);

  const loadPresets = useCallback(() => {
    api
      .listRunPresets()
      .then(setPresets)
      .catch(() => setPresets([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    api
      .listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, [open]);

  const projectOptions = useMemo(
    () => [
      { value: HOME_TARGET, label: "Home — default shell", hint: "~", hintStyle: "text" as const },
      ...projects.map((p) => ({
        value: p.project.path,
        label: p.project.name,
        hint: p.project.path,
        hintStyle: "text" as const,
      })),
    ],
    [projects]
  );

  const handleNewInProject = useCallback(
    (value: string) => {
      const project = projects.find((p) => p.project.path === value);
      void handleNewTerminal(
        project ? project.project.path : "",
        project?.project.name || "Terminal"
      );
    },
    [projects, handleNewTerminal]
  );

  useEffect(() => {
    if (open) loadPresets();
  }, [open, loadPresets]);

  const launchWorkspace = useCallback(
    async (items: RunPresetItem[]) => {
      const seen = new Set<string>();
      for (const item of items) {
        const key = `${item.cwd}\u0000${item.command ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (item.command) {
          const existing = findCommandSession(sessions, item.cwd, item.command);
          if (existing && !existing.exited) {
            selectTerminal(existing.id);
            continue;
          }
          if (existing) await closeTerminal(existing.id);
        }
        await openTerminal(item.cwd, item.projectTitle, item.title, item.command);
      }
    },
    [sessions, closeTerminal, openTerminal, selectTerminal]
  );

  useEffect(() => {
    if (!open || !workspaceLaunch || consumedWorkspace.current === workspaceLaunch.token) return;
    consumedWorkspace.current = workspaceLaunch.token;
    void launchWorkspace(workspaceLaunch.items);
  }, [open, workspaceLaunch, launchWorkspace]);

  const handleSaveWorkspace = useCallback(async () => {
    const name = saveName.trim();
    if (!name || sessions.length === 0) return;
    try {
      const items: RunPresetItem[] = sessions.map((s) => ({
        cwd: s.cwd,
        projectTitle: s.projectTitle,
        title: s.title,
        command: s.command,
      }));
      await api.createRunPreset(name, items);
      setSaveOpen(false);
      setSaveName("");
      loadPresets();
    } catch (e) {
      setError(parseError(e));
    }
  }, [saveName, sessions, loadPresets]);

  const handleDeletePreset = useCallback(
    async (id: string) => {
      try {
        await api.deleteRunPreset(id);
        loadPresets();
      } catch (e) {
        setError(parseError(e));
      }
    },
    [loadPresets]
  );

  return (
    <>
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--surface-1)]">
      {/* Header — doubles as the window title bar in the summoned window */}
      <div
        className={`border-b border-[var(--border-color)] flex items-center gap-2.5 shrink-0 ${
          headerDraggable ? "app-titlebar h-[var(--titlebar-h)] px-3" : "px-4 py-2.5"
        }`}
      >
        <div
          data-tauri-drag-region={headerDraggable ? true : undefined}
          className="flex items-center gap-2.5 min-w-0 flex-1"
        >
          <TerminalIcon size={16} />
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 shrink-0">Terminal</h2>
          {headerExtra}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Project sidebar */}
        <div className="w-52 shrink-0 border-r border-[var(--border-color)] flex flex-col">
          <div className="px-3 pt-3 pb-1.5 flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Projects
            </span>
            {keys.length > 1 && (
              <KbdBadge label="⌥↑↓" size="sm" title="Switch project group" />
            )}
            <div className="ml-auto w-16">
              <SelectDropdown
                options={projectOptions}
                value=""
                onChange={handleNewInProject}
                placeholder="New"
                ariaLabel="New terminal in project"
                disabled={opening}
                size="sm"
              />
            </div>
          </div>
          {keys.length > 8 && (
            <div className="px-2 pb-1.5">
              <input
                type="text"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                placeholder="Filter…"
                aria-label="Filter projects"
                className="w-full px-2 py-1 text-xs rounded-md bg-[var(--surface-2)] border border-[var(--border-color)] text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5">
            {visibleKeys.map((key) => {
              const group = sessionsOfProject(state, key);
              const title = group[0]?.projectTitle || "Terminal";
              const hasExited = group.some((s) => s.exited);
              return (
                <div
                  key={key}
                  onClick={() => setActiveProject(key)}
                  title={group[0]?.cwd || title}
                  className={`group flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer ${
                    key === activeProject
                      ? "bg-[var(--surface-2)]"
                      : "hover:bg-gray-100 dark:hover:bg-gray-800"
                  }`}
                >
                  <span className="flex-1 truncate text-xs text-gray-700 dark:text-gray-200">
                    {title}
                  </span>
                  {hasExited && (
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Exited" />
                  )}
                  <span className="text-[10px] text-gray-400 tabular-nums shrink-0">
                    {group.length}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="p-2 border-t border-[var(--border-color)] space-y-0.5">
            <DropdownMenu
              trigger={
                <button
                  type="button"
                  className="w-full text-left px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  Workspaces
                </button>
              }
            >
              {presets.length === 0 && (
                <div className="px-3 py-2 text-xs text-gray-400">No workspaces saved</div>
              )}
              {presets.map((p) => (
                <div key={p.id} className="group flex items-center">
                  <div className="flex-1 min-w-0">
                    <MenuItem
                      label={p.name}
                      description={`${p.items.length} terminals`}
                      onClick={() => void launchWorkspace(p.items)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeletePreset(p.id)}
                    aria-label={`Delete ${p.name}`}
                    title="Delete"
                    className="p-1 mr-2 rounded text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <CloseIcon size={10} />
                  </button>
                </div>
              ))}
              <div role="separator" className="border-t border-[var(--border-color)] my-1" />
              <button
                type="button"
                role="menuitem"
                aria-disabled={sessions.length === 0}
                onClick={() => {
                  if (sessions.length > 0) setSaveOpen(true);
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors aria-disabled:opacity-50"
              >
                Save Workspace…
              </button>
            </DropdownMenu>
            <button
              type="button"
              onClick={handleOpenSystemTerminal}
              disabled={!activeSession?.cwd}
              className="w-full text-left px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              Open in System Terminal
            </button>
            {sessions.length > 0 && (
              <button
                type="button"
                onClick={() => setKillAllOpen(true)}
                className="w-full text-left px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Kill All
              </button>
            )}
          </div>
        </div>

        {/* Terminals for the active project */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-2 py-1.5 border-b border-[var(--border-color)] flex items-center gap-1.5 shrink-0 overflow-x-auto">
            {activeGroup.map((s) => (
              <div
                key={s.id}
                onMouseDown={(e) => {
                  if (e.button === 1) e.preventDefault();
                }}
                onAuxClick={(e) => {
                  if (e.button === 1) void closeTerminal(s.id);
                }}
                title={`${s.cwd || s.title} — middle-click to close`}
                className={`group flex items-center gap-1 rounded-md pl-2 pr-1 py-1 text-xs shrink-0 ${
                  s.id === activeId
                    ? "bg-[var(--surface-2)] text-gray-900 dark:text-gray-100 font-medium shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                <button
                  type="button"
                  onClick={() => selectTerminal(s.id)}
                  className="flex items-center gap-1.5 max-w-[10rem]"
                >
                  <span className="truncate">{s.title}</span>
                  {s.exited && (
                    <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">
                      exited
                    </span>
                  )}
                </button>
                {s.command && (
                  <button
                    type="button"
                    onClick={() => void restartTerminal(s.id)}
                    aria-label={`Restart ${s.title}`}
                    title="Restart"
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <svg aria-hidden="true" width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 2a6 6 0 106 6 .75.75 0 011.5 0A7.5 7.5 0 118 .5a.75.75 0 010 1.5z" />
                      <path d="M14 2.75a.75.75 0 01.75-.75h2a.75.75 0 01-.75.75v2a.75.75 0 01-1.5 0V4.06l-1.97 1.97a.75.75 0 11-1.06-1.06l1.97-1.97h-1.19a.75.75 0 01-.75-.75z" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void closeTerminal(s.id)}
                  aria-label={`Close ${s.title}`}
                  className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 transition-colors"
                >
                  <CloseIcon size={10} />
                </button>
              </div>
            ))}
            {activeGroup.length > 0 && (
              <button
                type="button"
                onClick={() => void handleNewTerminal(activeGroup[0].cwd, activeGroupTitle)}
                disabled={opening}
                title="New terminal"
                aria-label="New terminal"
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0 disabled:opacity-50"
              >
                <PlusIcon />
              </button>
            )}
            {activeGroup.length > 1 && (
              <span className="shrink-0 ml-1">
                <KbdBadge
                  label="⌥←→"
                  size="sm"
                  title="Switch tabs — ⌥1…9 to jump, middle-click to close"
                />
              </span>
            )}
          </div>

          {error && (
            <div className="px-4 py-1.5 text-xs text-red-500 border-b border-[var(--border-color)] shrink-0">
              {error}
            </div>
          )}

          {/* All sessions stay mounted so every project keeps its scrollback */}
          <div className="relative flex-1 min-h-0 bg-[var(--surface-2)]">
            {sessions.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <span className="text-sm text-gray-400">No terminals open</span>
                <button
                  type="button"
                  onClick={() => void handleNewTerminal("", "Terminal")}
                  disabled={opening}
                  className="px-3 py-1.5 text-xs rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors disabled:opacity-50"
                >
                  New Terminal
                </button>
              </div>
            ) : (
              sessions.map((s) => (
                <TerminalCanvas
                  key={s.id}
                  id={s.id}
                  active={s.id === activeId}
                  onAttach={attachTerminal}
                  onDetach={detachTerminal}
                  onFit={fitTerminal}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
    <Modal
      open={saveOpen}
      onClose={() => setSaveOpen(false)}
      title="Save Workspace"
      subtitle={`${sessions.length} terminals`}
    >
      <div className="p-4 space-y-3">
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder="Workspace name"
          aria-label="Workspace name"
          autoFocus
          className="w-full px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface-2)] border border-[var(--border-color)] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setSaveOpen(false)}
            className="px-3 py-1.5 text-xs rounded-md bg-[var(--surface-2)] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSaveWorkspace()}
            disabled={!saveName.trim()}
            className="px-3 py-1.5 text-xs rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
    <ConfirmDialog
      open={killAllOpen}
      title="Kill all terminals?"
      message={`This closes all ${sessions.length} terminal sessions across every project.`}
      confirmLabel="Kill All"
      size="sm"
      onConfirm={async () => {
        await closeAllTerminals();
        setKillAllOpen(false);
      }}
      onCancel={() => setKillAllOpen(false)}
    />
    </>
  );
});

export default TerminalWorkspace;
