import { useState, useEffect, useCallback, useRef, memo } from "react";
import * as api from "../lib/tauri";
import type { ReflogEntry } from "../lib/types";
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

interface ReflogViewProps {
  path: string;
  onRefresh?: () => Promise<void>;
  onSuccess?: (msg: string) => void;
  onError?: (msg: string) => void;
}

export const ReflogView = memo(function ReflogView({ path, onRefresh, onSuccess, onError }: ReflogViewProps) {
  const [entries, setEntries] = useState<ReflogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.gitGetReflog(path, 50);
      if (!cancelledRef.current) setEntries(data);
    } catch (e) {
      if (!cancelledRef.current) setError(parseError(e));
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    return () => { cancelledRef.current = true; };
  }, [load]);

  const handleCheckout = useCallback(async (entry: ReflogEntry) => {
    setCheckingOut(entry.hash);
    try {
      await api.gitCheckoutCommit(path, entry.hash);
      onSuccess?.(`Checked out to ${entry.short_hash}`);
      await onRefresh?.();
    } catch (e) {
      onError?.(parseError(e));
    } finally {
      setCheckingOut(null);
    }
  }, [path, onRefresh, onSuccess, onError]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
        <span className="ml-2 text-xs text-gray-500">Loading reflog...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4">
        <p className="text-xs text-red-500 mb-2">{error}</p>
        <button onClick={load} className="text-xs text-blue-500 hover:underline">Retry</button>
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-4">No reflog entries</p>;
  }

  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-700/50 list-none m-0 p-0 max-h-48 overflow-y-auto">
      {entries.map((entry) => (
        <li key={`${entry.hash}-${entry.timestamp}`}>
          <button
            onClick={() => handleCheckout(entry)}
            disabled={checkingOut === entry.hash}
            className="w-full text-left px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors disabled:opacity-50 flex items-start gap-2"
            title={`Checkout to ${entry.hash}`}
          >
            <div className="shrink-0 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 dark:bg-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                {entry.message}
              </p>
              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-500 dark:text-gray-400">
                <span className="font-mono">{entry.short_hash}</span>
                <span>{entry.author}</span>
                <span>{formatRelativeTime(entry.timestamp)}</span>
                {checkingOut === entry.hash && <span className="text-blue-500">checking out...</span>}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
});

export default ReflogView;
