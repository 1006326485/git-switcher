import { memo, useState } from "react";

export interface AutoFetchFailure {
  name: string;
  path: string;
  message: string;
}

interface OfflineBannerProps {
  online: boolean;
  failures: AutoFetchFailure[];
  onRetry: () => void;
  onDismissFailures: () => void;
}

/**
 * Top-of-content banner shown while offline, plus the aggregated list of
 * projects whose background auto-fetch failed (instead of failing silently).
 */
export const OfflineBanner = memo(function OfflineBanner({
  online,
  failures,
  onRetry,
  onDismissFailures,
}: OfflineBannerProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-3 space-y-2">
      {!online && (
        <div
          role="status"
          className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50"
        >
          <span className="text-amber-500 text-base shrink-0" aria-hidden="true">
            &#x26A0;
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              You are offline
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Background refresh is paused and git operations may fail until the connection returns.
            </p>
          </div>
        </div>
      )}

      {online && failures.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-3 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50"
        >
          <span className="text-amber-500 text-base mt-0.5 shrink-0" aria-hidden="true">
            &#x26A0;
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Auto-fetch failed for {failures.length} project{failures.length === 1 ? "" : "s"}
            </p>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300 underline underline-offset-2"
              aria-expanded={expanded}
            >
              {expanded ? "Hide details" : "Show details"}
            </button>
            {expanded && (
              <ul className="mt-2 space-y-1">
                {failures.map((f) => (
                  <li key={f.path} className="text-xs text-amber-700 dark:text-amber-300 break-words">
                    <span className="font-semibold">{f.name}</span>
                    <span className="opacity-70"> — {f.message}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex gap-2">
              <button
                onClick={onRetry}
                className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors"
              >
                Retry
              </button>
              <button
                onClick={onDismissFailures}
                className="px-2 py-0.5 rounded text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-200/60 dark:hover:bg-amber-800/60 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
