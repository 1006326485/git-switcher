import { memo, useState, useEffect, useRef } from "react";
import type { ErrorSuggestion } from "../lib/types";

interface ErrorRecoveryBannerProps {
  message: string;
  suggestions: ErrorSuggestion[];
  onAction?: (actionType: string) => void;
  onDismiss: () => void;
  autoDismissMs?: number;
}

const actionIcons: Record<string, string> = {
  pull: "⬇",
  stash: "📦",
  checkout: "⭐",
  abort_merge: "❌",
  fetch: "🔄",
  discard: "↺",
  commit: "✔",
};

export const ErrorRecoveryBanner = memo(function ErrorRecoveryBanner({
  message,
  suggestions,
  onAction,
  onDismiss,
  autoDismissMs = 30000,
}: ErrorRecoveryBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isPaused || dismissed) return;
    timerRef.current = setTimeout(() => setDismissed(true), autoDismissMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoDismissMs, isPaused, dismissed]);

  if (dismissed || suggestions.length === 0) return null;

  return (
    <div
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="flex items-start gap-3 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50"
      role="alert"
    >
      <span className="text-amber-500 text-base mt-0.5 shrink-0" aria-hidden="true">&#x26A0;</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{message}</p>
        <div className="mt-2 space-y-1.5">
          {suggestions.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-xs" aria-hidden="true">{actionIcons[s.action_type] ?? "✨"}</span>
              <span className="text-xs text-amber-700 dark:text-amber-300">{s.description}</span>
              <button
                onClick={() => onAction?.(s.action_type)}
                className="ml-auto shrink-0 px-2 py-0.5 rounded text-xs font-semibold bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors active:scale-95"
              >
                {s.action_label}
              </button>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={() => { setDismissed(true); onDismiss(); }}
        aria-label="Dismiss recovery suggestions"
        className="shrink-0 text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors mt-0.5"
      >
        ✕
      </button>
    </div>
  );
});
