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
  terminalReorder: vi.fn(() => Promise.resolve()),
  terminalSetTitle: vi.fn(() => Promise.resolve()),
  listRunPresets: vi.fn(() => Promise.resolve([])),
  listCustomCommands: vi.fn(() =>
    Promise.resolve([
      {
        id: "c1",
        name: "dev",
        command: "pnpm run dev:web",
        shortcut: null,
        project_path: null,
        sort_order: 0,
        created_at: "",
      },
    ])
  ),
  listProjectScripts: vi.fn(() => Promise.resolve([{ name: "test", command: "pnpm test" }])),
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
    // The menu now says it is still reading before it claims the list is
    // empty, so the empty state lands a tick after the click.
    expect(await screen.findByText("No workspaces saved")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Save Workspace/ })).toHaveAttribute(
      "aria-disabled",
      "true"
    );

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByText("No workspaces saved")).not.toBeInTheDocument()
    );
  });

  it("blank slate lists projects with their quick-run chips", async () => {
    render(
      <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
    );
    // Project row from listProjects …
    expect(await screen.findByText("/tmp/demo")).toBeInTheDocument();
    // … with that project's own quick-run chips (saved + scripts).
    const chip = await screen.findByRole("button", { name: "pnpm run dev:web" });
    fireEvent.click(chip);
    await waitFor(() => expect(api.terminalOpen).toHaveBeenCalled());
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

  it("wires the tab strip and the sidebar groups as drag-sortable lists", async () => {
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
      {
        id: "t2",
        cwd: "/tmp/demo",
        title: "node",
        projectTitle: "demo",
        projectKey: "/tmp/demo",
        command: undefined,
        exited: false,
      },
    ]);
    render(
      <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
    );

    // Two tabs of the shown project plus its one sidebar group: every one of
    // them is a sortable activator, so drag (and Space+arrow) can reorder it.
    await waitFor(() =>
      expect(document.querySelectorAll('[aria-roledescription="sortable"]')).toHaveLength(3)
    );
    expect(document.querySelectorAll("[data-tab-id]")).toHaveLength(2);
    expect(document.querySelectorAll("[data-project-key]")).toHaveLength(1);
    // The tab body still selects on a plain click — dragging is an addition,
    // not a replacement for the click.
    fireEvent.click(await screen.findByRole("button", { name: "node" }));
    expect(api.terminalReorder).not.toHaveBeenCalled();
  });

  it("gives every tab a fixed width and scrolls the strip instead of squeezing", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(
      ["t1", "t2", "t3"].map((id) => ({
        id,
        cwd: "/tmp/demo",
        title: id,
        projectTitle: "demo",
        projectKey: "/tmp/demo",
        command: undefined,
        exited: false,
      }))
    );
    render(
      <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
    );

    const strip = await screen.findByTestId("terminal-tab-strip");
    // The strip is the only thing that scrolls; its scrollbar is hidden, so the
    // edge fades and arrows carry the affordance instead of a track.
    expect(strip.className).toContain("overflow-x-auto");
    expect(strip.className).toContain("no-scrollbar");

    const tabs = [...document.querySelectorAll<HTMLElement>("[data-tab-id]")];
    expect(tabs).toHaveLength(3);
    for (const tab of tabs) {
      expect(tab.className).toContain("w-[var(--term-tab-width)]");
      expect(tab.className).toContain("shrink-0");
    }

    // "+" and the ⌘←→ badge sit outside the scroller: a full strip must never
    // push the one control that gets you out of a full strip off-screen.
    expect(strip.contains(screen.getByRole("button", { name: "New terminal" }))).toBe(false);
  });
  it("reveals a tab's whole title on hover instead of a native tooltip", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([
      {
        id: "t1",
        cwd: "/tmp/demo",
        title: "/Users/spire/projects/git-switcher — npm run build",
        projectTitle: "demo",
        projectKey: "/tmp/demo",
        command: undefined,
        exited: false,
      },
    ]);
    render(
      <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
    );

    const tab = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('[data-tab-id="t1"]');
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });
    // A fixed width elides the middle, so the native attribute is gone: it
    // would stack a browser tooltip underneath the app's own.
    expect(tab.hasAttribute("title")).toBe(false);

    fireEvent.pointerOver(tab);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("/Users/spire/projects/git-switcher — npm run build");
    expect(tooltip).toHaveTextContent("Middle-click to close");

    fireEvent.pointerOut(tab);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });
});
