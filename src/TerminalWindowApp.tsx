import { memo, useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import TerminalWorkspace from "./components/TerminalWorkspace";
import { TerminalIcon } from "./components/ui/icons";
import { getSettings, terminalWindowDismiss } from "./lib/tauri";
import { formatHotkey } from "./lib/hotkey";
import { syncLanguageFromSettings } from "./hooks/useLanguage";
import { isDirtyChord, installHeldKeyTracking } from "./lib/heldKeys";

/**
 * Standalone terminal window summoned by the global hotkey — terminal UI only,
 * never the main app UI. Hiding keeps PTY sessions alive ("summon and go").
 */
export const TerminalWindowApp = memo(function TerminalWindowApp() {
  const { t } = useTranslation();
  const [hotkey, setHotkey] = useState<string | null>(null);
  const [hideOnBlur, setHideOnBlur] = useState(false);

  const loadSettings = useCallback(() => {
    getSettings()
      .then((s) => {
        setHotkey(s.terminal_hotkey);
        setHideOnBlur(s.terminal_hide_on_blur);
      })
      .catch(() => {});
  }, []);

  // Refresh on every summon so hotkey changes made in the main window apply
  // without reloading this window.
  useEffect(() => {
    loadSettings();
    const onFocus = () => loadSettings();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadSettings]);

  const hideWindow = useCallback(() => {
    void terminalWindowDismiss();
  }, []);

  useEffect(() => {
    if (!hideOnBlur) return;
    const onBlur = () => void getCurrentWindow().hide();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [hideOnBlur]);

  // The main window persists settings through the backend; pick up a language
  // change saved there without waiting for the next summon.
  useEffect(() => {
    const unlisten = listen("settings-changed", () => {
      void syncLanguageFromSettings();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Cmd+W / Ctrl+W dismisses this window like the summon hotkey does.
  useEffect(() => {
    // This window has its own module graph, so it needs its own held-key
    // record for the chord checks below.
    const stopHeldKeyTracking = installHeldKeyTracking();
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault();
        if (isDirtyChord(e)) return;
        hideWindow();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      stopHeldKeyTracking();
    };
  }, [hideWindow]);

  return (
    <div className="app-root window-root h-screen flex flex-col overflow-hidden rounded-xl ring-1 ring-black/10 dark:ring-white/10">
      {/* The workspace header (title + hotkey hint) lives in this overlay
          title bar next to the native traffic lights (tauri.conf.json gives
          the terminal window the same Overlay style as the main window),
          so the second header row below is gone and the panels move up. */}
      <div
        data-tauri-drag-region
        role="presentation"
        className="app-titlebar h-[var(--titlebar-h)] pl-20 pr-3 select-none shrink-0 flex items-center gap-2"
      >
        <TerminalIcon size={14} />
        <span className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 shrink-0">
          {t("terminal.title")}
        </span>
        <span className="flex-1" />
        {hotkey ? (
          <span className="text-[10px] text-[var(--text-2)] truncate">
            {formatHotkey(hotkey)} to summon / hide
          </span>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 min-w-0 flex flex-col">
        <TerminalWorkspace
          open
          initial={null}
          workspaceLaunch={null}
          onClose={hideWindow}
          headerDraggable
          hideHeader
        />
      </div>
    </div>
  );
});

export default TerminalWindowApp;
