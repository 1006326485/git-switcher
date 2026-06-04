import { useState, useCallback, memo } from "react";
import * as api from "../lib/tauri";
import type { GitFileEntry, StashInfo } from "../lib/types";

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
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const [stashList, setStashList] = useState<StashInfo[]>([]);
  const [showStashList, setShowStashList] = useState(false);
  const [stashMsg, setStashMsg] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [stagedDiff, setStagedDiff] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);

  const loadFiles = useCallback(async () => {
    try {
      const f = await api.gitGetFiles(path);
      setFiles(f);
    } catch (e) {
      onError(`Failed to load files: ${e}`);
    }
  }, [path, onError]);

  const loadStashList = useCallback(async () => {
    try {
      const list = await api.gitStashList(path);
      setStashList(list);
    } catch (e) {
      onError(`Failed to load stash list: ${e}`);
    }
  }, [path, onError]);

  const loadStagedDiff = useCallback(async () => {
    setLoadingDiff(true);
    try {
      const diff = await api.gitGetStagedDiff(path);
      setStagedDiff(diff);
    } catch (e) {
      onError(`Failed to load diff: ${e}`);
    } finally {
      setLoadingDiff(false);
    }
  }, [path, onError]);

  const handleToggle = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    if (next) {
      await Promise.all([loadFiles(), loadStashList()]);
    }
  }, [expanded, loadFiles, loadStashList]);

  const handleAction = useCallback(
    async (name: string, fn: () => Promise<void>, successMsg?: string) => {
      setLoadingOps((prev) => new Set(prev).add(name));
      const label = { fetch: "Fetching", pull: "Pulling", push: "Pushing", stash: "Stashing", pop: "Popping", stash_drop: "Dropping", stage_all: "Staging all", unstage_all: "Unstaging all", stash_apply: "Applying stash" }[name] ?? name;
      onInfo?.(`${label}...`);
      try {
        await fn();
        if (successMsg) onSuccess(successMsg);
        await Promise.all([onRefresh(), loadFiles(), loadStashList()]);
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
    [onRefresh, onSuccess, onError, loadFiles, loadStashList]
  );

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim()) return;
    setLoadingOps((prev) => new Set(prev).add("commit"));
    try {
      const hash = await api.gitCommit(path, commitMsg.trim());
      onSuccess(`Committed: ${hash.slice(0, 7)}`);
      setCommitMsg("");
      setStagedDiff(null);
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

  const handleStageAll = useCallback(() => handleAction("stage_all", async () => { await api.gitStageAll(path); }, "All files staged"), [handleAction, path]);
  const handleUnstageAll = useCallback(() => handleAction("unstage_all", async () => { await api.gitUnstageAll(path); }, "All files unstaged"), [handleAction, path]);
  const handleFetch = useCallback(() => handleAction("fetch", async () => { await api.gitFetch(path); }, "Fetch completed"), [handleAction, path]);
  const handlePull = useCallback(() => handleAction("pull", async () => { await api.gitPull(path); }, "Pull completed"), [handleAction, path]);
  const handlePush = useCallback(() => handleAction("push", async () => { await api.gitPush(path); }, "Push completed"), [handleAction, path]);
  const handlePop = useCallback(() => handleAction("pop", async () => { await api.gitStashPop(path); }, "Stash popped"), [handleAction, path]);

  const handleStash = useCallback(() => {
    const msg = stashMsg.trim();
    return handleAction("stash", async () => {
      await api.gitStash(path, msg || undefined);
    }, "Stashed changes");
  }, [handleAction, path, stashMsg]);

  const handleGenerateMsg = useCallback(async () => {
    setGeneratingMsg(true);
    try {
      const msg = await api.generateCommitMsg(path);
      setCommitMsg(msg);
    } catch (e) {
      onError(String(e));
    } finally {
      setGeneratingMsg(false);
    }
  }, [path, onError]);

  const handleStashPopAt = useCallback(
    (index: number) => handleAction("pop", async () => { await api.gitStashPop(path, index); }, `Stash@{${index}} popped`),
    [handleAction, path]
  );
  const handleStashApply = useCallback(
    (index: number) => handleAction("stash_apply", async () => { await api.gitStashApply(path, index); }, `Stash@{${index}} applied`),
    [handleAction, path]
  );
  const handleStashDrop = useCallback(
    (index: number) => handleAction("stash_drop", async () => { await api.gitStashDrop(path, index); }, `Stash@{${index}} dropped`),
    [handleAction, path]
  );

  const handleToggleStashList = useCallback(async () => {
    const next = !showStashList;
    setShowStashList(next);
    if (next) {
      await loadStashList();
    }
  }, [showStashList, loadStashList]);

  const handleToggleDiff = useCallback(async () => {
    const next = !showDiff;
    setShowDiff(next);
    if (next) {
      await loadStagedDiff();
    }
  }, [showDiff, loadStagedDiff]);

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
            <input
              type="text"
              value={stashMsg}
              onChange={(e) => setStashMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStash()}
              placeholder="Stash message (optional)"
              aria-label="Stash message"
              className="px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            <button
              onClick={handlePop}
              disabled={isLoading("pop")}
              aria-label="Pop stash"
              className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50 transition-colors"
            >
              {isLoading("pop") ? "Popping..." : "Pop"}
            </button>
            <button
              onClick={handleToggleStashList}
              aria-label="Toggle stash list"
              aria-expanded={showStashList}
              className="px-2.5 py-1.5 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Stash List {stashList.length > 0 ? `(${stashList.length})` : ""}
            </button>
          </div>

          {/* Stash list */}
          {showStashList && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {stashList.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">No stash entries</p>
              ) : (
                stashList.map((s) => (
                  <div key={s.index} className="flex items-center gap-2 text-xs">
                    <span className="w-8 text-center px-1.5 py-0.5 rounded font-mono bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
                      {s.index}
                    </span>
                    <span className="flex-1 truncate text-gray-700 dark:text-gray-300 font-mono">
                      {s.message}
                    </span>
                    <button
                      onClick={() => handleStashApply(s.index)}
                      disabled={isLoading("stash_apply")}
                      className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50"
                      aria-label={`Apply stash@{${s.index}}`}
                      title="Apply"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => handleStashPopAt(s.index)}
                      disabled={isLoading("pop")}
                      className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50"
                      aria-label={`Pop stash@{${s.index}}`}
                      title="Pop"
                    >
                      Pop
                    </button>
                    <button
                      onClick={() => handleStashDrop(s.index)}
                      disabled={isLoading("stash_drop")}
                      className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                      aria-label={`Drop stash@{${s.index}}`}
                      title="Drop"
                    >
                      Drop
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* File list with stage/unstage */}
          {files.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs text-gray-500 dark:text-gray-400">{files.length} file{files.length !== 1 ? "s" : ""}</span>
                <button
                  onClick={handleStageAll}
                  disabled={isLoading("stage_all")}
                  className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50 transition-colors"
                  aria-label="Stage all files"
                >
                  {isLoading("stage_all") ? "Staging..." : "Stage All"}
                </button>
                <button
                  onClick={handleUnstageAll}
                  disabled={isLoading("unstage_all")}
                  className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 transition-colors"
                  aria-label="Unstage all files"
                >
                  {isLoading("unstage_all") ? "Unstaging..." : "Unstage All"}
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto">
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
              onClick={handleGenerateMsg}
              disabled={generatingMsg}
              title="Generate commit message with AI"
              aria-label="Generate commit message with AI"
              className="px-2 py-1.5 rounded-md text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-50 transition-colors"
            >
              {generatingMsg ? (
                <span className="animate-spin inline-block">&#x21BB;</span>
              ) : (
                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0a8 8 0 110 16A8 8 0 018 0zm3.28 5.78a.75.75 0 00-1.06-1.06L7 7.94 5.78 6.72a.75.75 0 00-1.06 1.06l1.75 1.75a.75.75 0 001.06 0l3.75-3.75z" />
                </svg>
              )}
            </button>
            <button
              onClick={handleToggleDiff}
              title="Preview staged diff"
              aria-label="Preview staged diff"
              aria-expanded={showDiff}
              className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${showDiff ? "bg-teal-200 dark:bg-teal-800/50 text-teal-800 dark:text-teal-200" : "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 hover:bg-teal-200 dark:hover:bg-teal-900/50"}`}
            >
              {showDiff ? "Hide Diff" : "Preview Diff"}
            </button>
            <button
              onClick={handleCommit}
              disabled={!commitMsg.trim() || isLoading("commit")}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white transition-colors"
            >
              {isLoading("commit") ? "Committing..." : "Commit"}
            </button>
          </div>

          {/* Staged diff preview */}
          {showDiff && (
            <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Staged Changes</span>
                <button
                  onClick={loadStagedDiff}
                  disabled={loadingDiff}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
                  aria-label="Refresh diff"
                >
                  {loadingDiff ? "Loading..." : "Refresh"}
                </button>
              </div>
              <pre className="p-3 text-xs font-mono max-h-48 overflow-y-auto whitespace-pre-wrap break-all text-gray-800 dark:text-gray-200">
                {stagedDiff === null ? (
                  <span className="text-gray-400 italic">Loading...</span>
                ) : stagedDiff.length === 0 ? (
                  <span className="text-gray-400 italic">No staged changes</span>
                ) : (
                  stagedDiff.split("\n").map((line, i) => (
                    <span
                      key={i}
                      className={
                        line.startsWith("+")
                          ? "text-green-600 dark:text-green-400"
                          : line.startsWith("-")
                          ? "text-red-600 dark:text-red-400"
                          : line.startsWith("@@")
                          ? "text-purple-600 dark:text-purple-400"
                          : undefined
                      }
                    >
                      {line}
                      {"\n"}
                    </span>
                  ))
                )}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
