import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TerminalWorkspace from "./TerminalWorkspace";
import * as api from "../lib/tauri";

/** Stand-in for xterm with just enough surface for the canvas-menu handles. */
const { terminals, FakeTerminal } = vi.hoisted(() => {
  const created: FakeTerminal[] = [];
  class FakeTerminal {
    cols = 80;
    rows = 24;
    options: Record<string, unknown> = {};
    ydisp = 0;
    baseY = 0;
    selection = "";
    selectedAll = false;
    cleared = false;
    constructor() {
      created.push(this);
    }
    get buffer() {
      return { active: { viewportY: this.ydisp, baseY: this.baseY } };
    }
    loadAddon() {}
    open() {}
    focus() {}
    dispose() {}
    onData() {
      return { dispose() {} };
    }
    getSelection() {
      return this.selection;
    }
    selectAll() {
      this.selectedAll = true;
    }
    clear() {
      this.cleared = true;
    }
    write(_data: unknown, callback?: () => void) {
      callback?.();
    }
    scrollLines() {}
  }
  return { terminals: created, FakeTerminal };
});

vi.mock("@xterm/xterm", () => ({ Terminal: FakeTerminal }));
vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));
vi.mock("../lib/tauri", () => ({
  terminalList: vi.fn(() => Promise.resolve([])),
  terminalOpen: vi.fn(),
  terminalWrite: vi.fn(() => Promise.resolve()),
  terminalResize: vi.fn(() => Promise.resolve()),
  terminalClose: vi.fn(() => Promise.resolve()),
  listRunPresets: vi.fn(() => Promise.resolve([])),
  listCustomCommands: vi.fn(() => Promise.resolve([])),
  listProjectScripts: vi.fn(() => Promise.resolve([])),
  listProjects: vi.fn(() => Promise.resolve([])),
  openInFinder: vi.fn(),
  openInTerminal: vi.fn(),
  createRunPreset: vi.fn(),
  deleteRunPreset: vi.fn(),
  getSettings: vi.fn(() =>
    Promise.resolve({
      theme: "light",
      terminal_hotkey: "CmdOrCtrl+Shift+`",
      terminal_hide_on_blur: false,
    })
  ),
}));

// Two sessions in one project: t1 stays active, t2 is mounted but hidden. The
// menu must only ever reach the active one.
const sessions = [
  { id: "t1", cwd: "/tmp/demo", title: "zsh-one", projectTitle: "demo", projectKey: "/tmp/demo", command: undefined, exited: false },
  { id: "t2", cwd: "/tmp/demo", title: "zsh-two", projectTitle: "demo", projectKey: "/tmp/demo", command: undefined, exited: false },
];

const writeText = vi.fn().mockResolvedValue(undefined);
const readText = vi.fn().mockResolvedValue("");

beforeEach(() => {
  vi.clearAllMocks();
  terminals.length = 0;
  class ObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
  window.IntersectionObserver = ObserverStub as unknown as typeof IntersectionObserver;
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.mocked(api.terminalList).mockResolvedValue(sessions);
  writeText.mockClear();
  readText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText, readText },
    configurable: true,
  });
});

async function activeCanvas(): Promise<HTMLElement> {
  render(<TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />);
  return waitFor(() => {
    // t2 is the active session (applySessions picks the last of the group).
    const active = document.querySelector<HTMLElement>(
      '[data-testid="terminal-canvas-t2"]'
    );
    expect(active).toBeTruthy();
    return active as HTMLElement;
  });
}

async function openCanvasMenu(): Promise<HTMLElement> {
  const canvas = await activeCanvas();
  fireEvent.contextMenu(canvas, { button: 2, clientX: 40, clientY: 40 });
  return canvas;
}

function activeTerm(): InstanceType<typeof FakeTerminal> {
  // t2 is the active session (applySessions picks the last of the group).
  return terminals[terminals.length - 1];
}

describe("TerminalWorkspace canvas context menu", () => {
  it("opens the menu on the canvas even while text is selected", async () => {
    // The whole point of the canvas menu is to copy the selection, so the
    // "selection present ⇒ keep the native menu" guard must not apply here.
    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "selected text",
    } as Selection);

    await openCanvasMenu();

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Paste" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Select All" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Clear" })).toBeInTheDocument();
  });

  it("still defers to the native menu on a control inside the canvas", async () => {
    const canvas = await activeCanvas();
    const control = document.createElement("button");
    canvas.appendChild(control);

    fireEvent.contextMenu(control, { button: 2, clientX: 40, clientY: 40 });

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("still defers on native helper textarea", async () => {
    const canvas = await activeCanvas();
    const ta = document.createElement("textarea");
    ta.className = "xterm-helper-textarea";
    canvas.appendChild(ta);
    fireEvent.contextMenu(ta, { button: 2, clientX: 40, clientY: 40 });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("keeps Copy disabled when the terminal has no selection", async () => {
    await openCanvasMenu();
    await screen.findByRole("menu");

    expect(activeTerm().selection).toBe("");
    expect(screen.getByRole("menuitem", { name: "Copy" })).toBeDisabled();
  });

  it("copies the terminal selection to the clipboard", async () => {
    const canvas = await openCanvasMenu();
    activeTerm().selection = "hello world";

    // Re-open so the menu captures the now-present selection.
    fireEvent.contextMenu(canvas, { button: 2, clientX: 40, clientY: 40 });
    const copy = await screen.findByRole("menuitem", { name: "Copy" });
    expect(copy).not.toBeDisabled();
    fireEvent.click(copy);

    expect(writeText).toHaveBeenCalledWith("hello world");
  });

  it("pastes the clipboard into the active session via the pty write path", async () => {
    readText.mockResolvedValue("pasted text");
    await openCanvasMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: "Paste" }));

    await waitFor(() =>
      expect(api.terminalWrite).toHaveBeenCalledWith("t2", "pasted text")
    );
    // The hidden session t1 must never receive input.
    expect(api.terminalWrite).not.toHaveBeenCalledWith("t1", "pasted text");
  });

  it("selects all in the active terminal", async () => {
    await openCanvasMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: "Select All" }));

    expect(activeTerm().selectedAll).toBe(true);
  });

  it("clears the active terminal's screen", async () => {
    await openCanvasMenu();

    fireEvent.click(await screen.findByRole("menuitem", { name: "Clear" }));

    expect(activeTerm().cleared).toBe(true);
  });
});
