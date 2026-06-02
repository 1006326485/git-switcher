import { useState, useCallback, memo } from "react";
import * as api from "../lib/tauri";
import type { GitFileEntry } from "../lib/types";

interface GitOpsPanelProps {
  path: string;
  onRefresh: () => Promise<void>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onInfo?: (msg: string) => void;
}

export const GitOpsPanel = memo(function GitOpsPanel({ path, onRefresh, onSuccess, onError, onInfo }: GitOpsPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [commitMsg, setCommitMsg] = useState("");
  const [files, setFiles] = useState<GitFileEntry[]>([]);
  const [loadingOps, setLoadingOps] = useState<Set<string>>(new Set());
  const [stagingFiles, setStagingFiles] = useState<Set<string>>(new Set());

  const loadFiles = useCallback(async () => {
    try {
      const f = await api.gitGetFiles(path);
      setFiles(f);
    } catch (e) {
      onError(`Failed to load files: ${e}`);
    }
  }, [path, onError]);

  const handleToggle = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      await loadFiles();
    }
  }, [expanded, loadFiles]);

  const handleAction = useCallback(
    async (name: string, fn: () => Promise<void>, successMsg?: string) => {
      setLoadingOps((prev) => new Set(prev).add(name));
      const label = { fetch: "Fetching", pull: "Pulling", push: "Pushing", stash: "Stashing", pop: "Popping" }[name] ?? name;
      onInfo?.(`${label}...`);
      try {
        await fn();
        if (successMsg) onSuccess(successMsg);
        await Promise.all([onRefresh(), loadFiles()]);
      } catch (e) {
        onError(String(e));
      } finally {
        setLoadingOps((prev) => {
          const next = new Set(prev);
          next.delete(name);
          return next;
        });
      }
    },
    [onRefresh, onSuccess, onError, loadFiles]
  );

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim()) return;
    setLoadingOps((prev) => new Set(prev).add("commit"));
    try {
      const hash = await api.gitCommit(path, commitMsg.trim());
      onSuccess(`Committed: ${hash.slice(0, 7)}`);
      setCommitMsg("");
      await Promise.all([onRefresh(), loadFiles()]);
    } catch (e) {
      onError(String(e));
    } finally {
      setLoadingOps((prev) => {
        const next = new Set(prev);
        next.delete("commit");
        return next;
      });
    }
  }, [path, commitMsg, onRefresh, onSuccess, onError, loadFiles]);

  const handleStage = useCallback(
    async (filePath: string) => {
      setStagingFiles((prev) => new Set(prev).add(filePath));
      try {
        await api.gitStageFile(path, filePath);
        await loadFiles();
      } catch (e) {
        onError(String(e));
      } finally {
        setStagingFiles((prev) => {
          const next = new Set(prev);
          next.delete(filePath);
          return next;
        });
      }
    },
    [path, loadFiles, onError]
  );

  const handleUnstage = useCallback(
    async (filePath: string) => {
      setStagingFiles((prev) => new Set(prev).add(filePath));
      try {
        await api.gitUnstageFile(path, filePath);
        await loadFiles();
      } catch (e) {
        onError(String(e));
      } finally {
        setStagingFiles((prev) => {
          const next = new Set(prev);
          next.delete(filePath);
          return next;
        });
      }
    },
    [path, loadFiles, onError]
  );

  const handleFetch = useCallback(() => handleAction("fetch", async () => { await api.gitFetch(path); }, "Fetch completed"), [handleAction, path]);
  const handlePull = useCallback(() => handleAction("pull", async () => { await api.gitPull(path); }, "Pull completed"), [handleAction, path]);
  const handlePush = useCallback(() => handleAction("push", async () => { await api.gitPush(path); }, "Push completed"), [handleAction, path]);
  const handleStash = useCallback(() => handleAction("stash", async () => { await api.gitStash(path); }, "Stashed changes"), [handleAction, path]);
  const handlePop = useCallback(() => handleAction("pop", async () => { await api.gitStashPop(path); }, "Stash popped"), [handleAction, path]);

  const isLoading = (name: string) => loadingOps.has(name);

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      <button
        onClick={handleToggle}
        aria-expanded={expanded}
        aria-label="Toggle git operations"
        className="w-full px-4 py-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 flex items-center gap-2 transition-colors"
      >
        <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>&#x25B6;</span>
        Git Operations
      </button>

      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={handleFetch}
              disabled={isLoading("fetch")}
              aria-label="Fetch from remote"
              className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              {isLoading("fetch") ? "Fetching..." : "Fetch"}
            </button>
            <button
              onClick={handlePull}
              disabled={isLoading("pull")}
              aria-label="Pull from remote"
              className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
            >
              {isLoading("pull") ? "Pulling..." : "Pull"}
            </button>
            <button
              onClick={handlePush}
              disabled={isLoading("push")}
              aria-label="Push to remote"
              className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50 transition-colors"
            >
              {isLoading("push") ? "Pushing..." : "Push"}
            </button>
            <button
              onClick={handleStash}
              disabled={isLoading("stash")}
              aria-label="Stash changes"
              className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 disabled:opacity-50 transition-colors"
            >
              {isLoading("stash") ? "Stashing..." : "Stash"}
            </button>
            <button
              onClick={handlePop}
              disabled={isLoading("pop")}
              aria-label="Pop stash"
              className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50 transition-colors"
            >
              {isLoading("pop") ? "Popping..." : "Pop"}
            </button>
          </div>

          {/* File list with stage/unstage */}
          {files.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {files.map((f) => (
                <div key={f.path} className="flex items-center gap-2 text-xs">
                  <span
                    className={`w-14 text-center px-1.5 py-0.5 rounded font-mono ${
                      f.status === "untracked"
                        ? "bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300"
                        : f.status === "modified"
                        ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
                        : f.status === "deleted"
                        ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                        : f.status === "renamed"
                        ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                        : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                    }`}
                  >
                    {f.status === "untracked"
                      ? "??"
                      : f.status === "modified"
                      ? "M"
                      : f.status === "deleted"
                      ? "D"
                      : f.status === "renamed"
                      ? "R"
                      : "A"}
                  </span>
                  <span className="flex-1 truncate text-gray-700 dark:text-gray-300 font-mono">
                    {f.path}
                  </span>
                  {f.status === "untracked" ? (
                    <button
                      onClick={() => handleStage(f.path)}
                      disabled={stagingFiles.has(f.path)}
                      className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50"
                      aria-label={`Stage ${f.path}`}
                      title="Stage"
                    >
                      {stagingFiles.has(f.path) ? "..." : "+"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUnstage(f.path)}
                      disabled={stagingFiles.has(f.path)}
                      className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                      aria-label={`Unstage ${f.path}`}
                      title="Unstage"
                    >
                      {stagingFiles.has(f.path) ? "..." : "-"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Commit form */}
          <div className="flex gap-2">
            <input
              type="text"
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCommit()}
              placeholder="Commit message..."
              aria-label="Commit message"
              className="flex-1 px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleCommit}
              disabled={!commitMsg.trim() || isLoading("commit")}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white transition-colors"
            >
              {isLoading("commit") ? "Committing..." : "Commit"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
