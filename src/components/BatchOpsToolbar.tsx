import { memo } from "react";

interface BatchOpsToolbarProps {
  batchLoading: string | null;
  onFetchAll: () => void;
  onPullAll: () => void;
  onPushAll: () => void;
}

export const BatchOpsToolbar = memo(function BatchOpsToolbar({ batchLoading, onFetchAll, onPullAll, onPushAll }: BatchOpsToolbarProps) {
  return (
    <div className="space-y-0.5">
      <button
        onClick={onFetchAll}
        disabled={!!batchLoading}
        className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300 disabled:opacity-50"
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
        {batchLoading === "fetch" && (
          <span className="text-xs text-blue-500">Running...</span>
        )}
      </button>

      <button
        onClick={onPullAll}
        disabled={!!batchLoading}
        className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300 disabled:opacity-50"
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
        {batchLoading === "pull" && (
          <span className="text-xs text-blue-500">Running...</span>
        )}
      </button>

      <button
        onClick={onPushAll}
        disabled={!!batchLoading}
        className="w-full text-left px-3 py-2 text-sm flex items-center gap-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300 disabled:opacity-50"
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
        {batchLoading === "push" && (
          <span className="text-xs text-blue-500">Running...</span>
        )}
      </button>
    </div>
  );
});
