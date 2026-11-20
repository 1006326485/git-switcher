import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TerminalWorkspace from "./TerminalWorkspace";

/**
 * Every `terminal-sessions` broadcast the workspace subscribed to — the channel
 * the backend uses to publish a new order after a drag.
 */
const { sessionListeners } = vi.hoisted(() => ({
  sessionListeners: [] as Array<(event: { payload: unknown }) => void>,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((event: string, handler: (payload: { payload: unknown }) => void) => {
    if (event === "terminal-sessions") sessionListeners.push(handler);
    return Promise.resolve(() => {});
  }),
}));

vi.mock("../lib/tauri", () => ({
  terminalList: vi.fn(() =>
    Promise.resolve([
      session("t1", "zsh-one"),
      session("t2", "zsh-two"),
      session("t3", "zsh-three"),
    ])
  ),
  terminalOpen: vi.fn(),
  terminalWrite: vi.fn(() => Promise.resolve()),
  terminalResize: vi.fn(() => Promise.resolve()),
  terminalClose: vi.fn(() => Promise.resolve()),
  terminalReorder: vi.fn(() => Promise.resolve()),
  terminalSetTitle: vi.fn(() => Promise.resolve()),
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

function session(id: string, title: string) {
  return {
    id,
    cwd: "/tmp/demo",
    title,
    projectTitle: "demo",
    projectKey: "/tmp/demo",
    command: undefined,
    exited: false,
  };
}

function renderWorkspace() {
  render(<TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />);
}

function tabOrder(): Array<string | null> {
  return Array.from(document.querySelectorAll("[data-tab-id]")).map((el) =>
    el.getAttribute("data-tab-id")
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionListeners.length = 0;
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

describe("terminal pane order", () => {
  it("reorders the tabs without re-parenting the mounted terminals", async () => {
    renderWorkspace();

    const paneHost = await waitFor(() => {
      const host = document.querySelector('[data-testid="terminal-canvas-t1"]')?.parentElement;
      expect(host?.querySelectorAll('[data-testid^="terminal-canvas-"]').length).toBe(3);
      return host as HTMLElement;
    });
    // Each pane contributes its canvas and its "starting shell" overlay.
    const canvasOrder = () =>
      Array.from(paneHost.querySelectorAll("[data-testid^='terminal-canvas-']")).map((el) =>
        el.getAttribute("data-testid")
      );
    expect(canvasOrder()).toEqual(["terminal-canvas-t1", "terminal-canvas-t2", "terminal-canvas-t3"]);
    const panesBefore = Array.from(paneHost.children);
    expect(tabOrder()).toEqual(["t1", "t2", "t3"]);

    // What the backend broadcasts once a drag has been committed.
    act(() => {
      for (const listener of sessionListeners) {
        listener({ payload: [session("t3", "zsh-three"), session("t1", "zsh-one"), session("t2", "zsh-two")] });
      }
    });

    expect(tabOrder()).toEqual(["t3", "t1", "t2"]);
    // Regression: React used to remove and re-insert the keyed panes when the
    // session order changed, and moving an xterm container leaves its canvas
    // blank until the next output repaints it — the "press Enter and the
    // terminal comes back" report. Panes are absolutely positioned and only the
    // active one is visible, so their DOM order is free to stay put.
    expect(canvasOrder()).toEqual([
      "terminal-canvas-t1",
      "terminal-canvas-t2",
      "terminal-canvas-t3",
    ]);
    expect(paneHost.children.length).toBe(panesBefore.length);
    panesBefore.forEach((pane, index) => {
      expect(paneHost.children[index]).toBe(pane);
    });
  });
});
