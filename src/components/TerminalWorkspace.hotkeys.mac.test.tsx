import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TerminalWorkspace from "./TerminalWorkspace";
import * as api from "../lib/tauri";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// macOS platform: CmdOrCtrl resolves to Cmd, so Ctrl+key must keep
// reaching the shell instead of being claimed by the terminal handler.
vi.mock("../lib/hotkey", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/hotkey")>();
  return { ...actual, detectMac: () => true };
});

vi.mock("../lib/tauri", () => ({
  terminalList: vi.fn(() => Promise.resolve([])),
  terminalOpen: vi.fn(() =>
    Promise.resolve({ id: "t-mac", cwd: "/tmp/demo", title: "zsh", projectTitle: "demo", projectKey: "/tmp/demo", exited: false })
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
  openInTerminal: vi.fn(),
  createRunPreset: vi.fn(),
  deleteRunPreset: vi.fn(),
  getSettings: vi.fn(() =>
    Promise.resolve({ theme: "light", terminal_hotkey: "CmdOrCtrl+Shift+`", terminal_hide_on_blur: false })
  ),
}));

describe("TerminalWorkspace hotkeys (macOS)", () => {
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

  it("Cmd+Shift+N opens the New picker; Ctrl+Shift+N and Ctrl+N do not", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([
      { id: "t1", cwd: "/tmp/demo", title: "zsh", projectTitle: "demo", projectKey: "/tmp/demo", exited: false },
    ]);
    render(
      <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
    );
    await screen.findByText("zsh");
    const root = document.querySelector(".window-root");
    expect(root).not.toBeNull();

    // Ctrl+Shift+N must keep reaching the shell on macOS: no menu.
    fireEvent.keyDown(root!, { key: "N", code: "KeyN", ctrlKey: true, shiftKey: true });
    // Ctrl+N likewise (it is the shell's next-history key on macOS).
    fireEvent.keyDown(root!, { key: "n", code: "KeyN", ctrlKey: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(api.terminalOpen).not.toHaveBeenCalled();

    // Cmd+Shift+N is the terminal's new-tab chord on macOS: it opens the
    // sidebar's New project picker.
    fireEvent.keyDown(root!, { key: "N", code: "KeyN", metaKey: true, shiftKey: true });
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });

  it("Cmd+N adds a tab in the current project once the workspace is awake", async () => {
    vi.mocked(api.terminalResize).mockResolvedValue(undefined as never);
    vi.mocked(api.terminalList).mockResolvedValue([
      { id: "t1", cwd: "/tmp/demo", title: "zsh", projectTitle: "demo", projectKey: "/tmp/demo", exited: false },
    ]);
    render(
      <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
    );
    await screen.findByText("zsh");
    await waitFor(() => expect(api.listProjects).toHaveBeenCalled());
    const root = document.querySelector(".window-root");
    expect(root).not.toBeNull();

    // Dispatched on the window body, as right after a summon: focus has not
    // been moved into the panel yet.
    fireEvent.keyDown(document.body, { key: "n", code: "KeyN", metaKey: true });

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
});
