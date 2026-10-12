import i18n, { type TFunction } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../../locales/en.json";
import zhCN from "../../locales/zh-CN.json";

/**
 * Languages the interface is translated into. `locales/<code>.json` must exist
 * for every entry, and `scripts/check-i18n.mjs` (CI) enforces that.
 */
export const SUPPORTED_LANGUAGES = ["en", "zh-CN"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Stored preference meaning "whatever the operating system asks for". */
export const LANGUAGE_SYSTEM = "system";

export type LanguageChoice = SupportedLanguage | typeof LANGUAGE_SYSTEM;

/**
 * The raw preference (including `"system"`) is stored under this key so the
 * pre-paint script in `index.html` can set `<html lang>` before the first frame.
 * Keep the two in sync — `scripts/check-i18n.mjs` fails if they drift.
 */
export const LANGUAGE_STORAGE_KEY = "git-switcher-language";

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

/**
 * Language names are shown in their own script and are therefore never
 * translated: a user who cannot read the current interface still recognises
 * their own language in the list.
 */
export const LANGUAGE_META: { value: SupportedLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" },
];

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function isLanguageChoice(value: unknown): value is LanguageChoice {
  return value === LANGUAGE_SYSTEM || isSupportedLanguage(value);
}

/**
 * Maps a BCP-47 tag onto a language we ship. Every `zh` variant (`zh-Hans-CN`,
 * `zh-TW`, `zh`) resolves to Simplified Chinese — the only Chinese translation
 * available — and anything else falls back to English.
 */
export function normalizeLanguage(tag: string | null | undefined): SupportedLanguage {
  if (!tag) return DEFAULT_LANGUAGE;
  const lower = tag.toLowerCase();
  if (lower === "zh" || lower.startsWith("zh-")) return "zh-CN";
  return DEFAULT_LANGUAGE;
}

/** The system preference, honouring the order of `navigator.languages`. */
export function resolveSystemLanguage(): SupportedLanguage {
  if (typeof navigator === "undefined") return DEFAULT_LANGUAGE;
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of tags) {
    if (typeof tag === "string" && normalizeLanguage(tag) !== DEFAULT_LANGUAGE) {
      return normalizeLanguage(tag);
    }
  }
  return DEFAULT_LANGUAGE;
}

export function resolveLanguage(choice: LanguageChoice): SupportedLanguage {
  return choice === LANGUAGE_SYSTEM ? resolveSystemLanguage() : choice;
}

export function readStoredChoice(): LanguageChoice {
  try {
    const raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguageChoice(raw)) return raw;
  } catch {
    // localStorage may be unavailable (private mode); fall back to the system.
  }
  return LANGUAGE_SYSTEM;
}

export function resolveInitialLanguage(): SupportedLanguage {
  return resolveLanguage(readStoredChoice());
}

let currentChoice: LanguageChoice = readStoredChoice();
let currentResolved: SupportedLanguage = resolveLanguage(currentChoice);

const choiceListeners = new Set<() => void>();

/** The stored preference. Stable snapshot for `useSyncExternalStore`. */
export function getLanguageChoice(): LanguageChoice {
  return currentChoice;
}

/**
 * The language actually rendered. Tracked here rather than read back from
 * i18next so callers see the new value the moment a choice is applied, instead
 * of waiting for `changeLanguage` to settle.
 */
export function getResolvedLanguage(): SupportedLanguage {
  return currentResolved;
}

export function subscribeLanguageChoice(listener: () => void): () => void {
  choiceListeners.add(listener);
  return () => {
    choiceListeners.delete(listener);
  };
}

function applyDocumentLanguage(language: SupportedLanguage): void {
  if (typeof document !== "undefined") document.documentElement.lang = language;
}

/**
 * Applies a preference to i18next, `<html lang>` and localStorage, then notifies
 * React subscribers. Persisting it to the backend is the caller's job.
 */
export function applyLanguageChoice(choice: LanguageChoice): SupportedLanguage {
  currentChoice = choice;
  currentResolved = resolveLanguage(choice);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, choice);
  } catch {
    // Ignore: the UI still switches, only the pre-paint hint is lost.
  }
  if (i18n.resolvedLanguage !== currentResolved) {
    void i18n.changeLanguage(currentResolved);
  }
  applyDocumentLanguage(currentResolved);
  for (const listener of choiceListeners) listener();
  return currentResolved;
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "zh-CN": { translation: zhCN },
  },
  lng: currentResolved,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  // NOTE: no `nonExplicitSupportedLngs` — it strips "zh-CN" down to "zh"
  // before matching `supportedLngs`, which makes i18next treat zh-CN as
  // unsupported and fall back to English. Raw BCP-47 tags never reach
  // i18next here anyway: `normalizeLanguage()` maps every zh variant onto
  // the exact "zh-CN" catalogue code before `changeLanguage` is called.
  defaultNS: "translation",
  returnNull: false,
  interpolation: { escapeValue: false },
  // Resources are inlined, so initialise synchronously: the very first render is
  // already translated, with no flash of English and no Suspense boundary.
  initAsync: false,
  react: { useSuspense: false },
});

i18n.on("languageChanged", (language) => {
  currentResolved = normalizeLanguage(language);
  applyDocumentLanguage(currentResolved);
});

applyDocumentLanguage(currentResolved);

// "Follow system" should react to an OS language change without a restart.
if (typeof window !== "undefined") {
  window.addEventListener("languagechange", () => {
    if (getLanguageChoice() === LANGUAGE_SYSTEM) applyLanguageChoice(LANGUAGE_SYSTEM);
  });
}

/**
 * Translate outside React — module-level constants and non-component helpers.
 * Components must use `useTranslation()` so they re-render on a language change.
 */
export const t: TFunction = i18n.t.bind(i18n);

export default i18n;
