import { useState, useEffect, useCallback, memo, useRef, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import * as api from "../lib/tauri";
import type { LogEntry } from "../lib/types";
import { parseError } from "../lib/types";
import { CommitGraph } from "./CommitGraph";
import { OperationConfirmDialog } from "./OperationConfirmDialog";
import { Modal, MenuItem } from "./ui/primitives";
import { ContextMenu, MenuSeparator } from "./ui/ContextMenu";
import { useContextMenu } from "../hooks/useContextMenu";

const ConflictResolver = lazy(() => import("./ConflictResolver").then((m) => ({ default: m.ConflictResolver })));

const ROW_HEIGHT = 28;

function formatRelativeTime(t: TFunction, timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return t("commitLog.justNow");
  if (diff < 3600) return t("commitLog.mAgo", { count: Math.floor(diff / 60) });
  if (diff < 86400) return t("commitLog.hAgo", { count: Math.floor(diff / 3600) });
  if (diff < 604800) return t("commitLog.dAgo", { count: Math.floor(diff / 86400) });
  return new Date(timestamp * 1000).toLocaleDateString();
}

interface CommitLogProps {
  path: string;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string, rawError?: unknown, path?: string) => void;
  onRefresh?: () => Promise<void>;
  limit?: number;
}

export const CommitLog = memo(function CommitLog({ path, onSuccess, onError, onRefresh, limit = 500 }: CommitLogProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cherryPicking, setCherryPicking] = useState<string | null>(null);
  const [confirmCherryPick, setConfirmCherryPick] = useState<LogEntry | null>(null);
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
  // Explicit range endpoints set from the row context menu. Deliberately kept
  // apart from `selectedHashes`: changing the selection must not drop them, and
  // they only feed the range cherry-pick while both are set.
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [rangeEnd, setRangeEnd] = useState<string | null>(null);
  const [confirmRangePick, setConfirmRangePick] = useState<{ from: string; to: string; count: number } | null>(null);
  const [cherryPickConflicts, setCherryPickConflicts] = useState<string[] | null>(null);
  const [abortingCherryPick, setAbortingCherryPick] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowMenu = useContextMenu();
  const [menuEntry, setMenuEntry] = useState<LogEntry | null>(null);

  const closeRowMenu = useCallback(() => {
    setMenuEntry(null);
    rowMenu.close();
  }, [rowMenu]);

  const handleRowContextMenu = useCallback((e: React.MouseEvent, entry: LogEntry) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest?.('button, input, textarea, a, [role="button"]')) return;
    setMenuEntry(entry);
    rowMenu.onContextMenu(e);
  }, [rowMenu]);

  const copyRowText = useCallback((text: string, okMsg: string) => {
    navigator.clipboard.writeText(text).then(() => onSuccess?.(okMsg)).catch((err) => onError?.(String(err), err, path));
  }, [onSuccess, onError, path]);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const log = await api.gitLog(path, limit);
      setEntries(log);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, limit]);

  useEffect(() => { load(); }, [load]);

  const toggleSelect = useCallback((hash: string) => {
    setSelectedHashes((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) {
        next.delete(hash);
      } else {
        next.add(hash);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedHashes(new Set());
    setRangeStart(null);
    setRangeEnd(null);
  }, []);

  const handleCherryPick = useCallback(async (entry: LogEntry) => {
    setCherryPicking(entry.hash);
    setConfirmCherryPick(null);
    try {
      await api.gitCherryPick(path, entry.hash);
      onSuccess?.(t("commitLog.cherryPicked", { hash: entry.short_hash }));
      await Promise.all([load(), onRefresh?.()]);
    } catch (e) {
      const msg = parseError(e);
      if (msg.includes("conflict")) {
        const files = await api.gitListConflicts(path).catch(() => []);
        setCherryPickConflicts(files.length > 0 ? files : [t("commitLog.unknownConflict")]);
      } else {
        onError?.(msg, e, path);
      }
    } finally {
      setCherryPicking(null);
    }
  }, [path, onSuccess, onError, onRefresh, load]);

  const handleCherryPickRange = useCallback(async (from: string, to: string) => {
    setConfirmRangePick(null);
    setCherryPicking(from);
    try {
      const result = await api.gitCherryPickRange(path, from, to);
      if (result.success) { onSuccess?.(t("commitLog.rangeDone")); } else { onError?.(result.message); }
      if (result.conflicts.length > 0) {
        setCherryPickConflicts(result.conflicts);
      }
      await Promise.all([load(), onRefresh?.()]);
    } catch (e) {
      onError?.(parseError(e), e, path);
    } finally {
      setCherryPicking(null);
    }
  }, [path, onSuccess, onError, onRefresh, load]);

  const openRangeCherryPick = useCallback(() => {
    const hashes = [...selectedHashes];
    const indices = hashes.map((h) => entries.findIndex((e) => e.hash === h)).filter((i) => i >= 0).sort((a, b) => a - b);
    if (indices.length < 2) return;
    const from = entries[indices[indices.length - 1]].hash;
    const to = entries[indices[0]].hash;
    setConfirmRangePick({ from, to, count: indices.length });
  }, [selectedHashes, entries]);

  // The log lists newest first, so the older endpoint (higher index) is the
  // `from` base of `from..to` — same convention as openRangeCherryPick.
  const openEndpointRangeCherryPick = useCallback(() => {
    if (!rangeStart || !rangeEnd || rangeStart === rangeEnd) return;
    const startIndex = entries.findIndex((e) => e.hash === rangeStart);
    const endIndex = entries.findIndex((e) => e.hash === rangeEnd);
    if (startIndex < 0 || endIndex < 0) return;
    const fromIndex = Math.max(startIndex, endIndex);
    const toIndex = Math.min(startIndex, endIndex);
    setConfirmRangePick({ from: entries[fromIndex].hash, to: entries[toIndex].hash, count: fromIndex - toIndex + 1 });
  }, [rangeStart, rangeEnd, entries]);

  const hasBothRangeEndpoints = !!rangeStart && !!rangeEnd && rangeStart !== rangeEnd;

  const handleAbortCherryPick = useCallback(async () => {
    setAbortingCherryPick(true);
    try {
      await api.gitAbortCherryPick(path);
      setCherryPickConflicts(null);
      await load();
    } catch (e) {
      onError?.(parseError(e), e, path);
    } finally {
      setAbortingCherryPick(false);
    }
  }, [path, onError, load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4 text-xs text-gray-400">
        <span className="animate-spin mr-2">&#x21BB;</span>
        Loading commit log...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-red-500 mb-2">{error}</p>
        <button onClick={load} className="text-xs text-blue-500 hover:underline">{t("common.retry")}</button>
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-4">{t("commitLog.noCommits")}</p>;
  }

  const maxLane = Math.max(...entries.map((e) => e.lane), 0);
  const hasSelection = selectedHashes.size > 0;
  const isRangeSelection = selectedHashes.size >= 2;
  const graphWidth = (maxLane + 1) * 16;

  return (
    <div className="space-y-0 font-mono text-xs">
      {/* Selection toolbar */}
      {hasSelection && (
        <div className="flex items-center gap-2 px-2 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40 rounded mb-1">
          <span className="text-xs text-blue-700 dark:text-blue-300">
            {selectedHashes.size} selected
          </span>
          {isRangeSelection && (
            <button
              onClick={openRangeCherryPick}
              disabled={!!cherryPicking}
              className="px-2 py-0.5 rounded text-xs bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              Cherry-pick Range
            </button>
          )}
          {selectedHashes.size === 1 && (
            <button
              onClick={() => {
                const hash = [...selectedHashes][0];
                const entry = entries.find((e) => e.hash === hash);
                if (entry) setConfirmCherryPick(entry);
              }}
              disabled={!!cherryPicking}
              className="px-2 py-0.5 rounded text-xs bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              Cherry-pick Selected
            </button>
          )}
          <button
            onClick={clearSelection}
            className="px-2 py-0.5 rounded text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Cherry-pick conflict banner */}
      {cherryPickConflicts && (
        <div className="px-2 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded mb-1 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-red-700 dark:text-red-300">
              Cherry-pick conflict ({cherryPickConflicts.length} file{cherryPickConflicts.length !== 1 ? "s" : ""})
            </span>
            <button
              onClick={() => setResolveOpen(true)}
              className="px-2 py-0.5 rounded text-xs bg-blue-500 text-white hover:bg-blue-600 transition-colors"
            >
              Resolve conflicts
            </button>
            <button
              onClick={handleAbortCherryPick}
              disabled={abortingCherryPick}
              className="px-2 py-0.5 rounded text-xs bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {abortingCherryPick ? t("commitLog.aborting") : t("commitLog.abortCherryPick")}
            </button>
          </div>
          <ul className="text-[11px] text-red-600 dark:text-red-400 space-y-0.5 pl-3 list-disc">
            {cherryPickConflicts.map((f) => (
              <li key={f} className="font-mono">{f}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Commit graph + log */}
      <div ref={parentRef} className="select-text max-h-[60vh] overflow-auto">
        <div className="flex" style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative", width: "100%" }}>
          {/* SVG Graph column (sticky left) */}
          <div
            className="sticky left-0 z-10 shrink-0"
            style={{ width: graphWidth }}
          >
            <CommitGraph entries={entries} maxLane={maxLane} />
          </div>

          {/* Commit rows */}
          <div className="flex-1 min-w-0" style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const entry = entries[virtualRow.index];
              const hasRefs = entry.refs.length > 0;
              const isCherryPicking = cherryPicking === entry.hash;
              const isSelected = selectedHashes.has(entry.hash);

              return (
                <div
                  key={entry.hash}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  onContextMenu={(e) => handleRowContextMenu(e, entry)}
                  className={`flex items-center gap-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 group ${isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: ROW_HEIGHT,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {/* Checkbox */}
                  <label className="flex items-center shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(entry.hash)}
                      className="w-3 h-3 rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-400 cursor-pointer"
                    />
                  </label>

                  {/* Refs */}
                  {hasRefs && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      {entry.refs.map((ref) => (
                        <span
                          key={ref}
                          className="px-1 py-0 rounded text-[10px] font-semibold bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-800/50"
                        >
                          {ref}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Hash */}
                  <button
                    onClick={() => navigator.clipboard.writeText(entry.hash).then(() => onSuccess?.(t("commitLog.copiedHash")))}
                    className="text-gray-500 shrink-0 w-14 hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer text-left"
                    title={`Copy ${entry.hash}`}
                  >
                    {entry.short_hash}
                  </button>

                  {/* Message */}
                  <span className="flex-1 truncate text-gray-800 dark:text-gray-200">
                    {entry.message}
                  </span>

                  {/* Cherry-pick button */}
                  <button
                    onClick={() => setConfirmCherryPick(entry)}
                    disabled={isCherryPicking}
                    className="px-1.5 py-0.5 rounded text-[10px] opacity-0 group-hover:opacity-100 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50 transition-all shrink-0"
                    title={`Cherry-pick ${entry.short_hash}`}
                  >
                    {isCherryPicking ? "..." : t("commitLog.cherryPick")}
                  </button>

                  {/* Author + time — opacity reveal (not display swap) so the
                      row height never changes under measureElement. */}
                  <span className="text-gray-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 max-w-0 group-hover:max-w-24 overflow-hidden whitespace-nowrap">
                    {entry.author}
                  </span>
                  <span className="text-gray-400 shrink-0 w-14 text-right">
                    {formatRelativeTime(t, entry.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ContextMenu open={!!menuEntry && !!rowMenu.anchor} anchor={rowMenu.anchor ?? { x: 0, y: 0 }} onClose={closeRowMenu}>
        {menuEntry && (
          <>
            {selectedHashes.has(menuEntry.hash) ? (
              <MenuItem label={t("commitLog.deselectCommit")} onClick={() => toggleSelect(menuEntry.hash)} />
            ) : (
              <MenuItem label={t("commitLog.selectCommit")} onClick={() => toggleSelect(menuEntry.hash)} />
            )}
            {selectedHashes.size > 1 && (
              <MenuItem label={t("commitLog.clearSelection")} onClick={clearSelection} />
            )}
            <MenuSeparator />
            <MenuItem label={t("commitLog.copyHash")} onClick={() => copyRowText(menuEntry.short_hash, t("commitLog.copiedHash"))} />
            <MenuItem label={t("commitLog.copyFullHash")} onClick={() => copyRowText(menuEntry.hash, t("commitLog.copiedFullHash"))} />
            <MenuItem label={t("commitLog.copyMessage")} onClick={() => copyRowText(menuEntry.message, t("commitLog.copiedMessage"))} />
            <MenuSeparator />
            <MenuItem label={t("commitLog.cherryPickEllipsis")} onClick={() => setConfirmCherryPick(menuEntry)} />
            <MenuSeparator />
            <MenuItem
              label={rangeStart === menuEntry.hash ? t("commitLog.unsetRangeStart") : t("commitLog.rangeStart")}
              onClick={() => setRangeStart((prev) => (prev === menuEntry.hash ? null : menuEntry.hash))}
            />
            <MenuItem
              label={rangeEnd === menuEntry.hash ? t("commitLog.unsetRangeEnd") : t("commitLog.rangeEnd")}
              onClick={() => setRangeEnd((prev) => (prev === menuEntry.hash ? null : menuEntry.hash))}
            />
            {hasBothRangeEndpoints ? (
              <MenuItem label={t("commitLog.cherryPickRangeEllipsis")} onClick={openEndpointRangeCherryPick} />
            ) : (
              selectedHashes.size > 1 && (
                <MenuItem label={t("commitLog.cherryPickRangeEllipsis")} onClick={openRangeCherryPick} />
              )
            )}
          </>
        )}
      </ContextMenu>

      {confirmCherryPick && (
        <OperationConfirmDialog
          open
          operation="git_cherry_pick"
          targets={[{ path, label: `${confirmCherryPick.short_hash} — ${confirmCherryPick.message.split("\n")[0]}` }]}
          onConfirm={() => handleCherryPick(confirmCherryPick)}
          onCancel={() => setConfirmCherryPick(null)}
        />
      )}

      {confirmRangePick && (
        <OperationConfirmDialog
          open
          operation="git_cherry_pick_range"
          targets={[{ path, label: `${confirmRangePick.from.slice(0, 7)}..${confirmRangePick.to.slice(0, 7)} (${confirmRangePick.count} commits)` }]}
          onConfirm={() => handleCherryPickRange(confirmRangePick.from, confirmRangePick.to)}
          onCancel={() => setConfirmRangePick(null)}
        />
      )}

      {resolveOpen && (
        <Modal open onClose={() => setResolveOpen(false)} title={t("commitLog.resolveConflicts")} width="xl">
          <div className="p-3">
            <Suspense fallback={null}>
              <ConflictResolver
                path={path}
                onSuccess={(msg) => onSuccess?.(msg)}
                onError={(msg) => onError?.(msg)}
                onRefresh={() => { onRefresh?.(); }}
              />
            </Suspense>
          </div>
        </Modal>
      )}
    </div>
  );
});

export default CommitLog;
