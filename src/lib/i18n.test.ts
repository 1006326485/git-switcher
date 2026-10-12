import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import {
  applyLanguageChoice,
  getLanguageChoice,
  getResolvedLanguage,
  isLanguageChoice,
  isSupportedLanguage,
  LANGUAGE_STORAGE_KEY,
  LANGUAGE_SYSTEM,
  normalizeLanguage,
  readStoredChoice,
  resolveLanguage,
  resolveSystemLanguage,
  subscribeLanguageChoice,
  SUPPORTED_LANGUAGES,
  t,
} from "./i18n";

const originalLanguages = Object.getOwnPropertyDescriptor(navigator, "languages");

function stubNavigatorLanguages(languages: string[]) {
  Object.defineProperty(navigator, "languages", { value: languages, configurable: true });
}

afterEach(() => {
  applyLanguageChoice("en");
  localStorage.clear();
  if (originalLanguages) Object.defineProperty(navigator, "languages", originalLanguages);
  else Reflect.deleteProperty(navigator, "languages");
  vi.restoreAllMocks();
});

describe("normalizeLanguage", () => {
  it("maps every Chinese variant onto the Simplified Chinese catalogue", () => {
    expect(normalizeLanguage("zh")).toBe("zh-CN");
    expect(normalizeLanguage("zh-Hans-CN")).toBe("zh-CN");
    expect(normalizeLanguage("zh-TW")).toBe("zh-CN");
  });

  it("keeps English and falls back to it for anything unsupported", () => {
    expect(normalizeLanguage("en")).toBe("en");
    expect(normalizeLanguage("en-GB")).toBe("en");
    expect(normalizeLanguage("de-DE")).toBe("en");
    expect(normalizeLanguage(null)).toBe("en");
    expect(normalizeLanguage("")).toBe("en");
  });
});

describe("resolveSystemLanguage", () => {
  it("uses the first translated language from navigator.languages", () => {
    stubNavigatorLanguages(["de-DE", "zh-CN", "en-US"]);
    expect(resolveSystemLanguage()).toBe("zh-CN");
  });

  it("falls back to English when no listed language is translated", () => {
    stubNavigatorLanguages(["de-DE", "fr-FR"]);
    expect(resolveSystemLanguage()).toBe("en");
  });
});

describe("stored preference", () => {
  it("defaults to following the system", () => {
    expect(readStoredChoice()).toBe(LANGUAGE_SYSTEM);
  });

  it("reads a valid stored choice and rejects an unknown one", () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "zh-CN");
    expect(readStoredChoice()).toBe("zh-CN");
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");
    expect(readStoredChoice()).toBe(LANGUAGE_SYSTEM);
  });

  it("narrows choices and languages", () => {
    expect(isLanguageChoice("system")).toBe(true);
    expect(isLanguageChoice("zh-CN")).toBe(true);
    expect(isLanguageChoice("fr")).toBe(false);
    expect(isSupportedLanguage("system")).toBe(false);
    expect(SUPPORTED_LANGUAGES).toEqual(["en", "zh-CN"]);
  });
});

describe("applyLanguageChoice", () => {
  it("switches the catalogue, the document language and localStorage", async () => {
    applyLanguageChoice("zh-CN");

    expect(getLanguageChoice()).toBe("zh-CN");
    expect(getResolvedLanguage()).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh-CN");
    await waitFor(() => expect(t("settings.language.title")).toBe("语言"));
  });

  it("resolves the system preference without storing a concrete language", () => {
    stubNavigatorLanguages(["en-US"]);
    applyLanguageChoice(LANGUAGE_SYSTEM);

    expect(getLanguageChoice()).toBe(LANGUAGE_SYSTEM);
    expect(getResolvedLanguage()).toBe("en");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe(LANGUAGE_SYSTEM);
    expect(document.documentElement.lang).toBe("en");
  });

  it("notifies subscribers until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLanguageChoice(listener);

    applyLanguageChoice("zh-CN");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    applyLanguageChoice("en");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("resolveLanguage", () => {
  it("returns an explicit choice unchanged", () => {
    expect(resolveLanguage("zh-CN")).toBe("zh-CN");
  });
});
