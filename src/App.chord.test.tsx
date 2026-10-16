import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import App from "./App";

/**
 * App.tsx owns a second set of Cmd/Ctrl chords (view modes, Cmd+/, Cmd+D,
 * Cmd+R, Cmd+W). They must obey the same clean-chord rule as the rebindable
 * shortcuts: `Ctrl` `z` `/` is not `Ctrl+/`.
 */

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

function press(
  code: string,
  key: string,
  modifiers: KeyboardEventInit = {}
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    code,
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  document.body.dispatchEvent(event);
  return event;
}

function release(code: string, key: string): void {
  document.body.dispatchEvent(
    new KeyboardEvent("keyup", { code, key, bubbles: true })
  );
}

const dialog = () => document.querySelector('[role="dialog"]');

async function renderApp() {
  render(<App />);
  await waitFor(() => {
    expect(document.querySelector(".app-root")).toBeInTheDocument();
  });
}

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

describe("App chord cleanliness", () => {
  it("opens the shortcuts help on a clean Ctrl+/", async () => {
    await renderApp();

    await act(async () => {
      press("ControlLeft", "Control", { ctrlKey: true });
      press("Slash", "/", { ctrlKey: true });
    });

    await waitFor(() => expect(dialog()).toBeInTheDocument());
  });

  it("ignores Ctrl+/ while another key is still held", async () => {
    await renderApp();

    let dirty: KeyboardEvent | undefined;
    await act(async () => {
      press("ControlLeft", "Control", { ctrlKey: true });
      press("KeyZ", "z", { ctrlKey: true });
      dirty = press("Slash", "/", { ctrlKey: true });
    });

    expect(dirty?.defaultPrevented).toBe(true);
    expect(dialog()).toBeNull();

    // Releasing the stray key restores the chord.
    await act(async () => {
      release("KeyZ", "z");
      press("Slash", "/", { ctrlKey: true });
    });

    await waitFor(() => expect(dialog()).toBeInTheDocument());
  });
});
