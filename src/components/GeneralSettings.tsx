import { useState, useEffect, useCallback, useRef, memo } from "react";
import { ThemeSettings } from "./ThemeSettings";
import type { AppSettings, Theme, ViewMode } from "../lib/types";
import { getSettings, updateSettingsPartial } from "../lib/tauri";

interface GeneralSettingsProps {
  onError: (msg: string) => void;
  accentColor?: string;
  onAccentChange?: (color: string) => void;
}

const THEME_OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀️" },
  { value: "dark", label: "Dark", icon: "🌙" },
  { value: "system", label: "System", icon: "💻" },
];

const VIEW_MODE_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "card", label: "Card" },
  { value: "list", label: "List" },
  { value: "compact", label: "Compact" },
  { value: "table", label: "Table" },
  { value: "dashboard", label: "Dashboard" },
];

export const GeneralSettings = memo(function GeneralSettings({ onError, accentColor, onAccentChange }: GeneralSettingsProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    getSettings().then(setSettings).catch((e) => {
      onErrorRef.current(`Failed to load settings: ${e}`);
    });
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const update = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    // Update UI immediately
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    // Serialize saves to prevent race conditions
    pendingRef.current = pendingRef.current.then(async () => {
      try {
        await updateSettingsPartial({ [key]: value });
        setSaved(true);
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => setSaved(false), 1500);
      } catch (e) {
        onErrorRef.current(`Failed to save settings: ${e}`);
      }
    });
  }, []);

  if (!settings) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>;
  }

  return (
    <div className="space-y-5">
      {/* Theme */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Theme
        </label>
        <div className="flex gap-2">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update("theme", opt.value)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                settings.theme === opt.value
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                  : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <span className="mr-1.5">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Default View Mode */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Default View Mode
        </label>
        <div className="flex flex-wrap gap-2">
          {VIEW_MODE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update("view_mode", opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                settings.view_mode === opt.value
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                  : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Auto Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Auto Refresh
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Periodically refresh all project statuses
          </div>
        </div>
        <button
          role="switch"
          aria-checked={settings.auto_refresh}
          aria-label="Enable auto refresh"
          onClick={() => update("auto_refresh", !settings.auto_refresh)}
          className={`relative w-10 h-6 rounded-full transition-colors ${
            settings.auto_refresh
              ? "bg-blue-600"
              : "bg-gray-300 dark:bg-gray-600"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              settings.auto_refresh ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>

      {/* Refresh Interval */}
      {settings.auto_refresh && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Refresh Interval (seconds)
          </label>
          <input
            type="number"
            min="5"
            max="300"
            step="5"
            value={settings.refresh_interval_secs}
            onChange={(e) => update("refresh_interval_secs", Math.max(5, parseInt(e.target.value) || 30))}
            aria-label="Refresh interval in seconds"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
          />
          <p className="text-xs text-gray-400 mt-1">
            Minimum 5 seconds. Recommended: 30 seconds.
          </p>
        </div>
      )}

      {/* Auto Fetch on Launch */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Auto-fetch on Launch
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Automatically fetch all projects when the app starts
          </div>
        </div>
        <button
          role="switch"
          aria-checked={settings.auto_fetch_on_launch}
          aria-label="Enable auto-fetch on launch"
          onClick={() => update("auto_fetch_on_launch", !settings.auto_fetch_on_launch)}
          className={`relative w-10 h-6 rounded-full transition-colors ${
            settings.auto_fetch_on_launch
              ? "bg-blue-600"
              : "bg-gray-300 dark:bg-gray-600"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              settings.auto_fetch_on_launch ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>

      {/* Saved indicator */}
      {saved && (
        <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 transition-opacity">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Saved
        </div>
      )}

      {accentColor && onAccentChange && (
        <ThemeSettings accentColor={accentColor} onAccentChange={onAccentChange} />
      )}
    </div>
  );
});
