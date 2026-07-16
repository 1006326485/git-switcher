import { memo } from "react";
import type { GitFileEntry, FileDiffStats } from "../lib/types";
import type { DiffLine } from "./diffUtils";

const inlineLineColors: Record<DiffLine["type"], string> = {
  add: "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200",
  del: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200",
  context: "",
  header: "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 font-semibold",
};

interface GitOpsFileListProps {
  files: GitFileEntry[];
  diffStats: Record<string, FileDiffStats>;
  expandedFiles: Set<string>;
  inlineDiffs: Record<string, DiffLine[]>;
  loadingInline: Set<string>;
  stagingFiles: Set<string>;
  isLoading: (name: string) => boolean;
  onStageAll: () => void;
  onUnstageAll: () => void;
  onToggleInlineDiff: (filePath: string, staged: boolean) => void;
  onStage: (filePath: string, fileKey: string) => void;
  onUnstage: (filePath: string, fileKey: string) => void;
  onDiscard: (filePath: string, fileKey: string) => void;
  onSetDiffFile: (file: { path: string; staged: boolean }) => void;
  onSetBlameFile: (path: string) => void;
  onSetHistoryFile: (path: string) => void;
}

export const GitOpsFileList = memo(function GitOpsFileList({
  files, diffStats, expandedFiles, inlineDiffs, loadingInline, stagingFiles, isLoading,
  onStageAll, onUnstageAll, onToggleInlineDiff, onStage, onUnstage, onDiscard,
  onSetDiffFile, onSetBlameFile, onSetHistoryFile,
}: GitOpsFileListProps) {
  if (files.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs text-gray-500 dark:text-gray-400">{files.length} file{files.length !== 1 ? "s" : ""}</span>
        <button
          onClick={onStageAll}
          disabled={isLoading("stage_all")}
          className="px-2 py-0.5 rounded-lg text-xs font-medium bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800/50 hover:bg-green-200 dark:hover:bg-green-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
          aria-label="Stage all files"
        >
          {isLoading("stage_all") ? "Staging..." : "Stage All"}
        </button>
        <button
          onClick={onUnstageAll}
          disabled={isLoading("unstage_all")}
          className="px-2 py-0.5 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/50 hover:bg-red-200 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors duration-150 active:scale-[0.98]"
          aria-label="Unstage all files"
        >
          {isLoading("unstage_all") ? "Unstaging..." : "Unstage All"}
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto" role="list" aria-label="Changed files">
        {files.map((f) => {
          const fileKey = `${f.path}:${f.staged ? "S" : "W"}`;
          const diffKey = `${f.path}:${f.staged}`;
          const stats = diffStats[diffKey];
          const isInlineOpen = expandedFiles.has(diffKey);
          const isLoadingDiff = loadingInline.has(diffKey);
          const inlineLines = inlineDiffs[diffKey];

          const statusLabel = f.status === "untracked" ? "??"
            : f.status === "added" ? "A"
            : f.status === "modified" ? "M"
            : f.status === "deleted" ? "D"
            : f.status === "renamed" ? "R"
            : "A";
          const statusColor = f.status === "untracked"
            ? "bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300"
            : f.status === "added"
            ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
            : f.status === "modified"
            ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
            : f.status === "deleted"
            ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
            : f.status === "renamed"
            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
            : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300";

          return (
            <div key={fileKey} role="listitem">
              <div className="flex items-center gap-2 text-xs group">
                <span className={`w-14 text-center px-1.5 py-0.5 rounded font-mono ${statusColor}`}>
                  {statusLabel}{f.staged ? "*" : ""}
                </span>
                <button
                  onClick={() => onToggleInlineDiff(f.path, f.staged)}
                  className="flex-1 truncate text-gray-700 dark:text-gray-300 font-mono text-left hover:underline hover:text-blue-600 dark:hover:text-blue-400"
                  title={isInlineOpen ? "Collapse diff" : "Expand inline diff"}
                >
                  <span className={`mr-1 transition-transform inline-block ${isInlineOpen ? "rotate-90" : ""}`}>&#x25B6;</span>
                  {f.path}
                </button>
                {/* Diff stats */}
                {stats && (
                  <span className="shrink-0 font-mono tabular-nums">
                    {stats.additions > 0 && (
                      <span className="text-green-600 dark:text-green-400">+{stats.additions}</span>
                    )}
                    {stats.additions > 0 && stats.deletions > 0 && " "}
                    {stats.deletions > 0 && (
                      <span className="text-red-600 dark:text-red-400">-{stats.deletions}</span>
                    )}
                  </span>
                )}
                {/* View Full Diff (modal) */}
                <button
                  onClick={() => onSetDiffFile({ path: f.path, staged: f.staged })}
                  className="px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                  aria-label={`View full diff for ${f.path}`}
                  title="View Full Diff"
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M1.5 1h5a.5.5 0 010 1H2.707l3.147 3.146a.5.5 0 11-.708.708L2 2.707V6.5a.5.5 0 01-1 0v-5a.5.5 0 01.5-.5zm13 0a.5.5 0 01.5.5v5a.5.5 0 01-1 0V2.707l-3.146 3.147a.5.5 0 11-.708-.708L13.293 2H9.5a.5.5 0 010-1h5zM1 13.5a.5.5 0 01.5.5v1.793l3.146-3.147a.5.5 0 01.708.708L2.707 16H6.5a.5.5 0 010 1h-5a.5.5 0 01-.5-.5v-5a.5.5 0 011 0v3.793l3.146-3.147a.5.5 0 01.708.708L2.707 16H6.5a.5.5 0 010 1h-5z" />
                    <path d="M14.5 15h-5a.5.5 0 010-1h3.793l-3.147-3.146a.5.5 0 01.708-.708L14 13.293V9.5a.5.5 0 011 0v5a.5.5 0 01-.5.5z" />
                  </svg>
                </button>
                {/* Blame — only for tracked files */}
                {f.status !== "untracked" && (
                  <button
                    onClick={() => onSetBlameFile(f.path)}
                    className="px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                    aria-label={`View blame for ${f.path}`}
                    title="View Blame"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4.5 2A1.5 1.5 0 003 3.5v9A1.5 1.5 0 004.5 14h7a1.5 1.5 0 001.5-1.5V6.621a1.5 1.5 0 00-.44-1.06L9.44 2.44A1.5 1.5 0 008.378 2H4.5zM2 3.5A2.5 2.5 0 014.5 1h3.878a2.5 2.5 0 011.768.732l3.121 3.121A2.5 2.5 0 0114 6.622V12.5A2.5 2.5 0 0111.5 15h-7A2.5 2.5 0 012 12.5v-9z"/>
                      <path d="M5 5.5a.5.5 0 01.5-.5h5a.5.5 0 010 1h-5a.5.5 0 01-.5-.5zm.5 2.5a.5.5 0 000 1h5a.5.5 0 000-1h-5zm-.5 3.5a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5z"/>
                    </svg>
                  </button>
                )}
                {/* File History — only for tracked files */}
                {f.status !== "untracked" && (
                  <button
                    onClick={() => onSetHistoryFile(f.path)}
                    className="px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all"
                    aria-label={`View history for ${f.path}`}
                    title="View History"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 3.5a.5.5 0 00-1 0V8a.5.5 0 00.252.434l3.5 2a.5.5 0 00.496-.868L8 7.71V3.5z"/>
                      <path d="M8 16A8 8 0 108 0a8 8 0 000 16zm7-8A7 7 0 111 8a7 7 0 0114 0z"/>
                    </svg>
                  </button>
                )}
                {f.staged ? (
                  <button
                    onClick={() => onUnstage(f.path, fileKey)}
                    disabled={stagingFiles.has(fileKey)}
                    className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50"
                    aria-label={`Unstage ${f.path}`}
                    title="Unstage"
                  >
                    {stagingFiles.has(fileKey) ? "..." : "−"}
                  </button>
                ) : (
                  <button
                    onClick={() => onStage(f.path, fileKey)}
                    disabled={stagingFiles.has(fileKey)}
                    className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50"
                    aria-label={`Stage ${f.path}`}
                    title="Stage"
                  >
                    {stagingFiles.has(fileKey) ? "..." : "+"}
                  </button>
                )}
                {/* Discard button — only for unstaged changes */}
                {!f.staged && (
                  <button
                    onClick={() => onDiscard(f.path, fileKey)}
                    disabled={stagingFiles.has(fileKey)}
                    className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
                    aria-label={`Discard changes to ${f.path}`}
                    title="Discard changes"
                  >
                    {stagingFiles.has(fileKey) ? "..." : "↻"}
                  </button>
                )}
              </div>
              {/* Inline diff panel */}
              {isInlineOpen && (
                <div className="ml-16 mt-1 mb-2 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 overflow-hidden">
                  <div className="overflow-auto font-mono text-xs leading-5 max-h-[300px]">
                    {isLoadingDiff ? (
                      <div className="flex items-center justify-center py-4 text-gray-400">
                        <span className="animate-spin mr-2">&#x21BB;</span>
                        Loading diff...
                      </div>
                    ) : !inlineLines || inlineLines.length === 0 ? (
                      <div className="py-3 px-3 text-gray-400 italic">No changes</div>
                    ) : (
                      <table className="w-full border-collapse">
                        <tbody>
                          {inlineLines.map((line, i) => (
                            <tr key={i} className={inlineLineColors[line.type]}>
                              <td className="w-10 text-right pr-1 pl-1 select-none text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                                {line.oldLine ?? ""}
                              </td>
                              <td className="w-10 text-right pr-1 pl-1 select-none text-gray-400 dark:text-gray-500 border-r border-gray-200 dark:border-gray-700">
                                {line.newLine ?? ""}
                              </td>
                              <td className="whitespace-pre px-2">{line.content}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  <div className="flex items-center justify-end px-2 py-1 border-t border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                    <button
                      onClick={() => onSetDiffFile({ path: f.path, staged: f.staged })}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                      View Full Diff
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
