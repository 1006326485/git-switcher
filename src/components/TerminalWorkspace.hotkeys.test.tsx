import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TerminalWorkspace from "./TerminalWorkspace";
import * as api from "../lib/tauri";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("../lib/tauri", () => ({
  terminalList: vi.fn(() => Promise.resolve([])),
  terminalOpen: vi.fn(),
  terminalWrite: vi.fn(),
  terminalResize: vi.fn(),
  terminalClose: vi.fn(),
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
  openInTerminal: vi.fn(),
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

  it("Ctrl+N opens the New project dropdown", async () => {
    render(
      <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByText("No terminals open")).toBeInTheDocument());

    fireEvent.keyDown(workspaceRoot(), { key: "n", code: "KeyN", ctrlKey: true });

    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    // "demo" also renders in the blank-slate project row — scope to the dropdown.
    expect(await screen.findByRole("listbox")).toHaveTextContent("demo");
  });

  it("ignores terminal chords when focus is outside the workspace", async () => {
    render(
      <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByText("No terminals open")).toBeInTheDocument());

    // Focus in the main window (outside the panel): the chord belongs to
    // the app, not the terminal, so no dropdown opens.
    fireEvent.keyDown(document.body, { key: "n", code: "KeyN", ctrlKey: true });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    // Same chord with focus inside the workspace: terminal owns it.
    fireEvent.keyDown(workspaceRoot(), { key: "n", code: "KeyN", ctrlKey: true });
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("uses a rebound new-tab binding from settings", async () => {
    // Queued twice: useTheme loads settings on mount too, and consumes
    // the first one-shot value before the workspace's own load effect.
    const rebound = {
      theme: "light",
      terminal_hotkey: "CmdOrCtrl+Shift+`",
      terminal_hide_on_blur: false,
      in_app_terminal_new_tab: "CmdOrCtrl+Shift+N",
    } as never;
    vi.mocked(api.getSettings).mockResolvedValueOnce(rebound);
    vi.mocked(api.getSettings).mockResolvedValueOnce(rebound);
    render(
      <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByText("No terminals open")).toBeInTheDocument());
    // Wait for the async settings load to land before pressing keys, or
    // the still-default bindings would answer first.
    await waitFor(() => expect(api.getSettings).toHaveBeenCalled());
    await act(async () => {});

    // The old default no longer opens anything…
    fireEvent.keyDown(workspaceRoot(), { key: "n", code: "KeyN", ctrlKey: true });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    // …while the rebound chord does.
    fireEvent.keyDown(workspaceRoot(), { key: "n", code: "KeyN", ctrlKey: true, shiftKey: true });
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
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
    render(
      <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
    );
    await screen.findByText("zsh");

    fireEvent.keyDown(workspaceRoot(), { key: "w", code: "KeyW", ctrlKey: true });

    await waitFor(() => expect(api.terminalClose).toHaveBeenCalledWith("t1"));
  });
});
