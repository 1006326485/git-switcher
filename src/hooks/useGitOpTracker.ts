import { useEffect, useRef, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { GitOpEvent } from "../lib/types";
import * as api from "../lib/tauri";

export interface ActiveGitOp {
  id: number;
  op: string;
  path: string;
  startedAt: number;
}

export function useGitOpTracker() {
  const [activeOps, setActiveOps] = useState<ActiveGitOp[]>([]);
  const opsRef = useRef(activeOps);
  opsRef.current = activeOps;

  useEffect(() => {
    const unlistenStart = listen<GitOpEvent>("git-op-start", (event) => {
      const { id, op, path } = event.payload;
      setActiveOps((prev) => {
        if (prev.some((o) => o.id === id)) return prev;
        return [...prev, { id, op, path, startedAt: Date.now() }];
      });
    });

    const unlistenDone = listen<GitOpEvent>("git-op-done", (event) => {
      setActiveOps((prev) => prev.filter((o) => o.id !== event.payload.id));
    });

    const unlistenError = listen<GitOpEvent>("git-op-error", (event) => {
      setActiveOps((prev) => prev.filter((o) => o.id !== event.payload.id));
    });

    return () => {
      unlistenStart.then((fn) => fn()).catch(() => {});
      unlistenDone.then((fn) => fn()).catch(() => {});
      unlistenError.then((fn) => fn()).catch(() => {});
    };
  }, []);

  const cancelOp = useCallback(async (id: number) => {
    try {
      await api.cancelGitOp(id);
    } catch (e) {
      console.error("Failed to cancel operation:", e);
    }
    setActiveOps((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const isOpActive = useCallback(
    (op: string, path: string) => opsRef.current.some((o) => o.op === op && o.path === path),
    []
  );

  const getActiveOp = useCallback(
    (op: string, path: string) => opsRef.current.find((o) => o.op === op && o.path === path),
    []
  );

  return { activeOps, cancelOp, isOpActive, getActiveOp };
}
