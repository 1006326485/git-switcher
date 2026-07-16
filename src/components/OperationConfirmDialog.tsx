import { useEffect, useState } from "react";
import type { OperationPreview, OperationTarget } from "../lib/types";
import { getOperationPreview } from "../lib/tauri";
import { ConfirmDialog } from "./ConfirmDialog";
import { Modal } from "./ui/primitives";

interface OperationConfirmDialogProps {
  open: boolean;
  operation: string;
  targets: OperationTarget[];
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

const riskLabel = {
  destructive: "Destructive operation",
  history_rewrite: "History rewrite",
  batch_destructive: "Batch operation",
} as const;

export function OperationConfirmDialog({
  open,
  operation,
  targets,
  onConfirm,
  onCancel,
}: OperationConfirmDialogProps) {
  const [preview, setPreview] = useState<OperationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      return;
    }

    let cancelled = false;
    getOperationPreview(operation, targets)
      .then((nextPreview) => {
        if (!cancelled) setPreview(nextPreview);
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      });

    return () => {
      cancelled = true;
    };
  }, [open, operation, targets]);

  if (!open || (!preview && !error)) {
    return (
      <Modal open={open} onClose={onCancel} title="Preparing safety preview" maxWidth="max-w-sm">
        <div className="px-6 py-5 text-sm text-gray-500 dark:text-gray-400">Loading affected repositories…</div>
      </Modal>
    );
  }

  if (error || !preview) {
    return (
      <Modal open={open} onClose={onCancel} title="Safety preview unavailable" maxWidth="max-w-sm">
        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error ?? "Unable to load the safety preview."}</p>
          <div className="flex justify-end">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-[var(--surface-2)] border border-[var(--border-color)]"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  const { policy } = preview;
  return (
    <ConfirmDialog
      open
      title={policy.title}
      message={
        <div className="space-y-3">
          <p>{policy.description}</p>
          <p className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
            {riskLabel[policy.risk]}
          </p>
          <div className="rounded-md border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-2">
            <p className="text-xs font-medium text-red-800 dark:text-red-200 mb-1">Affected targets ({preview.targets.length})</p>
            <ul className="max-h-32 overflow-y-auto space-y-1 text-xs font-mono text-red-700 dark:text-red-300">
              {preview.targets.map((target) => (
                <li key={`${target.path}:${target.label}`}>{target.path} — {target.label}</li>
              ))}
            </ul>
          </div>
        </div>
      }
      confirmLabel={policy.confirm_label}
      confirmColor="red"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
