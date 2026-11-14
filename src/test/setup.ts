import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { applyLanguageChoice } from "../lib/i18n";

// Node 26+ ships experimental `localStorage`/`sessionStorage` globals that are
// `undefined` unless the process runs with `--localstorage-file`. Vitest's jsdom
// environment keeps globals that already exist on `globalThis`, so Node's value
// shadows jsdom's Storage and every test that touches it fails. Point the
// globals back at the jsdom window's real Storage.
const jsdomWindow = (globalThis as typeof globalThis & { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow) {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, key, {
      value: jsdomWindow[key],
      configurable: true,
      writable: true,
    });
  }
}

afterEach(() => {
  cleanup();
  // Tests assert on English literals; always leave the catalogue in English.
  applyLanguageChoice("en");
  if (typeof localStorage !== "undefined" && typeof localStorage.clear === "function")
    localStorage.clear();
});
