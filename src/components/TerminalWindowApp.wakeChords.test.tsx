import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TerminalWindowApp from "../TerminalWindowApp";
import * as api from "../lib/tauri";

const hide = vi.fn();

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({ hide })),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("../lib/tauri", () => ({
  terminalList: vi.fn(() => Promise.resolve([])),
  terminalOpen: vi.fn(() =>
    Promise.resolve({ id: "t-new", cwd: "/tmp/demo", title: "zsh", projectTitle: "demo", projectKey: "/tmp/demo", exited: false })
  ),
  terminalWrite: vi.fn(() => Promise.resolve()),
  terminalResize: vi.fn(() => Promise.resolve()),
  terminalClose: vi.fn(() => Promise.resolve()),
  terminalWindowDismiss: vi.fn(() => Promise.resolve()),
  listRunPresets: vi.fn(() => Promise.resolve([])),
  listCustomCommands: vi.fn(() => Promise.resolve([])),
  listProjectScripts: vi.fn(() => Promise.resolve([])),
  listProjects: vi.fn(() =>
    Promise.resolve([
      {
        project: {
          id: "p1",
          name: "demo",
          path: "/tmp/demo",
          alias: null,
          sort_order: 0,
          group_id: "g1",
          last_active_at: null,
          last_commit_hash: null,
          created_at: "",
          updated_at: "",
        },
        current_branch: "main",
        branches: [],
        status: { modified: 0, staged: 0, unmodified: 0, untracked: 0, conflicted: 0, ahead: 0, behind: 0 },
        group: { id: "g1", name: "g", color: null, sort_order: 0, created_at: "" },
        stash_count: 0,
      },
    ])
  ),
  switchBranch: vi.fn(() => Promise.resolve({})),
  openInFinder: vi.fn(),
  openInTerminal: vi.fn(),
  createRunPreset: vi.fn(),
  deleteRunPreset: vi.fn(),
  getSettings: vi.fn(() =>
    Promise.resolve({ theme: "light", terminal_hotkey: "CmdOrCtrl+Shift+`", terminal_hide_on_blur: false })
  ),
}));

/**
 * The summoned standalone window: after it is shown, focus is still on the
 * summon trigger (or document.body), not inside the terminal. Ctrl+W there
 * (⌘ on macOS) must close the tab; only a close that empties the terminal
 * dismisses the window. jsdom is non-macOS, so ⌘ == Ctrl.
 */
const demoSessions = [
  {
    id: "t1",
    cwd: "/tmp/demo",
    title: "zsh",
    projectTitle: "demo",
    projectKey: "/tmp/demo",
    command: undefined,
    exited: false,
  },
];

const secondSession = {
  id: "t2",
  cwd: "/tmp/demo",
  title: "node",
  projectTitle: "demo",
  projectKey: "/tmp/demo",
  command: undefined,
  exited: false,
};

const dismiss = () => vi.mocked(api.terminalWindowDismiss);

function windowRoot(): HTMLElement {
  const root = document.querySelector(".window-root");
  if (!(root instanceof HTMLElement)) throw new Error("terminal window root not rendered");
  return root;
}

function parkFocusOutside() {
  (document.body as HTMLElement).tabIndex = -1;
  (document.body as HTMLElement).focus();
  expect(windowRoot().contains(document.activeElement)).toBe(false);
}

function pressClose() {
  const event = new KeyboardEvent("keydown", { key: "w", code: "KeyW", ctrlKey: true, bubbles: true, cancelable: true });
  act(() => {
    window.dispatchEvent(event);
  });
  return event;
}

describe("TerminalWindowApp wake chords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    class ObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    window.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
    window.IntersectionObserver = ObserverStub as unknown as typeof IntersectionObserver;
    Element.prototype.scrollIntoView = vi.fn();
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
  });

  it("closes the tab without hiding the window when the close chord arrives outside the terminal", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    render(<TerminalWindowApp />);
    await screen.findByText("zsh");
    parkFocusOutside();

    pressClose();

    await waitFor(() => expect(api.terminalClose).toHaveBeenCalledWith("t1"));
    // Handing the chord to the tab must suppress the window's own Ctrl+W.
    await act(async () => {});
    expect(dismiss()).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });

  it("closes only the tab, keeping the window, when the close chord takes the last tab", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    render(<TerminalWindowApp />);
    await screen.findByText("zsh");
    await waitFor(() => expect(api.listProjects).toHaveBeenCalled());
    parkFocusOutside();

    pressClose();

    await waitFor(() => expect(api.terminalClose).toHaveBeenCalledWith("t1"));
    // Closing tabs never dismisses the window; it stays up on its empty
    // state, and the next close chord is what dismisses it.
    await waitFor(() => expect(screen.getByText("No terminals open")).toBeInTheDocument());
    await act(async () => {});
    expect(dismiss()).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });

  it("keeps the window when the last tab is closed with its close button", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    render(<TerminalWindowApp />);
    await screen.findByText("zsh");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close zsh" }));
    });

    await waitFor(() => expect(api.terminalClose).toHaveBeenCalledWith("t1"));
    expect(dismiss()).not.toHaveBeenCalled();
  });

  it("keeps the window up while another tab is still open", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([demoSessions[0], secondSession]);
    render(<TerminalWindowApp />);
    await screen.findByText("node");
    parkFocusOutside();

    pressClose();

    await waitFor(() => expect(api.terminalClose).toHaveBeenCalledTimes(1));
    expect(dismiss()).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });

  it("dismisses the empty window when the close chord arrives outside the terminal", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([]);
    render(<TerminalWindowApp />);
    await screen.findByText("No terminals open");
    parkFocusOutside();

    pressClose();

    await waitFor(() => expect(dismiss()).toHaveBeenCalledTimes(1));
    expect(api.terminalClose).not.toHaveBeenCalled();
  });
});
