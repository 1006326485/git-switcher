import { useState, useEffect, useCallback, memo } from "react";
import * as api from "../lib/tauri";
import type { OperationLogEntry } from "../lib/types";

const OP_ICONS: Record<string, string> = {
  fetch: "📥",
  pull: "⬇️",
  push: "⬆️",
  stash: "📦",
  branch_switch: "🔀",
  commit: "✏️",
  merge: "🔄",
  rebase: "🔄",
  cherry_pick: "🍒",
  tag: "🏷️",
  clean: "🧹",
  reset: "⏪",
  worktree: "🌳",
  stash_apply: "📦",
  stash_pop: "📦",
  fetch_all: "📥",
  pull_all: "⬇️",
  push_all: "⬆️",
  sync_all: "🔄",
};

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch {
    return dateStr;
  }
}

function formatOpName(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface OperationLogPanelProps {
  open: boolean;
  onClose: () => void;
}

export const OperationLogPanel = memo(function OperationLogPanel({
  open,
  onClose,
}: OperationLogPanelProps) {
  const [entries, setEntries] = useState<OperationLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getOperationLog(200);
      setEntries(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const filtered = filter === "all"
    ? entries
    : entries.filter((e) => e.operation_type === filter);

  const opTypes = [...new Set(entries.map((e) => e.operation_type))].sort();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        className="absolute right-4 top-12 w-96 max-h-[80vh] bg-[var(--surface-1)] rounded-xl shadow-2xl border border-[var(--border-color)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-color)]">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Operation History</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>

        {/* Filter chips */}
        <div className="px-3 py-2 border-b border-[var(--border-color)] overflow-x-auto">
          <div className="flex gap-1.5 min-w-max">
            <button
              onClick={() => setFilter("all")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === "all"
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-2)] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              All ({entries.length})
            </button>
            {opTypes.map((op) => {
              const count = entries.filter((e) => e.operation_type === op).length;
              return (
                <button
                  key={op}
                  onClick={() => setFilter(op)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    filter === op
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--surface-2)] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {OP_ICONS[op] || "📌"} {formatOpName(op)} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <svg className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-400 dark:text-gray-500">No operations recorded yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Git operations will appear here</p>
            </div>
          )}

          {!loading && filtered.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-start gap-2.5 px-4 py-2.5 border-b border-[var(--border-color)] last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
                entry.status === "error" ? "bg-red-50/50 dark:bg-red-900/10" : ""
              }`}
            >
              <span className="text-sm shrink-0 mt-0.5">
                {entry.status === "error" ? "❌" : (OP_ICONS[entry.operation_type] || "📌")}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {formatOpName(entry.operation_type)}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {entry.project_name || entry.project_path.split("/").pop()}
                  </span>
                </div>
                {entry.details && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {entry.details}
                  </p>
                )}
                {entry.error_message && (
                  <p className="text-xs text-red-500 dark:text-red-400 mt-0.5 truncate">
                    {entry.error_message}
                  </p>
                )}
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 mt-0.5">
                {formatTime(entry.created_at)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

export default OperationLogPanel;
