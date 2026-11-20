import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
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
  moveProjectIds,
  moveTabIds,
  preferredSessionOfProject,
  projectKeys,
  sessionsOfProject,
  type TerminalSessionState,
  type TerminalTabsState,
} from "../lib/terminalTabs";
import { matchesFuzzy, parseFuzzyQuery } from "../lib/fuzzyMatch";
import { useTranslation } from "react-i18next";
import { Modal, DropdownMenu, MenuItem, KbdBadge } from "./ui/primitives";
import { SwitchBranchControl } from "./SwitchBranchControl";
import { buildPickerItems, type PickerItem } from "../lib/scriptPicker";
import { ConfirmDialog } from "./ConfirmDialog";
import { CommandMenu } from "./TerminalCommandMenu";
import { SelectDropdown } from "./ui/SelectDropdown";
import { formatHotkey } from "../lib/hotkey";
import { CloseIcon, PlusIcon, TerminalIcon } from "./ui/icons";
import { Skeleton, SkeletonGroup, Spinner } from "./ui/loading";
import { ContextMenu, MenuSeparator } from "./ui/ContextMenu";
import { TabLabel } from "./ui/TabLabel";
import { HoverTooltip } from "./ui/HoverTooltip";
import { useHorizontalScroll } from "../hooks/useScrollEdge";
import { useContextMenu } from "../hooks/useContextMenu";
import { isShortcutCapturing } from "../lib/shortcutCapture";
import { isDirtyChord } from "../lib/heldKeys";
import { listen } from "@tauri-apps/api/event";
import { detectMac } from "../lib/hotkey";
import {
  matchDigitRange,
  matchesGlobalHotkey,
  overridesFromSettings,
  parseBinding,
  resolveInAppShortcuts,
  type ActionId,
} from "../lib/inAppShortcuts";

/** The keys this workspace claims as its own Cmd/Ctrl chords (defaults). */
const WORKSPACE_CHORD_CODE = /^(Key[NW]|Arrow(Up|Down|Left|Right)|Digit[1-9])$/;

/**
 * True when a (possibly rebound) binding's key maps to this physical code.
 * Used only for the dirty-chord swallow: a chord that still has another key
 * held must not fire, but must not leak to the shell either, for keys this
 * handler owns. Digit-range bindings own every Digit1-9 code.
 */
function bindingOwnsCode(binding: string, code: string): boolean {
  const p = parseBinding(binding);
  if (!p) return false;
  if (p.isBackquote) return code === "Backquote";
  const key = p.key;
  if (key === "Digit") return /^Digit[1-9]$/.test(code);
  if (/^Arrow/.test(key)) return code === key;
  if (/^[a-zA-Z]$/.test(key)) return code === "Key" + key.toUpperCase();
  if (/^[0-9]$/.test(key)) return code === "Digit" + key;
  if (key === ",") return code === "Comma";
  if (key === " ") return code === "Space";
  if (key.toLowerCase() === "enter") return code === "Enter";
  if (key.toLowerCase() === "escape") return code === "Escape";
  if (key.toLowerCase() === "tab") return code === "Tab";
  return code === key;
}

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

interface SortableRowRender {
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  isDragging: boolean;
  /** True from the moment a drag starts until the click that follows it. */
  dragged: () => boolean;
}

/**
 * One row of a dnd-kit sortable list.
 *
 * The transform is pinned to the list's own axis: a tab may only travel along
 * its strip (the bar clips vertically, so a free 2D drag would slip under the
 * panel edge) and a sidebar group may only travel down its column. The row
 * under the pointer follows 1:1 with no transition — a spring there reads as
 * lag — while the rows it displaces settle on the app's damped spring.
 */
function SortableRow({
  id,
  axis,
  children,
}: {
  id: string;
  axis: "x" | "y";
  children: (row: SortableRowRender) => ReactNode;
}) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useSortable({ id });
  const dragged = useRef(false);

  useEffect(() => {
    if (isDragging) {
      dragged.current = true;
      return;
    }
    if (!dragged.current) return;
    // The click that ends a gesture arrives just after the drop, before this
    // timer: it must not also select the row (or close the tab) it moved.
    const timer = window.setTimeout(() => {
      dragged.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isDragging]);

  const style: CSSProperties = {
    transform: transform
      ? axis === "x"
        ? `translate3d(${transform.x}px, 0, 0)`
        : `translate3d(0, ${transform.y}px, 0)`
      : undefined,
    // Only a displaced row (or the dragged one) needs an inline transition:
    // idle rows keep the class's own `transition-all` for hover and colour.
    transition: isDragging
      ? "none"
      : transform
        ? "transform 260ms var(--ease-spring), translate 200ms var(--ease-spring), scale 200ms var(--ease-spring)"
        : undefined,
    // Lift the row over its neighbours without leaving the scroll container.
    zIndex: isDragging ? 5 : undefined,
  };

  return (
    <>
      {children({
        setNodeRef,
        style,
        attributes,
        listeners,
        isDragging,
        dragged: () => dragged.current,
      })}
    </>
  );
}

interface TerminalWorkspaceProps {
  open: boolean;
  initial: TerminalLaunchTarget | null;
  workspaceLaunch: WorkspaceLaunch | null;
  onClose: () => void;
  /** Increment to focus the active terminal (palette command path). */
  focusSignal?: number;
  /** Increment to clear the active terminal's scrollback (palette path). */
  clearSignal?: number;
  /** Extra content on the title band (e.g. the summon hotkey hint). */
  headerExtra?: ReactNode;
  /** Render the header as the window title bar: draggable, red-light inset. */
  headerDraggable?: boolean;
  /** Hide the header row entirely (the host window draws the title itself). */
  hideHeader?: boolean;
}

interface TerminalCanvasProps {
  id: string;
  active: boolean;
  /** Replay the pane entrance on the wrapper (xterm node itself never animates). */
  animateIn?: boolean;
  /**
   * The pty has printed something (or already exited). Until then the canvas is
   * a blank rectangle — visually identical to a hung shell — so we cover it.
   */
  ready: boolean;
  startingLabel: string;
  onAttach: (id: string, container: HTMLElement) => void;
  onDetach: (id: string) => void;
  onFit: (id: string) => void;
  onContextMenu: (e: ReactMouseEvent) => void;
}

const TerminalCanvas = memo(function TerminalCanvas({
  id,
  active,
  animateIn,
  ready,
  startingLabel,
  onAttach,
  onDetach,
  onFit,
  onContextMenu,
}: TerminalCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // A cover that never lifts is worse than a blank canvas: `sleep 60` prints
  // nothing for a minute, and the user must not be left staring at "Starting
  // shell…" (or typing under an opaque layer). Give up after a few seconds.
  const [gaveUp, setGaveUp] = useState(false);
  const settled = ready || gaveUp;
  useEffect(() => {
    if (settled) return;
    const timer = window.setTimeout(() => setGaveUp(true), 3000);
    return () => window.clearTimeout(timer);
  }, [settled]);

  // Keep the overlay mounted for one fade after the first output arrives, so
  // the prompt does not appear through a hard cut.
  const [overlayVisible, setOverlayVisible] = useState(!settled);
  useEffect(() => {
    if (!settled) {
      setOverlayVisible(true);
      return;
    }
    const timer = window.setTimeout(() => setOverlayVisible(false), 200);
    return () => window.clearTimeout(timer);
  }, [settled]);

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

  return (
    /* Inset within the padded pane wrapper: the canvas measures this box, so
       xterm's cols/rows already account for the panel's rounded corners. */
    <>
      <div
        ref={containerRef}
        data-testid={`terminal-canvas-${id}`}
        onContextMenu={onContextMenu}
        className={`absolute inset-2 ${active ? "" : "hidden"}${animateIn && active ? " term-pane-in" : ""}`}
      />
      {overlayVisible && (
        /* Decorative cover, not a live region: the pane itself steals focus and
           xterm announces its own buffer. */
        <div
          aria-hidden="true"
          data-testid={`terminal-starting-${id}`}
          /* The cover is painted in xterm's own background (#1f2329 dark, #fff
             light) so the hand-off to the real buffer has no colour jump. */
          className={`pointer-events-none absolute inset-2 flex items-center justify-center gap-2 bg-white text-xs text-gray-500 transition-opacity duration-200 dark:bg-[#1f2329] dark:text-gray-400 ${settled ? "opacity-0" : "opacity-100"}${active ? "" : " hidden"}`}
        >
          <Spinner size="sm" />
          <span>{startingLabel}</span>
        </div>
      )}
    </>
  );
});

/**
 * The session ids in the order their panes were first mounted.
 *
 * Panes are absolutely positioned and only the active one is visible, so their
 * DOM order means nothing to the user — but React reorders keyed siblings by
 * removing and re-inserting them, and moving an xterm container leaves the
 * terminal painted blank until the next output (the next prompt) repaints it.
 * Dragging a tab or a project group reorders `sessions`, so panes keep this
 * stable order and only the tab strip and sidebar rows move.
 */
function usePaneOrder(ids: string[]): string[] {
  const orderRef = useRef<string[]>([]);
  const previous = orderRef.current;
  const next = previous.filter((id) => ids.includes(id));
  for (const id of ids) {
    if (!next.includes(id)) next.push(id);
  }
  const unchanged =
    next.length === previous.length && next.every((id, index) => id === previous[index]);
  orderRef.current = next;
  return unchanged ? previous : next;
}

/**
 * Placeholder for the window between mount and the first `terminal_list`
 * reply. Before this existed the workspace rendered `TerminalBlankSlate`
 * during that window, i.e. it told the user "No terminals open" and offered to
 * create one, then replaced that with their actual tabs a moment later.
 */
const TerminalRestoringSkeleton = memo(function TerminalRestoringSkeleton({
  label,
}: {
  label: string;
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col gap-3 p-4"
      aria-busy="true"
      data-testid="terminal-restoring-skeleton"
    >
      <SkeletonGroup className="flex items-center gap-2">
        <Skeleton className="h-6 w-24 rounded-md" />
        <Skeleton className="h-6 w-20 rounded-md" />
        <Skeleton className="h-6 w-16 rounded-md" />
      </SkeletonGroup>
      <SkeletonGroup className="flex-1 space-y-2 rounded-lg border border-[var(--border-color)] p-3">
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </SkeletonGroup>
      <span className="sr-only">{label}</span>
    </div>
  );
});

/** Global empty canvas (D scheme: C+B combined): up to 3 recent projects in
 * a horizontal card grid, each with its own quick-run commands.
 * sessions[] === 0 only — per-project empty is unreachable (project keys
 * derive from sessions). Each card = project header (name + path) + up to 2
 * quick-run commands (listCustomCommands + listProjectScripts for that cwd)
 * + an "open terminal" button for a blank terminal in that cwd. No expand
 * state, no new storage: reuses the sidebar ▶ data path and the existing
 * project list, sorted by last_active_at desc at the call site and capped
 * at 3). */
const TerminalBlankSlate = memo(function TerminalBlankSlate({
  projects,
  fallbackTitle,
  opening,
  loading,
  loadFailed,
  onRetry,
  onNew,
  onQuickRun,
}: {
  projects: { cwd: string; title: string }[];
  fallbackTitle: string;
  opening: boolean;
  /** The project list itself has not arrived yet — `projects` is empty because
   * nothing was read, not because there is nothing to show. Rendering the
   * "New Terminal" fallback here told the user their projects were gone. */
  loading: boolean;
  loadFailed: boolean;
  onRetry: () => void;
  onNew: (cwd: string, projectTitle: string) => void;
  onQuickRun: (cwd: string, projectTitle: string, item: PickerItem) => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<Record<string, PickerItem[]>>({});
  const shown = projects.slice(0, 3);

  useEffect(() => {
    let cancelled = false;
    setItems({});
    if (shown.length === 0) return;
    // One combined fetch: saved commands once, scripts per project.
    api
      .listCustomCommands()
      .then((saved) =>
        Promise.all(
          shown.map((p) =>
            (p.cwd ? api.listProjectScripts(p.cwd) : Promise.resolve([] as never[]))
              .then((scripts) => ({ cwd: p.cwd, items: buildPickerItems(saved, scripts, p.cwd).slice(0, 2) }))
              .catch(() => ({ cwd: p.cwd, items: [] as PickerItem[] }))
          )
        )
      )
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, PickerItem[]> = {};
        for (const r of rows) next[r.cwd] = r.items;
        setItems(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // shown is derived from projects (slice); depend on the stable source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 py-6 text-center overflow-y-auto">
      <span
        aria-hidden="true"
        className="w-11 h-11 shrink-0 rounded-2xl bg-[var(--surface-1)] border border-[var(--border-color)] flex items-center justify-center text-lg animate-[terminal-blank-float_3.2s_ease-in-out_infinite]"
      >
        ◧
      </span>
      <span className="text-sm text-gray-400">{t("terminal.noTerminals")}</span>
      {loading ? (
        <div
          className="w-full max-w-2xl"
          data-testid="terminal-blank-projects-skeleton"
        >
          <SkeletonGroup className="grid grid-cols-1 gap-2.5 w-full sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-1)] p-3.5 flex flex-col gap-2.5"
              >
                <div className="flex items-center gap-2">
                  <Skeleton className="w-7 h-7 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-2.5 w-20" />
                    <Skeleton className="h-2 w-28" />
                  </div>
                </div>
                <Skeleton className="h-6 w-full rounded-lg" />
                <Skeleton className="h-6 w-full rounded-lg" />
                <Skeleton className="h-7 w-full rounded-lg" />
              </div>
            ))}
          </SkeletonGroup>
        </div>
      ) : loadFailed && shown.length === 0 ? (
        <div className="flex flex-col items-center gap-2">
          <span className="text-xs text-red-500">{t("terminal.projectsLoadFailed")}</span>
          <button
            type="button"
            onClick={onRetry}
            className="press px-3 py-1.5 text-xs rounded-md border border-[var(--border-color)] text-gray-700 dark:text-gray-200 hover:bg-[var(--surface-2)] transition-colors"
          >
            {t("common.retry")}
          </button>
        </div>
      ) : shown.length === 0 ? (
        <button
          type="button"
          onClick={() => onNew("", fallbackTitle)}
          disabled={opening}
          className="press inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors disabled:opacity-50"
        >
          {/* Clicking used to only grey the button out: no spinner, no text
              change, nothing to distinguish "opening" from "did nothing". */}
          {opening && <Spinner size="xs" />}
          {opening ? t("terminal.startingShell") : t("terminal.newTerminalButton")}
        </button>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full max-w-2xl">
          {shown.map((p, ci) => {
            const cmds = items[p.cwd] ?? [];
            return (
              <div
                key={p.cwd || p.title}
                style={{ animationDelay: `${ci * 80}ms` }}
                className="rounded-2xl border border-[var(--border-color)] bg-[var(--surface-1)] hover:border-[var(--accent)] hover:-translate-y-0.5 hover:shadow-lg p-3.5 flex flex-col gap-2.5 text-left transition-all animate-[terminal-chip-in_380ms_var(--ease-jelly)_backwards]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    aria-hidden="true"
                    className="w-7 h-7 shrink-0 rounded-lg bg-[var(--surface-2)] flex items-center justify-center text-sm"
                  >
                    ◧
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-gray-800 dark:text-gray-100 truncate">
                      {p.title}
                    </span>
                    <span className="block text-[10.5px] font-mono text-gray-400 truncate">
                      {p.cwd}
                    </span>
                  </span>
                </div>
                {items[p.cwd] === undefined ? (
                  // Commands load per card after mount; rendering nothing made
                  // "still fetching" look like "this project has none".
                  <div className="flex flex-col gap-1.5" aria-hidden="true" data-testid="terminal-blank-cmd-skeleton">
                    <Skeleton className="h-[26px] w-full rounded-lg" />
                    <Skeleton className="h-[26px] w-3/4 rounded-lg" />
                  </div>
                ) : cmds.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {cmds.map((item) => (
                      <button
                        key={`${item.kind}:${item.name}:${item.command}`}
                        type="button"
                        onClick={() => onQuickRun(p.cwd, p.title, item)}
                        title={item.command}
                        className="press w-full inline-flex items-center gap-1.5 text-[11px] font-mono rounded-lg px-2.5 py-1.5 border border-[var(--border-color)] hover:bg-[var(--surface-2)] text-gray-700 dark:text-gray-200 transition-colors"
                      >
                        <span aria-hidden="true" className="text-emerald-500 text-[9px] shrink-0">▶</span>
                        <span className="truncate">{item.command}</span>
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onNew(p.cwd, p.title)}
                  disabled={opening}
                  className="press mt-auto w-full inline-flex items-center justify-center gap-1.5 text-[11.5px] font-semibold rounded-lg px-2.5 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors disabled:opacity-50"
                >
                  {opening && <Spinner size="xs" />}
                  {opening ? t("terminal.startingShell") : t("terminal.newTerminalButton")}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export const TerminalWorkspace = memo(function TerminalWorkspace({
  open,
  initial,
  workspaceLaunch,
  onClose,
  headerExtra,
  headerDraggable,
  hideHeader,
  focusSignal,
  clearSignal,
}: TerminalWorkspaceProps) {
  const {
    sessions,
    activeId,
    activeProject,
    openTerminal,
    closeTerminal,
    closeProjectTerminals,
    restartTerminal,
    closeAllTerminals,
    selectTerminal,
    reorderSessions,
    setActiveProject,
    selectAdjacentProject,
    selectTerminalByIndex,
    selectAdjacentTerminal,
    attachTerminal,
    detachTerminal,
    fitTerminal,
    focusTerminal,
    getSelection,
    selectAll,
    clearScreen,
    sendInput,
    setTerminalDark,
    activeByProject,
    bootstrapping,
    bootstrapError,
    retrySessions,
    isSessionReady,
  } = useTerminal();
  const { t } = useTranslation();
  const fallbackTitle = t("terminal.title");
  const { isDark } = useTheme();

  // FR2 (Phase 2 narrowing): terminal context means focus is inside this
  // workspace's own DOM. The ref is attached to the window-root element
  // below; in the standalone window that covers everything, in the main
  // window only the terminal panel.
  const workspaceRootRef = useRef<HTMLDivElement | null>(null);

  // Rebindable terminal bindings (Phase 2, FR3), resolved from settings
  // the same way App.tsx resolves the app actions. Defaults come from the
  // registry, so a missing settings field (or an older settings file)
  // simply keeps the default.
  const [termBindings, setTermBindings] = useState<Partial<Record<ActionId, string>>>({});
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      const getSettings = (api as { getSettings?: unknown }).getSettings;
      if (typeof getSettings !== "function") return;
      (getSettings as () => Promise<unknown>)()
        .then((s) => {
          if (!cancelled) setTermBindings(overridesFromSettings(s as Record<string, unknown>));
        })
        .catch(() => {});
    };
    load();
    const unlisten = listen("settings-changed", load);
    return () => {
      cancelled = true;
      unlisten.then((f) => f());
    };
  }, []);

  // Palette command paths (Phase 2, FR10): a signal increment focuses or
  // clears the active terminal. The prev refs keep the initial signal
  // value from firing on mount; opening the panel already auto-focuses
  // via the open/activeId effect, so consuming a signal while closed
  // loses nothing.
  const prevFocusSignal = useRef(focusSignal);
  const prevClearSignal = useRef(clearSignal);
  useEffect(() => {
    if (focusSignal === undefined || focusSignal === prevFocusSignal.current) return;
    prevFocusSignal.current = focusSignal;
    if (open && activeId) focusTerminal(activeId);
  }, [focusSignal, open, activeId, focusTerminal]);
  useEffect(() => {
    if (clearSignal === undefined || clearSignal === prevClearSignal.current) return;
    prevClearSignal.current = clearSignal;
    if (open && activeId) clearScreen(activeId);
  }, [clearSignal, open, activeId, clearScreen]);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [presets, setPresets] = useState<RunPreset[]>([]);
  const [killAllOpen, setKillAllOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [projects, setProjects] = useState<ProjectDetail[]>([]);
  // `projects === []` is ambiguous: it means "nothing read yet" on the very
  // first open and "you genuinely have no projects" afterwards. These two flags
  // separate them so the empty canvas never lies about an in-flight read.
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [projectsError, setProjectsError] = useState(false);
  const [projectsLoadTick, setProjectsLoadTick] = useState(0);
  // Same split for the saved-workspaces menu: an empty list while the read is
  // in flight claimed "No workspaces saved".
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [projectFilter, setProjectFilter] = useState("");
  const [menuSession, setMenuSession] = useState<TerminalSessionState | null>(null);
  const [menuProject, setMenuProject] = useState<{ key: string; cwd: string; title: string } | null>(null);
  const tabMenu = useContextMenu();
  const sidebarMenu = useContextMenu();
  // The canvas is the one surface where a live text selection is the reason to
  // open the menu (to copy it), so it must not inherit the selection guard.
  const canvasMenu = useContextMenu();
  // Text captured when the canvas menu opened, so the Copy item's state and the
  // text it copies stay consistent even if the selection changes afterwards.
  const [canvasSelection, setCanvasSelection] = useState("");
  const consumedInitial = useRef<TerminalLaunchTarget | null>(null);
  const consumedWorkspace = useRef<number | null>(null);
  const [newMenuSignal, setNewMenuSignal] = useState(0);
  // Quick-run commands per project cwd: hover preloads them so the ▶ menu
  // opens instantly. Project scripts come from manifest analysis
  // (package.json/Makefile/justfile), saved ones are user-stored per project.
  const [quickItems, setQuickItems] = useState<Record<string, PickerItem[]>>({});
  const quickLoading = useRef<Set<string>>(new Set());

  const tabbarRef = useRef<HTMLDivElement | null>(null);
  // Tabs keep a fixed width, so a full strip scrolls instead of squeezing
  // titles. The scrollbar is hidden (it would eat 8px of a 32px bar), so the
  // edge fades + arrows below are the only affordance that more tabs exist.
  const tabStrip = useHorizontalScroll(tabbarRef);
  // Hovering a tab shows its full title in a tooltip: a fixed width truncates
  // from the middle, and the reveal belongs to the app, not to a native
  // tooltip (which would double up with the middle-click hint it carries).
  const [tabHoverId, setTabHoverId] = useState<string | null>(null);
  // A drag must not leave a tooltip behind it: pointerenter keeps firing on the
  // tabs the dragged row passes over, so hover is suspended while one runs.
  const [tabDragActive, setTabDragActive] = useState(false);
  const tabHoverRef = useRef<HTMLElement | null>(null);
  // Looked up per render, not captured on hover: a shell that renames itself
  // while the pointer rests on the tab should show the new name.
  const hoveredTab = tabHoverId ? (sessions.find((s) => s.id === tabHoverId) ?? null) : null;
  // Newly opened tabs pop in once (jelly tabIn). Render happens before the
  // effect that records the new id, so the effect bumps a tick to re-render
  // with the class; render consumes the id so a later re-render (e.g. title
  // update) never replays the entrance.
  const newTabIds = useRef<Set<string>>(new Set());
  const [, setNewTabTick] = useState(0);
  // Reselect-squish tick per tab: clicking the active tab replays the jelly
  // wobble on demand (keyed class), so the effect isn't birth-only.
  const [tabSquish, setTabSquish] = useState<{ id: string; tick: number } | null>(null);
  // Sliding indicator geometry, measured from the active tab's DOM box.
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const prevSessionIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const ids = new Set(sessions.map((s) => s.id));
    let added = false;
    for (const s of sessions) {
      if (!prevSessionIds.current.has(s.id) && !newTabIds.current.has(s.id)) {
        newTabIds.current.add(s.id);
        added = true;
      }
    }
    for (const id of [...newTabIds.current]) {
      if (!ids.has(id)) newTabIds.current.delete(id);
    }
    prevSessionIds.current = ids;
    if (added) setNewTabTick((t) => t + 1);
  }, [sessions]);

  const preloadQuickItems = useCallback((cwd: string) => {
    if (!cwd || quickLoading.current.has(cwd)) return;
    quickLoading.current.add(cwd);
    Promise.all([api.listCustomCommands(), api.listProjectScripts(cwd)])
      .then(([saved, scripts]) => {
        setQuickItems((prev) =>
          prev[cwd] ? prev : { ...prev, [cwd]: buildPickerItems(saved, scripts, cwd) }
        );
      })
      .catch(() => {})
      .finally(() => {
        quickLoading.current.delete(cwd);
      });
  }, []);

  const state: TerminalTabsState = { sessions, activeId, activeProject, activeByProject };
  const keys = projectKeys(state);
  const activeGroup = activeProject != null ? sessionsOfProject(state, activeProject) : [];
  const sessionIds = useMemo(() => sessions.map((s) => s.id), [sessions]);
  const sessionsById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions]);
  // Panes render in mount order, never in tab order — see usePaneOrder.
  const paneIds = usePaneOrder(sessionIds);
  const activeGroupTitle = activeGroup[0]?.projectTitle || fallbackTitle;
  const isMac = useMemo(() => detectMac(), []);
  // Badge of the tab bar's "+": the effective (possibly rebound) new-tab
  // binding, formatted the way the shortcut help formats it.
  const newTabDisplay = useMemo(
    () => formatHotkey(resolveInAppShortcuts(termBindings).terminalNewTab, isMac),
    [termBindings, isMac]
  );
  // The branch control acts on the project whose terminals are shown (the
  // selected sidebar group), not on whichever session last had focus.
  const activeGroupCwd = activeGroup[0]?.cwd || "";
  const activeGroupDetail = useMemo(
    () => projects.find((p) => p.project.path === activeGroupCwd) ?? null,
    [projects, activeGroupCwd]
  );

  // 6px of travel before a drag takes over, so a click still selects a tab or
  // a group and the row only starts moving once the pointer means it. Keyboard
  // drags follow the sortable geometry, so Space/arrows reorder without a mouse.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // A drop lands the tab on the slot it was over — dnd-kit reports the two ids,
  // the pure helpers turn that into the full session order the backend owns.
  const handleTabDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || activeProject == null) return;
      reorderSessions(moveTabIds(sessions, activeProject, String(active.id), String(over.id)));
    },
    [activeProject, reorderSessions, sessions]
  );

  // Group drops move the whole block of tabs, so a group keeps its internal
  // tab order and its tabs stay adjacent in the flat list the sidebar reads.
  const handleGroupDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      reorderSessions(moveProjectIds(sessions, String(active.id), String(over.id)));
    },
    [reorderSessions, sessions]
  );

  useEffect(() => {
    setTerminalDark(isDark);
  }, [isDark, setTerminalDark]);

  const visibleKeys = useMemo(() => {
    const query = parseFuzzyQuery(projectFilter);
    if (query.terms.length === 0) return keys;
    return keys.filter((key) => {
      const group = sessionsOfProject(state, key);
      const title = group[0]?.projectTitle || fallbackTitle;
      return matchesFuzzy(title, query) || matchesFuzzy(group[0]?.cwd || "", query);
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

  const handleQuickRun = useCallback(
    (cwd: string, projectTitle: string, item: PickerItem) => {
      void handleNewTerminal(cwd, projectTitle, item.name, item.command);
    },
    [handleNewTerminal]
  );

  // Every "new terminal" entry point (the tab bar's "+", the new-tab chord)
  // opens one more tab in the project whose terminals are on screen. With no
  // tab at all it falls back to Home, matching the New menu's first entry, so
  // the action never dead-ends.
  const newTerminalInActiveProject = useCallback(() => {
    if (activeGroup[0]) {
      void handleNewTerminal(activeGroup[0].cwd, activeGroupTitle);
      return;
    }
    void handleNewTerminal("", fallbackTitle);
  }, [activeGroup, activeGroupTitle, fallbackTitle, handleNewTerminal]);

  // Slide the indicator to the active tab after paint, and keep it in view.
  // Keyed on the tab order as well as the selection: a drag can move the
  // indicator's tab (or slide it) without changing which tab is active.
  const activeTabIds = activeGroup.map((s) => s.id);
  const activeGroupOrder = activeTabIds.join("|");
  // Stable across renders (the strip's own state object is not), so the
  // indicator effect can re-measure the overflow chrome without re-running on
  // every render.
  const remeasureTabStrip = tabStrip.remeasure;
  useEffect(() => {
    const bar = tabbarRef.current;
    if (!bar || activeId == null) return;
    const raf = requestAnimationFrame(() => {
      const el = bar.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
      if (!el) return;
      setIndicator((prev) => {
        const next = { left: el.offsetLeft, width: el.offsetWidth };
        return prev.left === next.left && prev.width === next.width ? prev : next;
      });
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      // Tabs may have been added or closed, which changes scrollWidth without
      // resizing the bar — the fades and arrows have to hear about it.
      remeasureTabStrip();
    });
    return () => cancelAnimationFrame(raf);
  }, [activeId, activeGroupOrder, remeasureTabStrip]);

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
    const existing = preferredSessionOfProject(state, initial.cwd);
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
    state,
  ]);

  useEffect(() => {
    if (!open || !activeId) return;
    fitTerminal(activeId);
    focusTerminal(activeId);
  }, [open, activeId, fitTerminal, focusTerminal]);

  // Closing a tab — including the last one — leaves the panel/window up: the
  // close chord is about tabs, and the panel keeps its own empty state. The
  // next close chord with no tab left falls through to the host (panel close
  // / window hide).
  const closeTab = useCallback(
    (id: string) => {
      void closeTerminal(id);
    },
    [closeTerminal]
  );

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (isShortcutCapturing()) return;
      // FR2 (Phase 2 narrowing): this handler owns a keystroke only when
      // focus is inside the workspace's own DOM. In the standalone window
      // that is everything; in the main window an open panel no longer
      // steals app shortcuts while the user works in the project list, and
      // a dialog above the panel wins outright. The close chord and both
      // new-terminal chords are exempt from the target check: they must work
      // right after a summon, before anything inside has been clicked.
      const root = workspaceRootRef.current;
      const inside = !!root && e.target instanceof Node && root.contains(e.target);
      // The chords that ignore the event target do so because a summon leaves
      // focus on the trigger or on the body. A dialog above the panel takes
      // focus itself and owns the keyboard, so those chords must stand down
      // and let it answer (e.g. Add Project's Cmd+N).
      const active = document.activeElement;
      const focusIsIdle =
        !active || active === document.body || active === document.documentElement;
      const focusInWorkspace = !!root && active instanceof Node && root.contains(active);
      const focusExempt = inside || focusIsIdle || focusInWorkspace;
      const merged = resolveInAppShortcuts(termBindings);
      // A chord that still has another key held must not fire. Swallow it
      // only for the keys this handler owns, so a simultaneous Cmd+C/Cmd+A
      // keeps its native meaning, and a rebound binding's keys are owned
      // the same way the defaults are.
      if (isDirtyChord(e)) {
        // Only terminal bindings own keys here: an app binding's dirty
        // chord is the app handler's business, not this handler's.
        const terminalIds: ActionId[] = [
          "terminalSwitchGroupPrev",
          "terminalSwitchGroupNext",
          "terminalSwitchTabPrev",
          "terminalSwitchTabNext",
          "terminalJumpIndex",
          "terminalJumpProject",
          "terminalNewTab",
          "terminalNewTabInProject",
          "terminalCloseTab",
          "terminalFocusInput",
          "terminalClearScreen",
        ];
        if (
          (e.metaKey || e.ctrlKey || e.altKey) &&
          (WORKSPACE_CHORD_CODE.test(e.code) ||
            terminalIds.some((id) => bindingOwnsCode(merged[id] ?? "", e.code)))
        ) {
          e.preventDefault();
        }
        return;
      }
      // CmdOrCtrl+N adds one more tab in the project on screen (the tab
      // bar's "+"), and CmdOrCtrl+Shift+N opens the sidebar's New-project
      // button to the right of the "Projects" header. Both answer once the
      // workspace is awake, whether focus is inside it or still sits on the
      // element that summoned it: after a summon nothing inside has been
      // clicked yet. CmdOrCtrl+N is also app addProject, so outside the
      // workspace it must not reach the app handler while the panel is up.
      if (focusExempt) {
        if (matchesGlobalHotkey(e, merged.terminalNewTabInProject, isMac)) {
          e.preventDefault();
          e.stopPropagation();
          newTerminalInActiveProject();
          return;
        }
        if (matchesGlobalHotkey(e, merged.terminalNewTab, isMac)) {
          e.preventDefault();
          e.stopPropagation();
          setNewMenuSignal((s) => s + 1);
          return;
        }
        // Close is about tabs, not focus: a summoned panel closes its tab
        // even though nothing inside it has been clicked. With no tab left
        // the chord propagates (dialog-close / panel close / window hide).
        if (matchesGlobalHotkey(e, merged.terminalCloseTab, isMac)) {
          if (activeId == null) return;
          e.preventDefault();
          e.stopPropagation();
          closeTab(activeId);
          return;
        }
      }
      if (!inside) return;
      // Bindings resolve platform-aware (Cmd on macOS, Ctrl elsewhere):
      // Ctrl+key now reaches the shell on macOS instead of being claimed
      // here, and the terminal shortcuts work on Windows/Linux, where the
      // old metaKey-only check never fired. Shift variants are distinct
      // chords (FR8), so Cmd+Shift+N is its own binding.
      if (matchesGlobalHotkey(e, merged.terminalSwitchGroupPrev, isMac)) {
        e.preventDefault();
        selectAdjacentProject(-1);
        return;
      }
      if (matchesGlobalHotkey(e, merged.terminalSwitchGroupNext, isMac)) {
        e.preventDefault();
        selectAdjacentProject(1);
        return;
      }
      if (matchesGlobalHotkey(e, merged.terminalSwitchTabPrev, isMac)) {
        e.preventDefault();
        selectAdjacentTerminal(-1);
        return;
      }
      if (matchesGlobalHotkey(e, merged.terminalSwitchTabNext, isMac)) {
        e.preventDefault();
        selectAdjacentTerminal(1);
        return;
      }
      const jumpIndex = matchDigitRange(e, merged.terminalJumpIndex, isMac);
      if (jumpIndex !== null) {
        e.preventDefault();
        selectTerminalByIndex(jumpIndex);
        return;
      }
      const jumpProject = matchDigitRange(e, merged.terminalJumpProject, isMac);
      if (jumpProject !== null) {
        e.preventDefault();
        selectTerminalByIndex(jumpProject);
        return;
      }
      // Unbound by default (empty binding never matches): these fire only
      // when the user records a binding in the Shortcuts editor, or via
      // the palette commands. They stop propagation so the shell never
      // sees a chord the app consumed.
      if (
        merged.terminalFocusInput &&
        matchesGlobalHotkey(e, merged.terminalFocusInput, isMac)
      ) {
        if (activeId == null) return;
        e.preventDefault();
        e.stopPropagation();
        focusTerminal(activeId);
        return;
      }
      if (
        merged.terminalClearScreen &&
        matchesGlobalHotkey(e, merged.terminalClearScreen, isMac)
      ) {
        if (activeId == null) return;
        e.preventDefault();
        e.stopPropagation();
        clearScreen(activeId);
        return;
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, activeId, closeTab, selectAdjacentProject, selectTerminalByIndex, selectAdjacentTerminal, termBindings, focusTerminal, clearScreen, newTerminalInActiveProject]);

  const loadPresets = useCallback(() => {
    setPresetsLoading(true);
    api
      .listRunPresets()
      .then(setPresets)
      .catch(() => setPresets([]))
      .finally(() => setPresetsLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setProjectsError(false);
    api
      .listProjects()
      .then((list) => {
        if (cancelled) return;
        setProjects(list);
        setProjectsLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Keep whatever we already had: a failed refresh must not wipe a list
        // the user is looking at. Only a cold failure is surfaced.
        setProjectsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectsLoadTick]);

  const projectsPending = !projectsLoaded && !projectsError;

  const projectOptions = useMemo(
    () => [
      { value: HOME_TARGET, label: t("terminal.homeOption"), hint: "~", hintStyle: "text" as const },
      ...projects.map((p) => ({
        value: p.project.path,
        label: p.project.name,
        hint: p.project.path,
        hintStyle: "text" as const,
      })),
    ],
    [projects, t]
  );

  const handleNewInProject = useCallback(
    (value: string) => {
      const project = projects.find((p) => p.project.path === value);
      void handleNewTerminal(
        project ? project.project.path : "",
        project?.project.name || fallbackTitle
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

  const handleTabContextMenu = useCallback(
    (e: ReactMouseEvent, s: TerminalSessionState) => {
      // No `button` skip here: the tab title is content, and the WebView's
      // native menu is suppressed globally, so skipping would leave a dead
      // area with no menu at all.
      setMenuSession(s);
      sidebarMenu.close();
      tabMenu.onContextMenu(e);
    },
    [sidebarMenu.close, tabMenu.onContextMenu]
  );

  const handleProjectContextMenu = useCallback(
    (e: ReactMouseEvent, key: string) => {
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('button, input, textarea, a, [role="button"]')
      ) {
        return;
      }
      setMenuProject({
        key,
        cwd: sessionsOfProject(state, key)[0]?.cwd || "",
        title: sessionsOfProject(state, key)[0]?.projectTitle || fallbackTitle,
      });
      tabMenu.close();
      sidebarMenu.onContextMenu(e);
    },
    [sidebarMenu.onContextMenu, state, tabMenu.close]
  );

  const handleCopyTabPath = useCallback(() => {
    const path = menuSession?.cwd;
    if (!path) return;
    navigator.clipboard.writeText(path).catch((e) => setError(parseError(e)));
  }, [menuSession]);

  const handleCloseOtherTabs = useCallback(() => {
    const current = menuSession;
    if (!current) return;
    for (const s of activeGroup) {
      if (s.id !== current.id) closeTab(s.id);
    }
  }, [menuSession, activeGroup, closeTab]);

  const handleCanvasContextMenu = useCallback(
    (e: ReactMouseEvent) => {
      // xterm renders a helper <textarea> for IME/keys, but its CSS parks it
      // off-screen with zero size (`.xterm-helper-textarea`), so a real
      // right-click lands on the screen/canvas. The standard skip list already
      // covers it and any future in-canvas control, and a hit preserves the
      // native menu. The menu always acts on the active session: hidden
      // canvases are display:none and cannot receive the event.
      const target = e.target;
      if (
        target instanceof Element &&
        target.closest('button, input, textarea, a, [role="button"]')
      ) {
        return;
      }
      setCanvasSelection(activeId ? getSelection(activeId) : "");
      tabMenu.close();
      sidebarMenu.close();
      canvasMenu.onContextMenu(e);
    },
    [activeId, canvasMenu.onContextMenu, getSelection, sidebarMenu.close, tabMenu.close]
  );

  const handleCanvasCopy = useCallback(() => {
    if (!canvasSelection) return;
    navigator.clipboard.writeText(canvasSelection).catch((e) => setError(parseError(e)));
  }, [canvasSelection]);

  const handleCanvasPaste = useCallback(() => {
    if (!activeId) return;
    navigator.clipboard
      .readText()
      .then((text) => {
        if (text) sendInput(activeId, text);
      })
      .catch((e) => setError(parseError(e)));
  }, [activeId, sendInput]);

  const handleCanvasSelectAll = useCallback(() => {
    if (activeId) selectAll(activeId);
  }, [activeId, selectAll]);

  const handleCanvasClear = useCallback(() => {
    if (activeId) clearScreen(activeId);
  }, [activeId, clearScreen]);

  // Switch the branch of the project whose terminals are shown. The backend
  // re-reads the repository after the checkout and returns that detail;
  // the project list is then re-read so the branch control's own state (and
  // the next switch) sees the new branches and status.
  const handleSwitchBranch = useCallback(
    async (path: string, branch: string) => {
      setError(null);
      try {
        const detail = await api.switchBranch(path, branch);
        setProjects((prev) => {
          const next = prev.map((p) => (p.project.path === path ? detail : p));
          return next.some((p) => p.project.path === path) ? next : [...prev, detail];
        });
        try {
          const fresh = await api.listProjects();
          setProjects((prev) =>
            prev.map((p) => fresh.find((f) => f.project.path === p.project.path) ?? p)
          );
        } catch {
          // The switched detail above is enough; the next open re-reads.
        }
      } catch (e) {
        setError(t("projects.switchFailed", { error: parseError(e) }));
        throw e;
      }
    },
    [t]
  );

  // The branch control is the ONE new thing in this UI: mounted in the title
  // band, or (headerless host, which draws its own title) directly above the
  // sidebar list. Every other control keeps the position it has always had.
  const branchControl = activeGroupCwd ? (
    <SwitchBranchControl
      detail={activeGroupDetail}
      variant="header"
      onSwitch={handleSwitchBranch}
    />
  ) : null;

  return (
    <>
    <div
      ref={workspaceRootRef}
      // Marks the terminal context for App: while focus is inside, the app
      // shortcuts stand down (CmdOrCtrl+N here is the terminal's business).
      // Focus is not required — tests and screenshots may not move it — so
      // App also checks containment when the event originates here.
      data-terminal-context="true"
      className="window-root flex h-full min-h-0 flex-col overflow-hidden"
    >
      {/* Header — edge-to-edge title band with only a bottom hairline.
          Not rendered when the host window draws the title itself (the
          summoned window puts it in the overlay bar next to the traffic
          lights). The in-app panel (TerminalPanel) keeps this header with
          its custom close button. */}
      {!hideHeader && (
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
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100 shrink-0">{t("terminal.title")}</h2>
          {headerExtra}
          {branchControl}
        </div>
        <div className="flex items-center gap-2">
          {/* The summoned window renders native traffic lights in its own
              overlay title bar, so its header close button would duplicate
              the system one. The in-app panel has no traffic lights and
              keeps its custom close button. */}
          {!headerDraggable && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("common.close")}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>
      )}

      {/* Floating partitions (same kit as the main window): the sidebar and
          the terminal column are app-panels over the window material with a
          --panel-gap gutter. The header above stays edge-to-edge. */}
      <div className="flex flex-1 min-h-0 gap-[var(--panel-gap)] p-[var(--panel-gap)]">
        {/* Project sidebar */}
        <div className="app-panel w-52 shrink-0 flex flex-col overflow-hidden">
          {/* Headerless host (the summoned window draws its own title bar):
              the branch control the title band would carry sits directly
              above the project list, where the project in view is chosen. */}
          {hideHeader && branchControl && (
            <div className="px-3 pt-2.5 pb-1 shrink-0 min-w-0">{branchControl}</div>
          )}
          <div className="px-3 pt-3 pb-1.5 flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              {t("terminal.projects")}
            </span>

            {keys.length > 1 && (
              <KbdBadge label={t("terminal.switchGroupBadge")} size="sm" title={t("terminal.switchGroup")} />
            )}
            <div className="ml-auto w-16">
              <SelectDropdown
                options={projectOptions}
                value=""
                onChange={handleNewInProject}
                placeholder={t("terminal.newPlaceholder")}
                ariaLabel={t("terminal.newAria")}
                disabled={opening}
                size="sm"
                openSignal={newMenuSignal}
                loading={projectsPending}
                loadingLabel={t("terminal.projectsLoading")}
              />
            </div>
          </div>
          {keys.length > 8 && (
            <div className="px-2 pb-1.5">
              <input
                type="text"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                placeholder={t("terminal.filterPlaceholder")}
                aria-label={t("terminal.filterAria")}
                className="w-full px-2 py-1 text-xs rounded-md bg-[var(--surface-2)] border border-[var(--border-color)] text-gray-700 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-0.5">
            {/* Groups reorder by drag as whole blocks: a group keeps its tabs
                in order and simply moves past its neighbours. */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleGroupDragEnd}
            >
              <SortableContext items={visibleKeys} strategy={verticalListSortingStrategy}>
                {visibleKeys.map((key) => {
                  const group = sessionsOfProject(state, key);
                  const title = group[0]?.projectTitle || fallbackTitle;
                  const cwd = group[0]?.cwd || "";
                  const hasLive = group.some((s) => !s.exited);
                  const isActive = key === activeProject;
                  const items = quickItems[cwd];
                  return (
                    <SortableRow key={key} id={key} axis="y">
                      {({ setNodeRef, style, attributes, listeners, isDragging, dragged }) => (
                        <div
                          ref={setNodeRef}
                          style={style}
                          data-project-key={key}
                          data-dragging={isDragging ? "" : undefined}
                          {...listeners}
                          onClick={() => {
                            if (dragged()) return;
                            setActiveProject(key);
                          }}
                          onContextMenu={(e) => handleProjectContextMenu(e, key)}
                          onMouseEnter={() => preloadQuickItems(cwd)}
                          onFocus={() => preloadQuickItems(cwd)}
                          title={cwd || title}
                          className={`group relative flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-grab active:cursor-grabbing transition-all duration-200 hover:translate-x-0.5 active:scale-[0.98] ${
                            isDragging
                              ? "bg-[var(--surface-1)] shadow-lg ring-1 ring-[var(--accent)]/30"
                              : isActive
                                ? "bg-[var(--surface-2)] text-gray-900 dark:text-gray-100 font-semibold"
                                : "hover:bg-gray-100 dark:hover:bg-gray-800"
                          }`}
                        >
                          {isActive && (
                            <span
                              aria-hidden="true"
                              className="term-proj-rail absolute left-[-8px] top-[7px] bottom-[7px] w-[3px] rounded bg-[var(--accent)]"
                            />
                          )}
                          <span
                            aria-hidden="true"
                            title={hasLive ? undefined : t("terminal.exited")}
                            className={`w-[7px] h-[7px] rounded-full shrink-0 ${
                              hasLive ? "bg-emerald-400 term-dot-live" : "bg-red-500"
                            }`}
                          />
                          <button
                            type="button"
                            {...attributes}
                            onClick={() => {
                              if (dragged()) return;
                              setActiveProject(key);
                            }}
                            className="flex-1 min-w-0 truncate text-left text-xs text-gray-700 dark:text-gray-200"
                          >
                            {title}
                          </button>
                          {/* Quick-run ▶: fixed 20px slot, visibility-toggled so the
                              count pill never shifts when it appears (preview .run).
                              Opens the same searchable listbox the rest of the app
                              uses. Hidden once loaded and confirmed empty — no
                              shortcuts, no button. Stays visible while loading (items
                              undefined) so hover-preload can still resolve. */}
                          <CommandMenu
                            ariaLabel={t("terminal.quickRunAria", { title })}
                            title={t("terminal.quickRun")}
                            items={items ?? []}
                            loading={items === undefined}
                            onLoad={() => preloadQuickItems(cwd)}
                            onSelect={(item) => handleQuickRun(cwd, title, item)}
                            loadingLabel={t("terminal.quickRunLoading")}
                            emptyLabel={t("terminal.quickRunEmpty")}
                            noMatchLabel={t("terminal.quickRunNoMatch")}
                            hidden={items !== undefined && items.length === 0}
                            hoverOnly
                            className="shrink-0 w-5 h-5 inline-flex items-center justify-center"
                            triggerClassName="press w-5 h-5 inline-flex items-center justify-center rounded text-gray-400 hover:text-emerald-500 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-90"
                          />
                          <span className={`text-[10px] tabular-nums shrink-0 min-w-6 px-[7px] py-px rounded-full text-center ${
                            isActive
                              ? "bg-[var(--accent)] text-white"
                              : "text-gray-400 bg-[var(--surface-2)]"
                          }`}>
                            {group.length}
                          </span>
                        </div>
                      )}
                    </SortableRow>
                  );
                })}
              </SortableContext>
            </DndContext>
          </div>
          <div className="p-2 border-t border-[var(--border-color)] space-y-0.5">
            <DropdownMenu
              trigger={
                <button
                  type="button"
                  className="w-full text-left px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  {t("terminal.workspaces")}
                </button>
              }
              loading={presetsLoading}
              loadingLabel={t("terminal.workspacesLoading")}
              loadingSkeleton={
                /* Mirrors a saved workspace row: name line, `terminalsCount`
                   description under it, and the hover-only delete button's
                   slot on the right. */
                <SkeletonGroup>
                  {["58%", "46%"].map((width) => (
                    <div key={width} className="px-3 py-2 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex h-5 items-center">
                          <Skeleton className="h-4 rounded-sm" style={{ width }} />
                        </div>
                        <div className="mt-0.5 flex h-4 items-center">
                          <Skeleton className="h-3 w-[34%] rounded-sm" />
                        </div>
                      </div>
                      <Skeleton className="mr-2 h-3.5 w-3.5 shrink-0 rounded" />
                    </div>
                  ))}
                </SkeletonGroup>
              }
            >
              {presets.length === 0 && !presetsLoading && (
                <div className="px-3 py-2 text-xs text-gray-400">{t("terminal.noWorkspaces")}</div>
              )}
              {presets.map((p) => (
                <div key={p.id} className="group flex items-center">
                  <div className="flex-1 min-w-0">
                    <MenuItem
                      label={p.name}
                      description={t("terminal.terminalsCount", { count: p.items.length })}
                      onClick={() => void launchWorkspace(p.items)}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeletePreset(p.id)}
                    aria-label={t("terminal.deleteAria", { name: p.name })}
                    title={t("terminal.delete")}
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
                {t("terminal.saveWorkspace")}
              </button>
            </DropdownMenu>
            {sessions.length > 0 && (
              <button
                type="button"
                onClick={() => setKillAllOpen(true)}
                className="w-full text-left px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {t("terminal.killAll")}
              </button>
            )}
          </div>
        </div>

        {/* Terminals for the active project */}
        <div className="flex-1 min-w-0 flex flex-col gap-[var(--panel-gap)]">
          {activeGroup.length > 0 && (
          <div className="app-panel relative px-2 py-1.5 flex items-center gap-1.5 shrink-0">
            {/* The strip scrolls, the chrome does not. Tabs hold a fixed width
                (--term-tab-width) so one more tab never squeezes a title into
                unreadability; past the panel's width the strip scrolls, and
                the fades + arrows below are its only scrollbar. */}
            <div className="relative flex-1 min-w-0">
              <div
                ref={tabbarRef}
                data-testid="terminal-tab-strip"
                className="no-scrollbar relative flex items-center gap-1.5 overflow-x-auto"
              >
                <span
                  aria-hidden="true"
                  className="term-tab-indicator pointer-events-none absolute left-0 inset-y-0 rounded-md bg-[var(--surface-2)] shadow-[inset_0_0_0_1px_var(--border-color)]"
                  style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
                />
                {/* Tabs reorder by drag: the row follows the pointer along the
                    strip, the drop lands it on the slot it was over, and the new
                    order is mirrored to the backend so every window agrees. */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={() => {
                    setTabHoverId(null);
                    setTabDragActive(true);
                  }}
                  onDragEnd={(event) => {
                    setTabDragActive(false);
                    handleTabDragEnd(event);
                  }}
                  onDragCancel={() => setTabDragActive(false)}
                >
                  <SortableContext items={activeTabIds} strategy={horizontalListSortingStrategy}>
                    {activeGroup.map((s) => (
                      <SortableRow key={s.id} id={s.id} axis="x">
                        {({ setNodeRef, style, attributes, listeners, isDragging, dragged }) => (
                          <div
                            ref={setNodeRef}
                            style={style}
                            data-tab-id={s.id}
                            data-dragging={isDragging ? "" : undefined}
                            {...listeners}
                            onClick={() => {
                              if (dragged()) return;
                              if (s.id === activeId) {
                                setTabSquish((prev) => ({ id: s.id, tick: (prev?.tick ?? 0) + 1 }));
                              }
                              selectTerminal(s.id);
                            }}
                            onContextMenu={(e) => handleTabContextMenu(e, s)}
                            onMouseDown={(e) => {
                              setTabHoverId(null);
                              if (e.button === 1) e.preventDefault();
                            }}
                            onAuxClick={(e) => {
                              if (e.button === 1) closeTab(s.id);
                            }}
                            onPointerEnter={(e) => {
                              if (tabDragActive) return;
                              tabHoverRef.current = e.currentTarget;
                              setTabHoverId(s.id);
                            }}
                            onPointerLeave={() => {
                              tabHoverRef.current = null;
                              setTabHoverId(null);
                            }}
                            className={`group relative z-[1] flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs shrink-0 w-[var(--term-tab-width)] cursor-grab active:cursor-grabbing transition-all duration-200 hover:-translate-y-px active:scale-[0.98] ${
                              newTabIds.current.delete(s.id) ? "term-tab-new" : ""
                            }${
                              tabSquish && tabSquish.id === s.id ? ` term-tab-squish tab-squish-${tabSquish.tick}` : ""
                            } ${
                              isDragging
                                ? "bg-[var(--surface-1)] shadow-lg ring-1 ring-[var(--accent)]/30"
                                : s.id === activeId
                                  ? "text-gray-900 dark:text-gray-100 font-medium"
                                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                          >
                            <button
                              type="button"
                              {...attributes}
                              aria-label={s.title}
                              onClick={() => {
                                if (dragged()) return;
                                selectTerminal(s.id);
                              }}
                              className="flex items-center gap-1.5 min-w-0 flex-1"
                            >
                              <TabLabel text={s.title} className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left" />
                              {s.exited && (
                                <span className="text-[9px] uppercase tracking-wide px-1 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 shrink-0">
                                  {t("terminal.exitedBadge")}
                                </span>
                              )}
                            </button>
                            {s.command && (
                              <button
                                type="button"
                                onClick={() => void restartTerminal(s.id)}
                                aria-label={t("terminal.restartAria", { title: s.title })}
                                title={t("terminal.restart")}
                                className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0"
                              >
                                <svg aria-hidden="true" width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                                  <path d="M8 2a6 6 0 106 6 .75.75 0 011.5 0A7.5 7.5 0 118 .5a.75.75 0 010 1.5z" />
                                  <path d="M14 2.75a.75.75 0 01.75-.75h2a.75.75 0 01-.75.75v2a.75.75 0 01-1.5 0V4.06l-1.97 1.97a.75.75 0 11-1.06-1.06l1.97-1.97h-1.19a.75.75 0 01-.75-.75z" />
                                </svg>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => closeTab(s.id)}
                              aria-label={t("terminal.closeAria", { title: s.title })}
                              className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 transition-colors shrink-0"
                            >
                              <CloseIcon size={10} />
                            </button>
                          </div>
                        )}
                      </SortableRow>
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
              {tabStrip.overflow && !tabStrip.atStart && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[var(--panel-bg)] to-transparent"
                />
              )}
              {tabStrip.overflow && !tabStrip.atEnd && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[var(--panel-bg)] to-transparent"
                />
              )}
              {tabStrip.overflow && !tabStrip.atStart && (
                <button
                  type="button"
                  onClick={() => tabStrip.scrollBy(-1)}
                  aria-label={t("terminal.scrollTabsLeft")}
                  className="absolute left-1 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full border border-[var(--border-color)] bg-[var(--surface-1)] text-gray-500 shadow-sm transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M10.53 3.47a.75.75 0 010 1.06L6.06 8l4.47 3.47a.75.75 0 11-1.06 1.06L4.47 8.53a.75.75 0 010-1.06l5-5a.75.75 0 011.06 0z" />
                  </svg>
                </button>
              )}
              {tabStrip.overflow && !tabStrip.atEnd && (
                <button
                  type="button"
                  onClick={() => tabStrip.scrollBy(1)}
                  aria-label={t("terminal.scrollTabsRight")}
                  className="absolute right-1 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded-full border border-[var(--border-color)] bg-[var(--surface-1)] text-gray-500 shadow-sm transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                    <path d="M5.47 3.47a.75.75 0 011.06 0l5 5a.75.75 0 010 1.06l-5 5a.75.75 0 11-1.06-1.06L9.94 8 5.47 4.53a.75.75 0 010-1.06z" />
                  </svg>
                </button>
              )}
              {/* The full title, revealed after a hover: the tab itself shows a
                  fixed width with the middle elided, so this is the only place
                  the whole name is readable. The hint rides along because the
                  native title attribute that used to carry it would now stack a
                  second tooltip on top of this one. */}
              <HoverTooltip anchorRef={tabHoverRef} visible={hoveredTab !== null}>
                <span className="block break-all">{hoveredTab?.title}</span>
                <span className="mt-0.5 block text-[11px] opacity-60">{t("terminal.middleClickHint")}</span>
              </HoverTooltip>
            </div>
            {/* One more tab in the project whose terminals are shown; the
                tooltip names the chord that does the same thing. */}
            {activeGroup.length > 0 && (
              <button
                type="button"
                onClick={newTerminalInActiveProject}
                disabled={opening}
                title={`${t("terminal.newTerminal")} — ${newTabDisplay}`}
                aria-label={t("terminal.newTerminal")}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0 disabled:opacity-50"
              >
                {/* The tab bar's "+" greys out while the pty spawns; without
                    the arc the click reads as ignored. */}
                {opening ? <Spinner size="sm" /> : <PlusIcon />}
              </button>
            )}
            {activeGroup.length > 1 && (
              <span className="shrink-0 ml-1">
                <KbdBadge
                  label="⌘←→"
                  size="sm"
                  title={t("terminal.switchTabs")}
                />
              </span>
            )}
          </div>
          )}

          {error && (
            <div className="px-4 py-1.5 text-xs text-red-500 border-b border-[var(--border-color)] shrink-0">
              {error}
            </div>
          )}

          {/* All sessions stay mounted so every project keeps its scrollback.
              sessions[] === 0 is reachable (fresh window, or after Kill All):
              show the global empty state. Per-project empty (activeGroup empty
              while sessions exist) can't happen — project keys derive from
              sessions and applySessions always retargets activeProject — so
              there is no per-project empty branch.
              The animation must not remount the xterm containers:
              TerminalCanvas attach/dispose is tied to mount, so a keyed
              remount per tab switch would destroy the view under it. Only
              the active session's wrapper carries the entrance class.
              inset-2: the panel's rounded corners would otherwise clip the
              terminal's edge cells (prompt char, scrollbar). */}
          <div className="app-panel relative flex-1 min-h-0 overflow-hidden">
            {sessions.length === 0 ? (
              bootstrapping ? (
                <TerminalRestoringSkeleton label={t("terminal.restoringSessions")} />
              ) : bootstrapError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
                  <span className="text-sm text-red-500">{t("terminal.restoreFailed")}</span>
                  <span className="max-w-md break-words text-[11px] text-gray-400">{bootstrapError}</span>
                  <button
                    type="button"
                    onClick={() => void retrySessions()}
                    className="press mt-1 px-3 py-1.5 text-xs rounded-md border border-[var(--border-color)] text-gray-700 dark:text-gray-200 hover:bg-[var(--surface-2)] transition-colors"
                  >
                    {t("common.retry")}
                  </button>
                </div>
              ) : (
              <TerminalBlankSlate
                projects={[...projects]
                  .sort((a, b) =>
                    (b.project.last_active_at ?? "").localeCompare(a.project.last_active_at ?? "")
                  )
                  .map((p) => ({
                    cwd: p.project.path,
                    title: p.project.name,
                  }))}
                fallbackTitle={fallbackTitle}
                opening={opening}
                loading={projectsPending}
                loadFailed={projectsError && !projectsLoaded}
                onRetry={() => {
                  setProjectsLoaded(false);
                  setProjectsError(false);
                  setProjectsLoadTick((n) => n + 1);
                }}
                onNew={(cwd, title) => void handleNewTerminal(cwd, title)}
                onQuickRun={handleQuickRun}
              />
              )
            ) : (
              <div className="absolute inset-0">
              {paneIds.map((id) => {
                const s = sessionsById.get(id);
                if (!s) return null;
                return (
                  <TerminalCanvas
                    key={id}
                    id={id}
                    active={id === activeId}
                    animateIn={id === activeId}
                    ready={isSessionReady(id)}
                    startingLabel={t("terminal.startingShell")}
                    onAttach={attachTerminal}
                    onDetach={detachTerminal}
                    onFit={fitTerminal}
                    onContextMenu={handleCanvasContextMenu}
                  />
                );
              })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    <ContextMenu {...tabMenu.menuProps} minWidth={200}>
      {menuSession && (
        <>
          <MenuItem
            label={t("terminal.newTerminal")}
            disabled={!menuSession.cwd}
            onClick={() => void handleNewTerminal(menuSession.cwd, menuSession.projectTitle)}
          />
          <MenuItem
            label={t("terminal.openInFinder")}
            disabled={!menuSession.cwd}
            onClick={() => {
              if (menuSession.cwd)
                api.openInFinder(menuSession.cwd).catch((e) => setError(parseError(e)));
            }}
          />
          <MenuItem
            label={t("terminal.systemTerminal")}
            disabled={!menuSession.cwd}
            onClick={() => {
              if (menuSession.cwd)
                api.openInTerminal(menuSession.cwd).catch((e) => setError(parseError(e)));
            }}
          />
          <MenuItem label={t("terminal.copyPath")} disabled={!menuSession.cwd} onClick={handleCopyTabPath} />
          <MenuSeparator />
          <MenuItem
            label={t("terminal.restart")}
            disabled={!menuSession.command}
            onClick={() => void restartTerminal(menuSession.id)}
          />
          <MenuItem label={t("common.close")} onClick={() => closeTab(menuSession.id)} />
          <MenuSeparator />
          <MenuItem
            label={t("terminal.closeOthers")}
            danger
            disabled={activeGroup.every((s) => s.id === menuSession.id)}
            onClick={handleCloseOtherTabs}
          />
        </>
      )}
    </ContextMenu>
    <ContextMenu {...sidebarMenu.menuProps} minWidth={200}>
      {menuProject && (
        <>
          <MenuItem
            label={t("terminal.newTerminal")}
            disabled={!menuProject.cwd}
            onClick={() => void handleNewTerminal(menuProject.cwd, menuProject.title)}
          />
          <MenuItem
            label={t("terminal.openInFinder")}
            disabled={!menuProject.cwd}
            onClick={() => {
              if (menuProject.cwd)
                api.openInFinder(menuProject.cwd).catch((e) => setError(parseError(e)));
            }}
          />
          <MenuItem
            label={t("terminal.systemTerminal")}
            disabled={!menuProject.cwd}
            onClick={() => {
              if (menuProject.cwd)
                api.openInTerminal(menuProject.cwd).catch((e) => setError(parseError(e)));
            }}
          />
          <MenuItem
            label={t("terminal.copyPath")}
            disabled={!menuProject.cwd}
            onClick={() => {
              if (!menuProject.cwd) return;
              navigator.clipboard.writeText(menuProject.cwd).catch((e) => setError(parseError(e)));
            }}
          />
          <MenuSeparator />
          <MenuItem
            label={t("terminal.closeAllTerminals")}
            danger
            disabled={!sessions.some((s) => s.projectKey === menuProject.key)}
            onClick={() => void closeProjectTerminals(menuProject.key)}
          />
        </>
      )}
    </ContextMenu>
    <ContextMenu {...canvasMenu.menuProps} minWidth={180}>
      <MenuItem
        label={t("terminal.canvasCopy")}
        disabled={!canvasSelection}
        onClick={handleCanvasCopy}
      />
      <MenuItem
        label={t("terminal.canvasPaste")}
        disabled={!activeId}
        onClick={handleCanvasPaste}
      />
      <MenuItem
        label={t("terminal.canvasSelectAll")}
        disabled={!activeId}
        onClick={handleCanvasSelectAll}
      />
      <MenuItem
        label={t("terminal.canvasClear")}
        disabled={!activeId}
        onClick={handleCanvasClear}
      />
    </ContextMenu>
    <Modal
      open={saveOpen}
      onClose={() => setSaveOpen(false)}
      title={t("terminal.saveWorkspaceModal")}
      subtitle={t("terminal.terminalsCount", { count: sessions.length })}
    >
      <div className="p-4 space-y-3">
        <input
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder={t("terminal.workspaceNamePlaceholder")}
          aria-label={t("terminal.workspaceNamePlaceholder")}
          autoFocus
          className="w-full px-2.5 py-1.5 text-sm rounded-md bg-[var(--surface-2)] border border-[var(--border-color)] text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setSaveOpen(false)}
            className="px-3 py-1.5 text-xs rounded-md bg-[var(--surface-2)] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleSaveWorkspace()}
            disabled={!saveName.trim()}
            className="px-3 py-1.5 text-xs rounded-md bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white transition-colors disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </Modal>
    <ConfirmDialog
      open={killAllOpen}
      title={t("terminal.killAllTitle")}
      message={t("terminal.killAllMessage", { count: sessions.length })}
      confirmLabel={t("terminal.killAll")}
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
