import { useState, useCallback, useRef, useEffect } from "react";
import type { ViewMode } from "../lib/types";
import { getSettings, updateSettings } from "../lib/tauri";

export function useAppSettings(onError: (msg: string) => void) {
  const [viewMode, setViewModeState] = useState<ViewMode>("card");
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

  const setViewMode = useCallback(
    async (mode: ViewMode) => {
      const prev = committedViewMode.current;
      setViewModeState(mode);
      try {
        const settings = await getSettings();
        await updateSettings({ ...settings, view_mode: mode });
        committedViewMode.current = mode;
      } catch (e) {
        setViewModeState(prev);
        onError(`Failed to save view mode: ${e}`);
      }
    },
    [onError]
  );

  return { viewMode, setViewMode, setViewModeState };
}
