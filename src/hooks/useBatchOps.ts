import { useState, useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { BatchResult } from "../lib/types";
import * as api from "../lib/tauri";

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
}

export function useBatchOps(toast: ToastApi, onRefreshAll: () => void) {
  const [loading, setLoading] = useState<string | null>(null);
  const callbacksRef = useRef({ toast, onRefreshAll });
  callbacksRef.current = { toast, onRefreshAll };

  // Listen for batch events — must be at app level so events are received
  // even when the dropdown menu (which renders BatchOpsToolbar) is closed
  useEffect(() => {
    let failedCount = 0;
    const unlistenResult = listen<BatchResult>("batch-result", (event) => {
      if (!event.payload.success) failedCount++;
    });

    const unlistenDone = listen<string>("batch-done", (event) => {
      const op = event.payload;
      setLoading(null);
      const label = op === "fetch" ? "Fetch" : op === "pull" ? "Pull" : op;
      if (failedCount > 0) {
        callbacksRef.current.toast.error(`${label} completed with ${failedCount} failure(s)`);
      } else {
        callbacksRef.current.toast.success(`${label} completed`);
      }
      callbacksRef.current.onRefreshAll();
      failedCount = 0;
    });

    return () => {
      unlistenResult.then((fn) => fn()).catch(() => {});
      unlistenDone.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // Safety timeout: reset loading if batch-done never fires
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setLoading(null);
      callbacksRef.current.toast.error("Operation timed out");
    }, 120_000);
    return () => clearTimeout(timer);
  }, [loading]);

  const fetchAll = useCallback(async () => {
    if (loading) return;
    setLoading("fetch");
    try {
      await api.fetchAll();
    } catch (e) {
      callbacksRef.current.toast.error(String(e));
      setLoading(null);
    }
  }, [loading]);

  const pullAll = useCallback(async () => {
    if (loading) return;
    setLoading("pull");
    try {
      await api.pullAll();
    } catch (e) {
      callbacksRef.current.toast.error(String(e));
      setLoading(null);
    }
  }, [loading]);

  return { batchLoading: loading, fetchAll, pullAll };
}
