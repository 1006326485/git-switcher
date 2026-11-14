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
 * Wake regression: after the terminal panel is summoned, focus never moved
 * into the workspace, so the chords used to be dead until the user clicked a
 * terminal. jsdom is non-macOS here, so ⌘ == Ctrl; the Cmd path follows from
 * the same bindings (see TerminalWorkspace.hotkeys.mac.test.tsx).
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

const otherSession = {
  id: "t2",
  cwd: "/tmp/demo",
  title: "node",
  projectTitle: "demo",
  projectKey: "/tmp/demo",
  command: undefined,
  exited: false,
};

function workspaceRoot(): HTMLElement {
  const root = document.querySelector(".window-root");
  if (!(root instanceof HTMLElement)) throw new Error("workspace root not rendered");
  return root;
}

/** Focus away from the workspace, the way a summon leaves it. */
function parkFocusOutside() {
  (document.body as HTMLElement).tabIndex = -1;
  (document.body as HTMLElement).focus();
  expect(workspaceRoot().contains(document.activeElement)).toBe(false);
}

function press(key: string, code: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key, code, bubbles: true, cancelable: true, ...modifiers });
  act(() => {
    document.body.dispatchEvent(event);
  });
  return event;
}

const pressClose = () => press("w", "KeyW", { ctrlKey: true });

async function renderAwakeWorkspace() {
  const onClose = vi.fn();
  const view = render(
    <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={onClose} />
  );
  return { onClose, view };
}

describe("TerminalWorkspace wake chords", () => {
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

  it("closes the active tab when the close chord arrives outside the workspace", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    await renderAwakeWorkspace();
    await screen.findByText("zsh");
    parkFocusOutside();

    const event = pressClose();

    await waitFor(() => expect(api.terminalClose).toHaveBeenCalledTimes(1));
    expect(api.terminalClose).toHaveBeenCalledWith("t1");
    expect(event.defaultPrevented).toBe(true);
  });

  it("closes the active tab, not the first one, when the active tab is outside focus", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([demoSessions[0], otherSession]);
    await renderAwakeWorkspace();
    await screen.findByText("node");
    fireEvent.click(screen.getByText("node"));
    await waitFor(() =>
      expect(within(workspaceRoot()).getByTestId("terminal-canvas-t2").className).not.toContain("hidden")
    );
    parkFocusOutside();

    pressClose();

    await waitFor(() => expect(api.terminalClose).toHaveBeenCalledTimes(1));
    expect(api.terminalClose).toHaveBeenCalledWith("t2");
  });

  it("leaves the close chord alone when the workspace has no tabs", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([]);
    const { onClose } = await renderAwakeWorkspace();
    await screen.findByText("No terminals open");
    parkFocusOutside();

    const event = pressClose();
    await act(async () => {});

    expect(event.defaultPrevented).toBe(false);
    expect(api.terminalClose).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes only the tab, keeping the panel, when the close chord takes the last tab", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    const { onClose } = await renderAwakeWorkspace();
    await screen.findByText("zsh");
    await waitFor(() => expect(api.listProjects).toHaveBeenCalled());
    parkFocusOutside();

    const event = pressClose();

    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(api.terminalClose).toHaveBeenCalledWith("t1"));
    // Closing tabs never dismisses the panel; the empty workspace stays up.
    await waitFor(() => expect(screen.getByText("No terminals open")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the panel when the last tab's close button is clicked", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    const { onClose } = await renderAwakeWorkspace();
    await screen.findByText("zsh");
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close zsh" }));
    });

    await waitFor(() => expect(api.terminalClose).toHaveBeenCalledWith("t1"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close the panel when one of several tabs is closed", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([demoSessions[0], otherSession]);
    const { onClose } = await renderAwakeWorkspace();
    await screen.findByText("node");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Close zsh" }));
    });

    await waitFor(() => expect(api.terminalClose).toHaveBeenCalledWith("t1"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("adds a tab in the current project for Ctrl+N with focus outside the workspace", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    await renderAwakeWorkspace();
    await screen.findByText("zsh");
    await waitFor(() => expect(api.listProjects).toHaveBeenCalled());
    parkFocusOutside();

    const event = press("n", "KeyN", { ctrlKey: true });

    // A freshly summoned panel answers the chord before anything inside it
    // has been clicked: one more tab in the project on screen, no picker.
    await waitFor(() =>
      expect(api.terminalOpen).toHaveBeenCalledWith(
        "/tmp/demo",
        80,
        24,
        expect.objectContaining({ projectTitle: "demo" })
      )
    );
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("opens the sidebar's New button for Ctrl+Shift+N with focus outside the workspace", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    await renderAwakeWorkspace();
    await screen.findByText("zsh");
    await waitFor(() => expect(api.listProjects).toHaveBeenCalled());
    parkFocusOutside();

    const event = press("N", "KeyN", { ctrlKey: true, shiftKey: true });

    // CmdOrCtrl+Shift+N keeps the project picker next to the "Projects"
    // header, and creates nothing by itself.
    const menu = await screen.findByRole("listbox");
    expect(within(menu).getAllByRole("option")[0]).toHaveTextContent("Home — default shell");
    expect(event.defaultPrevented).toBe(true);
    expect(api.terminalOpen).not.toHaveBeenCalled();
  });

  it("yields the chords to a host dialog that holds focus above the panel", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    await renderAwakeWorkspace();
    await screen.findByText("zsh");

    // A dialog above the panel moves focus into itself. The panel must not
    // steal its chords: Add Project's own Cmd+N has to keep working.
    const dialogField = document.createElement("input");
    document.body.appendChild(dialogField);
    dialogField.focus();
    expect(workspaceRoot().contains(document.activeElement)).toBe(false);

    const newEvent = press("n", "KeyN", { ctrlKey: true });
    const closeEvent = press("w", "KeyW", { ctrlKey: true });
    await act(async () => {});

    expect(newEvent.defaultPrevented).toBe(false);
    expect(closeEvent.defaultPrevented).toBe(false);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(api.terminalClose).not.toHaveBeenCalled();
    dialogField.remove();
  });

  it("stops answering a chord once the user rebinds it away", async () => {
    vi.mocked(api.getSettings).mockResolvedValue({
      theme: "light",
      terminal_hotkey: "CmdOrCtrl+Shift+`",
      terminal_hide_on_blur: false,
      in_app_terminal_new_tab_in_project: "CmdOrCtrl+Alt+N",
    } as never);
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    await renderAwakeWorkspace();
    await screen.findByText("zsh");
    await waitFor(() => expect(api.getSettings).toHaveBeenCalled());
    await act(async () => {});
    parkFocusOutside();

    // The default Ctrl+N no longer belongs to the rebindable action.
    press("n", "KeyN", { ctrlKey: true });
    await act(async () => {});
    expect(api.terminalOpen).not.toHaveBeenCalled();

    // The rebound chord still does.
    press("n", "KeyN", { ctrlKey: true, altKey: true });
    await waitFor(() => expect(api.terminalOpen).toHaveBeenCalled());
  });

  it.each([
    ["Ctrl+ArrowLeft (previous group)", () => press("ArrowLeft", "ArrowLeft", { ctrlKey: true })],
    ["Ctrl+ArrowRight (next group)", () => press("ArrowRight", "ArrowRight", { ctrlKey: true })],
    ["Ctrl+1 (jump to tab)", () => press("1", "Digit1", { ctrlKey: true })],
  ])("leaves %s focus-gated", async (_label, dispatch) => {
    vi.mocked(api.terminalList).mockResolvedValue([demoSessions[0], otherSession]);
    await renderAwakeWorkspace();
    await screen.findByText("node");
    parkFocusOutside();
    const activeCanvasBefore = (workspaceRoot().querySelector('[class*="term-pane-in"]') as HTMLElement).getAttribute(
      "data-testid"
    );

    const event = dispatch();
    await act(async () => {});

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(api.terminalOpen).not.toHaveBeenCalled();
    expect(api.terminalClose).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    const activeCanvasAfter = (workspaceRoot().querySelector('[class*="term-pane-in"]') as HTMLElement).getAttribute(
      "data-testid"
    );
    expect(activeCanvasAfter).toBe(activeCanvasBefore);
  });
});
