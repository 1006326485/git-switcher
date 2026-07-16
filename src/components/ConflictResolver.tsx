import { useState, useEffect, useCallback, memo } from "react";
import * as api from "../lib/tauri";
import { parseError } from "../lib/types";

interface ConflictResolverProps {
  path: string;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onRefresh: () => void;
}

export const ConflictResolver = memo(function ConflictResolver({
  path,
  onSuccess,
  onError,
  onRefresh,
}: ConflictResolverProps) {
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  const loadConflicts = useCallback(async () => {
    try {
      const files = await api.gitListConflicts(path);
      setConflicts(files);
    } catch { /* ignore */ }
  }, [path]);

  useEffect(() => { loadConflicts(); }, [loadConflicts]);

  const handleResolve = useCallback(async (filePath: string, resolution: string) => {
    setResolving(filePath);
    try {
      await api.gitResolveConflict(path, filePath, resolution);
      setConflicts((prev) => prev.filter((f) => f !== filePath));
      onSuccess(`Resolved ${filePath} (${resolution})`);
      onRefresh();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setResolving(null);
    }
  }, [path, onSuccess, onError, onRefresh]);

  const handleAbort = useCallback(async () => {
    setLoading(true);
    try {
      await api.gitAbortMerge(path);
      setConflicts([]);
      onSuccess("Merge aborted");
      onRefresh();
    } catch (e) {
      onError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, onSuccess, onError, onRefresh]);

  if (conflicts.length === 0) return null;

  return (
    <div className="p-3 bg-red-50 dark:bg-red-900/10 rounded-lg border border-red-200 dark:border-red-800/30 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-red-700 dark:text-red-300">
          ⚠ {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""} to resolve
        </h4>
        <button
          onClick={handleAbort}
          disabled={loading}
          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300"
        >
          {loading ? "Aborting..." : "Abort Merge"}
        </button>
      </div>
      <div className="space-y-1">
        {conflicts.map((f) => (
          <div key={f} className="flex items-center gap-2 text-xs">
            <span className="flex-1 font-mono text-red-600 dark:text-red-400 truncate">{f}</span>
            <button
              onClick={() => handleResolve(f, "ours")}
              disabled={resolving === f}
              className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-200 disabled:opacity-50"
            >
              Ours
            </button>
            <button
              onClick={() => handleResolve(f, "theirs")}
              disabled={resolving === f}
              className="px-2 py-0.5 rounded bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-200 disabled:opacity-50"
            >
              Theirs
            </button>
          </div>
        ))}
      </div>
    </div>
  );
});
