import { useState, useCallback, useEffect, memo } from "react";
import * as api from "../lib/tauri";
import type { StashInfo } from "../lib/types";
import { parseError } from "../lib/types";
import { Modal } from "./ui/primitives";
import { OperationConfirmDialog } from "./OperationConfirmDialog";

interface StashManagerProps {
  path: string;
  open: boolean;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return "";
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

function diffLineClass(line: string): string {
  if (line.startsWith("+") && !line.startsWith("+++")) return "text-green-700 dark:text-green-300";
  if (line.startsWith("-") && !line.startsWith("---")) return "text-red-700 dark:text-red-300";
  if (line.startsWith("@@")) return "text-blue-600 dark:text-blue-400";
  if (line.startsWith("diff") || line.startsWith("index") || line.startsWith("---") || line.startsWith("+++")) return "text-gray-500 dark:text-gray-400";
  return "";
}

export const StashManager = memo(function StashManager({
  path,
  open,
  onClose,
  onRefresh,
  onSuccess,
  onError,
}: StashManagerProps) {
  const [stashList, setStashList] = useState<StashInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingIdx, setLoadingIdx] = useState<number | null>(null);
  const [stashMsg, setStashMsg] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState<number | null>(null);

  // Diff preview state
  const [showDiff, setShowDiff] = useState<Set<number>>(new Set());
  const [diffCache, setDiffCache] = useState<Record<number, string>>({});
  const [loadingDiff, setLoadingDiff] = useState<Set<number>>(new Set());

  const loadStashes = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.gitStashList(path);
      setStashList(list);
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, onError]);

  useEffect(() => {
    if (open) loadStashes();
  }, [open, loadStashes]);

  const handleToggleDiff = useCallback(async (index: number) => {
    setShowDiff(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });

    // Load diff if not cached
    if (!diffCache[index]) {
      setLoadingDiff(prev => new Set(prev).add(index));
      try {
        const diff = await api.gitStashShow(path, index);
        setDiffCache(prev => ({ ...prev, [index]: diff }));
      } catch (e) {
        onError(parseError(e));
      } finally {
        setLoadingDiff(prev => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }
    }
  }, [path, diffCache, onError]);

  const handleStash = useCallback(async () => {
    setLoadingIdx(-1);
    try {
      await api.gitStash(path, stashMsg || undefined, includeUntracked);
      onSuccess(stashMsg ? `Stashed: ${stashMsg}` : "Changes stashed");
      setStashMsg("");
      await Promise.all([loadStashes(), onRefresh()]);
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoadingIdx(null);
    }
  }, [path, stashMsg, loadStashes, onRefresh, onSuccess, onError]);

  const handleApply = useCallback(async (index: number) => {
    setLoadingIdx(index);
    try {
      await api.gitStashApply(path, index);
      onSuccess(`Applied stash@{${index}}`);
      await Promise.all([loadStashes(), onRefresh()]);
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoadingIdx(null);
    }
  }, [path, loadStashes, onRefresh, onSuccess, onError]);

  const handlePop = useCallback(async (index: number) => {
    setLoadingIdx(index);
    try {
      await api.gitStashPop(path, index);
      onSuccess(`Popped stash@{${index}}`);
      await Promise.all([loadStashes(), onRefresh()]);
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoadingIdx(null);
    }
  }, [path, loadStashes, onRefresh, onSuccess, onError]);

  const handleDrop = useCallback(async (index: number) => {
    setLoadingIdx(index);
    try {
      await api.gitStashDrop(path, index);
      onSuccess(`Dropped stash@{${index}}`);
      await Promise.all([loadStashes(), onRefresh()]);
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoadingIdx(null);
      setConfirmDrop(null);
    }
  }, [path, loadStashes, onRefresh, onSuccess, onError]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && stashMsg.trim()) {
        e.preventDefault();
        handleStash();
      }
    },
    [stashMsg, handleStash]
  );

  return (
    <>
    <Modal open={open} onClose={onClose} title="Stash Manager" maxWidth="max-w-2xl">
      <div className="p-5 space-y-4">
        {/* Create stash */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={stashMsg}
            onChange={(e) => setStashMsg(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Stash message (optional)"
            aria-label="Stash message"
            disabled={loadingIdx === -1}
            className="flex-1 px-3 py-2 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50"
          />
          <label className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap cursor-pointer">
            <input
              type="checkbox"
              checked={includeUntracked}
              onChange={(e) => setIncludeUntracked(e.target.checked)}
              className="rounded"
            />
            Include untracked
          </label>
          <button
            onClick={handleStash}
            disabled={loadingIdx === -1}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-200 dark:hover:bg-amber-900/40 disabled:opacity-50 transition-colors active:scale-[0.98]"
          >
            {loadingIdx === -1 ? "Stashing..." : "Stash"}
          </button>
        </div>

        {/* Stash list */}
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-400 dark:text-gray-500">
            <span className="animate-spin mr-2">&#x21BB;</span>
            Loading stashes...
          </div>
        ) : stashList.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500 italic">
            No stashes
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {stashList.map((s) => (
              <div key={s.index} className="rounded-lg bg-[var(--surface-2)] border border-[var(--border-color)] hover:border-gray-300 dark:hover:border-gray-600 transition-colors">
                <div className="flex items-center gap-2 px-3 py-2">
                  <span className="w-7 text-center px-1.5 py-0.5 rounded text-xs font-mono font-semibold bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 shrink-0">
                    {s.index}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-700 dark:text-gray-300 truncate font-mono">
                      {s.message}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {s.branch && (
                        <span className="text-xs text-blue-500 dark:text-blue-400">
                          {s.branch}
                        </span>
                      )}
                      {s.timestamp > 0 && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                          {formatRelativeTime(s.timestamp)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => handleToggleDiff(s.index)}
                      disabled={loadingDiff.has(s.index)}
                      className={`px-2 py-1 rounded text-xs font-medium border transition-colors active:scale-[0.98] ${
                        showDiff.has(s.index)
                          ? "bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-500"
                          : "bg-[var(--surface-1)] text-gray-600 dark:text-gray-400 border-[var(--border-color)] hover:bg-gray-100 dark:hover:bg-gray-700"
                      } disabled:opacity-50`}
                      title="Show/hide diff preview"
                    >
                      {loadingDiff.has(s.index) ? "..." : showDiff.has(s.index) ? "Hide" : "Show"}
                    </button>
                    <button
                      onClick={() => handleApply(s.index)}
                      disabled={loadingIdx !== null}
                      className="px-2 py-1 rounded text-xs font-medium bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 hover:bg-blue-200 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors active:scale-[0.98]"
                      title="Apply stash (keep in list)"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => handlePop(s.index)}
                      disabled={loadingIdx !== null}
                      className="px-2 py-1 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 hover:bg-purple-200 dark:hover:bg-purple-900/40 disabled:opacity-50 transition-colors active:scale-[0.98]"
                      title="Pop stash (apply and remove)"
                    >
                      Pop
                    </button>
                    <button
                      onClick={() => setConfirmDrop(s.index)}
                      disabled={loadingIdx !== null}
                      className="px-2 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50 hover:bg-red-200 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors active:scale-[0.98]"
                      title="Drop stash (delete)"
                    >
                      Drop
                    </button>
                  </div>
                </div>

                {/* Inline diff preview */}
                {showDiff.has(s.index) && diffCache[s.index] && (
                  <div className="border-t border-[var(--border-color)] px-3 py-2 max-h-48 overflow-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed">
                      {diffCache[s.index].split("\n").map((line, i) => (
                        <div key={i} className={diffLineClass(line)}>{line}</div>
                      ))}
                    </pre>
                  </div>
                )}
                {showDiff.has(s.index) && !diffCache[s.index] && loadingDiff.has(s.index) && (
                  <div className="border-t border-[var(--border-color)] px-3 py-3 text-center text-xs text-gray-400">
                    <span className="animate-spin mr-1">&#x21BB;</span>
                    Loading diff...
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
    {confirmDrop !== null && (
      <OperationConfirmDialog
        open
        operation="git_stash_drop"
        targets={[{ path, label: `stash@{${confirmDrop}}` }]}
        onConfirm={() => handleDrop(confirmDrop)}
        onCancel={() => setConfirmDrop(null)}
      />
    )}
    </>
  );
});
