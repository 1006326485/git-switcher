import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBatchOps } from "./useBatchOps";
import type { BatchResult } from "../lib/types";

type Handler = (event: { payload: unknown }) => void;

const listeners = new Map<string, Handler>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((name: string, handler: Handler) => {
    listeners.set(name, handler);
    return Promise.resolve(() => listeners.delete(name));
  }),
}));

vi.mock("../lib/tauri", () => ({
  fetchAll: vi.fn(() => Promise.resolve()),
  pullAll: vi.fn(() => Promise.resolve()),
  pushAll: vi.fn(() => Promise.resolve()),
  pullBehind: vi.fn(() => Promise.resolve()),
  pushAhead: vi.fn(() => Promise.resolve()),
  syncAll: vi.fn(() => Promise.resolve()),
  logOperation: vi.fn(() => Promise.resolve()),
}));

function emit(name: string, payload: unknown) {
  const handler = listeners.get(name);
  if (!handler) throw new Error(`no listener for ${name}`);
  act(() => handler({ payload }));
}

function result(project: string, success = true): BatchResult {
  return { project_name: project, success, message: success ? "ok" : "boom" };
}

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };

beforeEach(() => {
  listeners.clear();
  toast.success.mockClear();
  toast.error.mockClear();
  toast.info.mockClear();
});

describe("useBatchOps progress", () => {
  it("takes the denominator from batch-start and ticks per batch-result", async () => {
    const { result: hook } = renderHook(() => useBatchOps(toast, () => {}, null));
    await waitFor(() => expect(listeners.has("batch-start")).toBe(true));

    await act(async () => {
      await hook.current.fetchAll();
    });
    expect(hook.current.batchLoading).toBe("fetch");

    emit("batch-start", { label: "fetch", total: 4 });
    expect(hook.current.batchTotal).toBe(4);

    // Streaming: the badge advances as repositories settle, not all at once.
    emit("batch-result", result("a"));
    expect(hook.current.batchProgress.completed).toBe(1);
    emit("batch-result", result("b", false));
    expect(hook.current.batchProgress).toMatchObject({ completed: 2, failed: 1 });

    emit("batch-done", "fetch");
    expect(hook.current.batchLoading).toBeNull();
    expect(hook.current.batchTotal).toBe(0);
  });

  it("explains a no-op instead of silently ignoring a second batch", async () => {
    const { result: hook } = renderHook(() => useBatchOps(toast, () => {}, null));
    await waitFor(() => expect(listeners.has("batch-start")).toBe(true));

    await act(async () => {
      await hook.current.fetchAll();
    });
    await act(async () => {
      await hook.current.pullAll();
    });

    expect(hook.current.batchLoading).toBe("fetch");
    expect(toast.info).toHaveBeenCalledWith("A batch operation is already running");
  });

  it("keeps the pill and marks it stalled when batch-done never arrives", async () => {
    vi.useFakeTimers();
    try {
      const { result: hook } = renderHook(() => useBatchOps(toast, () => {}, null));
      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await hook.current.fetchAll();
      });
      emit("batch-start", { label: "fetch", total: 2 });

      act(() => {
        vi.advanceTimersByTime(120_000);
      });

      // A future batch-done must not report counts for a run the UI gave up
      // on, so the hook degrades instead of pretending the batch ended.
      expect(hook.current.batchStalled).toBe(true);
      expect(hook.current.batchLoading).toBe("fetch");
      expect(toast.error).toHaveBeenCalledWith("Operation timed out");
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets the user dismiss a stalled batch", async () => {
    const { result: hook } = renderHook(() => useBatchOps(toast, () => {}, null));
    await waitFor(() => expect(listeners.has("batch-start")).toBe(true));
    await act(async () => {
      await hook.current.fetchAll();
    });
    emit("batch-start", { label: "fetch", total: 2 });

    act(() => hook.current.dismissBatch());
    expect(hook.current.batchLoading).toBeNull();
    expect(hook.current.batchProgress.completed).toBe(0);
  });
});
