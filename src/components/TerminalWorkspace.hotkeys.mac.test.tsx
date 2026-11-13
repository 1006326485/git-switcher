import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TerminalWorkspace from "./TerminalWorkspace";

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

  it("Cmd+N opens the New project dropdown, Ctrl+N does not", async () => {
    render(
      <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByText("No terminals open")).toBeInTheDocument());
    const root = document.querySelector(".window-root");
    expect(root).not.toBeNull();

    // Ctrl+N must keep reaching the shell on macOS: no dropdown.
    fireEvent.keyDown(root!, { key: "n", code: "KeyN", ctrlKey: true });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    // Cmd+N is the terminal's new-tab chord on macOS.
    fireEvent.keyDown(root!, { key: "n", code: "KeyN", metaKey: true });
    expect(await screen.findByRole("listbox")).toBeInTheDocument();
  });
});
