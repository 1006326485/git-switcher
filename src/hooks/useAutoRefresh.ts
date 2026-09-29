import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getSettings } from "../lib/tauri";
import type { GitOpEvent } from "../lib/types";

export function useAutoRefresh(
  refreshAll: () => void,
  onError: (msg: string) => void,
  settingsVersion?: number
) {
  const busyOpsRef = useRef(0);

  // Track active git operations to skip auto-refresh during busy periods
  useEffect(() => {
    const unlistenStart = listen<GitOpEvent>("git-op-start", () => {
      busyOpsRef.current++;
    });
    const unlistenDone = listen<GitOpEvent>("git-op-done", () => {
      busyOpsRef.current = Math.max(0, busyOpsRef.current - 1);
    });
    const unlistenError = listen<GitOpEvent>("git-op-error", () => {
      busyOpsRef.current = Math.max(0, busyOpsRef.current - 1);
    });
    return () => {
      unlistenStart.then((fn) => fn()).catch(() => {});
      unlistenDone.then((fn) => fn()).catch(() => {});
      unlistenError.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // Auto-refresh timer — re-reads settings when settingsVersion changes
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let onVisibility: (() => void) | null = null;
    let cleanupExtra: (() => void) | null = null;

    getSettings()
      .then((s) => {
        if (cancelled) return;
        if (s.auto_refresh && s.refresh_interval_secs > 0) {
          const ms = s.refresh_interval_secs * 1000;
          const startTimer = () => {
            timer = setInterval(() => {
              if (!document.hidden && navigator.onLine && busyOpsRef.current === 0) refreshAll();
            }, ms);
          };
          if (navigator.onLine) startTimer();
          const syncTimer = () => {
            // Mirror the document.hidden gate: pause while hidden or offline,
            // resume (and catch up once) when visible and online again.
            if (document.hidden || !navigator.onLine) {
              if (timer) {
                clearInterval(timer);
                timer = null;
              }
            } else if (!timer) {
              startTimer();
            }
          };
          onVisibility = syncTimer;
          document.addEventListener("visibilitychange", onVisibility);
          window.addEventListener("online", syncTimer);
          window.addEventListener("offline", syncTimer);
          const onOnline = () => refreshAll();
          window.addEventListener("online", onOnline);
          cleanupExtra = () => {
            window.removeEventListener("online", syncTimer);
            window.removeEventListener("offline", syncTimer);
            window.removeEventListener("online", onOnline);
          };
        }
      })
      .catch((e) => onError(`Failed to load settings: ${e}`));

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (onVisibility)
        document.removeEventListener("visibilitychange", onVisibility);
      if (cleanupExtra) cleanupExtra();
    };
  }, [refreshAll, onError, settingsVersion]);
}
