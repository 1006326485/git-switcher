import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TerminalWindowApp from "./TerminalWindowApp";
import { formatHotkey } from "./lib/hotkey";

const hide = vi.fn();

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({ hide })),
}));

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

const settings = vi.hoisted(() => ({
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
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    if (cmd === "get_settings") return Promise.resolve({ ...settings });
    return Promise.resolve([]);
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

describe("TerminalWindowApp", () => {
  it("renders terminal-only chrome with the hotkey hint", async () => {
    render(<TerminalWindowApp />);
    expect(document.querySelector(".app-titlebar")).toBeInTheDocument();
    expect(
      await screen.findByText(`${formatHotkey("CmdOrCtrl+Shift+`")} to summon / hide`)
    ).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
  });

  it("dismisses through the app so the main window never takes focus", async () => {
    render(<TerminalWindowApp />);
    const { invoke } = await import("@tauri-apps/api/core");

    fireEvent.click(screen.getByLabelText("Close"));

    await waitFor(() => expect(vi.mocked(invoke)).toHaveBeenCalledWith("terminal_window_dismiss"));
    expect(hide).not.toHaveBeenCalled();
  });

  it("reloads settings when the window is summoned again", async () => {
    render(<TerminalWindowApp />);
    await screen.findByText(`${formatHotkey("CmdOrCtrl+Shift+`")} to summon / hide`);

    const { invoke } = await import("@tauri-apps/api/core");
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === "get_settings") return Promise.resolve({ ...settings, terminal_hotkey: "Alt+Space" });
      return Promise.resolve([]);
    });
    fireEvent(window, new Event("focus"));

    await waitFor(() =>
      expect(screen.getByText(`${formatHotkey("Alt+Space")} to summon / hide`)).toBeInTheDocument()
    );
  });
});
