import { act, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import App from "./App";
import { clearHeldKeys } from "./lib/heldKeys";

/**
 * Cmd+W precedence contract: dialog/panel > terminal tab > native hide.
 * - (a) Dialog/panel open + Cmd+W -> preventDefault + close in-app.
 * - (b) Terminal panel open + active tab, no dialog -> preventDefault +
 *   close tab. Covered by TerminalWorkspace.hotkeys.test.tsx
 *   ("Cmd+W closes the active terminal tab"); not duplicated here.
 * - (c) Nothing open + Cmd+W -> NO preventDefault, NO state change
 *   (reaches the native menu -> hide-to-tray).
 *
 * Chord semantics mirror the handlers under test: App.tsx matches
 * `(metaKey || ctrlKey) && key === "w"`; TerminalWorkspace matches
 * meta-only `code === "KeyW"` in the capture phase and falls through
 * when there is no active tab.
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
  clearHeldKeys();
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

describe("App Cmd+W precedence", () => {
  it("(c) bare Cmd+W is not intercepted and changes nothing", async () => {
    await renderApp();
    expect(dialog()).toBeNull();

    let ev: KeyboardEvent | undefined;
    await act(async () => {
      press("MetaLeft", "Meta", { metaKey: true });
      ev = press("KeyW", "w", { metaKey: true });
    });

    expect(ev?.defaultPrevented).toBe(false);
    expect(dialog()).toBeNull();
    expect(document.querySelector(".app-root")).toBeInTheDocument();

    await act(async () => {
      release("KeyW", "w");
      release("MetaLeft", "Meta");
    });
  });

  it("(a) dialog-open Cmd+W is intercepted and closes the dialog", async () => {
    await renderApp();

    // Open the shortcuts help via its clean Ctrl+/ chord.
    await act(async () => {
      press("ControlLeft", "Control", { ctrlKey: true });
      press("Slash", "/", { ctrlKey: true });
    });
    await waitFor(() => expect(dialog()).toBeInTheDocument());
    await act(async () => {
      release("Slash", "/");
      release("ControlLeft", "Control");
    });

    let ev: KeyboardEvent | undefined;
    await act(async () => {
      press("MetaLeft", "Meta", { metaKey: true });
      ev = press("KeyW", "w", { metaKey: true });
    });

    expect(ev?.defaultPrevented).toBe(true);
    await waitFor(() => expect(dialog()).toBeNull());

    await act(async () => {
      release("KeyW", "w");
      release("MetaLeft", "Meta");
    });
  });

  it("(a) terminal panel with no tabs falls through and closes the panel", async () => {
    await renderApp();

    // Open the panel via its Control+~ binding (no sessions mocked, so no tabs).
    let toggle: KeyboardEvent | undefined;
    await act(async () => {
      press("ControlLeft", "Control", { ctrlKey: true });
      toggle = press("Backquote", "`", { ctrlKey: true });
    });
    expect(toggle?.defaultPrevented).toBe(true);
    await act(async () => {
      release("Backquote", "`");
      release("ControlLeft", "Control");
    });

    // No-tab workspace handler lets Cmd+W propagate; the App gate closes the panel.
    let ev: KeyboardEvent | undefined;
    await act(async () => {
      press("MetaLeft", "Meta", { metaKey: true });
      ev = press("KeyW", "w", { metaKey: true });
    });
    expect(ev?.defaultPrevented).toBe(true);
    await act(async () => {
      release("KeyW", "w");
      release("MetaLeft", "Meta");
    });

    // Panel is now closed: the next bare Cmd+W reaches native again.
    let again: KeyboardEvent | undefined;
    await act(async () => {
      press("MetaLeft", "Meta", { metaKey: true });
      again = press("KeyW", "w", { metaKey: true });
    });
    expect(again?.defaultPrevented).toBe(false);
    await act(async () => {
      release("KeyW", "w");
      release("MetaLeft", "Meta");
    });
  });
});
