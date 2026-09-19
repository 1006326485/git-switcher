import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { getSuggestions, type ErrorSuggestion } from "../lib/types";

export interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
  retry?: () => void | Promise<void>;
  suggestions?: ErrorSuggestion[];
  rawError?: unknown;
  path?: string;
  /** True while the exit animation plays; the toast is then unmounted. */
  exiting?: boolean;
}

const TOAST_DURATION = 3000;
const TOAST_EXIT_MS = 160;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const remainingRef = useRef<Map<string, number>>(new Map());
  const startedRef = useRef<Map<string, number>>(new Map());
  const exitingRef = useRef<Set<string>>(new Set());

  // Removal goes through a short exit phase so the fade-out animation can
  // finish before the toast unmounts (mirrors its entrance path, §7).
  const startExit = useCallback((id: string) => {
    if (exitingRef.current.has(id)) return;
    exitingRef.current.add(id);
    // Cancel any pending auto-remove timer; the exit timer takes over.
    const pending = timersRef.current.get(id);
    if (pending) clearTimeout(pending);
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    const timer = setTimeout(() => {
      exitingRef.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id);
      remainingRef.current.delete(id);
      startedRef.current.delete(id);
    }, TOAST_EXIT_MS);
    timersRef.current.set(id, timer);
  }, []);

  const startTimer = useCallback((id: string, duration: number) => {
    startedRef.current.set(id, Date.now());
    remainingRef.current.set(id, duration);
    const timer = setTimeout(() => {
      startExit(id);
    }, duration);
    timersRef.current.set(id, timer);
  }, [startExit]);

  const addToast = useCallback(
    (type: Toast["type"], message: string, retry?: () => void | Promise<void>, rawError?: unknown, path?: string) => {
      const id = `toast-${++counterRef.current}`;
      const suggestions = type === "error" && rawError ? getSuggestions(rawError) : undefined;
      setToasts((prev) => [...prev, { id, type, message, retry, suggestions, rawError, path }]);
      startTimer(id, TOAST_DURATION);
    },
    [startTimer]
  );

  const success = useCallback((msg: string) => addToast("success", msg), [addToast]);
  const error = useCallback((msg: string, retry?: () => void | Promise<void>, rawError?: unknown, path?: string) => addToast("error", msg, retry, rawError, path), [addToast]);
  const info = useCallback((msg: string) => addToast("info", msg), [addToast]);

  const removeToast = useCallback((id: string) => {
    startExit(id);
  }, [startExit]);

  const pauseToast = useCallback((id: string) => {
    if (exitingRef.current.has(id)) return;
    const timer = timersRef.current.get(id);
    const started = startedRef.current.get(id);
    const remaining = remainingRef.current.get(id);
    if (timer && started && remaining) {
      clearTimeout(timer);
      timersRef.current.delete(id);
      remainingRef.current.set(id, Math.max(0, remaining - (Date.now() - started)));
    }
  }, []);

  const resumeToast = useCallback((id: string) => {
    const remaining = remainingRef.current.get(id);
    if (remaining && remaining > 0) {
      startTimer(id, remaining);
    }
  }, [startTimer]);

  // Clean up all timers on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
      remainingRef.current.clear();
      startedRef.current.clear();
    };
  }, []);

  return useMemo(
    () => ({ toasts, success, error, info, removeToast, pauseToast, resumeToast }),
    [toasts, success, error, info, removeToast, pauseToast, resumeToast]
  );
}
