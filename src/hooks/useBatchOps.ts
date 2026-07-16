import { useState, useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { BatchResult } from "../lib/types";
import * as api from "../lib/tauri";

interface ToastApi {
  success: (msg: string) => void;
  error: (msg: string) => void;
}

export interface BatchProgress {
  completed: number;
  failed: number;
  failedProjects: string[];
}

export function useBatchOps(toast: ToastApi, onRefreshAll: () => void, activeGroup: string | null) {
  const [loading, setLoading] = useState<string | null>(null);
  const [progress, setProgress] = useState<BatchProgress>({ completed: 0, failed: 0, failedProjects: [] });
  const callbacksRef = useRef({ toast, onRefreshAll });
  callbacksRef.current = { toast, onRefreshAll };
  const groupRef = useRef(activeGroup);
  groupRef.current = activeGroup;

  // Listen for batch events — must be at app level so events are received
  // even when the dropdown menu (which renders BatchOpsToolbar) is closed
  useEffect(() => {
    let failedCount = 0;
    let completedCount = 0;
    const failedNames: string[] = [];

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
      const labels: Record<string, string> = { fetch: "Fetch", pull: "Pull", push: "Push", pull_behind: "Pull Behind", push_ahead: "Push Ahead", sync: "Sync All" };
      const label = labels[op] ?? op;
      if (failedCount > 0) {
        callbacksRef.current.toast.error(`${label} completed: ${completedCount - failedCount} succeeded, ${failedCount} failed`);
      } else {
        callbacksRef.current.toast.success(`${label} completed: ${completedCount} project(s)`);
      }
      callbacksRef.current.onRefreshAll();
      failedCount = 0;
      completedCount = 0;
      failedNames.length = 0;
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

  // Reset progress when a new operation starts
  const startOp = useCallback((op: string) => {
    if (loading) return false;
    setLoading(op);
    setProgress({ completed: 0, failed: 0, failedProjects: [] });
    return true;
  }, [loading]);

  const fetchAll = useCallback(async () => {
    if (!startOp("fetch")) return;
    try {
      await api.fetchAll(groupRef.current ?? undefined);
    } catch (e) {
      callbacksRef.current.toast.error(String(e));
      setLoading(null);
    }
  }, [startOp]);

  const pullAll = useCallback(async () => {
    if (!startOp("pull")) return;
    try {
      await api.pullAll(groupRef.current ?? undefined);
    } catch (e) {
      callbacksRef.current.toast.error(String(e));
      setLoading(null);
    }
  }, [startOp]);

  const pushAll = useCallback(async () => {
    if (!startOp("push")) return;
    try {
      await api.pushAll(groupRef.current ?? undefined);
    } catch (e) {
      callbacksRef.current.toast.error(String(e));
      setLoading(null);
    }
  }, [startOp]);

  const pullBehind = useCallback(async () => {
    if (!startOp("pull_behind")) return;
    try {
      await api.pullBehind(groupRef.current ?? undefined);
    } catch (e) {
      callbacksRef.current.toast.error(String(e));
      setLoading(null);
    }
  }, [startOp]);

  const pushAhead = useCallback(async () => {
    if (!startOp("push_ahead")) return;
    try {
      await api.pushAhead(groupRef.current ?? undefined);
    } catch (e) {
      callbacksRef.current.toast.error(String(e));
      setLoading(null);
    }
  }, [startOp]);

  const syncAll = useCallback(async () => {
    if (!startOp("sync")) return;
    try {
      await api.syncAll(groupRef.current ?? undefined);
    } catch (e) {
      callbacksRef.current.toast.error(String(e));
      setLoading(null);
    }
  }, [startOp]);

  return { batchLoading: loading, batchProgress: progress, fetchAll, pullAll, pushAll, pullBehind, pushAhead, syncAll };
}
