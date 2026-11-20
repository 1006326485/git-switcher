import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "./ui/loading";
import type { BatchProgress } from "../hooks/useBatchOps";

const LABEL_KEYS = {
  fetch: "batchOps.fetch",
  pull: "batchOps.pull",
  push: "batchOps.push",
  pull_behind: "batchOps.pullBehind",
  push_ahead: "batchOps.pushAhead",
  sync: "batchOps.syncAll",
} as const;

type BatchOpKey = keyof typeof LABEL_KEYS;

export interface BatchStatusProps {
  batchLoading: string | null;
  batchProgress: BatchProgress;
  /** Total repositories in the running batch, or 0 while unknown. */
  batchTotal: number;
  /** Safety timeout fired without a matching `batch-done`. */
  batchStalled: boolean;
  onDismiss: () => void;
}

/**
 * Batch progress that survives the menu that started it.
 *
 * The old design rendered progress only inside the header's "More" dropdown,
 * and `DropdownMenu` closes on any child click — so pressing Fetch All
 * unmounted the spinner and the progress badge in the same frame the work
 * began, leaving a bare toast at the end. This pill lives in the header
 * instead, so the run stays visible from every entry point (menu, palette,
 * shortcut, tray).
 */
export const BatchStatus = memo(function BatchStatus({
  batchLoading,
  batchProgress,
  batchTotal,
  batchStalled,
  onDismiss,
}: BatchStatusProps) {
  const { t } = useTranslation();
  if (!batchLoading) return null;

  const labelKey = batchLoading in LABEL_KEYS ? LABEL_KEYS[batchLoading as BatchOpKey] : null;
  const label = labelKey ? t(labelKey) : batchLoading;
  const { completed, failed } = batchProgress;
  const hasTotal = batchTotal > 0;

  return (
    <span
      role="status"
      aria-live="polite"
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300"
    >
      {!batchStalled && <Spinner size="xs" />}
      <span className="truncate font-medium">{label}</span>
      <span className="tabular-nums">
        {hasTotal ? t("batchOps.progress", { done: completed, total: batchTotal }) : t("batchOps.starting")}
      </span>
      {failed > 0 && <span className="text-red-600 dark:text-red-400">{t("batchOps.failed", { count: failed })}</span>}
      {batchStalled && (
        <>
          <span className="opacity-70">{t("batchOps.stalled")}</span>
          <button
            type="button"
            onClick={onDismiss}
            className="ml-0.5 rounded px-1 text-[11px] font-medium underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-100"
          >
            {t("batchOps.dismissStalled")}
          </button>
        </>
      )}
    </span>
  );
});
