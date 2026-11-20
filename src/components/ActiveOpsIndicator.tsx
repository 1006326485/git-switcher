import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "./ui/loading";
import type { ActiveGitOp } from "../hooks/useGitOpTracker";

const OP_LABEL_KEYS = {
  switch_branch: "row.op.switch_branch",
  commit: "row.op.commit",
  push: "row.op.push",
  pull: "row.op.pull",
  fetch: "row.op.fetch",
  stash: "row.op.stash",
  pop: "row.op.pop",
  merge: "row.op.merge",
  cherry_pick: "row.op.cherry_pick",
  rebase: "row.op.rebase",
  delete_branch: "row.op.delete_branch",
  create_branch: "row.op.create_branch",
} as const;

type OpKey = keyof typeof OP_LABEL_KEYS;

function basename(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * Workspace-wide "what is still running" strip.
 *
 * Rows already show their own operation banner, but only the rows you can see:
 * a fetch started from the palette, a shortcut or the tray on a project that is
 * filtered or scrolled away used to be completely invisible — and the app gives
 * no other hint that git work is in flight. This strip aggregates
 * `useGitOpTracker`'s live operations and lets each one be cancelled without
 * hunting for its card.
 */
export const ActiveOpsIndicator = memo(function ActiveOpsIndicator({
  ops,
  onCancel,
}: {
  ops: ActiveGitOp[];
  onCancel?: (id: number) => void;
}) {
  const { t } = useTranslation();
  if (ops.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/70 px-2.5 py-1.5 text-xs text-blue-700 dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-300"
    >
      <Spinner size="xs" />
      <span className="font-medium">
        {t("header.activity.opsRunning", { count: ops.length })}
      </span>
      <ul className="flex min-w-0 flex-wrap items-center gap-1.5">
        {ops.map((op) => {
          const labelKey = op.op in OP_LABEL_KEYS ? OP_LABEL_KEYS[op.op as OpKey] : null;
          const label = labelKey ? t(labelKey) : op.op;
          return (
            <li
              key={op.id}
              className="inline-flex max-w-[16rem] items-center gap-1 rounded-full border border-blue-200/80 bg-white/70 px-2 py-0.5 dark:border-blue-800/60 dark:bg-blue-950/40"
            >
              <span className="truncate" title={op.path}>
                {label} · {basename(op.path)}
              </span>
              {onCancel && (
                <button
                  type="button"
                  onClick={() => onCancel(op.id)}
                  aria-label={t("row.op.cancel")}
                  title={t("row.op.cancel")}
                  className="rounded px-0.5 leading-none opacity-70 hover:opacity-100"
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
});
