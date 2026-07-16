import { useState, useEffect, useCallback, memo } from "react";
import * as api from "../lib/tauri";
import type { FileCommitEntry } from "../lib/types";
import { parseError } from "../lib/types";

function formatRelativeTime(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

interface FileHistoryViewProps {
  path: string;
  filePath: string;
  onClose: () => void;
}

export const FileHistoryView = memo(function FileHistoryView({
  path,
  filePath,
  onClose,
}: FileHistoryViewProps) {
  const [entries, setEntries] = useState<FileCommitEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.gitFileHistory(path, filePath, 50);
      setEntries(data);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, filePath]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <div>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">File History</h2>
            <p className="text-xs text-gray-500 font-mono truncate max-w-xs">{filePath}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg" aria-label="Close">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
              <span className="ml-2 text-sm text-gray-500">Loading history...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-6">
              <p className="text-sm text-red-500 mb-2">{error}</p>
              <button onClick={load} className="text-xs text-blue-500 hover:underline">Retry</button>
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-6">No history found for this file</p>
          )}

          {!loading && !error && entries.length > 0 && (
            <div className="space-y-2">
              {entries.map((entry) => (
                <div
                  key={entry.hash}
                  className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <span className="font-mono text-xs text-gray-500 mt-0.5 shrink-0">
                    {entry.hash.slice(0, 7)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-800 dark:text-gray-200 truncate">{entry.message}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {entry.author} · {formatRelativeTime(entry.timestamp)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 text-xs">
                    <span className="text-green-600 dark:text-green-400">+{entry.additions}</span>
                    <span className="text-red-600 dark:text-red-400">-{entry.deletions}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
export default FileHistoryView;
