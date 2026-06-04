import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { getSettings } from "../lib/tauri";
import type { GitOpEvent } from "../lib/types";

export function useAutoRefresh(
  refreshAll: () => void,
  onError: (msg: string) => void
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

  // Auto-refresh timer (pauses when window hidden or git ops active)
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;
    let onVisibility: (() => void) | null = null;

    getSettings()
      .then((s) => {
        if (cancelled) return;
        if (s.auto_refresh && s.refresh_interval_secs > 0) {
          const ms = s.refresh_interval_secs * 1000;
          const startTimer = () => {
            timer = setInterval(() => {
              if (!document.hidden && busyOpsRef.current === 0) refreshAll();
            }, ms);
          };
          startTimer();
          onVisibility = () => {
            if (document.hidden) {
              if (timer) {
                clearInterval(timer);
                timer = null;
              }
            } else {
              if (!timer) startTimer();
            }
          };
          document.addEventListener("visibilitychange", onVisibility);
        }
      })
      .catch((e) => onError(`Failed to load settings: ${e}`));

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (onVisibility)
        document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshAll, onError]);
}
