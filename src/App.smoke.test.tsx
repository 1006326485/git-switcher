import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import App from "./App";

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

describe("App smoke", () => {
  it("renders the main UI without throwing", async () => {
    render(<App />);
    await waitFor(() => {
      expect(document.querySelector(".app-root")).toBeInTheDocument();
    });
    expect(document.querySelector(".app-titlebar")).toBeInTheDocument();
  });
});
