import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TerminalWorkspace from "./TerminalWorkspace";
import * as api from "../lib/tauri";

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
        status: { modified: 0, staged: 0, untracked: 0, conflicted: 0, ahead: 0, behind: 0 },
        group: { id: "g1", name: "g", color: null, sort_order: 0, created_at: "" },
        stash_count: 0,
      },
    ])
  ),
  openInFinder: vi.fn(),
  openInTerminal: vi.fn(),
  switchBranch: vi.fn(() => Promise.resolve({})),
  createRunPreset: vi.fn(),
  deleteRunPreset: vi.fn(),
  getSettings: vi.fn(() =>
    Promise.resolve({ theme: "light", terminal_hotkey: "CmdOrCtrl+Shift+`", terminal_hide_on_blur: false })
  ),
}));

/**
 * Phase 2 notes: the terminal handler resolves CmdOrCtrl platform-aware
 * (Cmd on macOS, Ctrl elsewhere) and owns a chord only when focus is
 * inside the workspace's own DOM. jsdom is a non-Mac environment, so the
 * tests below use Ctrl; the macOS (Cmd) path is covered by
 * TerminalWorkspace.hotkeys.mac.test.tsx.
 */
function workspaceRoot(): Element {
  const root = document.querySelector(".window-root");
  if (!root) throw new Error("workspace root not rendered");
  return root;
}

/**
 * Every mount in these tests loads settings more than once (useTheme plus
 * the workspace's own binding load), so a one-shot override would be
 * consumed by the wrong caller. Services with getSettings are queued.
 */
function queueSettings(bindings: Record<string, string>) {
  const value = {
    theme: "light",
    terminal_hotkey: "CmdOrCtrl+Shift+`",
    terminal_hide_on_blur: false,
    ...bindings,
  } as never;
  vi.mocked(api.getSettings).mockResolvedValue(value);
}

function renderWorkspace() {
  render(<TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />);
}

/** One live tab: the New-terminal "+" lives in the tab bar (needs a tab). */
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

/** How many tabs the workspace has asked the backend to open. */
function openCalls(): number {
  return vi.mocked(api.terminalOpen).mock.calls.length;
}

describe("TerminalWorkspace hotkeys", () => {
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

  it("Ctrl+Shift+N opens the sidebar's New project picker", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    renderWorkspace();
    await screen.findByText("zsh");
    await waitFor(() => expect(api.listProjects).toHaveBeenCalled());

    fireEvent.keyDown(workspaceRoot(), { key: "N", code: "KeyN", ctrlKey: true, shiftKey: true });

    const menu = await screen.findByRole("listbox");
    // Home is still the first row of the picker.
    expect(within(menu).getAllByRole("option")[0]).toHaveTextContent("Home — default shell");
    // Opening the menu creates nothing by itself.
    expect(api.terminalOpen).not.toHaveBeenCalled();
  });

  it("Ctrl+N adds one more tab in the current project, without a menu", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([
      {
        id: "t1",
        cwd: "/tmp/demo",
        title: "zsh",
        projectTitle: "demo",
        projectKey: "/tmp/demo",
        command: undefined,
        exited: false,
      },
    ]);
    renderWorkspace();
    await screen.findByText("zsh");
    await waitFor(() => expect(api.listProjects).toHaveBeenCalled());

    fireEvent.keyDown(workspaceRoot(), { key: "n", code: "KeyN", ctrlKey: true });

    // Same action as the tab bar's "+": a new tab in the project on screen.
    await waitFor(() =>
      expect(api.terminalOpen).toHaveBeenCalledWith(
        "/tmp/demo",
        80,
        24,
        expect.objectContaining({ projectTitle: "demo" })
      )
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("acts on both new-terminal chords when focus is outside the workspace", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    renderWorkspace();
    await screen.findByText("zsh");
    const before = openCalls();

    // Right after a summon focus sits outside the panel; the chords must
    // still answer before anything inside it is clicked.
    fireEvent.keyDown(document.body, { key: "N", code: "KeyN", ctrlKey: true, shiftKey: true });
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    // The picker itself creates nothing.
    expect(openCalls()).toBe(before);
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());

    // CmdOrCtrl+N is the tab-bar "+" instead: one more tab in the project.
    fireEvent.keyDown(document.body, { key: "n", code: "KeyN", ctrlKey: true });
    await waitFor(() => expect(openCalls()).toBe(before + 1));
  });

  it("uses rebound new-terminal bindings from settings", async () => {
    queueSettings({
      in_app_terminal_new_tab: "CmdOrCtrl+T",
      in_app_terminal_new_tab_in_project: "CmdOrCtrl+Alt+N",
    });
    renderWorkspace();
    await waitFor(() => expect(screen.getByText("No terminals open")).toBeInTheDocument());
    // Wait for the async settings load to land before pressing keys, or
    // the still-default bindings would answer first.
    await waitFor(() => expect(api.getSettings).toHaveBeenCalled());
    await act(async () => {});

    // The old chord no longer opens the New picker…
    fireEvent.keyDown(workspaceRoot(), { key: "N", code: "KeyN", ctrlKey: true, shiftKey: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // …while the rebound one does.
    fireEvent.keyDown(workspaceRoot(), { key: "t", code: "KeyT", ctrlKey: true });
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());

    // The rebound "new terminal in current project" chord opens a tab.
    fireEvent.keyDown(workspaceRoot(), { key: "n", code: "KeyN", ctrlKey: true, altKey: true });
    await waitFor(() => expect(api.terminalOpen).toHaveBeenCalled());
  });

  it("Ctrl+W closes the active terminal tab", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([
      {
        id: "t1",
        cwd: "/tmp/demo",
        title: "zsh",
        projectTitle: "demo",
        projectKey: "/tmp/demo",
        command: undefined,
        exited: false,
      },
    ]);
    renderWorkspace();
    await screen.findByText("zsh");

    fireEvent.keyDown(workspaceRoot(), { key: "w", code: "KeyW", ctrlKey: true });

    await waitFor(() => expect(api.terminalClose).toHaveBeenCalledWith("t1"));
  });
});
