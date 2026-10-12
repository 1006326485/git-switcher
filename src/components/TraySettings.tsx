import { memo, useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { AppSettings, TraySettings as TrayConfig } from "../lib/types";
import {
  getSettings,
  listCustomCommands,
  listRunPresets,
  updateSettingsPartial,
} from "../lib/tauri";

interface TraySettingsProps {
  onError: (msg: string) => void;
}

interface PinEntry {
  pinId: string;
  label: string;
  kind: string;
  detail: string;
}

const PIN_LIMIT = 10;

function SwitchRow({
  label,
  description,
  checked,
  ariaLabel,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  ariaLabel: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{description}</div>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        onClick={onToggle}
        className={`relative w-10 h-6 rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </button>
    </div>
  );
}

export const TraySettings = memo(function TraySettings({ onError }: TraySettingsProps) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [entries, setEntries] = useState<PinEntry[]>([]);
  const [saved, setSaved] = useState(false);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Promise<boolean>>(Promise.resolve(true));

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((e) => onErrorRef.current(t("settings.tray.failLoadSettings", { error: String(e) })));
    Promise.all([listRunPresets(), listCustomCommands()])
      .then(([presets, commands]) =>
        setEntries([
          ...presets.map((p) => ({
            pinId: `preset:${p.id}`,
            label: p.name,
            kind: t("settings.tray.preset"),
            detail: t("settings.tray.items", { count: p.items.length }),
          })),
          ...commands.map((c) => ({
            pinId: `saved:${c.id}`,
            label: c.name,
            kind: t("settings.tray.command"),
            detail: c.project_path ?? t("settings.tray.global"),
          })),
        ])
      )
      .catch((e) => onErrorRef.current(t("settings.tray.failLoadEntries", { error: String(e) })));
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const updateTray = useCallback(
    (patch: Partial<TrayConfig>): Promise<boolean> => {
      setSettings((prev) => (prev ? { ...prev, tray: { ...prev.tray, ...patch } } : prev));
      const save = pendingRef.current.then(async () => {
        try {
          const current = await getSettings();
          await updateSettingsPartial({ tray: { ...current.tray, ...patch } });
          setSaved(true);
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => setSaved(false), 1500);
          return true;
        } catch (e) {
          onErrorRef.current(t("settings.tray.failSave", { error: String(e) }));
          return false;
        }
      });
      pendingRef.current = save;
      return save;
    },
    []
  );

  const tray = settings?.tray;
  const pinned = tray?.pinned_commands ?? [];

  const togglePin = useCallback(
    (pinId: string) => {
      const next = pinned.includes(pinId)
        ? pinned.filter((p) => p !== pinId)
        : [...pinned, pinId];
      void updateTray({ pinned_commands: next });
    },
    [pinned, updateTray]
  );

  if (!settings || !tray) {
    return <div className="text-sm text-gray-500 dark:text-gray-400">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {t("settings.tray.intro")}
      </p>

      <SwitchRow
        label={t("settings.tray.gitShortcuts")}
        description={t("settings.tray.gitShortcutsDesc")}
        checked={tray.git_actions}
        ariaLabel={t("settings.tray.gitShortcuts")}
        onToggle={() => void updateTray({ git_actions: !tray.git_actions })}
      />

      <SwitchRow
        label={t("settings.tray.recentProjects")}
        description={t("settings.tray.recentProjectsDesc")}
        checked={tray.recent_projects}
        ariaLabel={t("settings.tray.recentProjects")}
        onToggle={() => void updateTray({ recent_projects: !tray.recent_projects })}
      />

      {tray.recent_projects && (
        <div className="pl-1">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t("settings.tray.recentCount")}
          </label>
          <input
            type="number"
            min="1"
            max="8"
            value={tray.recent_limit}
            aria-label={t("settings.tray.recentCount")}
            onChange={(e) =>
              void updateTray({
                recent_limit: Math.min(8, Math.max(1, parseInt(e.target.value) || 5)),
              })
            }
            className="w-24 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400"
          />
        </div>
      )}

      <SwitchRow
        label={t("settings.tray.quickLaunch")}
        description={t("settings.tray.quickLaunchDesc")}
        checked={tray.quick_launch}
        ariaLabel={t("settings.tray.quickLaunch")}
        onToggle={() => void updateTray({ quick_launch: !tray.quick_launch })}
      />

      {tray.quick_launch && (
        <div className="space-y-1.5">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t("settings.tray.pinHint", { limit: PIN_LIMIT })}
          </div>
          {entries.length === 0 ? (
            <div className="text-sm text-gray-400 dark:text-gray-500">
              {t("settings.tray.empty")}
            </div>
          ) : (
            entries.map((entry) => {
              const isPinned = pinned.includes(entry.pinId);
              const full = !isPinned && pinned.length >= PIN_LIMIT;
              return (
                <label
                  key={entry.pinId}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm cursor-pointer ${
                    full ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={isPinned}
                      disabled={full}
                      aria-label={entry.label}
                      onChange={() => togglePin(entry.pinId)}
                      className="accent-blue-600"
                    />
                    <span className="truncate text-gray-800 dark:text-gray-200">
                      {entry.label}
                    </span>
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {entry.kind} · {entry.detail}
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}

      <SwitchRow
        label={t("settings.tray.notifications")}
        description={t("settings.tray.notificationsDesc")}
        checked={tray.notifications}
        ariaLabel={t("settings.tray.notifications")}
        onToggle={() => void updateTray({ notifications: !tray.notifications })}
      />

      {saved && (
        <div className="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400 transition-opacity">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {t("common.saved")}
        </div>
      )}
    </div>
  );
});
