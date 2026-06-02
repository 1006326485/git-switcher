import { useState, useCallback, useRef, useMemo, useEffect } from "react";

export interface Toast {
  id: string;
  type: "success" | "error" | "info";
  message: string;
}

const TOAST_DURATION = 3000;

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const remainingRef = useRef<Map<string, number>>(new Map());
  const startedRef = useRef<Map<string, number>>(new Map());

  const startTimer = useCallback((id: string, duration: number) => {
    startedRef.current.set(id, Date.now());
    remainingRef.current.set(id, duration);
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id);
      remainingRef.current.delete(id);
      startedRef.current.delete(id);
    }, duration);
    timersRef.current.set(id, timer);
  }, []);

  const addToast = useCallback(
    (type: Toast["type"], message: string) => {
      const id = `toast-${++counterRef.current}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      startTimer(id, TOAST_DURATION);
    },
    [startTimer]
  );

  const success = useCallback((msg: string) => addToast("success", msg), [addToast]);
  const error = useCallback((msg: string) => addToast("error", msg), [addToast]);
  const info = useCallback((msg: string) => addToast("info", msg), [addToast]);

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(id);
    remainingRef.current.delete(id);
    startedRef.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pauseToast = useCallback((id: string) => {
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
