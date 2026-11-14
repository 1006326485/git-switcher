import { act, render, waitFor } from "@testing-library/react";
import { listen } from "@tauri-apps/api/event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import App from "./App";
import { clearHeldKeys } from "./lib/heldKeys";

/**
 * In-app terminal-panel toggle (main window only).
 *
 * Contract:
 * - Default in-app chord is `CmdOrCtrl+`` (NO Shift): Cmd+` on macOS,
 *   Ctrl+` elsewhere. It opens and closes the built-in panel.
 * - The global hotkey chord (`terminal_hotkey`, default `CmdOrCtrl+Shift+``)
 *   belongs to the backend while the window is focused. The in-app handler
 *   must not act on a Shift-held backquote: in jsdom the backend never runs,
 *   so the observable requirement is "panel state does not change".
 * - A binding recorded in the Shortcuts panel (settings field
 *   `in_app_toggle_terminal`) is the one that works; the old default stops.
 *
 * jsdom reports a non-mac platform, so the default in-app binding resolves to
 * Ctrl+` here (App tests must NOT mock detectMac: it also drives the native
 * keymap paths). The macOS chord is covered via metaKey below; matchesBinding
 * treats CmdOrCtrl as "meta OR ctrl", so the same table-entry resolution is
 * exercised.
 */

// Per-test settings, returned by the mocked get_settings command.
const settingsRef = {
  current: {} as Record<string, unknown>,
};

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
        ...settingsRef.current,
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

/** The terminal panel: TerminalPanel's fixed overlay, `hidden` while closed. */
function panelOverlay(): HTMLElement {
  const root = document.querySelector('[data-terminal-context="true"]');
  const overlay = root?.closest(".fixed.inset-0");
  if (!(overlay instanceof HTMLElement)) throw new Error("terminal panel not mounted");
  return overlay;
}

const isPanelOpen = () => !panelOverlay().classList.contains("hidden");

async function expectPanelOpen() {
  await waitFor(() => expect(isPanelOpen()).toBe(true));
}

async function expectPanelClosed() {
  await waitFor(() => expect(isPanelOpen()).toBe(false));
}

async function renderApp(settings: Record<string, unknown> = {}) {
  settingsRef.current = settings;
  render(<App />);
  await waitFor(() => {
    expect(document.querySelector(".app-root")).toBeInTheDocument();
  });
  // The bindings (in_app_toggle_terminal) and the global terminal hotkey are
  // only correct once get_settings has been consumed — wait for it so a
  // "initially closed" assertion cannot race the settings load.
  await waitFor(() =>
    expect(vi.mocked(tauriInvoke).mock.calls.some(([cmd]) => cmd === "get_settings")).toBe(true)
  );
  await waitFor(() => expect(panelOverlay()).toBeTruthy());
}

// Ctrl+` — the default in-app toggle on Windows/Linux (the jsdom platform).
async function pressToggleCtrl() {
  let ev: KeyboardEvent | undefined;
  await act(async () => {
    press("ControlLeft", "Control", { ctrlKey: true });
    ev = press("Backquote", "`", { ctrlKey: true });
  });
  // Released immediately: a still-held key would make the next chord "dirty".
  await act(async () => {
    release("Backquote", "`");
    release("ControlLeft", "Control");
  });
  return ev;
}

// Cmd+` — the default in-app toggle on macOS.
async function pressToggleCmd() {
  let ev: KeyboardEvent | undefined;
  await act(async () => {
    press("MetaLeft", "Meta", { metaKey: true });
    ev = press("Backquote", "`", { metaKey: true });
  });
  await act(async () => {
    release("Backquote", "`");
    release("MetaLeft", "Meta");
  });
  return ev;
}

// CmdOrCtrl+Shift+` — the global hotkey chord (backend-owned).
async function pressGlobalHotkeyChord() {
  await act(async () => {
    press("ControlLeft", "Control", { ctrlKey: true });
    press("ShiftLeft", "Shift", { ctrlKey: true, shiftKey: true });
    press("Backquote", "~", { ctrlKey: true, shiftKey: true });
  });
  await act(async () => {
    release("Backquote", "~");
    release("ShiftLeft", "Shift");
    release("ControlLeft", "Control");
  });
}

async function pressCustomCtrlT() {
  await act(async () => {
    press("ControlLeft", "Control", { ctrlKey: true });
    press("KeyT", "t", { ctrlKey: true });
  });
  await act(async () => {
    release("KeyT", "t");
    release("ControlLeft", "Control");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  clearHeldKeys();
  localStorage.clear();
  settingsRef.current = {};
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

describe("App in-app terminal toggle: default chord", () => {
  it("Ctrl+` (no Shift) opens the panel and Ctrl+` again closes it", async () => {
    await renderApp();
    await expectPanelClosed();

    const open = await pressToggleCtrl();
    expect(open?.defaultPrevented).toBe(true);
    await expectPanelOpen();

    const close = await pressToggleCtrl();
    expect(close?.defaultPrevented).toBe(true);
    await expectPanelClosed();
  });

  it("ignores the other platform's modifier: Cmd+` is not the toggle off macOS", async () => {
    // jsdom is a non-mac platform, so the default resolves to Ctrl+`. Cmd+`
    // must be left alone (it is the platform's own chord, not this binding),
    // which also keeps ⌘ and Ctrl from both firing on a real macOS.
    await renderApp();
    await expectPanelClosed();

    const cmd = await pressToggleCmd();
    expect(cmd?.defaultPrevented).toBe(false);
    expect(isPanelOpen()).toBe(false);

    // The platform chord still works, and only once per press.
    await pressToggleCtrl();
    await expectPanelOpen();
  });
});

// jsdom exposes `platform` through the prototype (no own descriptor), and an
// empty value is what detectMac() reads as non-mac — the default here.
function restoreNonMacPlatform(): void {
  Object.defineProperty(navigator, "platform", { value: "", configurable: true });
}

describe("App in-app terminal toggle on macOS", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
  });
  afterEach(restoreNonMacPlatform);

  it("toggles on Cmd+` and leaves Ctrl+` to the shell", async () => {
    await renderApp();
    await expectPanelClosed();

    // Ctrl+` is the shell's on macOS: it must neither toggle nor be swallowed.
    const ctrl = await pressToggleCtrl();
    expect(ctrl?.defaultPrevented).toBe(false);
    expect(isPanelOpen()).toBe(false);

    const cmd = await pressToggleCmd();
    expect(cmd?.defaultPrevented).toBe(true);
    await expectPanelOpen();

    await pressToggleCmd();
    await expectPanelClosed();
  });
});

describe("App in-app terminal toggle: global hotkey chord is not stolen", () => {
  it("Ctrl+Shift+` leaves the panel state alone (backend owns that chord)", async () => {
    await renderApp();
    await expectPanelClosed();

    // Twice: an accidental toggle would be visible either way (open, or
    // open-then-closed on a second press).
    await pressGlobalHotkeyChord();
    await pressGlobalHotkeyChord();

    // Give any (wrong) state update a chance to flush before asserting.
    await act(async () => {
      await Promise.resolve();
    });
    expect(isPanelOpen()).toBe(false);
  });

  it("Ctrl+Shift+` with the panel already open does not close it", async () => {
    await renderApp();
    await pressToggleCtrl();
    await expectPanelOpen();

    await pressGlobalHotkeyChord();
    await act(async () => {
      await Promise.resolve();
    });
    expect(isPanelOpen()).toBe(true);
  });

  // With the default terminal_hotkey configured, the global-chord suppression
  // in useKeyboardShortcuts is what stops Ctrl+Shift+` here, so the tests
  // above would still pass if the in-app matcher itself ignored Shift. With no
  // global hotkey configured there is nothing to suppress: only the binding's
  // own `needShift` check can keep the Shift-held chord from toggling.
  it("Ctrl+Shift+` does not toggle when no global hotkey is configured", async () => {
    await renderApp({ terminal_hotkey: "" });
    await expectPanelClosed();

    await pressGlobalHotkeyChord();
    await act(async () => {
      await Promise.resolve();
    });
    expect(isPanelOpen()).toBe(false);

    // The unshifted default still works alongside it.
    await pressToggleCtrl();
    await expectPanelOpen();
  });
});

describe("App in-app terminal toggle: re-recorded binding wins", () => {
  it("uses in_app_toggle_terminal (Control+T) and drops the default backquote chord", async () => {
    await renderApp({ in_app_toggle_terminal: "Control+T" });
    await expectPanelClosed();

    // The old default chord no longer toggles the panel.
    const stale = await pressToggleCtrl();
    expect(stale?.defaultPrevented).toBe(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(isPanelOpen()).toBe(false);

    // The recorded binding opens it...
    await pressCustomCtrlT();
    await expectPanelOpen();

    // ...and closes it again.
    await pressCustomCtrlT();
    await expectPanelClosed();
  });

  it("shows the recorded binding in the shortcuts help instead of the default", async () => {
    await renderApp({ in_app_toggle_terminal: "Control+T" });

    // Open the shortcuts help with its clean Ctrl+/ chord.
    await act(async () => {
      press("ControlLeft", "Control", { ctrlKey: true });
      press("Slash", "/", { ctrlKey: true });
    });
    await act(async () => {
      release("Slash", "/");
      release("ControlLeft", "Control");
    });

    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeInTheDocument());

    // Each row renders its chord as <kbd> badges ("Ctrl" + "T"); read the
    // badges of the row whose label is the terminal toggle.
    await waitFor(() => {
      const rows = Array.from(
        document.querySelectorAll('[role="dialog"] div.flex.items-center.justify-between')
      );
      const toggleRow = rows.find((row) =>
        /Toggle built-in terminal/i.test(row.textContent ?? "")
      );
      expect(toggleRow).toBeTruthy();
      const keys = Array.from(toggleRow!.querySelectorAll("kbd")).map(
        (k) => k.textContent?.trim() ?? ""
      );
      expect(keys).toEqual(["Ctrl", "T"]);
    });
  });

  it("picks up a binding saved in another window via settings-changed", async () => {
    // The Shortcuts panel saves with update_settings_partial, and the backend
    // only emits "settings-changed" (payload: none) — this window must re-read
    // the binding, or a chord recorded elsewhere would display but never fire.
    await renderApp({ in_app_toggle_terminal: "CmdOrCtrl+`" });
    await expectPanelClosed();

    const handlers = vi
      .mocked(listen)
      .mock.calls.filter(([event]) => event === "settings-changed")
      .map(([, handler]) => handler as () => void);
    expect(handlers.length).toBeGreaterThan(0);

    settingsRef.current = { in_app_toggle_terminal: "Control+T" };
    // The backend emits to every subscriber (App's binding effect, Header,
    // TerminalWorkspace), so deliver the event to all of them. Only App's
    // binding effect feeds useKeyboardShortcuts; if it ever stopped refetching,
    // the second assertion below would fail.
    await act(async () => {
      handlers.forEach((h) => h());
      await Promise.resolve();
    });

    // The newly saved chord opens the panel; the old default no longer does.
    await pressToggleCtrl();
    expect(isPanelOpen()).toBe(false);
    await pressCustomCtrlT();
    await expectPanelOpen();
  });
});
