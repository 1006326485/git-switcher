import { useState, useEffect, useCallback, memo } from "react";
import * as api from "../lib/tauri";
import type { CommitInfo } from "../lib/types";
import { Modal } from "./ui/primitives";

const LIMIT = 50;

interface GitLogViewerProps {
  path: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
}

export const GitLogViewer = memo(function GitLogViewer({ path, projectName, open, onClose }: GitLogViewerProps) {
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHasMore(true);
    api
      .gitGetLog(path, LIMIT, 0)
      .then((data) => {
        if (!cancelled) {
          setCommits(data);
          setHasMore(data.length >= LIMIT);
        }
      })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, path]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const more = await api.gitGetLog(path, LIMIT, commits.length);
      setCommits((prev) => [...prev, ...more]);
      setHasMore(more.length >= LIMIT);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingMore(false);
    }
  }, [path, commits.length, loadingMore, hasMore]);

  const formatDate = useCallback((ts: number) => {
    const d = new Date(ts * 1000);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  }, []);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Commit History"
      subtitle={projectName}
      maxWidth="max-w-2xl"
    >
      <div className="max-h-[60vh] overflow-y-auto" role="region" aria-label="Commit history">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <span className="animate-spin mr-2">&#x21BB;</span> Loading...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-32 text-red-500 text-sm">
            {error}
          </div>
        ) : commits.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            No commits yet
          </div>
        ) : (
          <>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/50 list-none m-0 p-0">
              {commits.map((c) => (
                <li
                  key={c.hash}
                  className="px-6 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 mt-1">
                      <div className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {c.message}
                      </p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                        <span className="font-mono">{c.short_hash}</span>
                        <span>{c.author}</span>
                        <span>{formatDate(c.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {hasMore && (
              <div className="px-6 py-3">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-sm text-gray-700 dark:text-gray-300 transition-colors"
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
});
