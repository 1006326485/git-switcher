import { memo, useState, useEffect, useRef } from "react";
import type { Toast as ToastType } from "../hooks/useToast";
import { ErrorRecoveryBanner } from "./ErrorRecoveryBanner";

interface ToastContainerProps {
  toasts: ToastType[];
  onRemove: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onAction?: (actionType: string, path?: string) => void;
}

const DURATION = 3000;

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

const progressColors: Record<ToastType["type"], string> = {
  success: "bg-green-400 dark:bg-green-500",
  error: "bg-red-400 dark:bg-red-500",
  info: "bg-blue-400 dark:bg-blue-500",
};

function ToastItem({
  toast,
  onRemove,
  onPause,
  onResume,
  onAction,
}: {
  toast: ToastType;
  onRemove: (id: string) => void;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onAction?: (actionType: string, path?: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(100);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const startTimeRef = useRef(Date.now());
  const accumulatedRef = useRef(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const animate = () => {
      if (paused) return;
      const elapsed = accumulatedRef.current + (Date.now() - startTimeRef.current);
      const remaining = Math.max(0, 100 - (elapsed / DURATION) * 100);
      setProgress(remaining);
      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [paused]);

  const handleMouseEnter = () => {
    setPaused(true);
    accumulatedRef.current += Date.now() - startTimeRef.current;
    onPause?.(toast.id);
  };

  const handleMouseLeave = () => {
    setPaused(false);
    startTimeRef.current = Date.now();
    onResume?.(toast.id);
  };

  const hasSuggestions = toast.type === "error" && toast.suggestions && toast.suggestions.length > 0;

  return (
    <div
      role={toast.type === "error" ? "alert" : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`pointer-events-auto relative flex flex-col px-4 py-3 rounded-xl border shadow-lg dark:ring-1 dark:ring-white/10 text-sm font-medium animate-[slideIn_0.2s_ease-out] overflow-hidden ${
        typeStyles[toast.type]
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{typeIcons[toast.type]}</span>
        <span className="flex-1">{toast.message}</span>
        {paused && (
          <span className="text-xs opacity-60">Paused</span>
        )}
        {hasSuggestions && (
          <button
            onClick={() => setShowSuggestions((v) => !v)}
            aria-label={showSuggestions ? "Hide recovery suggestions" : "Show recovery suggestions"}
            className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors"
          >
            {showSuggestions ? "Hide fixes" : "Fixes"}
          </button>
        )}
        {toast.type === "error" && toast.retry && (
          <button
            onClick={() => {
              const result = toast.retry!();
              if (result && typeof (result as Promise<void>).then === "function") {
                (result as Promise<void>).catch(() => {});
              }
              onRemove(toast.id);
            }}
            aria-label="Retry failed operation"
            className="ml-1 px-2 py-0.5 rounded text-xs font-semibold bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200 hover:bg-red-300 dark:hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        )}
        <button
          onClick={() => onRemove(toast.id)}
          aria-label="Dismiss notification"
          className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
        >
          ✕
        </button>
      </div>
      {/* Recovery suggestions */}
      {showSuggestions && hasSuggestions && (
        <div className="mt-2 -mx-1">
          <ErrorRecoveryBanner
            message=""
            suggestions={toast.suggestions!}
            onAction={(actionType) => {
              onAction?.(actionType, toast.path);
              onRemove(toast.id);
            }}
            onDismiss={() => setShowSuggestions(false)}
          />
        </div>
      )}
      {/* Progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5">
        <div
          className={`h-full transition-none ${progressColors[toast.type]}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export const ToastContainer = memo(function ToastContainer({ toasts, onRemove, onPause, onResume, onAction }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-[100] flex max-w-sm flex-col gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4" role="status" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onRemove={onRemove}
          onPause={onPause}
          onResume={onResume}
          onAction={onAction}
        />
      ))}
    </div>
  );
});
