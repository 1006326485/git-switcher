import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { AppSettings, Theme } from "../lib/types";
import { getSettings, updateSettingsPartial } from "../lib/tauri";

const STORAGE_KEY = "git-switcher-theme";

/** Window event bridging independent useTheme instances + settings UI. */
export const THEME_CHANGE_EVENT = "git-switcher:theme-change";

export function broadcastThemeChange(t: Theme) {
  window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: t }));
}

/** Whether the OS is currently in dark appearance. */
function systemPrefersDark(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

export function applyTheme(t: Theme) {
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
  // The OS appearance is state, not a render-time probe: when it flips while
  // the choice is "system", consumers (notably the xterm canvas) must
  // re-render to pick up the new colors.
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);
  const settingsRef = useRef<AppSettings | null>(null);
  const pendingRef = useRef<Promise<void>>(Promise.resolve());
  const themeRef = useRef<Theme>("system");

  // One place that records + applies a theme choice, so the React state and
  // the document class can never disagree.
  const apply = useCallback((next: Theme) => {
    themeRef.current = next;
    setThemeState(next);
    setSystemDark(systemPrefersDark());
    applyTheme(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSettings().then((settings) => {
      if (!cancelled) {
        settingsRef.current = settings;
        apply(settings.theme);
      }
    }).catch((e) => console.warn("Failed to load theme settings:", e));
    return () => { cancelled = true; };
  }, [apply]);

  // Theme changes made in the other window are persisted through the same
  // backend; `settings-changed` is the cross-window signal (the DOM event
  // above only reaches instances in this window). Without this, the summoned
  // terminal window keeps whatever theme it read when it was first created.
  useEffect(() => {
    const unlisten = listen("settings-changed", () => {
      getSettings().then((settings) => {
        settingsRef.current = settings;
        if (settings.theme !== themeRef.current) apply(settings.theme);
      }).catch(() => {});
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, [apply]);

  const setTheme = useCallback(async (newTheme: Theme) => {
    apply(newTheme);
    broadcastThemeChange(newTheme);
    // Serialize writes to prevent race condition
    pendingRef.current = pendingRef.current.then(async () => {
      try {
        const updated = await updateSettingsPartial({ theme: newTheme });
        settingsRef.current = updated;
      } catch (e) {
        console.error("Failed to persist theme:", e);
      }
    });
  }, [apply]);

  // Track the OS appearance for the whole lifetime of the hook: it also lets
  // a switch back to "system" use the current appearance instead of a stale
  // one recorded when the explicit choice was made.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      setSystemDark(mq.matches);
      if (themeRef.current === "system") applyTheme("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Converge independent hook instances (e.g. TerminalWorkspace's own
  // useTheme): a theme applied anywhere re-syncs this instance's state.
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<Theme>).detail;
      if (next) {
        themeRef.current = next;
        settingsRef.current = settingsRef.current
          ? { ...settingsRef.current, theme: next }
          : settingsRef.current;
        setThemeState(next);
      }
    };
    window.addEventListener(THEME_CHANGE_EVENT, handler);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, handler);
  }, []);

  const isDark = theme === "dark" || (theme === "system" && systemDark);

  return { theme, setTheme, isDark };
}
