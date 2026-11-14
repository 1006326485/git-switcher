import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { installSpellingPolicy } from "./lib/spellingPolicy";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(() => Promise.resolve(null)),
  save: vi.fn(() => Promise.resolve(null)),
  message: vi.fn(() => Promise.resolve()),
  ask: vi.fn(() => Promise.resolve(true)),
  confirm: vi.fn(() => Promise.resolve(true)),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    const table: Record<string, unknown> = {
      get_settings: {
        theme: "light",
        auto_refresh: false,
        refresh_interval_secs: 30,
        view_mode: "card",
        llm: {
          enabled: false,
          api_key: "",
          endpoint: "",
          model: "",
          temperature: 0.3,
          max_tokens: 4096,
          key_in_keychain: false,
        },
        auto_fetch_on_launch: false,
        terminal_hotkey: "CmdOrCtrl+Shift+`",
        terminal_hide_on_blur: false,
      },
      get_background_status: { paused: true, interval_secs: 30, last_run_at: null },
    };
    return Promise.resolve(table[cmd] ?? []);
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  class ObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
  window.IntersectionObserver = ObserverStub as unknown as typeof IntersectionObserver;
  Element.prototype.scrollIntoView = vi.fn();
});

/**
 * The unit tests prove installSpellingPolicy's logic; this proves it reaches
 * the real markup. Without the policy, the header search shows macOS
 * autocorrect while typing, which is the reported bug.
 */
describe("spelling policy on rendered fields", () => {
  it("covers the global search field", async () => {
    const dispose = installSpellingPolicy(document);
    try {
      render(<App />);
      const search = await waitFor(() => {
        const field = document.querySelector<HTMLInputElement>("#global-search-input");
        expect(field).not.toBeNull();
        return field!;
      });
      expect(search.getAttribute("spellcheck")).toBe("false");
      expect(search.getAttribute("autocorrect")).toBe("off");
      expect(search.getAttribute("autocapitalize")).toBe("off");
    } finally {
      dispose();
    }
  });
});
