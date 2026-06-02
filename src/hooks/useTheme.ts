import { useState, useEffect, useCallback, useRef } from "react";
import type { AppSettings, Theme } from "../lib/types";
import { getSettings, updateSettings } from "../lib/tauri";

const STORAGE_KEY = "git-switcher-theme";

function applyTheme(t: Theme) {
  const root = document.documentElement;
  // Disable transitions during theme switch
  root.classList.add("no-transition");

  if (t === "dark") {
    root.classList.add("dark");
  } else if (t === "light") {
    root.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  }

  // Persist to localStorage for the inline FOUC-prevention script
  localStorage.setItem(STORAGE_KEY, t);

  // Re-enable transitions after the next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove("no-transition");
    });
  });
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");
  const settingsRef = useRef<AppSettings | null>(null);
  const pendingRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    getSettings().then((settings) => {
      if (!cancelled) {
        settingsRef.current = settings;
        setThemeState(settings.theme);
        applyTheme(settings.theme);
      }
    }).catch((e) => console.warn("Failed to load theme settings:", e));
    return () => { cancelled = true; };
  }, []);

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    applyTheme(newTheme);
    // Serialize writes to prevent race condition
    pendingRef.current = pendingRef.current.then(async () => {
      try {
        if (settingsRef.current) {
          settingsRef.current.theme = newTheme;
        } else {
          settingsRef.current = await getSettings();
          settingsRef.current.theme = newTheme;
        }
        await updateSettings(settingsRef.current);
      } catch (e) {
        console.error("Failed to persist theme:", e);
      }
    });
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return { theme, setTheme };
}
