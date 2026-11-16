import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TerminalWorkspace from "./TerminalWorkspace";

/**
 * The workspace (and therefore the summoned terminal window) reads the theme
 * through useTheme. These cases pin the two paths that used to bypass it:
 * an OS appearance change while following the system, and a theme saved by
 * the other window through the backend.
 */
const h = vi.hoisted(() => ({
  setTerminalDark: vi.fn(),
  getSettings: vi.fn(),
  settingsListeners: [] as (() => void)[],
  media: {
    matches: false,
    listeners: [] as (() => void)[],
  },
}));

vi.mock("../hooks/useTerminal", () => ({
  useTerminal: () => ({
    sessions: [],
    activeId: null,
    activeProject: null,
    activeByProject: {},
    openTerminal: vi.fn(),
    closeTerminal: vi.fn(),
    closeProjectTerminals: vi.fn(),
    restartTerminal: vi.fn(),
    closeAllTerminals: vi.fn(),
    selectTerminal: vi.fn(),
    setActiveProject: vi.fn(),
    selectAdjacentProject: vi.fn(),
    selectTerminalByIndex: vi.fn(),
    selectAdjacentTerminal: vi.fn(),
    attachTerminal: vi.fn(),
    detachTerminal: vi.fn(),
    fitTerminal: vi.fn(),
    focusTerminal: vi.fn(),
    getSelection: vi.fn(() => ""),
    selectAll: vi.fn(),
    clearScreen: vi.fn(),
    sendInput: vi.fn(),
    setTerminalDark: h.setTerminalDark,
  }),
}));

vi.mock("../lib/tauri", () => ({
  getSettings: h.getSettings,
  listRunPresets: vi.fn(() => Promise.resolve([])),
  listProjects: vi.fn(() => Promise.resolve([])),
  listCustomCommands: vi.fn(() => Promise.resolve([])),
  listProjectScripts: vi.fn(() => Promise.resolve([])),
  switchBranch: vi.fn(),
  createRunPreset: vi.fn(),
  deleteRunPreset: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, handler: () => void) => {
    if (event === "settings-changed") h.settingsListeners.push(handler);
    return Promise.resolve(() => {});
  }),
}));

const settings = (theme: "light" | "dark" | "system") => ({
  theme,
  terminal_hotkey: "CmdOrCtrl+Shift+`",
  terminal_hide_on_blur: false,
});

function fireSettingsChanged() {
  act(() => {
    for (const handler of h.settingsListeners) handler();
  });
}

describe("TerminalWorkspace theme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.settingsListeners.length = 0;
    h.media.matches = false;
    h.media.listeners.length = 0;
    h.getSettings.mockResolvedValue(settings("system"));
    document.documentElement.classList.remove("dark", "no-transition");

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      get matches() {
        return h.media.matches;
      },
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (type: string, handler: () => void) => {
        if (type === "change") h.media.listeners.push(handler);
      },
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

  it("re-themes the terminal when the OS appearance changes under the system choice", async () => {
    render(<TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />);
    await waitFor(() => expect(h.setTerminalDark).toHaveBeenLastCalledWith(false));
    expect(document.documentElement).not.toHaveClass("dark");

    act(() => {
      h.media.matches = true;
      for (const handler of h.media.listeners) handler();
    });

    // The xterm canvas is themed from React state, so the change must
    // re-render the workspace — toggling <html class="dark"> alone used to
    // leave the terminal on its old colors until some unrelated re-render.
    await waitFor(() => expect(h.setTerminalDark).toHaveBeenLastCalledWith(true));
    expect(document.documentElement).toHaveClass("dark");
  });

  it("adopts a theme saved by the main window without reloading the window", async () => {
    render(<TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />);
    await waitFor(() => expect(h.setTerminalDark).toHaveBeenLastCalledWith(false));

    h.getSettings.mockResolvedValue(settings("dark"));
    fireSettingsChanged();

    await waitFor(() => expect(h.setTerminalDark).toHaveBeenLastCalledWith(true));
    expect(document.documentElement).toHaveClass("dark");
  });

  it("keeps an explicit light choice even when the OS is dark", async () => {
    h.media.matches = true;
    h.getSettings.mockResolvedValue(settings("light"));

    render(<TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />);

    await waitFor(() => expect(h.setTerminalDark).toHaveBeenLastCalledWith(false));
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
