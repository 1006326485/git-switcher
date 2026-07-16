import { useState, useEffect, useCallback, memo } from "react";
import * as api from "../lib/tauri";
import type { BranchCompareResult } from "../lib/types";
import { parseError } from "../lib/types";

interface BranchCompareViewProps {
  path: string;
  branchA: string;
  branchB: string;
  onClose: () => void;
}

export const BranchCompareView = memo(function BranchCompareView({
  path,
  branchA,
  branchB,
  onClose,
}: BranchCompareViewProps) {
  const [result, setResult] = useState<BranchCompareResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAhead, setShowAhead] = useState(true);
  const [showBehind, setShowBehind] = useState(true);
  const [showFiles, setShowFiles] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.gitCompareBranches(path, branchA, branchB);
      setResult(data);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setLoading(false);
    }
  }, [path, branchA, branchB]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-color)]">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            Comparing <span className="text-blue-600 dark:text-blue-400">{branchA}</span> → <span className="text-green-600 dark:text-green-400">{branchB}</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg" aria-label="Close">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent" />
              <span className="ml-2 text-sm text-gray-500">Comparing branches...</span>
            </div>
          )}

          {error && (
            <div className="text-center py-6">
              <p className="text-sm text-red-500 mb-2">{error}</p>
              <button onClick={load} className="text-xs text-blue-500 hover:underline">Retry</button>
            </div>
          )}

          {result && !loading && (
            <>
              {/* Summary */}
              <div className="flex items-center gap-3 text-xs">
                <span className="px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 font-medium">
                  {result.ahead} ahead
                </span>
                <span className="px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-medium">
                  {result.behind} behind
                </span>
                <span className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                  {result.changed_files.length} file{result.changed_files.length !== 1 ? "s" : ""} changed
                </span>
              </div>

              {/* Ahead commits */}
              {result.ahead_commits.length > 0 && (
                <section>
                  <button
                    onClick={() => setShowAhead(!showAhead)}
                    className="flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-300 mb-1"
                  >
                    <span>{showAhead ? "▼" : "▶"}</span>
                    Commits in {branchA} not in {branchB} ({result.ahead})
                  </button>
                  {showAhead && (
                    <div className="space-y-1 ml-4">
                      {result.ahead_commits.map((c) => (
                        <div key={c.hash} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-gray-500">{c.hash.slice(0, 7)}</span>
                          <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{c.message}</span>
                          <span className="text-gray-400">{c.author}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Behind commits */}
              {result.behind_commits.length > 0 && (
                <section>
                  <button
                    onClick={() => setShowBehind(!showBehind)}
                    className="flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-300 mb-1"
                  >
                    <span>{showBehind ? "▼" : "▶"}</span>
                    Commits in {branchB} not in {branchA} ({result.behind})
                  </button>
                  {showBehind && (
                    <div className="space-y-1 ml-4">
                      {result.behind_commits.map((c) => (
                        <div key={c.hash} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-gray-500">{c.hash.slice(0, 7)}</span>
                          <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{c.message}</span>
                          <span className="text-gray-400">{c.author}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Changed files */}
              {result.changed_files.length > 0 && (
                <section>
                  <button
                    onClick={() => setShowFiles(!showFiles)}
                    className="flex items-center gap-1 text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1"
                  >
                    <span>{showFiles ? "▼" : "▶"}</span>
                    Changed Files ({result.changed_files.length})
                  </button>
                  {showFiles && (
                    <div className="space-y-1 ml-4">
                      {result.changed_files.map((f) => (
                        <div key={f.path} className="flex items-center gap-2 text-xs">
                          <span className="flex-1 truncate font-mono text-gray-700 dark:text-gray-300">{f.path}</span>
                          <span className="text-green-600 dark:text-green-400">+{f.additions}</span>
                          <span className="text-red-600 dark:text-red-400">-{f.deletions}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* No diff */}
              {result.ahead === 0 && result.behind === 0 && result.changed_files.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">Branches are identical</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
});
export default BranchCompareView;
