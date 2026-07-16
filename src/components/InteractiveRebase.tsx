import { useState, useCallback, useEffect, memo } from "react";
import * as api from "../lib/tauri";
import type { CommitInfo } from "../lib/types";
import { parseError } from "../lib/types";
import { Modal } from "./ui/primitives";
import { OperationConfirmDialog } from "./OperationConfirmDialog";

type RebaseAction = "pick" | "squash" | "drop";

interface RebaseEntry {
  commit: CommitInfo;
  action: RebaseAction;
  squashMessage?: string;
}

interface InteractiveRebaseProps {
  open: boolean;
  path: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string, rawError?: unknown, path?: string) => void;
  onRefresh: () => Promise<void>;
}

const ACTION_STYLES: Record<RebaseAction, string> = {
  pick: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/50",
  squash: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/50",
  drop: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/50",
};

export const InteractiveRebase = memo(function InteractiveRebase({
  open,
  path,
  onClose,
  onSuccess,
  onError,
  onRefresh,
}: InteractiveRebaseProps) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [entries, setEntries] = useState<RebaseEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [commitCount, setCommitCount] = useState(10);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [squashMsg, setSquashMsg] = useState("");

  const loadCommits = useCallback(async () => {
    setLoading(true);
    try {
      const log = await api.gitGetLog(path, commitCount);
      setCommits(log);
      setEntries(log.map((c) => ({ commit: c, action: "pick" })));
    } catch (e) {
      onError(parseError(e), e, path);
    } finally {
      setLoading(false);
    }
  }, [path, commitCount, onError]);

  useEffect(() => {
    if (open) loadCommits();
  }, [open, loadCommits]);

  const setAction = useCallback((index: number, action: RebaseAction) => {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, action } : e))
    );
  }, []);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault();
      if (dragIndex !== null && dragIndex !== index) {
        setDropIndex(index);
      }
    },
    [dragIndex]
  );

  const handleDrop = useCallback(
    (index: number) => {
      if (dragIndex === null || dragIndex === index) {
        setDragIndex(null);
        setDropIndex(null);
        return;
      }
      setEntries((prev) => {
        const next = [...prev];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(index, 0, moved);
        return next;
      });
      setDragIndex(null);
      setDropIndex(null);
    },
    [dragIndex]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDropIndex(null);
  }, []);

  const hasChanges = entries.some((e, i) => {
    const orig = commits[i];
    return e.action !== "pick" || (orig && orig.hash !== e.commit.hash);
  });

  const pickCount = entries.filter((e) => e.action === "pick").length;
  const squashCount = entries.filter((e) => e.action === "squash").length;
  const dropCount = entries.filter((e) => e.action === "drop").length;

  const handleApply = useCallback(async () => {
    setApplying(true);
    try {
      // For consecutive squashes, group them and use squash_last_n
      // Simple approach: squash consecutive squashes at the end
      if (squashCount > 0 && entries.length > 0) {
        // Find trailing squash group (from bottom of list)
        let trailingSquash = 0;
        for (let i = entries.length - 1; i >= 0; i--) {
          if (entries[i].action === "squash") trailingSquash++;
          else break;
        }

        if (trailingSquash > 0 && squashMsg.trim()) {
          await api.gitSquashCommits(path, trailingSquash + 1, squashMsg.trim());
        } else if (trailingSquash > 0) {
          await api.gitSquashCommits(path, trailingSquash + 1);
        }
      }

      // Execute drops from top to bottom (reverse order to keep indices stable)
      const drops = entries
        .map((e, i) => ({ hash: e.commit.hash, index: i }))
        .filter((_, i) => entries[i].action === "drop")
        .reverse();

      for (const d of drops) {
        await api.gitDropCommit(path, d.hash);
      }

      onSuccess("Interactive rebase completed");
      await onRefresh();
      onClose();
    } catch (e) {
      onError(parseError(e), e, path);
    } finally {
      setApplying(false);
      setConfirmApply(false);
    }
  }, [entries, path, squashCount, squashMsg, onSuccess, onError, onRefresh, onClose]);

  if (!open) return null;

  return (
    <>
      <Modal open={open} onClose={onClose} title="Interactive Rebase" maxWidth="max-w-xl">
        <div className="px-6 py-4 space-y-4">
          {/* Commit count selector */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-gray-500 dark:text-gray-400">Show last</label>
            <input
              type="number"
              value={commitCount}
              onChange={(e) => setCommitCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              min={1}
              max={100}
              className="w-16 px-2 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={loadCommits}
              disabled={loading}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--surface-2)] text-gray-700 dark:text-gray-300 border border-[var(--border-color)] hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              {loading ? "Loading..." : "Reload"}
            </button>
          </div>

          {/* Warning banner */}
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
            <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-xs text-amber-700 dark:text-amber-300">
              This will rewrite history. Do not use on commits that have been pushed to a shared branch.
            </span>
          </div>

          {/* Stats summary */}
          {entries.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span>{pickCount} pick</span>
              {squashCount > 0 && <span className="text-purple-600 dark:text-purple-400">{squashCount} squash</span>}
              {dropCount > 0 && <span className="text-red-600 dark:text-red-400">{dropCount} drop</span>}
            </div>
          )}

          {/* Squash message input (shown when there are squashes) */}
          {squashCount > 0 && (
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                Squash commit message (optional)
              </label>
              <textarea
                value={squashMsg}
                onChange={(e) => setSquashMsg(e.target.value)}
                placeholder="Merged commit message..."
                rows={2}
                className="w-full px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>
          )}

          {/* Commit list */}
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-gray-500">
              <span className="animate-spin mr-2">&#x21BB;</span>
              Loading commits...
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400 italic">
              No commits found
            </div>
          ) : (
            <div className="space-y-1 max-h-[400px] overflow-y-auto" role="list" aria-label="Commits for rebase">
              {entries.map((entry, index) => {
                const isDragging = dragIndex === index;
                const isDropTarget = dropIndex === index && dragIndex !== null && dragIndex !== index;

                return (
                  <div
                    key={entry.commit.hash}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    role="listitem"
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-150 cursor-grab active:cursor-grabbing ${
                      isDragging
                        ? "opacity-40 border-dashed border-blue-400 dark:border-blue-600"
                        : isDropTarget
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : entry.action === "drop"
                        ? "opacity-50 border-red-200 dark:border-red-800/30 bg-red-50/50 dark:bg-red-900/10"
                        : "border-[var(--border-color)] bg-[var(--surface-1)]"
                    }`}
                  >
                    {/* Drag handle */}
                    <span className="text-gray-300 dark:text-gray-600 text-xs select-none" aria-hidden="true">
                      &#x2630;
                    </span>

                    {/* Action selector */}
                    <select
                      value={entry.action}
                      onChange={(e) => setAction(index, e.target.value as RebaseAction)}
                      className={`px-1.5 py-0.5 rounded text-xs font-medium border cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${ACTION_STYLES[entry.action]}`}
                      aria-label={`Action for commit ${entry.commit.short_hash}`}
                    >
                      <option value="pick">pick</option>
                      <option value="squash">squash</option>
                      <option value="drop">drop</option>
                    </select>

                    {/* Commit hash */}
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400 w-16 shrink-0">
                      {entry.commit.short_hash}
                    </span>

                    {/* Commit message */}
                    <span
                      className={`flex-1 text-xs truncate ${
                        entry.action === "drop"
                          ? "line-through text-gray-400 dark:text-gray-500"
                          : "text-gray-700 dark:text-gray-300"
                      }`}
                      title={entry.commit.message}
                    >
                      {entry.commit.message.split("\n")[0]}
                    </span>

                    {/* Author */}
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 hidden sm:block">
                      {entry.commit.author}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--surface-2)] text-gray-700 dark:text-gray-300 border border-[var(--border-color)] hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => setConfirmApply(true)}
              disabled={applying || !hasChanges || entries.length === 0}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-gray-400 text-white transition-colors"
            >
              {applying ? (
                <span className="flex items-center gap-1.5">
                  <span className="animate-spin">&#x21BB;</span>
                  Applying...
                </span>
              ) : (
                "Apply Rebase"
              )}
            </button>
          </div>
        </div>
      </Modal>

      {confirmApply && (
        <OperationConfirmDialog
          open
          operation="git_rebase"
          targets={[{ path, label: `${squashCount} squash action(s), ${dropCount} dropped commit(s)` }]}
          onConfirm={handleApply}
          onCancel={() => setConfirmApply(false)}
        />
      )}
    </>
  );
});
