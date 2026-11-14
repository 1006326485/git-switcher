import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TerminalWorkspace from "./TerminalWorkspace";
import * as api from "../lib/tauri";
import type { ProjectDetail } from "../lib/types";

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
  listProjects: vi.fn(() => Promise.resolve([])),
  switchBranch: vi.fn((path: string, branch: string) => Promise.resolve(makeDetail(path, branch))),
  openInFinder: vi.fn(),
  openInTerminal: vi.fn(),
  createRunPreset: vi.fn(),
  deleteRunPreset: vi.fn(),
  getSettings: vi.fn(() =>
    Promise.resolve({ theme: "light", terminal_hotkey: "CmdOrCtrl+Shift+`", terminal_hide_on_blur: false })
  ),
}));

function makeDetail(
  path: string,
  branch = "main",
  status: { modified?: number; staged?: number; untracked?: number } = {}
): ProjectDetail {
  return {
    project: {
      id: `id-${path}`,
      name: path.split("/").pop() || path,
      path,
      alias: null,
      sort_order: 0,
      group_id: "g1",
      last_active_at: null,
      last_commit_hash: null,
      created_at: "",
      updated_at: "",
    },
    current_branch: branch,
    branches: [
      { name: "main", is_current: branch === "main", is_remote: false, is_merged: true, is_tag: false },
      { name: "dev", is_current: branch === "dev", is_remote: false, is_merged: false, is_tag: false },
    ],
    status: {
      modified: status.modified ?? 0,
      staged: status.staged ?? 0,
      untracked: status.untracked ?? 0,
      conflicted: 0,
      ahead: 0,
      behind: 0,
    },
    group: { id: "g1", name: "g", color: null, sort_order: 0, created_at: "" },
    stash_count: 0,
  } as ProjectDetail;
}

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

function renderWorkspace() {
  render(<TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />);
}

function sidebarEntry(cwd: string): HTMLElement {
  const el = document.querySelector(`div[title="${cwd}"]`);
  if (!(el instanceof HTMLElement)) throw new Error(`sidebar entry not found: ${cwd}`);
  return el;
}

describe("TerminalWorkspace tab-bar +", () => {
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
    vi.mocked(api.listProjects).mockResolvedValue([makeDetail("/tmp/demo")]);
  });

  it("opens a tab in the CURRENT project and no menu", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    renderWorkspace();
    await screen.findByText("zsh");

    // The tab bar's "+" keeps its original label; it opens one more tab in
    // the project in view and its tooltip names the chord for the same thing.
    const plus = screen.getByRole("button", { name: "New terminal" });
    // The tooltip names the active new-tab binding (⌘⇧N on macOS).
    expect(plus.getAttribute("title")).toMatch(/(⌘|Ctrl\+)⇧?Shift\+?N$/);
    fireEvent.click(plus);
    await waitFor(() =>
      expect(api.terminalOpen).toHaveBeenCalledWith(
        "/tmp/demo",
        80,
        24,
        expect.objectContaining({ projectTitle: "demo" })
      )
    );
    // It is an action, not a picker.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens the tab in the project in view, not in another project", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([
      { id: "t1", cwd: "/tmp/demo", title: "zsh", projectTitle: "demo", projectKey: "/tmp/demo", exited: false },
      { id: "t2", cwd: "/tmp/other", title: "zsh", projectTitle: "other", projectKey: "/tmp/other", exited: false },
    ]);
    vi.mocked(api.listProjects).mockResolvedValue([makeDetail("/tmp/demo"), makeDetail("/tmp/other")]);
    renderWorkspace();
    await screen.findAllByText("zsh");

    fireEvent.click(sidebarEntry("/tmp/other"));
    fireEvent.click(screen.getByRole("button", { name: "New terminal" }));
    await waitFor(() =>
      expect(api.terminalOpen).toHaveBeenCalledWith(
        "/tmp/other",
        80,
        24,
        expect.objectContaining({ projectTitle: "other" })
      )
    );
  });

  it("lives in the tab bar, never in the sidebar or the header", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    renderWorkspace();
    await screen.findByText("zsh");

    // The "+" sits in the tab bar. It has no test id of its own (that would
    // be a new thing in the layout), so find it by its aria-label.
    const triggers = screen.getAllByRole("button", { name: "New terminal" });
    expect(triggers).toHaveLength(1);
    expect(triggers[0].querySelector("svg")).not.toBeNull();
    const tabbar = triggers[0].parentElement;
    expect(tabbar).not.toBeNull();
    // It is not in the sidebar (which carries the "New" project picker).
    expect(screen.getByRole("button", { name: "New terminal in project" })).not.toBeNull();
    expect(tabbar!.querySelector('[aria-label="New terminal in project"]')).toBeNull();

    // ⌘N is the tab bar's "+" — a new tab in the project, no picker.
    fireEvent.keyDown(document.querySelector(".window-root")!, { key: "n", code: "KeyN", ctrlKey: true });
    await waitFor(() =>
      expect(api.terminalOpen).toHaveBeenCalledWith("/tmp/demo", 80, 24, expect.anything())
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("keeps the branch switch reachable in a headerless host, without moving anything else", async () => {
    // The summoned window draws its own title bar (hideHeader): the branch
    // control the header would carry moves above the sidebar list. Every
    // other control stays where it was.
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    vi.mocked(api.listProjects).mockResolvedValue([makeDetail("/tmp/demo", "main")]);
    render(
      <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} hideHeader />
    );
    await screen.findByText("zsh");

    expect(screen.queryByRole("heading", { name: "Terminal" })).not.toBeInTheDocument();
    const pill = await screen.findByRole("button", { name: "Branch: main. Click to switch." });
    // Right above the "Projects" header, inside the sidebar panel.
    expect(pill.closest(".app-panel")).toBe(
      screen.getByRole("button", { name: "New terminal in project" }).closest(".app-panel")
    );

    // The New project picker is still in the sidebar header, above the
    // project list, and still offers Home as its first row.
    const picker = screen.getByRole("button", { name: "New terminal in project" });
    expect(picker.closest(".app-panel")).toBe(pill.closest(".app-panel"));
    fireEvent.click(picker);
    const menu = await screen.findByRole("listbox");
    expect(within(menu).getAllByRole("option")[0]).toHaveTextContent("Home — default shell");
  });
});

describe("TerminalWorkspace quick run", () => {
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
    vi.mocked(api.listProjects).mockResolvedValue([makeDetail("/tmp/demo")]);
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    // clearAllMocks keeps previous implementations; start each quick-run test
    // from a known empty command list unless the test says otherwise.
    vi.mocked(api.listProjectScripts).mockResolvedValue([]);
  });

  it("keeps the ▶ reachable while the list loads, then hides it when there is nothing to run", async () => {
    let resolveScripts: (v: { name: string; command: string }[]) => void = () => {};
    const pending = new Promise<{ name: string; command: string }[]>((resolve) => {
      resolveScripts = resolve;
    });
    vi.mocked(api.listProjectScripts).mockReturnValue(pending as never);
    renderWorkspace();
    await screen.findByText("zsh");

    // Hover preloads the command list; the trigger stays mounted while it is
    // still loading (an unknown list is not an empty one).
    fireEvent.mouseEnter(sidebarEntry("/tmp/demo"));
    await waitFor(() => expect(api.listProjectScripts).toHaveBeenCalledWith("/tmp/demo"));
    expect(screen.getByRole("button", { name: "Quick run in demo" })).toBeInTheDocument();

    // The list resolves empty: nothing to run, so the trigger goes away.
    resolveScripts([]);
    await waitFor(
      () =>
        expect(
          screen.queryByRole("button", { name: "Quick run in demo" })
        ).not.toBeInTheDocument(),
      { timeout: 1500 }
    );
  });

  it("stays available while the list loads and opens as a searchable listbox", async () => {
    let resolveScripts: (v: { name: string; command: string }[]) => void = () => {};
    const pending = new Promise<{ name: string; command: string }[]>((resolve) => {
      resolveScripts = resolve;
    });
    vi.mocked(api.listProjectScripts).mockReturnValue(pending as never);
    renderWorkspace();
    await screen.findByText("zsh");
    fireEvent.mouseEnter(sidebarEntry("/tmp/demo"));
    await waitFor(() => expect(api.listProjectScripts).toHaveBeenCalledWith("/tmp/demo"));

    const button = screen.getByRole("button", { name: "Quick run in demo" });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    const listbox = await screen.findByRole("listbox");
    // The search field is part of the picker itself, from the very first
    // open and even for a short list.
    expect(within(listbox.parentElement!).getByRole("textbox")).toBeInTheDocument();
    expect(await screen.findByText("Loading commands…")).toBeInTheDocument();

    resolveScripts([{ name: "dev", command: "npm run dev" }]);
    const item = await screen.findByRole("option", { name: /dev/ });
    expect(item).toHaveTextContent("npm run dev");

    fireEvent.click(item);
    await waitFor(() =>
      expect(api.terminalOpen).toHaveBeenCalledWith(
        "/tmp/demo",
        80,
        24,
        expect.objectContaining({ title: "dev" })
      )
    );
  });

  it("filters by name or command and Enter runs the first match", async () => {
    vi.mocked(api.listProjectScripts).mockResolvedValue([
      { name: "dev", command: "npm run dev" },
      { name: "build", command: "npm run build" },
      { name: "test", command: "npm test" },
    ]);
    renderWorkspace();
    await screen.findByText("zsh");
    fireEvent.mouseEnter(sidebarEntry("/tmp/demo"));
    await waitFor(() => expect(api.listProjectScripts).toHaveBeenCalledWith("/tmp/demo"));
    const button = screen.getByRole("button", { name: "Quick run in demo" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    const search = await screen.findByRole("textbox", { name: "Search commands" });
    // The acronym matches build's name (and its command), not dev/test.
    fireEvent.change(search, { target: { value: "bld" } });
    await waitFor(() =>
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
        expect.stringContaining("build"),
      ])
    );

    // Typing a command fragment filters by the command line as well.
    fireEvent.change(search, { target: { value: "npm test" } });
    await waitFor(() =>
      expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
        expect.stringContaining("test"),
      ])
    );

    // And Enter runs the highlighted (first) match, close the picker.
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() =>
      expect(api.terminalOpen).toHaveBeenCalledWith(
        "/tmp/demo",
        80,
        24,
        expect.objectContaining({ title: "test", command: "npm test" })
      )
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("highlights the first command on open so Enter runs it without typing", async () => {
    vi.mocked(api.listProjectScripts).mockResolvedValue([
      { name: "dev", command: "npm run dev" },
      { name: "build", command: "npm run build" },
    ]);
    renderWorkspace();
    await screen.findByText("zsh");
    fireEvent.mouseEnter(sidebarEntry("/tmp/demo"));
    await waitFor(() => expect(api.listProjectScripts).toHaveBeenCalledWith("/tmp/demo"));
    const button = screen.getByRole("button", { name: "Quick run in demo" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    const search = await screen.findByRole("textbox", { name: "Search commands" });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() =>
      expect(api.terminalOpen).toHaveBeenCalledWith(
        "/tmp/demo",
        80,
        24,
        expect.objectContaining({ title: "dev" })
      )
    );
  });

  it("moves the highlight with the arrow keys before Enter runs it", async () => {
    vi.mocked(api.listProjectScripts).mockResolvedValue([
      { name: "dev", command: "npm run dev" },
      { name: "build", command: "npm run build" },
    ]);
    renderWorkspace();
    await screen.findByText("zsh");
    fireEvent.mouseEnter(sidebarEntry("/tmp/demo"));
    await waitFor(() => expect(api.listProjectScripts).toHaveBeenCalledWith("/tmp/demo"));
    const button = screen.getByRole("button", { name: "Quick run in demo" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    const search = await screen.findByRole("textbox", { name: "Search commands" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });
    await waitFor(() =>
      expect(api.terminalOpen).toHaveBeenCalledWith(
        "/tmp/demo",
        80,
        24,
        expect.objectContaining({ title: "build" })
      )
    );
  });

  it("says when the search matches no command", async () => {
    vi.mocked(api.listProjectScripts).mockResolvedValue([
      { name: "dev", command: "npm run dev" },
      { name: "build", command: "npm run build" },
    ]);
    renderWorkspace();
    await screen.findByText("zsh");
    fireEvent.mouseEnter(sidebarEntry("/tmp/demo"));
    await waitFor(() => expect(api.listProjectScripts).toHaveBeenCalledWith("/tmp/demo"));
    const button = screen.getByRole("button", { name: "Quick run in demo" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    const search = await screen.findByRole("textbox", { name: "Search commands" });
    fireEvent.change(search, { target: { value: "zzzz" } });
    expect(await screen.findByText("No matching commands")).toBeInTheDocument();
  });

  it("Escape closes the quick-run list without running anything", async () => {
    vi.mocked(api.listProjectScripts).mockResolvedValue([
      { name: "dev", command: "npm run dev" },
      { name: "build", command: "npm run build" },
    ]);
    renderWorkspace();
    await screen.findByText("zsh");

    fireEvent.mouseEnter(sidebarEntry("/tmp/demo"));
    await waitFor(() => expect(api.listProjectScripts).toHaveBeenCalledWith("/tmp/demo"));
    const button = screen.getByRole("button", { name: "Quick run in demo" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);

    expect(await screen.findByRole("option", { name: /build/ })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("option", { name: /build/ })).not.toBeInTheDocument()
    );
    // The trigger gets focus back, like the app's other dropdowns.
    await waitFor(() => expect(button).toHaveFocus());
    expect(api.terminalOpen).not.toHaveBeenCalled();
  });

  it("renders no ▶ at all when the project is known to have no commands", async () => {
    renderWorkspace();
    await screen.findByText("zsh");
    fireEvent.mouseEnter(sidebarEntry("/tmp/demo"));
    await waitFor(() => expect(api.listProjectScripts).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Quick run in demo" })
      ).not.toBeInTheDocument()
    );
  });
});

describe("TerminalWorkspace branch switching", () => {
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
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
  });

  it("shows the branch of the project in view and switches it from the header", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([makeDetail("/tmp/demo", "main")]);
    let listCalls = 0;
    vi.mocked(api.listProjects).mockImplementation(() => {
      listCalls += 1;
      return Promise.resolve([makeDetail("/tmp/demo", listCalls === 1 ? "main" : "dev")]);
    });
    renderWorkspace();
    await screen.findByText("zsh");

    const pill = await screen.findByRole("button", { name: "Branch: main. Click to switch." });
    fireEvent.click(pill);
    const list = await screen.findByRole("listbox", { name: "Branches" });
    fireEvent.click(within(list).getByRole("option", { name: /^dev/ }));

    await waitFor(() => expect(api.switchBranch).toHaveBeenCalledWith("/tmp/demo", "dev"));
    // Closing the listbox is enough for the pill to update.
    // The pill shows the checked-out branch as soon as the checkout resolves.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Branch: dev. Click to switch." })).toBeInTheDocument()
    );
  });

  it("asks before switching a project with uncommitted changes", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([
      makeDetail("/tmp/demo", "main", { modified: 2, untracked: 1 }),
    ]);
    renderWorkspace();
    await screen.findByText("zsh");

    fireEvent.click(await screen.findByRole("button", { name: "Branch: main. Click to switch." }));
    const list = await screen.findByRole("listbox", { name: "Branches" });
    fireEvent.click(within(list).getByRole("option", { name: /^dev/ }));

    expect(await screen.findByText(/uncommitted changes/)).toBeInTheDocument();
    expect(api.switchBranch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Switch branch" }));
    await waitFor(() => expect(api.switchBranch).toHaveBeenCalledWith("/tmp/demo", "dev"));
  });
});
