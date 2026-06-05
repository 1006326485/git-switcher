import { memo, useState, useCallback, useEffect } from "react";
import { Modal } from "./ui/primitives";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  confirmColor?: "red" | "green" | "blue";
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /** localStorage key to skip this dialog when set */
  skipKey?: string;
}

const colorStyles = {
  red: "bg-red-600 hover:bg-red-700",
  green: "bg-green-600 hover:bg-green-700",
  blue: "bg-blue-600 hover:bg-blue-700",
};

export const ConfirmDialog = memo(function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  confirmColor = "red",
  onConfirm,
  onCancel,
  skipKey,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setLoading(false);
      setDontAsk(false);
    }
  }, [open]);

  const handleConfirm = useCallback(async () => {
    if (dontAsk && skipKey) {
      localStorage.setItem(skipKey, "skip");
    }
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }, [onConfirm, dontAsk, skipKey]);

  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="max-w-sm">
      <div className="px-6 py-5">
        <div className="text-sm text-gray-600 dark:text-gray-400 mb-6">{message}</div>
        {skipKey && (
          <label className="flex items-center gap-2 mb-4 text-sm text-gray-500 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={dontAsk}
              onChange={(e) => setDontAsk(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            Don't ask again
          </label>
        )}
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 bg-[var(--surface-2)] border border-[var(--border-color)] hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-150 disabled:opacity-50 active:scale-[0.98]"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors duration-150 disabled:opacity-50 active:scale-[0.98] ${colorStyles[confirmColor]}`}
          >
            {loading ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
});
