import { memo, useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import * as api from "../lib/tauri";
import type { ProjectDiffSummary } from "../lib/types";
import { parseError } from "../lib/types";

interface QuickDiffPanelProps {
  open: boolean;
  onClose: () => void;
  onOpenFileDiff?: (projectPath: string, filePath: string) => void;
}

export const QuickDiffPanel = memo(function QuickDiffPanel({
  open,
  onClose,
  onOpenFileDiff,
}: QuickDiffPanelProps) {
  const [summaries, setSummaries] = useState<ProjectDiffSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchDiffs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.gitQuickDiffAll();
      setSummaries(result);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchDiffs();
    }
  }, [open, fetchDiffs]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const totalProjects = summaries.length;
  const totalFiles = summaries.reduce((sum, s) => sum + s.files_changed, 0);
  const totalAdditions = summaries.reduce((sum, s) => sum + s.additions, 0);
  const totalDeletions = summaries.reduce((sum, s) => sum + s.deletions, 0);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] bg-[var(--surface-1)] rounded-xl shadow-2xl border border-[var(--border-color)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Quick Diff Overview
            </h2>
            {!loading && !error && (
              <span className="text-xs text-gray-400">
                {totalProjects} project{totalProjects !== 1 ? "s" : ""}, {totalFiles} file{totalFiles !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDiffs}
              disabled={loading}
              className="px-2 py-1 text-xs rounded-md bg-[var(--surface-2)] text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Summary bar */}
        {!loading && !error && totalProjects > 0 && (
          <div className="px-4 py-2 border-b border-[var(--border-color)] flex items-center gap-4 text-xs shrink-0">
            <span className="text-gray-500 dark:text-gray-400">
              Summary:
            </span>
            <span className="text-green-600 dark:text-green-400 font-medium">
              +{totalAdditions}
            </span>
            <span className="text-red-500 dark:text-red-400 font-medium">
              -{totalDeletions}
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {totalFiles} file{totalFiles !== 1 ? "s" : ""} changed
            </span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-5 w-5 text-gray-400 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-gray-400">Scanning repositories...</span>
            </div>
          )}

          {error && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-red-500">{error}</p>
              <button
                onClick={fetchDiffs}
                className="mt-2 px-3 py-1 text-xs rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && totalProjects === 0 && (
            <div className="px-4 py-12 text-center">
              <svg className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-500 dark:text-gray-400">All repositories are clean</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">No uncommitted changes across any project</p>
            </div>
          )}

          {!loading && !error && summaries.map((summary) => (
            <div
              key={summary.project_id}
              className="border-b border-[var(--border-color)] last:border-b-0"
            >
              <button
                className="w-full px-4 py-3 text-left hover:bg-[var(--surface-2)] transition-colors flex items-center gap-3"
                onClick={() => setExpandedId(expandedId === summary.project_id ? null : summary.project_id)}
              >
                <svg
                  className={`w-3.5 h-3.5 text-gray-400 shrink-0 transition-transform ${expandedId === summary.project_id ? "rotate-90" : ""}`}
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path d="M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {summary.project_name}
                    </span>
                    <span className="text-[11px] text-blue-600 dark:text-blue-400 font-mono">
                      {summary.current_branch}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400 truncate block">{summary.path}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0 text-xs">
                  <span className="text-gray-500 dark:text-gray-400">
                    {summary.files_changed} file{summary.files_changed !== 1 ? "s" : ""}
                  </span>
                </div>
              </button>

              {expandedId === summary.project_id && (
                <div className="px-4 pb-3 pl-10">
                  <ul className="space-y-0.5">
                    {summary.files.map((file) => (
                      <li key={file} className="flex items-center gap-2">
                        {onOpenFileDiff ? (
                          <button
                            className="text-xs font-mono text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate transition-colors"
                            onClick={() => onOpenFileDiff(summary.path, file)}
                          >
                            {file}
                          </button>
                        ) : (
                          <span className="text-xs font-mono text-gray-600 dark:text-gray-300 truncate">
                            {file}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
});
export default QuickDiffPanel;
