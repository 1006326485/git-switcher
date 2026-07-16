import { memo } from "react";
import type { BatchProgress } from "../hooks/useBatchOps";

interface BatchOpsToolbarProps {
  batchLoading: string | null;
  batchProgress: BatchProgress;
  onFetchAll: () => void;
  onPullAll: () => void;
  onPushAll: () => void;
  onPullBehind: () => void;
  onPushAhead: () => void;
  onSyncAll: () => void;
  behindCount: number;
  aheadCount: number;
}

function ProgressBadge({ progress }: { progress: BatchProgress }) {
  if (progress.completed === 0) {
    return <span className="text-xs text-blue-500 animate-pulse">Starting...</span>;
  }
  return (
    <span className="text-xs text-blue-500 tabular-nums">
      {progress.completed} done
      {progress.failed > 0 && (
        <span className="text-red-500 ml-1">({progress.failed} failed)</span>
      )}
    </span>
  );
}

export const BatchOpsToolbar = memo(function BatchOpsToolbar({ batchLoading, batchProgress, onFetchAll, onPullAll, onPushAll, onPullBehind, onPushAhead, onSyncAll, behindCount, aheadCount }: BatchOpsToolbarProps) {
  return (
    <div className="space-y-0.5">
      <button
        onClick={onFetchAll}
        disabled={!!batchLoading}
        className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors duration-150 hover:bg-[var(--surface-2)] text-gray-700 dark:text-gray-300 disabled:opacity-50 active:scale-[0.98]"
      >
        <span className="shrink-0 w-5 h-5 flex items-center justify-center text-gray-400 dark:text-gray-500">
          {batchLoading === "fetch" ? (
            <span className="animate-spin text-xs">&#x21BB;</span>
          ) : (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.001 7.001 0 0115 8a.75.75 0 01-1.5 0A5.5 5.5 0 008 2.5zM2.25 9.25a.25.25 0 00-.25.25v3.646a.25.25 0 00.427.177l1.38-1.38A7.001 7.001 0 0015 8a.75.75 0 011.5 0 8.501 8.501 0 01-14.131 4.869l1.204 1.204A.25.25 0 012.104 14H5.75a.25.25 0 000-1.5H2.25z" />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-gray-900 dark:text-gray-100">Fetch All</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Download remote updates</div>
        </div>
        {batchLoading === "fetch" && <ProgressBadge progress={batchProgress} />}
      </button>

      <button
        onClick={onPullAll}
        disabled={!!batchLoading}
        className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors duration-150 hover:bg-[var(--surface-2)] text-gray-700 dark:text-gray-300 disabled:opacity-50 active:scale-[0.98]"
      >
        <span className="shrink-0 w-5 h-5 flex items-center justify-center text-gray-400 dark:text-gray-500">
          {batchLoading === "pull" ? (
            <span className="animate-spin text-xs">&#x21BB;</span>
          ) : (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14H2.75z" />
              <path d="M7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.749.749 0 111.06 1.06l-3.25 3.25a.749.749 0 01-1.06 0L4.22 6.78a.749.749 0 111.06-1.06l1.97 1.969z" />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-gray-900 dark:text-gray-100">Pull All</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Pull latest changes</div>
        </div>
        {batchLoading === "pull" && <ProgressBadge progress={batchProgress} />}
      </button>

      <button
        onClick={onPushAll}
        disabled={!!batchLoading}
        className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors duration-150 hover:bg-[var(--surface-2)] text-gray-700 dark:text-gray-300 disabled:opacity-50 active:scale-[0.98]"
      >
        <span className="shrink-0 w-5 h-5 flex items-center justify-center text-gray-400 dark:text-gray-500">
          {batchLoading === "push" ? (
            <span className="animate-spin text-xs">&#x21BB;</span>
          ) : (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.25 14A1.75 1.75 0 0015 12.25v-2.5a.75.75 0 00-1.5 0v2.5a.25.25 0 01-.25.25H2.75a.25.25 0 01-.25-.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .966.784 1.75 1.75 1.75h10.5z" />
              <path d="M8.75 1.311V8a.75.75 0 01-1.5 0V1.311L5.28 3.28A.75.75 0 014.22 2.22l3.25-3.25a.75.75 0 011.06 0l3.25 3.25a.749.749 0 11-1.06 1.06L8.75 1.311z" />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-gray-900 dark:text-gray-100">Push All</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Push local commits</div>
        </div>
        {batchLoading === "push" && <ProgressBadge progress={batchProgress} />}
      </button>

      <div className="border-t border-gray-100 dark:border-gray-700 my-1" />

      <button
        onClick={onPullBehind}
        disabled={!!batchLoading}
        className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors duration-150 hover:bg-[var(--surface-2)] text-gray-700 dark:text-gray-300 disabled:opacity-50 active:scale-[0.98]"
      >
        <span className="shrink-0 w-5 h-5 flex items-center justify-center text-gray-400 dark:text-gray-500">
          {batchLoading === "pull_behind" ? (
            <span className="animate-spin text-xs">&#x21BB;</span>
          ) : (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14H2.75z" />
              <path d="M7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.749.749 0 111.06 1.06l-3.25 3.25a.749.749 0 01-1.06 0L4.22 6.78a.749.749 0 111.06-1.06l1.97 1.969z" />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-gray-900 dark:text-gray-100">Pull Behind</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Only pull projects behind remote</div>
        </div>
        {behindCount > 0 && batchLoading !== "pull_behind" && (
          <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full tabular-nums">
            {behindCount}
          </span>
        )}
        {batchLoading === "pull_behind" && <ProgressBadge progress={batchProgress} />}
      </button>

      <button
        onClick={onPushAhead}
        disabled={!!batchLoading}
        className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors duration-150 hover:bg-[var(--surface-2)] text-gray-700 dark:text-gray-300 disabled:opacity-50 active:scale-[0.98]"
      >
        <span className="shrink-0 w-5 h-5 flex items-center justify-center text-gray-400 dark:text-gray-500">
          {batchLoading === "push_ahead" ? (
            <span className="animate-spin text-xs">&#x21BB;</span>
          ) : (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.25 14A1.75 1.75 0 0015 12.25v-2.5a.75.75 0 00-1.5 0v2.5a.25.25 0 01-.25.25H2.75a.25.25 0 01-.25-.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .966.784 1.75 1.75 1.75h10.5z" />
              <path d="M8.75 1.311V8a.75.75 0 01-1.5 0V1.311L5.28 3.28A.75.75 0 014.22 2.22l3.25-3.25a.75.75 0 011.06 0l3.25 3.25a.749.749 0 11-1.06 1.06L8.75 1.311z" />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-gray-900 dark:text-gray-100">Push Ahead</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Only push projects ahead of remote</div>
        </div>
        {aheadCount > 0 && batchLoading !== "push_ahead" && (
          <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full tabular-nums">
            {aheadCount}
          </span>
        )}
        {batchLoading === "push_ahead" && <ProgressBadge progress={batchProgress} />}
      </button>

      <div className="border-t border-gray-100 dark:border-gray-700 my-1" />

      <button
        onClick={onSyncAll}
        disabled={!!batchLoading}
        className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors duration-150 hover:bg-[var(--surface-2)] text-gray-700 dark:text-gray-300 disabled:opacity-50 active:scale-[0.98]"
      >
        <span className="shrink-0 w-5 h-5 flex items-center justify-center text-gray-400 dark:text-gray-500">
          {batchLoading === "sync" ? (
            <span className="animate-spin text-xs">&#x21BB;</span>
          ) : (
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.001 7.001 0 0115 8a.75.75 0 01-1.5 0A5.5 5.5 0 008 2.5zM2.25 9.25a.25.25 0 00-.25.25v3.646a.25.25 0 00.427.177l1.38-1.38A7.001 7.001 0 0015 8a.75.75 0 011.5 0 8.501 8.501 0 01-14.131 4.869l1.204 1.204A.25.25 0 012.104 14H5.75a.25.25 0 000-1.5H2.25z" />
              <path d="M2.75 14A1.75 1.75 0 011 12.25v-2.5a.75.75 0 011.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 00.25-.25v-2.5a.75.75 0 011.5 0v2.5A1.75 1.75 0 0113.25 14H2.75z" />
              <path d="M7.25 7.689V2a.75.75 0 011.5 0v5.689l1.97-1.969a.749.749 0 111.06 1.06l-3.25 3.25a.749.749 0 01-1.06 0L4.22 6.78a.749.749 0 111.06-1.06l1.97 1.969z" />
            </svg>
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-gray-900 dark:text-gray-100">Sync All</div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Fetch + Pull all projects</div>
        </div>
        {batchLoading === "sync" && <ProgressBadge progress={batchProgress} />}
      </button>
    </div>
  );
});
