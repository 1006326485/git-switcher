import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("TerminalWorkspace smoke", () => {
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

  it("renders without throwing", async () => {
    render(
      <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
    );
    await waitFor(() => expect(screen.getByText("Terminal")).toBeInTheDocument());
    expect(screen.getByText("No terminals open")).toBeInTheDocument();
  });

  it("opens the Workspaces menu with items disabled while empty", async () => {
    render(
      <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
    );
    fireEvent.click(screen.getByRole("button", { name: "Workspaces" }));
    expect(screen.getByText("No workspaces saved")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Save Workspace/ })).toHaveAttribute(
      "aria-disabled",
      "true"
    );

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByText("No workspaces saved")).not.toBeInTheDocument()
    );
  });

  it("asks for confirmation before killing all terminals", async () => {
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
    fireEvent.click(await screen.findByRole("button", { name: "Kill All" }));
    expect(screen.getByText("Kill all terminals?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByText("Kill all terminals?")).not.toBeInTheDocument()
    );
    expect(api.terminalClose).not.toHaveBeenCalled();
  });
});
