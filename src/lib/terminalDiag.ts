import { BaseDirectory } from "@tauri-apps/api/path";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { Terminal } from "@xterm/xterm";

/**
 * TEMPORARY DIAGNOSTIC — delete this file and every `diag*` call site once the
 * "fleet inspector needs manual scroll" bug (m00001) is diagnosed.
 *
 * Writes a state-transition log for every xterm instance to
 * `<app data dir>/terminal-viewport-diag.log`. The point is to catch the moment
 * a viewport stops following the tail: each sample records the full xterm scroll
 * state plus the event that produced it, so a `behind`/`latch` transition can be
 * attributed to a keystroke, a resize, a hide/show, or a burst of output.
 */

const LOG_NAME = "git-switcher-terminal-viewport-diag.log";
const MAX_LINES = 600;
const FLUSH_MS = 250;

const lines: string[] = [];
let flushScheduled = false;
let lastError = "";

function push(line: string) {
  lines.push(line);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  scheduleFlush();
}

function scheduleFlush() {
  if (flushScheduled) return;
  flushScheduled = true;
  void setTimeout(() => {
    flushScheduled = false;
    const text = lines.join("") + `__END__ ${lastError}\n`;
    // AppData is where the rest of the app already writes (git-switcher.db), but
    // the identifier-derived directory may not exist yet and writeTextFile does
    // not create parents. Home's root always exists and is inside the fs scope,
    // so it is the fallback.
    writeTextFile(LOG_NAME, text, { baseDir: BaseDirectory.AppData, create: true })
      .catch(() => writeTextFile(LOG_NAME, text, { baseDir: BaseDirectory.Home, create: true }))
      .catch((e) => {
        lastError = String(e).slice(0, 200);
      });
  }, FLUSH_MS);
}

export function diagEnabled(): boolean {
  try {
    // On by default: this is a one-shot diagnostic build. Setting localStorage
    // `gs.diag` to "0" silences it without a rebuild.
    return typeof localStorage === "undefined" || localStorage.getItem("gs.diag") !== "0";
  } catch {
    return true;
  }
}

export interface ViewportState {
  viewportY: number;
  baseY: number;
  ydisp: number;
  ybase: number;
  rows: number;
  cols: number;
  latch: boolean;
  domScrollTop: number;
  domScrollHeight: number;
  domClientHeight: number;
  tailGap: number;
  behind: boolean;
}

/** Read xterm's scroll state. Tolerates missing internals across xterm builds. */
export function viewportState(term: Terminal): ViewportState {
  const st = { ...emptyState() };
  try {
    const active = term.buffer.active as { viewportY?: number; baseY?: number };
    st.viewportY = typeof active.viewportY === "number" ? active.viewportY : -1;
    st.baseY = typeof active.baseY === "number" ? active.baseY : -1;
  } catch {}
  st.rows = term.rows;
  st.cols = term.cols;
  st.behind = st.viewportY >= 0 && st.baseY > st.viewportY;
  return st;
}

function emptyState(): ViewportState {
  return {
    viewportY: -1,
    baseY: -1,
    ydisp: -1,
    ybase: -1,
    rows: -1,
    cols: -1,
    latch: false,
    domScrollTop: -1,
    domScrollHeight: -1,
    domClientHeight: -1,
    tailGap: -1,
    behind: false,
  };
}

/** Fill in the internals + DOM half of the state; only needed when logging. */
function enrich(term: Terminal, st: ViewportState): ViewportState {
  try {
    const core = (term as unknown as Record<string, unknown>)._core as Record<string, unknown>;
    const bs = (core.bufferService ?? core._bufferService) as
      | { isUserScrolling?: boolean; buffer?: { ydisp?: number; ybase?: number } }
      | undefined;
    if (bs && typeof bs.isUserScrolling === "boolean") st.latch = bs.isUserScrolling;
    const buf = bs?.buffer;
    if (buf) {
      if (typeof buf.ydisp === "number") st.ydisp = buf.ydisp;
      if (typeof buf.ybase === "number") st.ybase = buf.ybase;
    }
  } catch {}
  try {
    const el = (term as unknown as { element?: Element }).element;
    const host = el?.querySelector(".xterm-viewport") ?? null;
    if (host) {
      st.domScrollTop = host.scrollTop;
      st.domScrollHeight = host.scrollHeight;
      st.domClientHeight = host.clientHeight;
      st.tailGap = host.scrollHeight - host.clientHeight - host.scrollTop;
    }
  } catch {}
  return st;
}

function fmt(s: ViewportState): string {
  return `vY=${s.viewportY} bY=${s.baseY} ydisp=${s.ydisp} ybase=${s.ybase} rows=${s.rows} cols=${s.cols} latch=${s.latch} domTop=${s.domScrollTop} domH=${s.domScrollHeight} clientH=${s.domClientHeight} tailGap=${s.tailGap}${s.behind ? " BEHIND" : ""}`;
}

/**
 * Log a state transition for one terminal. Only emits when the scroll state
 * actually changed since the last call for that id, or when `force` is set.
 */
export function diag(id: string, event: string, term?: Terminal, force = false, note = "") {
  if (!diagEnabled()) return;
  const now = Date.now();
  const stamp = new Date(now).toISOString().slice(11, 23);
  if (!term) {
    push(`${stamp} [${id}] ${event} ${note}\n`);
    return;
  }
  // Cheap check first: the buffer's scroll position is the thing that decides
  // whether the view follows the tail, and reading it touches no DOM. The DOM
  // half of the state is only read when something actually changed, so a busy
  // terminal does not pay a `querySelector` per output chunk.
  const cheap = viewportState(term);
  const prev = seen.get(id);
  const cheapKey = `${cheap.viewportY}|${cheap.baseY}|${cheap.rows}|${cheap.cols}`;
  if (!force && prev !== undefined && seenCheap.get(id) === cheapKey && !cheap.behind) return;
  const s = enrich(term, cheap);
  const key = `${s.viewportY}|${s.baseY}|${s.latch}|${s.tailGap}|${s.rows}|${s.cols}`;
  if (!force && prev === key) return;
  const changedFrom = prev === undefined ? "" : ` (was ${prev})`;
  seen.set(id, key);
  seenCheap.set(id, cheapKey);
  push(`${stamp} [${id}] ${event} ${fmt(s)}${changedFrom} ${note}\n`);
}

const seen = new Map<string, string>();
const seenCheap = new Map<string, string>();

/** Clear the "last seen" snapshot so the next diag() always emits. */
export function diagReset(id: string) {
  seen.delete(id);
  seenCheap.delete(id);
}

/** Expose the buffer on window so it can be read from devtools. */
export function diagExpose() {
  try {
    (window as unknown as Record<string, unknown>).__diagDump = () => lines.join("");
  } catch {}
}
