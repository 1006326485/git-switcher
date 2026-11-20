import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import type { BatchResult } from "../lib/types";
import { parseError } from "../lib/types";
import * as api from "../lib/tauri";

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
  /** Used to explain a no-op (a batch is already running) instead of failing silently. */
  info?: (msg: string) => void;
}

export interface BatchProgress {
  completed: number;
  failed: number;
  failedProjects: string[];
}

export interface BatchStartPayload {
  label: string;
  total: number;
}

export function useBatchOps(toast: ToastApi, onRefreshAll: () => void, activeGroup: string | null) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState<string | null>(null);
  const [progress, setProgress] = useState<BatchProgress>({ completed: 0, failed: 0, failedProjects: [] });
  // Denominator for the progress badge. `list_projects`-style batches report it
  // up front via `batch-start`; 0 means "not known yet".
  const [total, setTotal] = useState(0);
  /**
   * Set when the safety timeout fires but `batch-done` never arrived. The run
   * may genuinely still be going, so the UI keeps its pill and says so rather
   * than pretending the batch ended.
   */
  const [stalled, setStalled] = useState(false);
  const callbacksRef = useRef({ toast, onRefreshAll });
  callbacksRef.current = { toast, onRefreshAll };
  const tRef = useRef(t);
  tRef.current = t;
  const groupRef = useRef(activeGroup);
  groupRef.current = activeGroup;

  // Listen for batch events — must be at app level so events are received
  // even when the dropdown menu (which renders BatchOpsToolbar) is closed
  useEffect(() => {
    let failedCount = 0;
    let completedCount = 0;
    const failedNames: string[] = [];

    const unlistenStart = listen<BatchStartPayload>("batch-start", (event) => {
      setTotal(event.payload.total);
      setStalled(false);
    });

    const unlistenResult = listen<BatchResult>("batch-result", (event) => {
      completedCount++;
      if (!event.payload.success) {
        failedCount++;
        failedNames.push(event.payload.project_name);
      }
      setProgress({ completed: completedCount, failed: failedCount, failedProjects: [...failedNames] });
    });

    const unlistenDone = listen<string>("batch-done", (event) => {
      const op = event.payload;
      setLoading(null);
      setStalled(false);
      setTotal(0);
      const tt = tRef.current;
      const labels: Record<string, string> = { fetch: tt("batchOps.fetch"), pull: tt("batchOps.pull"), push: tt("batchOps.push"), pull_behind: tt("batchOps.pullBehind"), push_ahead: tt("batchOps.pushAhead"), sync: tt("batchOps.syncAll") };
      const label = labels[op] ?? op;
      if (failedCount > 0) {
        callbacksRef.current.toast.error(tt("batchOps.completedSuccess", { label, succeeded: completedCount - failedCount, failed: failedCount }));
      } else {
        callbacksRef.current.toast.success(tt("batchOps.completedAll", { label, count: completedCount }));
      }
      callbacksRef.current.onRefreshAll();
      failedCount = 0;
      completedCount = 0;
      failedNames.length = 0;
    });

    return () => {
      unlistenStart.then((fn) => fn()).catch(() => {});
      unlistenResult.then((fn) => fn()).catch(() => {});
      unlistenDone.then((fn) => fn()).catch(() => {});
    };
  }, []);

  // Safety timeout: the backend may be wedged, but it may also just be slow on
  // a bad network. Either way, silently clearing `loading` was wrong — it let
  // the UI look idle while the run continued, and the eventual `batch-done`
  // then reported counts for a batch the user thought had ended. Degrade
  // instead: keep the pill, flag it as stale, and converge on `batch-done`.
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setStalled(true);
      callbacksRef.current.toast.error(tRef.current("batchOps.timedOut"));
    }, 120_000);
    return () => clearTimeout(timer);
  }, [loading]);

  /** Lets the user clear a stalled pill without waiting for the backend. */
  const dismissBatch = useCallback(() => {
    setLoading(null);
    setStalled(false);
    setTotal(0);
    setProgress({ completed: 0, failed: 0, failedProjects: [] });
  }, []);

  // Reset progress when a new operation starts
  const startOp = useCallback((op: string) => {
    if (loading) {
      // Previously a silent no-op, so palette / shortcut / tray entry points
      // looked broken while a batch was already running.
      callbacksRef.current.toast.info?.(tRef.current("batchOps.alreadyRunning"));
      return false;
    }
    setLoading(op);
    setStalled(false);
    setTotal(0);
    setProgress({ completed: 0, failed: 0, failedProjects: [] });
    return true;
  }, [loading]);

  const fetchAll = useCallback(async () => {
    if (!startOp("fetch")) return;
    api.logOperation("fetch_all", groupRef.current ?? "/", tRef.current("batchOps.allProjects"), undefined, "success").catch(() => {});
    try {
      await api.fetchAll(groupRef.current ?? undefined);
    } catch (e) {
      api.logOperation("fetch_all", groupRef.current ?? "/", tRef.current("batchOps.allProjects"), undefined, "error", parseError(e)).catch(() => {});
      callbacksRef.current.toast.error(parseError(e));
      setLoading(null);
    }
  }, [startOp]);

  const pullAll = useCallback(async () => {
    if (!startOp("pull")) return;
    api.logOperation("pull_all", groupRef.current ?? "/", tRef.current("batchOps.allProjects"), undefined, "success").catch(() => {});
    try {
      await api.pullAll(groupRef.current ?? undefined);
    } catch (e) {
      api.logOperation("pull_all", groupRef.current ?? "/", tRef.current("batchOps.allProjects"), undefined, "error", parseError(e)).catch(() => {});
      callbacksRef.current.toast.error(parseError(e));
      setLoading(null);
    }
  }, [startOp]);

  const pushAll = useCallback(async () => {
    if (!startOp("push")) return;
    api.logOperation("push_all", groupRef.current ?? "/", tRef.current("batchOps.allProjects"), undefined, "success").catch(() => {});
    try {
      await api.pushAll(groupRef.current ?? undefined);
    } catch (e) {
      api.logOperation("push_all", groupRef.current ?? "/", tRef.current("batchOps.allProjects"), undefined, "error", parseError(e)).catch(() => {});
      callbacksRef.current.toast.error(parseError(e));
      setLoading(null);
    }
  }, [startOp]);

  const pullBehind = useCallback(async () => {
    if (!startOp("pull_behind")) return;
    try {
      await api.pullBehind(groupRef.current ?? undefined);
    } catch (e) {
      callbacksRef.current.toast.error(parseError(e));
      setLoading(null);
    }
  }, [startOp]);

  const pushAhead = useCallback(async () => {
    if (!startOp("push_ahead")) return;
    try {
      await api.pushAhead(groupRef.current ?? undefined);
    } catch (e) {
      callbacksRef.current.toast.error(parseError(e));
      setLoading(null);
    }
  }, [startOp]);

  const syncAll = useCallback(async () => {
    if (!startOp("sync")) return;
    api.logOperation("sync_all", groupRef.current ?? "/", tRef.current("batchOps.allProjects"), undefined, "success").catch(() => {});
    try {
      await api.syncAll(groupRef.current ?? undefined);
    } catch (e) {
      api.logOperation("sync_all", groupRef.current ?? "/", tRef.current("batchOps.allProjects"), undefined, "error", parseError(e)).catch(() => {});
      callbacksRef.current.toast.error(parseError(e));
      setLoading(null);
    }
  }, [startOp]);

  return {
    batchLoading: loading,
    batchProgress: progress,
    /** Total repositories in the running batch, or 0 while unknown. */
    batchTotal: total,
    /** True when the safety timeout fired without a matching `batch-done`. */
    batchStalled: stalled,
    dismissBatch,
    fetchAll,
    pullAll,
    pushAll,
    pullBehind,
    pushAhead,
    syncAll,
  };
}
