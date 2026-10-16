import { useState, useEffect, useCallback, useRef, memo } from "react";
import { useTranslation } from "react-i18next";
import { ThemeSettings } from "./ThemeSettings";
import { LanguageSettings } from "./LanguageSettings";
import { ShortcutRecorder } from "./ShortcutRecorder";
import { KbdBadge } from "./ui/primitives";
import type { AppSettings, Theme, ViewMode } from "../lib/types";
import { getSettings, updateSettingsPartial } from "../lib/tauri";
import { applyTheme, broadcastThemeChange } from "../hooks/useTheme";
import { bindingToDisplayParts, normalizeBinding } from "../lib/hotkey";
import { applyLanguageChoice, type LanguageChoice } from "../lib/i18n";

interface GeneralSettingsProps {
  onError: (msg: string) => void;
  accentColor?: string;
  onAccentChange?: (color: string) => void;
}

const THEME_META: {
  value: Theme;
  icon: string;
  labelKey: "settings.general.themeLight" | "settings.general.themeDark" | "settings.general.themeSystem";
}[] = [
  { value: "light", icon: "☀️", labelKey: "settings.general.themeLight" },
  { value: "dark", icon: "🌙", labelKey: "settings.general.themeDark" },
  { value: "system", icon: "💻", labelKey: "settings.general.themeSystem" },
];

const VIEW_MODE_META: {
  value: ViewMode;
  labelKey:
    | "settings.general.viewCard"
    | "settings.general.viewList"
    | "settings.general.viewCompact"
    | "settings.general.viewTable"
    | "settings.general.viewDashboard";
}[] = [
  { value: "card", labelKey: "settings.general.viewCard" },
  { value: "list", labelKey: "settings.general.viewList" },
  { value: "compact", labelKey: "settings.general.viewCompact" },
  { value: "table", labelKey: "settings.general.viewTable" },
  { value: "dashboard", labelKey: "settings.general.viewDashboard" },
];

export const GeneralSettings = memo(function GeneralSettings({ onError, accentColor, onAccentChange }: GeneralSettingsProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [editingTerminalHotkey, setEditingTerminalHotkey] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Promise<boolean>>(Promise.resolve(true));

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
    }).catch((e) => {
      onErrorRef.current(t("errors.loadSettings", { error: String(e) }));
    });
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [t]);

  const update = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<boolean> => {
    // Update UI immediately
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    // Serialize saves to prevent race conditions
    const save = pendingRef.current.then(async () => {
      try {
        await updateSettingsPartial({ [key]: value });
        setSaved(true);
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => setSaved(false), 1500);
        return true;
      } catch (e) {
        onErrorRef.current(t("errors.saveSettings", { error: String(e) }));
        return false;
      }
    });
    pendingRef.current = save;
    return save;
  }, [t]);

  const commitHotkey = useCallback((raw: string) => {
    if (!settings) return;
    const value = normalizeBinding(raw.trim());
    if (!value || value === settings.terminal_hotkey) {
      setEditingTerminalHotkey(false);
      return;
    }
    setEditingTerminalHotkey(false);
    void update("terminal_hotkey", value);
  }, [settings, update]);

  const selectLanguage = useCallback(
    (choice: LanguageChoice) => {
      // Switch the interface immediately, then persist through the serialized
      // saver so concurrent setting changes cannot interleave.
      applyLanguageChoice(choice);
      void update("language", choice);
    },
    [update]
  );

  const selectTheme = useCallback(
    (value: Theme) => {
      // Apply to the DOM immediately (same path as Header/palette) so the
      // switch is visible without reload, and notify other useTheme
      // instances; persist through the serialized saver.
      applyTheme(value);
      broadcastThemeChange(value);
      void update("theme", value);
    },
    [update]
  );

  if (!settings) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-5">
      {/* Theme */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t("settings.general.theme")}
        </label>
        <div className="flex gap-2">
          {THEME_META.map((opt) => (
            <button
              key={opt.value}
              onClick={() => selectTheme(opt.value)}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                settings.theme === opt.value
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                  : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              <span className="mr-1.5">{opt.icon}</span>
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Default View Mode */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t("settings.general.viewMode")}
        </label>
        <div className="flex flex-wrap gap-2">
          {VIEW_MODE_META.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update("view_mode", opt.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                settings.view_mode === opt.value
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                  : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
              }`}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Auto Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {t("settings.general.autoRefresh")}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t("settings.general.autoRefreshDesc")}
          </div>
        </div>
        <button
          role="switch"
          aria-checked={settings.auto_refresh}
          aria-label={t("settings.general.autoRefreshAria")}
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
            {t("settings.general.refreshInterval")}
          </label>
          <input
            type="number"
            min="5"
            max="300"
            step="5"
            value={settings.refresh_interval_secs}
            onChange={(e) => update("refresh_interval_secs", Math.max(5, parseInt(e.target.value) || 30))}
            aria-label={t("settings.general.refreshIntervalAria")}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
          />
          <p className="text-xs text-gray-400 mt-1">
            {t("settings.general.refreshIntervalHint")}
          </p>
        </div>
      )}

      {/* Auto Fetch on Launch */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {t("settings.general.autoFetchOnLaunch")}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t("settings.general.autoFetchOnLaunchDesc")}
          </div>
        </div>
        <button
          role="switch"
          aria-checked={settings.auto_fetch_on_launch}
          aria-label={t("settings.general.autoFetchOnLaunchAria")}
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

      {/* Terminal Hotkey */}
      <div>
        <div className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t("settings.general.terminalHotkey")}
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-0.5">
            {bindingToDisplayParts(settings.terminal_hotkey).map((k, i) => (
              <span key={i} className="flex items-center gap-0.5">
                {i > 0 && <span className="text-[11px] text-gray-400">+</span>}
                <KbdBadge label={k} />
              </span>
            ))}
          </div>
          {editingTerminalHotkey ? (
            <ShortcutRecorder
              initial={settings.terminal_hotkey}
              forGlobalHotkey
              onCommit={commitHotkey}
              onCancel={() => setEditingTerminalHotkey(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingTerminalHotkey(true)}
              aria-label={t("settings.general.terminalHotkeyAria")}
              className="px-2 py-1 rounded-md text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              Edit
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          {t("settings.general.terminalHotkeyHint")}
        </p>
      </div>

      {/* Hide Terminal on Blur */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {t("settings.general.hideTerminalOnBlur")}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t("settings.general.hideTerminalOnBlurDesc")}
          </div>
        </div>
        <button
          role="switch"
          aria-checked={settings.terminal_hide_on_blur}
          aria-label={t("settings.general.hideTerminalOnBlurAria")}
          onClick={() => update("terminal_hide_on_blur", !settings.terminal_hide_on_blur)}
          className={`relative w-10 h-6 rounded-full transition-colors ${
            settings.terminal_hide_on_blur
              ? "bg-blue-600"
              : "bg-gray-300 dark:bg-gray-600"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              settings.terminal_hide_on_blur ? "translate-x-4" : ""
            }`}
          />
        </button>
      </div>

      <LanguageSettings onSelect={selectLanguage} />

      {/* Saved indicator — reserved row so toggling never shifts layout */}
      <div aria-live="polite" className="flex items-center gap-1.5 text-sm min-h-[20px]">
        {saved && (
          <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400 transition-opacity">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {t("common.saved")}
          </span>
        )}
      </div>

      {accentColor && onAccentChange && (
        <ThemeSettings accentColor={accentColor} onAccentChange={onAccentChange} />
      )}
    </div>
  );
});
