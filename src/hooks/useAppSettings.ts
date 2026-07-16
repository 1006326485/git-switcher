import { useState, useCallback, useRef, useEffect } from "react";
import type { ViewMode } from "../lib/types";
import { getSettings, updateSettings } from "../lib/tauri";

export function useAppSettings(onError: (msg: string) => void) {
  const [viewMode, setViewModeState] = useState<ViewMode>("card");
  const [settingsVersion, setSettingsVersion] = useState(0);
  const [accentColor, setAccentColorState] = useState<string>(() => localStorage.getItem("accentColor") || "blue");
  const committedViewMode = useRef(viewMode);

  // Load initial view mode from settings
  useEffect(() => {
    let cancelled = false;
    getSettings()
      .then((s) => {
        if (!cancelled) {
          setViewModeState(s.view_mode);
          committedViewMode.current = s.view_mode;
        }
      })
      .catch((e) => onError(`Failed to load view mode: ${e}`));
    return () => {
      cancelled = true;
    };
  }, [onError]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accentColor);
  }, [accentColor]);

  const setAccentColor = useCallback((color: string) => {
    setAccentColorState(color);
    localStorage.setItem("accentColor", color);
    document.documentElement.setAttribute("data-accent", color);
  }, []);

  const setViewMode = useCallback(
    async (mode: ViewMode) => {
      const prev = committedViewMode.current;
      setViewModeState(mode);
      try {
        const settings = await getSettings();
        await updateSettings({ ...settings, view_mode: mode });
        committedViewMode.current = mode;
        setSettingsVersion((v) => v + 1);
      } catch (e) {
        setViewModeState(prev);
        onError(`Failed to save view mode: ${e}`);
      }
    },
    [onError]
  );

  /** Call after any settings save to notify dependent hooks */
  const notifySettingsChanged = useCallback(() => {
    setSettingsVersion((v) => v + 1);
  }, []);

  return { viewMode, setViewMode, setViewModeState, settingsVersion, notifySettingsChanged, accentColor, setAccentColor };
}
