import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
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

    // Open the panel via its in-app toggle, CmdOrCtrl+` — Ctrl+` with NO Shift
    // on a non-mac platform (the global hotkey is the Shift-held variant and
    // belongs to the backend). No sessions are mocked, so the panel has no tabs.
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

describe("App Cmd+N precedence (FR2 terminal context)", () => {
  const addDialogTitle = () =>
    Array.from(document.querySelectorAll("h2")).some((h) => /Add Project/i.test(h.textContent ?? ""));

  /**
   * Focus something INSIDE the terminal workspace. The panel (TerminalPanel)
   * is a portal into document.body, so it is not nestable inside
   * `[data-terminal-context]`: find the workspace's own .window-root there.
   */
  function workspaceRoot(): HTMLElement {
    const panels = Array.from(document.querySelectorAll("body > div > div")).filter(
      (el) => el.querySelector(".window-root")
    );
    const el = panels[panels.length - 1]?.querySelector(".window-root");
    if (!(el instanceof HTMLElement)) throw new Error("terminal workspace not mounted");
    return el;
  }

  async function focusWorkspace() {
    const target = workspaceRoot().querySelector("button") ?? workspaceRoot();
    await act(async () => {
      (target as HTMLElement).focus();
    });
  }

  it("opens Add Project when focus is in the app (no terminal context)", async () => {
    await renderApp();
    await act(async () => {
      press("ControlLeft", "Control", { ctrlKey: true });
      press("KeyN", "n", { ctrlKey: true });
    });
    await waitFor(() => expect(addDialogTitle()).toBe(true));
    await act(async () => {
      release("KeyN", "n");
      release("ControlLeft", "Control");
    });
  });

  // The regression this pins: CmdOrCtrl+N pressed INSIDE the terminal panel
  // (e.g. the shell's Ctrl+N history key) used to reach App's addProject
  // handler and summon the Add Project dialog behind the panel.
  it("keeps Cmd+N inside the terminal context away from Add Project", async () => {
    await renderApp();

    // Open the terminal panel with the in-app toggle (CmdOrCtrl+` → Ctrl+`,
    // unshifted). No sessions are mocked, so the panel starts blank.
    let toggle: KeyboardEvent | undefined;
    await act(async () => {
      toggle = press("Backquote", "`", { ctrlKey: true });
    });
    expect(toggle?.defaultPrevented).toBe(true);
    await act(async () => {
      release("Backquote", "`");
    });
    await waitFor(() => expect(workspaceRoot()).toBeTruthy());

    await focusWorkspace();
    expect(document.activeElement?.closest(".window-root")).not.toBeNull();
    let ev: KeyboardEvent | undefined;
    await act(async () => {
      ev = press("KeyN", "n", { ctrlKey: true });
    });
    await act(async () => {
      release("KeyN", "n");
      release("ControlLeft", "Control");
    });

    expect(addDialogTitle()).toBe(false);
    // The chord never reached App's addProject: the terminal context owns
    // it (the workspace has nothing to open for it, so it is not swallowed
    // either — the browser default on that platform decides).
    expect(ev).toBeDefined();
  });

  it("restores the app meaning of Cmd+N once focus leaves the terminal", async () => {
    await renderApp();
    // In-app toggle: Ctrl+` (CmdOrCtrl+`), unshifted — the default binding.
    let toggle: KeyboardEvent | undefined;
    await act(async () => {
      toggle = press("Backquote", "`", { ctrlKey: true });
    });
    expect(toggle?.defaultPrevented).toBe(true);
    await act(async () => {
      release("Backquote", "`");
    });
    await waitFor(() => expect(workspaceRoot()).toBeTruthy());
    await focusWorkspace();
    // The root is React's workspace element; its panel wrapper carries
    // "hidden" while closed (TerminalPanel).
    const workspace = workspaceRoot();
    // TerminalPanel's wrapper: the fixed overlay that is `hidden` while the
    // panel is closed.
    const panelWrapper = workspace.closest(".fixed.inset-0");
    expect(panelWrapper).not.toBeNull();

    // Close the panel (pointer path; every chord attempt would itself be
    // owned by the terminal context we are trying to leave).
    const closeButton = workspace.querySelector('[aria-label="Close"]');
    expect(closeButton).not.toBeNull();
    await act(async () => {
      fireEvent.click(closeButton as Element);
    });
    await waitFor(() => expect(panelWrapper?.className).toContain("hidden"));

    await act(async () => {
      (document.body as HTMLElement).tabIndex = -1;
      (document.body as HTMLElement).focus();
    });
    expect(document.activeElement?.closest(".window-root")).toBeNull();

    await act(async () => {
      press("KeyN", "n", { ctrlKey: true });
    });
    await waitFor(() => expect(addDialogTitle()).toBe(true));
  });

  // The reported bug: after summoning the built-in panel, nothing inside it
  // had been clicked yet, so focus still sat on the trigger. Both chords had
  // to be clicked into the panel before they worked.
  async function summonPanel() {
    await renderApp();
    // In-app toggle: CmdOrCtrl+` — Ctrl+` without Shift on this platform.
    let toggle: KeyboardEvent | undefined;
    await act(async () => {
      toggle = press("Backquote", "`", { ctrlKey: true });
    });
    expect(toggle?.defaultPrevented).toBe(true);
    // Releasing the summon chord matters: a key still held would make the
    // next chord "dirty" and it would be refused (heldKeys contract).
    await act(async () => {
      release("Backquote", "`");
      release("ControlLeft", "Control");
    });
    await waitFor(() => expect(workspaceRoot()).toBeTruthy());
    expect(document.activeElement?.closest(".window-root")).toBeFalsy();
  }

  it("adds a terminal tab on Cmd+N right after the panel is summoned", async () => {
    await summonPanel();

    await act(async () => {
      press("ControlLeft", "Control", { ctrlKey: true });
      press("KeyN", "n", { ctrlKey: true });
    });
    await act(async () => {
      release("KeyN", "n");
      release("ControlLeft", "Control");
    });

    // Cmd+N is "one more tab in the current project" (the tab bar's "+"),
    // not the project picker, and it must not fall through to Add Project.
    await waitFor(() =>
      expect(
        vi.mocked(invoke).mock.calls.some(([cmd]) => cmd === "terminal_open")
      ).toBe(true)
    );
    expect(addDialogTitle()).toBe(false);
    expect(document.querySelector('[role="listbox"]')).toBeNull();
  });

  it("opens the New-project picker on Cmd+Shift+N right after the panel is summoned", async () => {
    await summonPanel();

    await act(async () => {
      press("ControlLeft", "Control", { ctrlKey: true });
      press("KeyN", "N", { ctrlKey: true, shiftKey: true });
    });

    await waitFor(() => expect(document.querySelector('[role="listbox"]')).toBeTruthy());
    await act(async () => {
      release("KeyN", "N");
      release("ControlLeft", "Control");
    });
  });
});
