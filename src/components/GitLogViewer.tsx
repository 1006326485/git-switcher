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

  // Filter state
  const [authorFilter, setAuthorFilter] = useState("");
  const [messageFilter, setMessageFilter] = useState("");
  const [sinceFilter, setSinceFilter] = useState("");
  const [untilFilter, setUntilFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const buildFilters = useCallback((): api.GitLogFilters => {
    const filters: api.GitLogFilters = {};
    if (authorFilter.trim()) filters.author = authorFilter.trim();
    if (messageFilter.trim()) filters.message_contains = messageFilter.trim();
    if (sinceFilter) filters.since = Math.floor(new Date(sinceFilter).getTime() / 1000);
    if (untilFilter) filters.until = Math.floor(new Date(untilFilter).getTime() / 1000);
    return filters;
  }, [authorFilter, messageFilter, sinceFilter, untilFilter]);

  const fetchLogs = useCallback(
    async (offset: number, append: boolean, filters: api.GitLogFilters) => {
      const data = await api.gitGetLog(path, LIMIT, offset, filters);
      if (append) {
        setCommits((prev) => [...prev, ...data]);
      } else {
        setCommits(data);
      }
      setHasMore(data.length >= LIMIT);
    },
    [path],
  );

  // Initial load when modal opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setHasMore(true);
    fetchLogs(0, false, {})
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, path, fetchLogs]);

  const handleApplyFilters = useCallback(() => {
    setLoading(true);
    setError(null);
    setHasMore(true);
    fetchLogs(0, false, buildFilters())
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [fetchLogs, buildFilters]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await fetchLogs(commits.length, true, buildFilters());
    } catch (e) {
      setError(String(e));
    } finally {
      setLoadingMore(false);
    }
  }, [commits.length, loadingMore, hasMore, fetchLogs, buildFilters]);

  const handleClearFilters = useCallback(() => {
    setAuthorFilter("");
    setMessageFilter("");
    setSinceFilter("");
    setUntilFilter("");
  }, []);

  const hasActiveFilters = authorFilter.trim() || messageFilter.trim() || sinceFilter || untilFilter;

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
      {/* Filter toggle */}
      <div className="px-6 pb-2 flex items-center gap-2">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            showFilters || hasActiveFilters
              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
              : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          {hasActiveFilters ? "Filters (active)" : "Filters"}
        </button>
      </div>

      {/* Filter inputs */}
      {showFilters && (
        <div className="px-6 pb-3 space-y-2 border-b border-gray-100 dark:border-gray-700/50">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Author</label>
              <input
                type="text"
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value)}
                placeholder="Filter by author..."
                className="w-full px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Message</label>
              <input
                type="text"
                value={messageFilter}
                onChange={(e) => setMessageFilter(e.target.value)}
                placeholder="Search in messages..."
                className="w-full px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Since</label>
              <input
                type="date"
                value={sinceFilter}
                onChange={(e) => setSinceFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Until</label>
              <input
                type="date"
                value={untilFilter}
                onChange={(e) => setUntilFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleApplyFilters}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              Apply
            </button>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="px-3 py-1.5 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

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
            {hasActiveFilters ? "No commits match the filters" : "No commits yet"}
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
