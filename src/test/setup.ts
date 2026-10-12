import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { applyLanguageChoice } from "../lib/i18n";

afterEach(() => {
  cleanup();
  // Tests assert on English literals; always leave the catalogue in English.
  applyLanguageChoice("en");
  localStorage.clear();
});
