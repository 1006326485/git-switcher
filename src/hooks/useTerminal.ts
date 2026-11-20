import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import * as api from "../lib/tauri";
import { resyncTerminalViewport } from "../lib/terminalViewport";
import { diag, diagEnabled, diagExpose, diagReset } from "../lib/terminalDiag";
import {
  applySessions,
  nextActiveInProject,
  nextProjectKey,
  orderSessions,
  projectKeys,
  sessionsOfProject,
  setActive,
  setActiveProject,
  upsertSession,
  EMPTY_TABS,
  type TerminalTabsState,
  type TerminalSessionState,
} from "../lib/terminalTabs";

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const PENDING_CHUNK_LIMIT = 500;

interface TerminalView {
  term: Terminal;
  fitAddon: FitAddon;
}

/**
 * The single write path from a view to its shared pty session. Both `term.onData`
 * (typing) and the canvas menu's Paste go through here so injected input is
 * indistinguishable from keystrokes at the backend.
 */
function writeToPty(id: string, data: string) {
  api.terminalWrite(id, data).catch(() => {});
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function xtermTheme(dark: boolean): ITheme {
  return dark
    ? { background: "#1f2329", foreground: "#e6e6e6", cursor: "#7aa2f7", selectionBackground: "#3b4261" }
    : { background: "#ffffff", foreground: "#23272e", cursor: "#2563eb", selectionBackground: "#bfdbfe" };
}

// Tearing down an xterm while its write pipeline (or a queued refresh) is
// still flushing crashes inside `syncScrollArea`; draining the queue first.
function disposeSafely(term: Terminal) {
  try {
    term.write("", () => {
      try {
        term.dispose();
      } catch {
        // already disposed
      }
    });
  } catch {
    try {
      term.dispose();
    } catch {
      // already disposed
    }
  }
}

/**
 * Terminal state shared across windows: session metadata lives in the Rust
 * backend (broadcast via `terminal-sessions`), every window renders its own
 * xterm over the same pty output stream (`terminal-data`, broadcast).
 */
export function useTerminal() {
  const [tabs, setTabs] = useState<TerminalTabsState>(EMPTY_TABS);
  /**
   * True until the first `terminal_list` settles. Without this the workspace
   * could not tell "we have not asked yet" from "you have no sessions", so
   * summoning a window with live shells briefly showed the empty-canvas
   * prose ("No terminals open") before the tabs popped in.
   */
  const [bootstrapping, setBootstrapping] = useState(true);
  /** Set when the first `terminal_list` failed; the list may be incomplete. */
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  /**
   * Sessions whose pty has produced output in this window. The pane can be
   * mounted before the shell prints anything (zsh + rc files take a few
   * hundred ms), and a blank canvas is indistinguishable from a hung one.
   */
  const [readyIds, setReadyIds] = useState<ReadonlySet<string>>(() => new Set());
  const viewsRef = useRef(new Map<string, TerminalView>());
  const pendingRef = useRef(new Map<string, Uint8Array[]>());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const darkRef = useRef(false);

  /**
   * Reads the live session list from the backend. Previously fired once,
   * unchecked: a failure was swallowed and left the workspace rendering the
   * "no terminals" slate forever, with no way to recover.
   */
  const loadSessions = useCallback(async () => {
    setBootstrapping(true);
    setBootstrapError(null);
    try {
      const list = await api.terminalList();
      setTabs((prev) => applySessions(prev, list));
    } catch (error) {
      setBootstrapError(error instanceof Error ? error.message : String(error));
    } finally {
      setBootstrapping(false);
    }
  }, []);

  useEffect(() => {
    const unlistenData = listen<{ id: string; data: string }>("terminal-data", (event) => {
      const { id, data } = event.payload;
      const bytes = base64ToBytes(data);
      const view = viewsRef.current.get(id);
      if (view) {
        // First bytes for this session in this window: the shell is alive, so
        // the "starting" overlay can go away.
        setReadyIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
        view.term.write(bytes);
        // TEMP-DIAG: diag() dedups on state change, so this is cheap unless the
        // scroll state actually moved — that is exactly the transition to catch.
        diag(id, "output", view.term, false, `bytes=${bytes.length}`);
        return;
      }
      // Output can arrive before the xterm container mounts; buffer it briefly.
      const pending = pendingRef.current.get(id) ?? [];
      if (pending.length < PENDING_CHUNK_LIMIT) pending.push(bytes);
      pendingRef.current.set(id, pending);
    });

    const unlistenSessions = listen<TerminalSessionState[]>("terminal-sessions", (event) => {
      setTabs((prev) => applySessions(prev, event.payload));
    });

    // A tray quick-launch brings its newest session to the front.
    const unlistenFocus = listen<{ id: string }>("terminal-focus-session", (event) => {
      const id = event.payload.id;
      setTabs((prev) => (prev.sessions.some((s) => s.id === id) ? setActive(prev, id) : prev));
    });

    loadSessions();

    return () => {
      unlistenData.then((fn) => fn()).catch(() => {});
      unlistenSessions.then((fn) => fn()).catch(() => {});
      unlistenFocus.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // Keep the readiness set in step with the session list: drop ids whose
  // session is gone (they can never be rendered again) and treat an already
  // exited session as ready — it will never print another byte, so an
  // "Starting shell…" overlay on it would be a permanent lie.
  useEffect(() => {
    setReadyIds((prev) => {
      const known = new Set(tabs.sessions.map((s) => s.id));
      const next = new Set<string>();
      let changed = false;
      for (const id of prev) {
        if (known.has(id)) next.add(id);
        else changed = true; // session gone: it can never render again
      }
      for (const session of tabs.sessions) {
        if (session.exited && !next.has(session.id)) {
          next.add(session.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tabs.sessions]);

  useEffect(() => {
    const views = viewsRef.current;
    return () => {
      // Sessions are shared across windows and killed by the backend on exit;
      // unmounting a view must never close them.
      for (const view of views.values()) disposeSafely(view.term);
      views.clear();
    };
  }, []);

  const disposeView = useCallback((id: string) => {
    const view = viewsRef.current.get(id);
    viewsRef.current.delete(id);
    pendingRef.current.delete(id);
    if (view) disposeSafely(view.term);
  }, []);

  const openTerminal = useCallback(
    async (cwd: string, projectTitle: string, title?: string, command?: string) => {
      const meta = await api.terminalOpen(cwd, DEFAULT_COLS, DEFAULT_ROWS, {
        title,
        projectTitle,
        command,
      });
      if (command) {
        await api.terminalWrite(meta.id, `${command}\r`);
      }
      setTabs((prev) => upsertSession(prev, meta));
    },
    []
  );

  const closeTerminal = useCallback(
    async (id: string) => {
      try {
        await api.terminalClose(id);
      } catch {
        // Session already gone — the tab still needs to disappear.
      }
      disposeView(id);
      setTabs((prev) => applySessions(prev, prev.sessions.filter((s) => s.id !== id)));
    },
    [disposeView]
  );

  const restartTerminal = useCallback(
    async (id: string) => {
      const session = tabsRef.current.sessions.find((s) => s.id === id);
      if (!session?.command) return;
      await closeTerminal(id);
      await openTerminal(
        session.cwd,
        session.projectTitle,
        session.title,
        session.command
      );
    },
    [closeTerminal, openTerminal]
  );

  const closeProjectTerminals = useCallback(
    async (projectKey: string) => {
      const ids = tabsRef.current.sessions
        .filter((s) => s.projectKey === projectKey)
        .map((s) => s.id);
      if (ids.length === 0) return;
      for (const id of ids) disposeView(id);
      setTabs((prev) =>
        applySessions(prev, prev.sessions.filter((s) => s.projectKey !== projectKey))
      );
      await Promise.all(ids.map((id) => api.terminalClose(id).catch(() => {})));
    },
    [disposeView]
  );

  const closeAllTerminals = useCallback(async () => {
    const ids = tabsRef.current.sessions.map((s) => s.id);
    if (ids.length === 0) return;
    for (const id of ids) disposeView(id);
    setTabs((prev) => applySessions(prev, []));
    await Promise.all(ids.map((id) => api.terminalClose(id).catch(() => {})));
  }, [disposeView]);

  /**
   * Drag-reorder: applies the new order locally at once (the tab must land
   * under the pointer without waiting on IPC) and mirrors it to the backend,
   * which broadcasts it to the other windows. A rejected list means the
   * window raced a close/open; resync instead of trusting a private order.
   */
  const reorderSessions = useCallback((orderedIds: string[]) => {
    setTabs((prev) => {
      const sessions = orderSessions(prev.sessions, orderedIds);
      if (sessions.every((session, index) => session === prev.sessions[index])) return prev;
      return { ...prev, sessions };
    });
    api.terminalReorder(orderedIds).catch(() => {
      api
        .terminalList()
        .then((list) => setTabs((prev) => applySessions(prev, list)))
        .catch(() => {});
    });
  }, []);

  const selectTerminal = useCallback((id: string) => {
    setTabs((prev) => setActive(prev, id));
  }, []);

  const selectProject = useCallback((projectKey: string) => {
    setTabs((prev) => setActiveProject(prev, projectKey));
  }, []);

  const selectAdjacentProject = useCallback((dir: 1 | -1) => {
    setTabs((prev) => {
      const key = nextProjectKey(projectKeys(prev), prev.activeProject, dir);
      return key == null ? prev : setActiveProject(prev, key);
    });
  }, []);

  const selectTerminalByIndex = useCallback((index: number) => {
    setTabs((prev) => {
      const group = sessionsOfProject(prev, prev.activeProject ?? "");
      const target = group[index];
      return target ? setActive(prev, target.id) : prev;
    });
  }, []);

  const selectAdjacentTerminal = useCallback((dir: 1 | -1) => {
    setTabs((prev) => {
      if (prev.activeProject == null) return prev;
      const group = sessionsOfProject(prev, prev.activeProject);
      const current = group.findIndex((s) => s.id === prev.activeId);
      const id = nextActiveInProject(
        prev.sessions,
        prev.activeProject,
        current < 0 ? 0 : current,
        dir
      );
      return id == null ? prev : setActive(prev, id);
    });
  }, []);

  const attachTerminal = useCallback((id: string, container: HTMLElement) => {
    if (viewsRef.current.has(id)) return;
    const term = new Terminal({
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      fontSize: 12,
      cursorBlink: true,
      scrollback: 5000,
      theme: xtermTheme(darkRef.current),
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    diagReset(id);
    diag(id, "attach", term, true);
    term.onData((data) => {
      // Typing counts as proof of life: a command that prints nothing at all
      // (say `sleep 60`) would otherwise leave the "starting" cover up while
      // the user types invisibly underneath it.
      setReadyIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      // TEMP-DIAG: record what the user typed and whether it jumped the viewport.
      diag(id, "onData", term, true, `data=${JSON.stringify(data.slice(0, 24))}`);
      writeToPty(id, data);
    });
    // The shell reports its own title on every prompt (OSC 2, the one xterm
    // surfaces as `onTitleChange`), so a tab's name follows the cwd and whatever
    // is running instead of freezing at the spawn-time title. The report is kept
    // whole: how much of it fits is the tab's business, and the label is
    // truncated to the width it is given. Repeats are dropped here so a prompt
    // that re-sends the same title costs neither a round trip nor a broadcast,
    // and an empty report never blanks a tab. The backend likewise ignores
    // reports for tabs that were opened with an explicit command.
    let reported = "";
    term.onTitleChange((title) => {
      const next = title.trim();
      if (!next || next === reported) return;
      reported = next;
      api.terminalSetTitle(id, next).catch(() => {});
    });
    viewsRef.current.set(id, { term, fitAddon });
    const pending = pendingRef.current.get(id);
    if (pending) {
      pendingRef.current.delete(id);
      for (const chunk of pending) term.write(chunk);
    }
    fitAddon.fit();
    diag(id, "attach-fit", term, true);
  }, []);

  const detachTerminal = useCallback((id: string) => {
    disposeView(id);
  }, [disposeView]);

  // The pty size follows the focused window so two windows sharing a session
  // don't fight over rows/cols on every layout pass. Every caller is "this
  // session is becoming visible", so this is also where the viewport is
  // re-aligned after the container was display:none (see the module comment on
  // `resyncTerminalViewport`).
  const fitTerminal = useCallback((id: string) => {
    const view = viewsRef.current.get(id);
    if (!view) return;
    diag(id, "fit:before", view.term, true);
    view.fitAddon.fit();
    diag(id, "fit:after-fit", view.term, true);
    resyncTerminalViewport(view.term);
    diag(id, "fit:after-resync", view.term, true);
    if (!document.hasFocus()) return;
    api.terminalResize(id, view.term.cols, view.term.rows).catch(() => {});
  }, []);

  const focusTerminal = useCallback((id: string) => {
    viewsRef.current.get(id)?.term.focus();
  }, []);

  // Canvas-menu handles: read/edit the xterm instance for a session. Each is a
  // no-op when the id has no local view (e.g. a stale menu after the session
  // closed), mirroring `fitTerminal`/`focusTerminal`.
  const getSelection = useCallback((id: string) => {
    return viewsRef.current.get(id)?.term.getSelection() ?? "";
  }, []);

  const selectAll = useCallback((id: string) => {
    viewsRef.current.get(id)?.term.selectAll();
  }, []);

  // `clear`, not `reset`: the scrollback is wiped but the shell session and its
  // state (cwd, running process) are untouched.
  const clearScreen = useCallback((id: string) => {
    viewsRef.current.get(id)?.term.clear();
  }, []);

  const sendInput = useCallback((id: string, data: string) => {
    if (!viewsRef.current.has(id)) return;
    writeToPty(id, data);
  }, []);

  const setTerminalDark = useCallback((dark: boolean) => {
    darkRef.current = dark;
    for (const view of viewsRef.current.values()) {
      view.term.options.theme = xtermTheme(dark);
    }
  }, []);

  // Re-fit when this window regains focus so its layout wins the pty size.
  useEffect(() => {
    const onFocus = () => {
      const id = tabsRef.current.activeId;
      if (id) fitTerminal(id);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fitTerminal]);

  // TEMP-DIAG: sample every view at 4 Hz. `diag` only emits on state change, so
  // a steady terminal costs one Map lookup per tick; the log only grows when the
  // scroll state actually moves (the transition we are hunting).
  useEffect(() => {
    if (!diagEnabled()) return;
    diagExpose();
    const timer = window.setInterval(() => {
      for (const [id, view] of viewsRef.current) diag(id, "sample", view.term, false);
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  return {
    sessions: tabs.sessions,
    activeId: tabs.activeId,
    activeProject: tabs.activeProject,
    activeByProject: tabs.activeByProject,
    openTerminal,
    closeTerminal,
    restartTerminal,
    closeProjectTerminals,
    closeAllTerminals,
    selectTerminal,
    reorderSessions,
    setActiveProject: selectProject,
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
    bootstrapping,
    bootstrapError,
    retrySessions: loadSessions,
    /** True once the session's pty has printed something (or already exited). */
    isSessionReady: (id: string) => readyIds.has(id),
  };
}
