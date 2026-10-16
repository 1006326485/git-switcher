import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TerminalWorkspace from "./TerminalWorkspace";
import * as api from "../lib/tauri";

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

const sessions = [
  {
    id: "t1",
    cwd: "/tmp/demo",
    title: "zsh-one",
    projectTitle: "demo",
    projectKey: "/tmp/demo",
    command: "npm run dev",
    exited: false,
  },
  {
    id: "t2",
    cwd: "/tmp/demo",
    title: "zsh-two",
    projectTitle: "demo",
    projectKey: "/tmp/demo",
    command: undefined,
    exited: false,
  },
  {
    id: "t3",
    cwd: "/tmp/other",
    title: "zsh-three",
    projectTitle: "other",
    projectKey: "/tmp/other",
    command: undefined,
    exited: false,
  },
];

function renderWorkspace() {
  render(
    <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
  );
}

function sidebarEntry(cwd: string): HTMLElement {
  const el = document.querySelector(`div[title="${cwd}"]`);
  if (!(el instanceof HTMLElement)) throw new Error(`sidebar entry not found: ${cwd}`);
  return el;
}

async function openSidebarMenu(cwd: string) {
  await screen.findByText(cwd === "/tmp/demo" ? "demo" : "other");
  fireEvent.contextMenu(sidebarEntry(cwd), { button: 2, clientX: 30, clientY: 30 });
  return screen.findByRole("menu");
}

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
  vi.mocked(api.terminalList).mockResolvedValue(sessions);
});

describe("TerminalWorkspace sidebar project context menu", () => {
  it("opens the menu when a sidebar entry is right-clicked", async () => {
    renderWorkspace();

    const menu = await openSidebarMenu("/tmp/demo");

    expect(menu).toBeInTheDocument();
  });

  it("shows New Terminal, Copy Path and Close All Terminals", async () => {
    renderWorkspace();
    await openSidebarMenu("/tmp/demo");

    const labels = screen.getAllByRole("menuitem").map((el) => el.textContent ?? "");
    expect(labels[0]).toMatch(/new terminal/i);
    expect(screen.getByRole("menuitem", { name: "Copy Path" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Close All Terminals" })).toBeInTheDocument();
  });

  it("closes only that project's terminals from Close All Terminals", async () => {
    renderWorkspace();
    await openSidebarMenu("/tmp/demo");

    fireEvent.click(screen.getByRole("menuitem", { name: "Close All Terminals" }));

    await waitFor(() => expect(api.terminalClose).toHaveBeenCalledWith("t1"));
    expect(api.terminalClose).toHaveBeenCalledWith("t2");
    expect(api.terminalClose).not.toHaveBeenCalledWith("t3");
  });

  it("disables Close All Terminals when the project has no sessions", async () => {
    renderWorkspace();
    await screen.findByText("other");

    fireEvent.click(sidebarEntry("/tmp/demo"));
    await screen.findByText("zsh-one");
    fireEvent.contextMenu(sidebarEntry("/tmp/demo"), { button: 2, clientX: 30, clientY: 30 });
    expect(
      await screen.findByRole("menuitem", { name: "Close All Terminals" })
    ).toBeEnabled();

    for (const title of ["zsh-one", "zsh-two"]) {
      const root = (await screen.findByText(title)).closest("div.group") as HTMLElement;
      const buttons = Array.from(root.querySelectorAll("button"));
      fireEvent.click(buttons[buttons.length - 1]);
      await waitFor(() => expect(screen.queryByText(title)).not.toBeInTheDocument());
    }

    await waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "Close All Terminals" })).toBeDisabled()
    );
  });

  it("still switches the active project on left-click", async () => {
    renderWorkspace();
    await screen.findByText("other");

    fireEvent.click(sidebarEntry("/tmp/other"));
    await waitFor(() =>
      expect(sidebarEntry("/tmp/other").className).toContain("bg-[var(--surface-2)]")
    );

    fireEvent.click(sidebarEntry("/tmp/demo"));
    await waitFor(() =>
      expect(sidebarEntry("/tmp/demo").className).toContain("bg-[var(--surface-2)]")
    );
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
