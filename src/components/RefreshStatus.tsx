import { memo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Spinner, useDelayedFlag } from "./ui/loading";
import { relativeTime } from "../lib/format";

export interface AutoFetchProgress {
  /** Projects selected for the launch fetch. */
  total: number;
  /** How many have settled (succeeded or failed). */
  done: number;
  /** Failures collected so far. */
  failed: number;
  running: boolean;
}

interface RefreshStatusProps {
  /** Full-list re-read in flight. */
  isRefreshingAll: boolean;
  /** How many single projects are being re-read right now. */
  refreshingProjectCount: number;
  /** Launch auto-fetch progress, or null when it is not running. */
  autoFetch: AutoFetchProgress | null;
  /** Wall-clock time of the last completed read. */
  lastRefreshedAt: number | null;
}

/** "2 minutes ago" — re-ticked on a slow timer so the label does not go stale. */
function useUpdatedLabel(timestamp: number | null) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timestamp === null) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [timestamp]);

  if (timestamp === null) return null;
  const elapsedMs = Math.max(0, now - timestamp);
  if (elapsedMs < 45_000) return t("header.activity.updatedJustNow");
  const minutes = Math.round(elapsedMs / 60_000);
  if (minutes < 60) return t("header.activity.updated", { time: relativeTime(-minutes, "minute") });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("header.activity.updated", { time: relativeTime(-hours, "hour") });
  return t("header.activity.updated", { time: relativeTime(-Math.round(hours / 24), "day") });
}

/**
 * The single place the app says "something is being read right now".
 *
 * Before this, every refresh path (Cmd+R, the 30s timer, window focus, the
 * tray, the background service, undo, import) was completely silent: users
 * could not tell "refreshed, nothing changed" from "did not refresh". It is
 * also the app's one polite live region for load status — panels use
 * `aria-busy` instead so they do not talk over it.
 *
 * Busy work is gated by `useDelayedFlag` so sub-150ms reads never flash, and
 * resolved work leaves a quiet "updated 2m ago" behind.
 */
export const RefreshStatus = memo(function RefreshStatus({
  isRefreshingAll,
  refreshingProjectCount,
  autoFetch,
  lastRefreshedAt,
}: RefreshStatusProps) {
  const { t } = useTranslation();
  const { visible } = useDelayedFlag(isRefreshingAll || refreshingProjectCount > 0);
  const updatedLabel = useUpdatedLabel(lastRefreshedAt);

  // Launch auto-fetch is never delayed: it is a known multi-second job and
  // the shell is otherwise blank, so the cue is useful from the first frame.
  if (autoFetch?.running) {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] tabular-nums"
      >
        <Spinner size="xs" />
        <span>
          {autoFetch.total > 0
            ? t("header.activity.fetching", { done: autoFetch.done, total: autoFetch.total })
            : t("header.activity.fetchingStarting")}
        </span>
        {autoFetch.failed > 0 && (
          <span className="text-red-500 dark:text-red-400">
            {t("header.activity.failed", { count: autoFetch.failed })}
          </span>
        )}
      </span>
    );
  }

  if (visible) {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] tabular-nums"
      >
        <Spinner size="xs" />
        <span>
          {isRefreshingAll
            ? t("header.activity.refreshingAll")
            : t("header.activity.refreshingProject", { count: refreshingProjectCount })}
        </span>
      </span>
    );
  }

  if (!updatedLabel) return null;

  return (
    <span
      role="status"
      aria-live="polite"
      title={t("header.activity.updatedTitle")}
      className="hidden text-xs text-gray-400 tabular-nums sm:inline dark:text-gray-500"
    >
      {updatedLabel}
    </span>
  );
});
