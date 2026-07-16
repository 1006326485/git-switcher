import { memo, type RefObject } from "react";
import type { CommitInfo } from "../lib/types";
import { AiGenerateIcon } from "./ui/icons";

const COMMIT_PREFIXES = ["feat: ", "fix: ", "chore: ", "docs: "] as const;

interface GitOpsCommitBarProps {
  commitMsg: string;
  onCommitMsgChange: (msg: string) => void;
  commitMsgRef: RefObject<HTMLTextAreaElement | null>;
  onCommit: () => void;
  onGenerateMsg: () => void;
  generatingMsg: boolean;
  onToggleDiff: () => void;
  showDiff: boolean;
  isLoading: (name: string) => boolean;
  onInsertPrefix: (prefix: string) => void;
  recentCommits: CommitInfo[];
  onFillCommit: (msg: string) => void;
  stagedDiff: string | null;
  loadingDiff: boolean;
  onRefreshDiff: () => void;
}

export const GitOpsCommitBar = memo(function GitOpsCommitBar({
  commitMsg, onCommitMsgChange, commitMsgRef, onCommit, onGenerateMsg, generatingMsg,
  onToggleDiff, showDiff, isLoading, onInsertPrefix, recentCommits, onFillCommit,
  stagedDiff, loadingDiff, onRefreshDiff,
}: GitOpsCommitBarProps) {
  return (
    <>
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2 min-w-0">
          <textarea
            ref={commitMsgRef}
            value={commitMsg}
            onChange={(e) => onCommitMsgChange(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                onCommit();
              }
            }}
            placeholder="Commit message... (Cmd+Enter to commit)"
            aria-label="Commit message"
            rows={2}
            className="flex-1 min-w-0 px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-1)] text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <div className="flex gap-2 shrink-0">
            <button
              onClick={onGenerateMsg}
              disabled={generatingMsg}
              title="Generate commit message with AI"
              aria-label="Generate commit message with AI"
              className="px-2 py-1.5 rounded-lg text-xs font-medium bg-purple-100 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 hover:bg-purple-200 dark:hover:bg-purple-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
            >
              {generatingMsg ? (
                <span className="animate-spin inline-block">&#x21BB;</span>
              ) : (
                <AiGenerateIcon />
              )}
            </button>
            <button
              onClick={onToggleDiff}
              title="Preview staged diff"
              aria-label="Preview staged diff"
              aria-expanded={showDiff}
              className={`px-2 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 active:scale-[0.98] ${showDiff ? "bg-teal-200 dark:bg-teal-800/50 text-teal-800 dark:text-teal-200 border border-teal-300 dark:border-teal-700/50" : "bg-teal-100 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800/50 hover:bg-teal-200 dark:hover:bg-teal-900/40"}`}
            >
              {showDiff ? "Hide Diff" : "Preview Diff"}
            </button>
            <button
              onClick={onCommit}
              disabled={!commitMsg.trim() || isLoading("commit")}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:bg-gray-400 text-white transition-colors duration-150 active:scale-[0.98]"
            >
              {isLoading("commit") ? "Committing..." : "Commit"}
            </button>
          </div>
        </div>

        {/* Commit message helpers */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Character counter */}
          <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
            {commitMsg.length} chars
          </span>

          {/* Prefix buttons */}
          <div className="flex gap-1">
            {COMMIT_PREFIXES.map((prefix) => (
              <button
                key={prefix}
                onClick={() => onInsertPrefix(prefix)}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                title={`Add "${prefix.trim()}" prefix`}
              >
                {prefix.trim()}
              </button>
            ))}
          </div>

          {/* Recent commit quick-fill */}
          {recentCommits.length > 0 && (
            <div className="flex gap-1 ml-auto">
              {recentCommits.map((c) => (
                <button
                  key={c.hash}
                  onClick={() => onFillCommit(c.message.split("\n")[0])}
                  className="px-1.5 py-0.5 rounded text-[10px] text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 truncate max-w-[120px] transition-colors"
                  title={c.message.split("\n")[0]}
                >
                  {c.message.split("\n")[0]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Staged diff preview */}
      {showDiff && (
        <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Staged Changes</span>
            <button
              onClick={onRefreshDiff}
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
    </>
  );
});
