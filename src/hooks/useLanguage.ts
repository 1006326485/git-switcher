import { useSyncExternalStore } from "react";
import {
  applyLanguageChoice,
  getLanguageChoice,
  getResolvedLanguage,
  isLanguageChoice,
  subscribeLanguageChoice,
  type LanguageChoice,
  type SupportedLanguage,
} from "../lib/i18n";
import { getSettings } from "../lib/tauri";

export interface LanguageControls {
  /** The stored preference, which may be `"system"`. */
  choice: LanguageChoice;
  /** The language currently rendered. */
  resolved: SupportedLanguage;
  /** Switch immediately and return the resolved language. Persisting is the caller's job. */
  setChoice: (choice: LanguageChoice) => SupportedLanguage;
}

export function useLanguage(): LanguageControls {
  const choice = useSyncExternalStore(subscribeLanguageChoice, getLanguageChoice, getLanguageChoice);
  return { choice, resolved: getResolvedLanguage(), setChoice: applyLanguageChoice };
}

/**
 * `settings.json` is authoritative — the Rust side reads the same file to build
 * the tray menu — so reconcile once at startup in case localStorage (the
 * pre-paint hint) and the stored settings disagree.
 */
export async function syncLanguageFromSettings(): Promise<void> {
  try {
    const settings = await getSettings();
    if (isLanguageChoice(settings.language) && settings.language !== getLanguageChoice()) {
      applyLanguageChoice(settings.language);
    }
  } catch {
    // No backend available (tests, plain `vite dev` in a browser): keep the
    // value the pre-paint script already resolved.
  }
}
