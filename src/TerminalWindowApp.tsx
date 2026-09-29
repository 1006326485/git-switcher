import { memo, useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import TerminalWorkspace from "./components/TerminalWorkspace";
import { getSettings, terminalWindowDismiss } from "./lib/tauri";
import { formatHotkey } from "./lib/hotkey";

/**
 * Standalone terminal window summoned by the global hotkey — terminal UI only,
 * never the main app UI. Hiding keeps PTY sessions alive ("summon and go").
 */
export const TerminalWindowApp = memo(function TerminalWindowApp() {
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

  return (
    <div className="app-root h-screen flex flex-col overflow-hidden rounded-xl ring-1 ring-black/10 dark:ring-white/10 bg-[var(--surface-0)]">
      <div className="flex-1 min-h-0">
        <TerminalWorkspace
          open
          initial={null}
          workspaceLaunch={null}
          onClose={hideWindow}
          headerDraggable
          headerExtra={
            hotkey ? (
              <span className="text-[10px] text-[var(--text-2)] truncate">
                {formatHotkey(hotkey)} to summon / hide
              </span>
            ) : null
          }
        />
      </div>
    </div>
  );
});

export default TerminalWindowApp;
