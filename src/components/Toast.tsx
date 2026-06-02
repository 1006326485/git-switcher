import { memo } from "react";
import type { Toast as ToastType } from "../hooks/useToast";

interface ToastContainerProps {
  toasts: ToastType[];
  onRemove: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
}

const typeStyles: Record<ToastType["type"], string> = {
  success:
    "bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-800 dark:text-green-200",
  error:
    "bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-800 dark:text-red-200",
  info:
    "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200",
};

const typeIcons: Record<ToastType["type"], string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
};

export const ToastContainer = memo(function ToastContainer({ toasts, onRemove, onPause, onResume }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-100 flex flex-col gap-2 pointer-events-none" role="status" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.type === "error" ? "alert" : undefined}
          onMouseEnter={() => onPause?.(toast.id)}
          onMouseLeave={() => onResume?.(toast.id)}
          className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm font-medium animate-[slideIn_0.2s_ease-out] ${
            typeStyles[toast.type]
          }`}
        >
          <span className="text-base">{typeIcons[toast.type]}</span>
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => onRemove(toast.id)}
            aria-label="Dismiss notification"
            className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
});
