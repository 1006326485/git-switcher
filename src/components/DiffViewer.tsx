import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as api from "../lib/tauri";
import { parseError, type GitFileEntry, type FileDiffStats } from "../lib/types";
import { parseDiff, parseDiffSideBySide, computeDiffStats, type DiffLine, type DiffHunkPair, type DiffSummary } from "./diffUtils";
import { getLanguage, getLanguageLabel, highlightLine } from "../lib/syntaxHighlight";
import { getOrComputeHighlight } from "../lib/highlightCache";

/**
 * Wrap all case-insensitive occurrences of `query` in an HTML string with <mark> tags.
 * If `currentOccurrence` is provided, that specific match gets the "diff-search-current" class.
 */
function highlightSearchMatchesWithCurrent(html: string, query: string, currentOccurrence?: number): string {
  if (!query) return html;
  const qLower = query.toLowerCase();

  let textIdx = 0;
  let occurrence = 0;
  const out: string[] = [];
  let i = 0;
  while (i < html.length) {
    if (html[i] === "<") {
      const close = html.indexOf(">", i);
      out.push(html.slice(i, close + 1));
      i = close + 1;
      continue;
    }
    if (html[i] === "&") {
      const semi = html.indexOf(";", i);
      if (semi !== -1 && semi - i <= 7) {
        out.push(html.slice(i, semi + 1));
        textIdx++;
        i = semi + 1;
        continue;
      }
    }
    const textChar = html[i].toLowerCase();
    if (textChar === qLower[0]) {
      let q = 0;
      let ti = i;
      while (q < qLower.length && ti < html.length) {
        if (html[ti] === "<") {
          const close = html.indexOf(">", ti);
          ti = close + 1;
          continue;
        }
        if (html[ti] === "&") {
          const semi = html.indexOf(";", ti);
          if (semi !== -1 && semi - ti <= 7) {
            if (html.slice(ti, semi + 1).toLowerCase() !== qLower[q]) break;
            q++;
            ti = semi + 1;
            continue;
          }
        }
        if (html[ti].toLowerCase() !== qLower[q]) break;
        q++;
        ti++;
      }
      if (q === qLower.length) {
        const cls = occurrence === currentOccurrence ? "diff-search-match diff-search-current" : "diff-search-match";
        out.push(`<mark class="${cls}">`);
        // Replay characters through <mark>
        let wi = i;
        let wq = 0;
        while (wq < qLower.length && wi < html.length) {
          if (html[wi] === "<") {
            const close = html.indexOf(">", wi);
            out.push(html.slice(wi, close + 1));
            wi = close + 1;
            continue;
          }
          if (html[wi] === "&") {
            const semi = html.indexOf(";", wi);
            if (semi !== -1 && semi - wi <= 7) {
              out.push(html.slice(wi, semi + 1));
              wq++;
              wi = semi + 1;
              continue;
            }
          }
          out.push(html[wi]);
          wq++;
          wi++;
        }
        out.push("</mark>");
        i = wi;
        occurrence++;
        textIdx += qLower.length;
        continue;
      }
    }
    out.push(html[i]);
    textIdx++;
    i++;
  }
  return out.join("");
}

/** Count case-insensitive occurrences of `query` in `text`. */
function countOccurrences(text: string, query: string): number {
  if (!query) return 0;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (text.match(new RegExp(escaped, "gi")) ?? []).length;
}

export { parseDiff, parseDiffSideBySide, computeDiffStats, type DiffLine, type DiffHunkPair, type DiffSummary } from "./diffUtils";

/** Info for a file in the file tree sidebar */
interface FileTreeItem {
  path: string;
  status: GitFileEntry["status"];
  stats: FileDiffStats | null; // null = not loaded yet
}

interface DiffViewerProps {
  path: string;
  filePath: string;
  onClose: () => void;
  /** Show staged (cached) diff instead of working tree diff */
  staged?: boolean;
  /** List of changed files for file tree navigation */
  files?: GitFileEntry[];
}

/** Build flat side-by-side rows from hunk pairs for virtualization */
function buildSplitLines(hunks: DiffHunkPair[]) {
  const rows: { old: { line: number | null; content: string }; new: { line: number | null; content: string }; type: "context" | "header" | "change" }[] = [];
  for (const hunk of hunks) {
    const maxLen = Math.max(hunk.old.length, hunk.new.length);
    for (let i = 0; i < maxLen; i++) {
      const o = hunk.old[i] ?? { line: null, content: "" };
      const n = hunk.new[i] ?? { line: null, content: "" };
      const isHeader = o.line === null && n.line === null && o.content === n.content;
      const isChange = o.content !== n.content && !isHeader;
      rows.push({
        old: o,
        new: n,
        type: isHeader ? "header" : isChange ? "change" : "context",
      });
    }
  }
  return rows;
}

const lineColors = {
  add: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200",
  del: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200",
  context: "",
  header: "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-semibold",
};

const ROW_HEIGHT = 20; // matches leading-5 (1.25rem = 20px)
const VIRTUALIZE_THRESHOLD = 200; // only virtualize for large diffs

/** Flat side-by-side row produced by buildSplitLines */
type SplitRowData = ReturnType<typeof buildSplitLines>[number];

/**
 * Highlight one diff row to HTML through the shared cache (see highlightCache.ts).
 * `prefix` is the diff marker shown before the highlighted code ("" in unified view).
 */
function rowHtml(content: string, prefix: string, language: string, searchQuery: string, currentOccurrence?: number): string {
  return getOrComputeHighlight(
    { content: prefix + content, language, searchQuery, currentOccurrence },
    () => {
      let html = prefix + highlightLine(content, language);
      if (searchQuery) html = highlightSearchMatchesWithCurrent(html, searchQuery, currentOccurrence);
      return html;
    },
  );
}

interface UnifiedRowProps {
  line: DiffLine;
  language: string;
  searchQuery: string;
  currentOccurrence?: number;
}

/** In-flow unified-view row (small diffs render as a plain table). */
const UnifiedRow = memo(function UnifiedRow({ line, language, searchQuery, currentOccurrence }: UnifiedRowProps) {
  return (
    <tr className={lineColors[line.type]}>
      <td className="w-10 text-right pr-1 pl-1 select-none text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">{line.oldLine ?? ""}</td>
      <td className="w-10 text-right pr-1 pl-1 select-none text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">{line.newLine ?? ""}</td>
      <td className="whitespace-pre px-2" dangerouslySetInnerHTML={{ __html: rowHtml(line.content, "", language, searchQuery, currentOccurrence) }} />
    </tr>
  );
});

/** Virtualized unified-view row: absolutely positioned at `top`, matching the split view. */
const UnifiedVirtualRow = memo(function UnifiedVirtualRow({ line, top, language, searchQuery, currentOccurrence }: UnifiedRowProps & { top: number }) {
  return (
    <div className={`absolute w-full grid grid-cols-[2.5rem_2.5rem_1fr] ${lineColors[line.type]}`} style={{ top, height: ROW_HEIGHT }}>
      <div className="text-right pr-1 pl-1 select-none text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">{line.oldLine ?? ""}</div>
      <div className="text-right pr-1 pl-1 select-none text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">{line.newLine ?? ""}</div>
      <div className="whitespace-pre px-2" dangerouslySetInnerHTML={{ __html: rowHtml(line.content, "", language, searchQuery, currentOccurrence) }} />
    </div>
  );
});

interface SplitRowProps {
  row: SplitRowData;
  side: "old" | "new";
  language: string;
  searchQuery: string;
  currentOccurrence?: number;
  /** Absolute offset for virtualized panes; omit for in-flow rows. */
  top?: number;
}

/** One side-by-side diff row (old or new pane). Memoized so scroll only re-renders changed rows. */
const SplitRow = memo(function SplitRow({ row, side, language, searchQuery, currentOccurrence, top }: SplitRowProps) {
  const isOld = side === "old";
  const sideLine = isOld ? row.old : row.new;
  const otherLine = isOld ? row.new : row.old;
  const changed = row.old.content !== row.new.content;
  const changedBg = isOld
    ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200"
    : "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200";
  const bg = row.type === "header"
    ? "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-semibold"
    : sideLine.line !== null && otherLine.line === null
      ? changedBg
      : sideLine.line === null && otherLine.line !== null
        ? "bg-gray-50 dark:bg-gray-800/50"
        : changed
          ? changedBg
          : "bg-white dark:bg-gray-900";
  const marker = isOld ? "-" : "+";
  const stripped = sideLine.content.startsWith(marker) ? sideLine.content.slice(1) : sideLine.content;
  const prefix = sideLine.content.startsWith(marker) ? `${marker} ` : "  ";
  const html = row.type === "header" ? stripped : rowHtml(stripped, prefix, language, searchQuery, currentOccurrence);
  const cells = (
    <>
      <div className="text-right pr-1 pl-1 select-none text-gray-400 dark:text-gray-500">{sideLine.line ?? ""}</div>
      <div className="whitespace-pre px-2" dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
  if (top !== undefined) {
    return (
      <div className={`absolute w-full grid grid-cols-[3rem_1fr] ${bg}`} style={{ top, height: ROW_HEIGHT }}>
        {cells}
      </div>
    );
  }
  return (
    <div className={`grid grid-cols-[3rem_1fr] ${bg}`} style={{ height: ROW_HEIGHT }}>
      {cells}
    </div>
  );
});

const FILE_STATUS_STYLES: Record<GitFileEntry["status"], { dot: string; label: string }> = {
  added: { dot: "bg-green-500", label: "A" },
  modified: { dot: "bg-yellow-500", label: "M" },
  deleted: { dot: "bg-red-500", label: "D" },
  renamed: { dot: "bg-blue-500", label: "R" },
  untracked: { dot: "bg-gray-400", label: "?" },
};

const FILE_STATUS_ICONS: Record<GitFileEntry["status"], { icon: string; color: string }> = {
  added: { icon: "+", color: "text-green-600 dark:text-green-400" },
  modified: { icon: "~", color: "text-yellow-600 dark:text-yellow-400" },
  deleted: { icon: "-", color: "text-red-600 dark:text-red-400" },
  renamed: { icon: "→", color: "text-blue-600 dark:text-blue-400" },
  untracked: { icon: "?", color: "text-gray-400 dark:text-gray-500" },
};

export const DiffViewer = memo(function DiffViewer({ path, filePath, onClose, staged, files }: DiffViewerProps) {
  const [raw, setRaw] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"unified" | "split">("unified");
  const scrollRef = useRef<HTMLDivElement>(null);
  const splitLeftRef = useRef<HTMLDivElement>(null);
  const splitRightRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const [currentHunkIdx, setCurrentHunkIdx] = useState(0);
  const treeListRef = useRef<HTMLDivElement>(null);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashCopied = useCallback((label: string) => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setCopiedLabel(label);
    copyTimerRef.current = setTimeout(() => setCopiedLabel(null), 1500);
  }, []);

  // ── Copy helpers ─────────────────────────────────────────────────────
  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flashCopied(label);
    } catch {
      // fallback: textarea trick
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      flashCopied(label);
    }
  }, [flashCopied]);

  const copyCurrentDiff = useCallback(() => {
    if (raw) copyText(raw, "Diff copied!");
  }, [raw, copyText]);

  // Cleanup copy timer
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

  // ── Search state ─────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  // Effective query: debounced so typing does not rescan the diff on every keystroke.
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatch, setCurrentMatch] = useState(0);

  useEffect(() => {
    if (searchInput === "") {
      setSearchQuery("");
      return;
    }
    const timer = setTimeout(() => {
      setSearchQuery(searchInput);
      setCurrentMatch(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchStyleInjected = useRef(false);

  // Inject search highlight styles once
  if (!searchStyleInjected.current && typeof document !== "undefined") {
    const style = document.createElement("style");
    style.textContent = `
      .diff-search-match { background: #facc15; color: #000; border-radius: 2px; }
      .dark .diff-search-match { background: #854d0e; color: #fef9c3; }
      .diff-search-current .diff-search-match { background: #f97316; color: #fff; outline: 2px solid #ea580c; }
      .dark .diff-search-current .diff-search-match { background: #ea580c; color: #fff; }
    `;
    document.head.appendChild(style);
    searchStyleInjected.current = true;
  }

  // ── File tree state ──────────────────────────────────────────────────
  const multiFile = (files?.length ?? 0) > 1;
  const [showFileTree, setShowFileTree] = useState(multiFile);
  const [activeFilePath, setActiveFilePath] = useState(filePath);
  const [treeItems, setTreeItems] = useState<FileTreeItem[]>(() =>
    (files ?? []).map((f) => ({ path: f.path, status: f.status, stats: null })),
  );
  const activeIdx = useMemo(() => treeItems.findIndex((t) => t.path === activeFilePath), [treeItems, activeFilePath]);

  // Load diff stats for all files on mount (background)
  useEffect(() => {
    if (!files || files.length <= 1) return;
    let cancelled = false;
    const load = async () => {
      const results = await Promise.all(
        files.map((f) =>
          api.getFileDiffStats(path, f.path, staged).catch((): FileDiffStats => ({ additions: 0, deletions: 0 })),
        ),
      );
      if (cancelled) return;
      setTreeItems((prev) => prev.map((item, i) => ({ ...item, stats: results[i] })));
    };
    load();
    return () => { cancelled = true; };
  }, [files, path, staged]);

  // Scroll active file into view in tree
  useEffect(() => {
    if (activeIdx >= 0 && treeListRef.current) {
      const el = treeListRef.current.children[activeIdx] as HTMLElement | undefined;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  /** Navigate to a different file in the tree */
  const selectFile = useCallback(
    (filePath: string) => {
      setActiveFilePath(filePath);
      setLoading(true);
      setError(null);
      setRaw("");
      api
        .getFileDiff(path, filePath, staged)
        .then((diffRaw) => setRaw(diffRaw))
        .catch((e) => setError(parseError(e)))
        .finally(() => setLoading(false));
    },
    [path, staged],
  );

  // Keyboard navigation for file tree
  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!multiFile) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(activeIdx + 1, treeItems.length - 1);
        selectFile(treeItems[next].path);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(activeIdx - 1, 0);
        selectFile(treeItems[prev].path);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (activeIdx >= 0) selectFile(treeItems[activeIdx].path);
      }
    },
    [multiFile, activeIdx, treeItems, selectFile],
  );

  const lines = useMemo(() => (raw ? parseDiff(raw) : []), [raw]);
  const splitHunks = useMemo(() => (raw ? parseDiffSideBySide(raw) : []), [raw]);
  const splitLines = useMemo(() => buildSplitLines(splitHunks), [splitHunks]);
  const language = useMemo(() => getLanguage(activeFilePath), [activeFilePath]);
  const langLabel = useMemo(() => getLanguageLabel(language), [language]);

  // Reset hunk index when diff content changes
  useEffect(() => { setCurrentHunkIdx(0); }, [raw]);

  const copyChanges = useCallback(() => {
    const changed: string[] = [];
    for (const line of lines) {
      if (line.type === "add" || line.type === "del") {
        changed.push(line.content.slice(1));
      }
    }
    if (changed.length) copyText(changed.join("\n"), "Changes copied!");
  }, [lines, copyText]);

  const copyFileDiff = useCallback(
    async (fp: string) => {
      try {
        const diff = await api.getFileDiff(path, fp, staged);
        if (diff) copyText(diff, `${fp.split("/").pop()} diff copied!`);
      } catch { /* ignore */ }
    },
    [path, staged, copyText],
  );

  /** Starting row indices for each change hunk (for N/P navigation) */
  const hunkStarts = useMemo(() => {
    if (viewMode === "split") {
      const starts: number[] = [];
      for (let i = 0; i < splitLines.length; i++) {
        if (splitLines[i].type === "header") {
          starts.push(i);
        }
      }
      return starts;
    } else {
      const starts: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].type === "header") {
          starts.push(i);
        }
      }
      return starts;
    }
  }, [lines, splitLines, viewMode]);

  const diffSummary = useMemo<DiffSummary | null>(() => {
    const statsArr = treeItems.map((t) => t.stats).filter((s): s is FileDiffStats => s !== null);
    if (statsArr.length === 0) return null;
    return computeDiffStats(statsArr);
  }, [treeItems]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getFileDiff(path, activeFilePath, staged)
      .then((diffRaw) => {
        if (cancelled) return;
        setRaw(diffRaw);
      })
      .catch((e) => {
        if (!cancelled) setError(parseError(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, activeFilePath, staged]);

  const useVirtual = lines.length > VIRTUALIZE_THRESHOLD;
  const useVirtualSplit = splitLines.length > VIRTUALIZE_THRESHOLD;

  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const splitLeftVirtualizer = useVirtualizer({
    count: splitLines.length,
    getScrollElement: () => splitLeftRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  // Scroll sync handlers for split view
  const handleSplitScroll = useCallback((source: "left" | "right") => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    const src = source === "left" ? splitLeftRef.current : splitRightRef.current;
    const dst = source === "left" ? splitRightRef.current : splitLeftRef.current;
    if (src && dst) dst.scrollTop = src.scrollTop;
    requestAnimationFrame(() => { syncingRef.current = false; });
  }, []);

  // ── Search logic ─────────────────────────────────────────────────────
  // Single pass over the diff: each match is recorded as one position, so the
  // total match count is just the length of this list.
  const matchPositions = useMemo(() => {
    const positions: { lineIdx: number; side?: "old" | "new" }[] = [];
    if (!searchQuery) return positions;
    if (viewMode === "split") {
      for (let i = 0; i < splitLines.length; i++) {
        const row = splitLines[i];
        const oldCount = countOccurrences(row.old.content, searchQuery);
        const newCount = countOccurrences(row.new.content, searchQuery);
        for (let j = 0; j < oldCount; j++) positions.push({ lineIdx: i, side: "old" });
        for (let j = 0; j < newCount; j++) positions.push({ lineIdx: i, side: "new" });
      }
    } else {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].type === "header") continue;
        const count = countOccurrences(lines[i].content, searchQuery);
        for (let j = 0; j < count; j++) positions.push({ lineIdx: i });
      }
    }
    return positions;
  }, [lines, splitLines, viewMode, searchQuery]);

  const totalMatches = matchPositions.length;

  // Clamp currentMatch when total changes
  useEffect(() => {
    if (totalMatches === 0) { setCurrentMatch(0); return; }
    setCurrentMatch((prev) => (prev >= totalMatches ? totalMatches - 1 : prev));
  }, [totalMatches]);

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setSearchInput("");
    setSearchQuery("");
    setCurrentMatch(0);
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchInput("");
    setSearchQuery("");
    setCurrentMatch(0);
  }, []);

  const navigateMatch = useCallback(
    (delta: number) => {
      if (totalMatches === 0) return;
      setCurrentMatch((prev) => (prev + delta + totalMatches) % totalMatches);
    },
    [totalMatches],
  );

  // Scroll to current match
  useEffect(() => {
    if (!searchQuery || totalMatches === 0 || matchPositions.length === 0) return;
    const pos = matchPositions[currentMatch];
    if (!pos) return;
    const lineIdx = pos.lineIdx;

    if (viewMode === "split") {
      const container = pos.side === "old" ? splitLeftRef.current : splitRightRef.current;
      if (container) {
        if (useVirtualSplit) {
          // Scroll to approximate position for virtualized view
          container.scrollTop = lineIdx * ROW_HEIGHT - container.clientHeight / 3;
        } else {
          const el = container.children[lineIdx] as HTMLElement | undefined;
          el?.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    } else {
      const container = scrollRef.current;
      if (container) {
        if (useVirtual) {
          virtualizer.scrollToIndex(lineIdx, { align: "center" });
        } else {
          const el = container.querySelector(`tbody`)?.children[lineIdx] as HTMLElement | undefined;
          el?.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
    }
  }, [currentMatch, matchPositions, searchQuery, totalMatches, viewMode, useVirtual, useVirtualSplit, virtualizer]);

  /** Scroll to a specific row index in the diff view */
  const scrollToHunk = useCallback(
    (rowIdx: number) => {
      if (viewMode === "split") {
        const container = splitLeftRef.current;
        if (container) {
          if (useVirtualSplit) {
            splitLeftVirtualizer.scrollToIndex(rowIdx, { align: "start" });
          } else {
            const el = container.children[rowIdx] as HTMLElement | undefined;
            el?.scrollIntoView({ block: "start", behavior: "smooth" });
          }
        }
      } else {
        const container = scrollRef.current;
        if (container) {
          if (useVirtual) {
            virtualizer.scrollToIndex(rowIdx, { align: "start" });
          } else {
            const el = container.querySelector("tbody")?.children[rowIdx] as HTMLElement | undefined;
            el?.scrollIntoView({ block: "start", behavior: "smooth" });
          }
        }
      }
    },
    [viewMode, useVirtual, useVirtualSplit, virtualizer, splitLeftVirtualizer],
  );

  // Global keyboard shortcuts for diff navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return;
      // Skip when search bar is open (let search handle its own keys)
      if (searchOpen) return;

      switch (e.key) {
        case "j":
        case "J":
        case "ArrowDown":
          if (multiFile) {
            e.preventDefault();
            const next = Math.min(activeIdx + 1, treeItems.length - 1);
            selectFile(treeItems[next].path);
          }
          break;
        case "k":
        case "K":
        case "ArrowUp":
          if (multiFile) {
            e.preventDefault();
            const prev = Math.max(activeIdx - 1, 0);
            selectFile(treeItems[prev].path);
          }
          break;
        case "n":
        case "N":
          if (hunkStarts.length > 0) {
            e.preventDefault();
            setCurrentHunkIdx((prev) => {
              const next = (prev + 1) % hunkStarts.length;
              scrollToHunk(hunkStarts[next]);
              return next;
            });
          }
          break;
        case "p":
        case "P":
          if (hunkStarts.length > 0) {
            e.preventDefault();
            setCurrentHunkIdx((prev) => {
              const next = (prev - 1 + hunkStarts.length) % hunkStarts.length;
              scrollToHunk(hunkStarts[next]);
              return next;
            });
          }
          break;
        case "f":
        case "F":
          if (multiFile) {
            e.preventDefault();
            setShowFileTree((v) => !v);
          }
          break;
        case "s":
          e.preventDefault();
          setViewMode((v) => (v === "unified" ? "split" : "unified"));
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen, multiFile, activeIdx, treeItems, selectFile, hunkStarts, onClose, scrollToHunk]);

  // Keyboard: Cmd+F / Escape within the modal
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSearch();
      } else if (e.key === "Enter") {
        e.preventDefault();
        navigateMatch(e.shiftKey ? -1 : 1);
      }
    },
    [closeSearch, navigateMatch],
  );

  // Map currentMatch → which occurrence on its line to highlight
  const curLineOcc = useMemo(() => {
    if (!searchQuery || totalMatches === 0) return { unified: new Map<number, number>(), split: new Map<string, number>() };
    const pos = matchPositions[currentMatch];
    if (!pos) return { unified: new Map<number, number>(), split: new Map<string, number>() };

    // Count occurrences on the same line (same side for split) up to currentMatch
    let occ = 0;
    for (let i = 0; i <= currentMatch; i++) {
      const p = matchPositions[i];
      if (p.lineIdx === pos.lineIdx && p.side === pos.side) occ++;
    }

    if (viewMode === "split") {
      const m = new Map<string, number>();
      m.set(`${pos.lineIdx}:${pos.side}`, occ - 1);
      return { unified: new Map<number, number>(), split: m };
    } else {
      const m = new Map<number, number>();
      m.set(pos.lineIdx, occ - 1);
      return { unified: m, split: new Map<string, number>() };
    }
  }, [matchPositions, currentMatch, searchQuery, totalMatches, viewMode]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "f") { e.preventDefault(); openSearch(); }
      }}
    >
      <div
        className="bg-[var(--surface-1)] rounded-xl shadow-xl w-[90vw] max-w-5xl h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--surface-2)]">
          <div className="flex items-center gap-2 min-w-0">
            {/* Path breadcrumb */}
            {activeFilePath.includes("/") ? (
              <span className="font-mono text-sm text-gray-700 dark:text-gray-300 flex items-center gap-0.5 min-w-0 truncate">
                {activeFilePath.split("/").map((seg, i, arr) => (
                  <span key={i} className="flex items-center gap-0.5 min-w-0">
                    {i > 0 && <span className="text-gray-400 dark:text-gray-500 shrink-0">/</span>}
                    <span className={`truncate ${i === arr.length - 1 ? "font-semibold text-gray-900 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}`}>{seg}</span>
                  </span>
                ))}
              </span>
            ) : (
              <span className="font-mono text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{activeFilePath}</span>
            )}
            {langLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 shrink-0">
                {langLabel}
              </span>
            )}
            {lines.length > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                {lines.length} lines
              </span>
            )}
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 shrink-0">
              {viewMode === "split" ? "Split" : "Unified"}
            </span>
            {hunkStarts.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 shrink-0 tabular-nums" title="Current hunk / total hunks">
                {currentHunkIdx + 1}/{hunkStarts.length}
              </span>
            )}
            <span className="hidden lg:inline text-[10px] text-gray-400 dark:text-gray-500 shrink-0 ml-2">
              {multiFile ? "J/K: files  N/P: hunks  F: tree  S: view  Esc: close" : "N/P: hunks  S: view  Esc: close"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* File tree toggle */}
            {multiFile && (
              <button
                onClick={() => setShowFileTree((v) => !v)}
                className={`p-1 rounded ${showFileTree ? "bg-gray-300 dark:bg-gray-600" : "hover:bg-gray-200 dark:hover:bg-gray-700"} text-gray-500 dark:text-gray-400`}
                title="Toggle file tree"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 3.5A.5.5 0 012.5 3h3a.5.5 0 010 1h-3A.5.5 0 012 3.5zm0 3A.5.5 0 012.5 6h5a.5.5 0 010 1h-5A.5.5 0 012 6.5zm0 3A.5.5 0 012.5 9h3a.5.5 0 010 1h-3A.5.5 0 012 9.5zm7-6a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3A.5.5 0 019 3.5zm0 6a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3A.5.5 0 019 9.5zm0 3a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5z" />
                </svg>
              </button>
            )}
            {/* View mode toggle */}
            <button
              onClick={() => setViewMode("unified")}
              className={`p-1 rounded ${viewMode === "unified" ? "bg-gray-300 dark:bg-gray-600" : "hover:bg-gray-200 dark:hover:bg-gray-700"} text-gray-500 dark:text-gray-400`}
              title="Unified view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="2" y="3" width="12" height="2" rx="0.5" />
                <rect x="2" y="7" width="12" height="2" rx="0.5" />
                <rect x="2" y="11" width="12" height="2" rx="0.5" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode("split")}
              className={`p-1 rounded ${viewMode === "split" ? "bg-gray-300 dark:bg-gray-600" : "hover:bg-gray-200 dark:hover:bg-gray-700"} text-gray-500 dark:text-gray-400`}
              title="Split view"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="1" y="3" width="6" height="2" rx="0.5" />
                <rect x="9" y="3" width="6" height="2" rx="0.5" />
                <rect x="1" y="7" width="6" height="2" rx="0.5" />
                <rect x="9" y="7" width="6" height="2" rx="0.5" />
                <rect x="1" y="11" width="6" height="2" rx="0.5" />
                <rect x="9" y="11" width="6" height="2" rx="0.5" />
              </svg>
            </button>
            {/* Search button */}
            <button
              onClick={openSearch}
              className={`p-1 rounded ${searchOpen ? "bg-gray-300 dark:bg-gray-600" : "hover:bg-gray-200 dark:hover:bg-gray-700"} text-gray-500 dark:text-gray-400`}
              title="Search diff (Cmd+F)"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 110-10 5 5 0 010 10z" />
              </svg>
            </button>
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            {/* Copy buttons */}
            <button
              onClick={copyCurrentDiff}
              disabled={!raw}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-30"
              title="Copy diff"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z" />
                <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z" />
              </svg>
            </button>
            <button
              onClick={copyChanges}
              disabled={lines.filter((l) => l.type === "add" || l.type === "del").length === 0}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 disabled:opacity-30"
              title="Copy changed lines only"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 2a.75.75 0 01.75.75v4.5h4.5a.75.75 0 010 1.5h-4.5v4.5a.75.75 0 01-1.5 0v-4.5h-4.5a.75.75 0 010-1.5h4.5v-4.5A.75.75 0 018 2z" />
              </svg>
            </button>
            {copiedLabel && (
              <span className="text-[11px] text-green-600 dark:text-green-400 font-medium animate-pulse ml-1">{copiedLabel}</span>
            )}
            <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              aria-label="Close diff viewer"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search bar */}
        {searchOpen && (
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[var(--border-color)] bg-[var(--surface-2)]">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-gray-400 shrink-0">
              <path d="M11.742 10.344a6.5 6.5 0 10-1.397 1.398h-.001l3.85 3.85a1 1 0 001.415-1.414l-3.85-3.85zm-5.242.156a5 5 0 110-10 5 5 0 010 10z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search diff content..."
              className="flex-1 min-w-0 text-xs bg-transparent border-none outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400"
            />
            {searchQuery && (
              <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                {totalMatches > 0 ? `${currentMatch + 1} / ${totalMatches}` : "No results"}
              </span>
            )}
            <button onClick={() => navigateMatch(-1)} disabled={totalMatches === 0} className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-500">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 4l-4 4h8z" /></svg>
            </button>
            <button onClick={() => navigateMatch(1)} disabled={totalMatches === 0} className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-500">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 12l4-4H4z" /></svg>
            </button>
            <button onClick={closeSearch} className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          </div>
        )}

        {/* Diff stats summary bar */}
        {multiFile && diffSummary && (
          <div className="flex items-center gap-3 px-4 py-1.5 border-b border-[var(--border-color)] bg-[var(--surface-2)] text-xs text-gray-600 dark:text-gray-400">
            <span className="font-medium">{diffSummary.totalFiles} files changed</span>
            <span className="text-green-600 dark:text-green-400 font-mono tabular-nums">+{diffSummary.totalAdditions}</span>
            <span className="text-red-600 dark:text-red-400 font-mono tabular-nums">-{diffSummary.totalDeletions}</span>
            <div className="flex-1 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex">
              {(() => {
                const total = diffSummary.totalAdditions + diffSummary.totalDeletions;
                if (total === 0) return null;
                const addPct = (diffSummary.totalAdditions / total) * 100;
                return (
                  <>
                    <div className="h-full bg-green-500" style={{ width: `${addPct}%` }} />
                    <div className="h-full bg-red-500" style={{ width: `${100 - addPct}%` }} />
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* File tree sidebar */}
          {showFileTree && multiFile && (
            <div
              ref={treeListRef}
              className="w-56 shrink-0 border-r border-[var(--border-color)] bg-[var(--surface-2)] overflow-y-auto text-xs select-none relative"
              tabIndex={0}
              onKeyDown={handleTreeKeyDown}
            >
              {treeItems.map((item) => {
                const st = FILE_STATUS_STYLES[item.status];
                const isActive = item.path === activeFilePath;
                const parts = item.path.split("/");
                const fileName = parts[parts.length - 1];
                const depth = parts.length - 1;
                const dirSegments = parts.slice(0, -1);
                return (
                  <div
                    key={item.path}
                    className={`group flex items-center gap-2 px-3 py-1.5 cursor-pointer ${
                      isActive
                        ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300"
                    }`}
                    style={{ paddingLeft: `${12 + depth * 12}px` }}
                    onClick={() => selectFile(item.path)}
                    title={item.path}
                  >
                    {/* Indentation guides */}
                    {depth > 0 && (
                      <span className="absolute left-0 top-0 bottom-0 flex">
                        {dirSegments.map((_, di) => (
                          <span key={di} className="w-3 border-l border-gray-200 dark:border-gray-700" style={{ marginLeft: `${12 + di * 12}px` }} />
                        ))}
                      </span>
                    )}
                    <span className={`w-4 text-center font-bold shrink-0 ${FILE_STATUS_ICONS[item.status].color}`} title={st.label}>
                      {FILE_STATUS_ICONS[item.status].icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{fileName}</div>
                      {dirSegments.length > 0 && (
                        <div className="truncate text-[10px] text-gray-400 dark:text-gray-500">
                          {dirSegments.join("/")}
                        </div>
                      )}
                    </div>
                    {item.stats && (
                      <span className="shrink-0 font-mono text-[10px] tabular-nums">
                        {item.stats.additions > 0 && <span className="text-green-600 dark:text-green-400">+{item.stats.additions}</span>}
                        {item.stats.additions > 0 && item.stats.deletions > 0 && " "}
                        {item.stats.deletions > 0 && <span className="text-red-600 dark:text-red-400">-{item.stats.deletions}</span>}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); copyFileDiff(item.path); }}
                      className="shrink-0 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 dark:text-gray-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      title={`Copy ${fileName} diff`}
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z" />
                        <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Diff content */}
          <div className="select-text flex-1 flex flex-col overflow-hidden min-w-0">
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">Loading diff...</div>
            ) : error ? (
              <div className="flex-1 flex items-center justify-center text-red-500">{error}</div>
            ) : lines.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-400">No changes</div>
            ) : viewMode === "split" ? (
              /* Split view */
              <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex font-mono text-xs bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex-1 px-2 py-1 text-center text-gray-500 dark:text-gray-400 font-semibold border-r border-gray-300 dark:border-gray-600">Old</div>
                    <div className="flex-1 px-2 py-1 text-center text-gray-500 dark:text-gray-400 font-semibold">New</div>
                  </div>
                  <div className="flex-1 flex overflow-hidden relative">
                    {/* Left side (Old) */}
                    <div
                      ref={splitLeftRef}
                      className="flex-1 overflow-auto font-mono text-xs leading-5"
                      onScroll={() => handleSplitScroll("left")}
                    >
                      {useVirtualSplit ? (
                        <div style={{ height: splitLeftVirtualizer.getTotalSize(), position: "relative" }}>
                          {splitLeftVirtualizer.getVirtualItems().map((vi) => (
                            <SplitRow
                              key={vi.index}
                              row={splitLines[vi.index]}
                              side="old"
                              language={language}
                              searchQuery={searchQuery}
                              currentOccurrence={curLineOcc.split.get(`${vi.index}:old`)}
                              top={vi.start}
                            />
                          ))}
                        </div>
                      ) : (
                        splitLines.map((row, i) => (
                          <SplitRow
                            key={i}
                            row={row}
                            side="old"
                            language={language}
                            searchQuery={searchQuery}
                            currentOccurrence={curLineOcc.split.get(`${i}:old`)}
                          />
                        ))
                      )}
                    </div>
                    {/* Divider */}
                    <div className="w-px bg-gray-300 dark:bg-gray-600 shrink-0" />
                    {/* Right side (New) */}
                    <div
                      ref={splitRightRef}
                      className="flex-1 overflow-auto font-mono text-xs leading-5"
                      onScroll={() => handleSplitScroll("right")}
                    >
                      {useVirtualSplit ? (
                        <div style={{ height: splitLeftVirtualizer.getTotalSize(), position: "relative" }}>
                          {splitLeftVirtualizer.getVirtualItems().map((vi) => (
                            <SplitRow
                              key={vi.index}
                              row={splitLines[vi.index]}
                              side="new"
                              language={language}
                              searchQuery={searchQuery}
                              currentOccurrence={curLineOcc.split.get(`${vi.index}:new`)}
                              top={vi.start}
                            />
                          ))}
                        </div>
                      ) : (
                        splitLines.map((row, i) => (
                          <SplitRow
                            key={i}
                            row={row}
                            side="new"
                            language={language}
                            searchQuery={searchQuery}
                            currentOccurrence={curLineOcc.split.get(`${i}:new`)}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Unified view */
              <div ref={scrollRef} className="flex-1 overflow-auto font-mono text-xs leading-5">
                {useVirtual ? (
                  <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                    {virtualizer.getVirtualItems().map((vi) => (
                      <UnifiedVirtualRow
                        key={vi.index}
                        line={lines[vi.index]}
                        top={vi.start}
                        language={language}
                        searchQuery={searchQuery}
                        currentOccurrence={curLineOcc.unified.get(vi.index)}
                      />
                    ))}
                  </div>
                ) : (
                  <table className="w-full border-collapse">
                    <tbody>
                      {lines.map((line, i) => (
                        <UnifiedRow key={i} line={line} language={language} searchQuery={searchQuery} currentOccurrence={curLineOcc.unified.get(i)} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    // Portal to body: card ancestors apply hover translate, which turns them
    // into the containing block for fixed descendants and traps this overlay.
    document.body
  );
});
export default DiffViewer;
