import { useState, useEffect, useCallback, useRef, memo } from "react";
import type { BackgroundStatus } from "../lib/types";
import {
  getBackgroundStatus,
  pauseBackgroundRefresh,
  resumeBackgroundRefresh,
  setBackgroundInterval,
} from "../lib/tauri";

interface BackgroundSettingsProps {
  onError: (msg: string) => void;
}

export const BackgroundSettings = memo(function BackgroundSettings({ onError }: BackgroundSettingsProps) {
  const [status, setStatus] = useState<BackgroundStatus | null>(null);
  const [intervalInput, setIntervalInput] = useState(300);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const loadStatus = useCallback(() => {
    getBackgroundStatus()
      .then((s) => {
        setStatus(s);
        setIntervalInput(s.interval_secs);
      })
      .catch((e) => onErrorRef.current(`Failed to load background status: ${e}`));
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleToggle = useCallback(async () => {
    if (!status) return;
    try {
      if (status.active) {
        await pauseBackgroundRefresh();
      } else {
        await resumeBackgroundRefresh();
      }
      loadStatus();
    } catch (e) {
      onErrorRef.current(`Failed to toggle background refresh: ${e}`);
    }
  }, [status, loadStatus]);

  const handleIntervalChange = useCallback(
    async (value: number) => {
      const clamped = Math.max(60, Math.min(3600, value));
      setIntervalInput(clamped);
      try {
        await setBackgroundInterval(clamped);
        loadStatus();
      } catch (e) {
        onErrorRef.current(`Failed to update interval: ${e}`);
      }
    },
    [loadStatus]
  );

  if (!status) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  const formatTime = (ts: number | null) => {
    if (!ts) return "Never";
    return new Date(ts * 1000).toLocaleTimeString();
  };

  return (
    <div className="space-y-5">
      {/* Enable / Pause toggle */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Background Fetch
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Silently fetch all repos in the background
          </div>
        </div>
        <button
          role="switch"
          aria-checked={status.active}
          aria-label="Enable background fetch"
          onClick={handleToggle}
          className={`relative w-10 h-6 rounded-full transition-colors ${
            status.active ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              status.active ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>

      {/* Interval slider */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Refresh Interval
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={60}
            max={3600}
            step={60}
            value={intervalInput}
            onChange={(e) => setIntervalInput(parseInt(e.target.value, 10))}
            onMouseUp={(e) => handleIntervalChange((e.target as HTMLInputElement).valueAsNumber)}
            onTouchEnd={(e) => handleIntervalChange((e.target as HTMLInputElement).valueAsNumber)}
            className="flex-1 accent-blue-600"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400 w-16 text-right">
            {intervalInput >= 60
              ? `${Math.floor(intervalInput / 60)}m ${intervalInput % 60}s`
              : `${intervalInput}s`}
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Minimum 60 seconds. Default: 5 minutes.
        </p>
      </div>

      {/* Status info */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Status</span>
          <span className={status.active ? "text-green-600 dark:text-green-400" : "text-gray-400"}>
            {status.active ? "Active" : "Paused"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Interval</span>
          <span className="text-gray-900 dark:text-gray-100">
            {Math.floor(status.interval_secs / 60)}m {status.interval_secs % 60}s
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Last Refresh</span>
          <span className="text-gray-900 dark:text-gray-100">
            {formatTime(status.last_refresh)}
          </span>
        </div>
      </div>
    </div>
  );
});
