import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TerminalWorkspace from "./TerminalWorkspace";
import * as api from "../lib/tauri";

type Handler = (event: { payload: unknown }) => void;

const listeners = new Map<string, Handler>();

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((name: string, handler: Handler) => {
    listeners.set(name, handler);
    return Promise.resolve(() => listeners.delete(name));
  }),
}));

vi.mock("../lib/tauri", () => ({
  terminalList: vi.fn(() => Promise.resolve([])),
  terminalOpen: vi.fn(() =>
    Promise.resolve({
      id: "t-new",
      cwd: "/tmp/demo",
      title: "zsh",
      projectTitle: "demo",
      projectKey: "/tmp/demo",
      exited: false,
    })
  ),
  terminalWrite: vi.fn(() => Promise.resolve()),
  terminalResize: vi.fn(() => Promise.resolve()),
  terminalClose: vi.fn(() => Promise.resolve()),
  listRunPresets: vi.fn(() => Promise.resolve([])),
  listCustomCommands: vi.fn(() => Promise.resolve([])),
  listProjectScripts: vi.fn(() => Promise.resolve([])),
  listProjects: vi.fn(() => Promise.resolve([])),
  switchBranch: vi.fn(() => Promise.resolve({})),
  openInFinder: vi.fn(),
  openInTerminal: vi.fn(),
  createRunPreset: vi.fn(),
  deleteRunPreset: vi.fn(),
  getSettings: vi.fn(() =>
    Promise.resolve({ theme: "light", terminal_hotkey: "CmdOrCtrl+Shift+`", terminal_hide_on_blur: false })
  ),
}));

const liveSession = {
  id: "t1",
  cwd: "/tmp/demo",
  title: "zsh",
  projectTitle: "demo",
  projectKey: "/tmp/demo",
  command: undefined,
  exited: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderWorkspace() {
  return render(
    <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
  );
}

/** Base64 of "ready\r\n" — the pty's first bytes for a session. */
const FIRST_OUTPUT = btoa("ready\r\n");

async function emitData(id: string) {
  await waitFor(() => expect(listeners.has("terminal-data")).toBe(true));
  act(() => listeners.get("terminal-data")!({ payload: { id, data: FIRST_OUTPUT } }));
}

beforeEach(() => {
  listeners.clear();
  vi.clearAllMocks();
  // `clearAllMocks` keeps implementations, so a case that parked one of these
  // on a never-resolving promise leaked into every later case. Each test now
  // starts from a resolved, empty backend.
  vi.mocked(api.terminalList).mockResolvedValue([]);
  vi.mocked(api.listProjects).mockResolvedValue([]);
  vi.mocked(api.listCustomCommands).mockResolvedValue([]);
  vi.mocked(api.listProjectScripts).mockResolvedValue([]);
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

describe("TerminalWorkspace session bootstrap", () => {
  it("shows the restoring skeleton instead of an empty slate while the list is in flight", async () => {
    const gate = deferred<unknown[]>();
    vi.mocked(api.terminalList).mockReturnValue(gate.promise as never);

    renderWorkspace();

    // Regression: this window used to claim "No terminals open" (and offer to
    // create one) before it had even asked the backend.
    expect(screen.getByTestId("terminal-restoring-skeleton")).toBeInTheDocument();
    expect(screen.queryByText("No terminals open")).toBeNull();

    await act(async () => {
      gate.resolve([]);
      await gate.promise;
    });

    await waitFor(() =>
      expect(screen.queryByTestId("terminal-restoring-skeleton")).toBeNull()
    );
    // Now genuinely empty → the real blank slate is appropriate.
    expect(screen.getByText("No terminals open")).toBeInTheDocument();
  });

  it("surfaces a failed restore with a working retry", async () => {
    vi.mocked(api.terminalList).mockRejectedValueOnce(new Error("backend offline"));

    renderWorkspace();

    expect(await screen.findByText("Couldn't restore terminal sessions")).toBeInTheDocument();
    expect(screen.getByText("backend offline")).toBeInTheDocument();
    // A swallowed failure used to leave the blank slate up forever.
    expect(screen.queryByText("No terminals open")).toBeNull();

    vi.mocked(api.terminalList).mockResolvedValue([liveSession]);
    await act(async () => {
      screen.getByRole("button", { name: "Retry" }).click();
    });

    expect(await screen.findByText("zsh")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't restore terminal sessions")).toBeNull();
  });
});

describe("TerminalWorkspace blank-slate cards", () => {
  it("reserves space for quick commands while they load, instead of collapsing", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([]);
    vi.mocked(api.listProjects).mockResolvedValue([
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
    ] as never);
    // Commands never arrive: the card must still show it is waiting.
    vi.mocked(api.listCustomCommands).mockReturnValue(new Promise(() => {}) as never);

    renderWorkspace();

    expect(await screen.findByTestId("terminal-blank-cmd-skeleton")).toBeInTheDocument();
  });
});

describe("TerminalWorkspace project list", () => {
  const demoProject = {
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
    status: {
      modified: 0,
      staged: 0,
      unmodified: 0,
      untracked: 0,
      conflicted: 0,
      ahead: 0,
      behind: 0,
    },
    group: { id: "g1", name: "g", color: null, sort_order: 0, created_at: "" },
    stash_count: 0,
  };

  it("reads the project list instead of showing the bare New Terminal fallback", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([]);
    const gate = deferred<unknown[]>();
    vi.mocked(api.listProjects).mockReturnValue(gate.promise as never);

    renderWorkspace();

    // Regression: a cold start with no sessions rendered the single "New
    // Terminal" button — indistinguishable from "this account has no
    // projects" while the read was still in flight.
    const skeleton = await screen.findByTestId("terminal-blank-projects-skeleton");
    expect(screen.queryByRole("button", { name: "New Terminal" })).toBeNull();
    // Three card-shaped placeholders, and no caption above them: the skeleton
    // itself is the message.
    expect(skeleton.firstElementChild?.children).toHaveLength(3);
    expect(screen.queryByText("Loading projects…")).toBeNull();

    await act(async () => {
      gate.resolve([demoProject]);
      await gate.promise;
    });

    await waitFor(() =>
      expect(screen.queryByTestId("terminal-blank-projects-skeleton")).toBeNull()
    );
    expect(await screen.findByText("demo")).toBeInTheDocument();
  });

  it("shows the pending read inside the New dropdown instead of just Home", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([]);
    const gate = deferred<unknown[]>();
    vi.mocked(api.listProjects).mockReturnValue(gate.promise as never);

    renderWorkspace();
    await screen.findByTestId("terminal-blank-projects-skeleton");

    fireEvent.click(screen.getByRole("button", { name: "New terminal in project" }));
    const listbox = await screen.findByRole("listbox");
    expect(within(listbox).getByText("Loading projects…")).toBeInTheDocument();
    // Home is static and real: it must stay pickable while the rest loads.
    expect(within(listbox).getByRole("option", { name: /Home/ })).toBeInTheDocument();

    await act(async () => {
      gate.resolve([demoProject]);
      await gate.promise;
    });

    await waitFor(() => expect(within(listbox).queryByText("Loading projects…")).toBeNull());
    expect(within(listbox).getByRole("option", { name: /demo/ })).toBeInTheDocument();
  });

  it("reports a failed project read and retries on demand", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([]);
    vi.mocked(api.listProjects).mockRejectedValueOnce(new Error("ipc down"));

    renderWorkspace();

    expect(await screen.findByText("Couldn't load the project list")).toBeInTheDocument();

    vi.mocked(api.listProjects).mockResolvedValue([demoProject] as never);
    act(() => screen.getByRole("button", { name: "Retry" }).click());

    expect(await screen.findByText("demo")).toBeInTheDocument();
  });
});

describe("TerminalWorkspace pane readiness", () => {
  it("covers a fresh pane until the shell prints its first byte", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([liveSession]);

    renderWorkspace();
    await screen.findByText("zsh");

    // The canvas is mounted but blank at this point; without the cover it is
    // indistinguishable from a hung shell.
    expect(screen.getByTestId("terminal-starting-t1")).toBeInTheDocument();

    await emitData("t1");

    await waitFor(() => expect(screen.queryByTestId("terminal-starting-t1")).toBeNull());
  });

  it("lifts the cover on its own when the shell stays silent", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([liveSession]);

    renderWorkspace();
    await screen.findByText("zsh");
    expect(screen.getByTestId("terminal-starting-t1")).toBeInTheDocument();

    // `sleep 60` prints nothing for a minute. A cover that never lifts would
    // hide both the prompt and everything the user types, so it gives up.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 3200));
    });

    await waitFor(() => expect(screen.queryByTestId("terminal-starting-t1")).toBeNull(), {
      timeout: 2000,
    });
  }, 10_000);

  it("never covers a session that already exited", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([{ ...liveSession, exited: true }]);

    renderWorkspace();
    await screen.findByText("zsh");

    // An exited session will never print again — a permanent "Starting shell…"
    // would be a lie, so the overlay must not appear at all.
    await waitFor(() => expect(screen.queryByTestId("terminal-starting-t1")).toBeNull());
  });
});
