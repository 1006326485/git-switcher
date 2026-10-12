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
];

function renderWorkspace() {
  render(
    <TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />
  );
}

async function tabRoot(title: string): Promise<HTMLElement> {
  const label = await screen.findByText(title);
  return label.closest("div.group") as HTMLElement;
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

describe("TerminalWorkspace tab context menu", () => {
  it("opens the menu when the tab root is right-clicked", async () => {
    renderWorkspace();
    const root = await tabRoot("zsh-one");

    fireEvent.contextMenu(root, { button: 2, clientX: 30, clientY: 30 });

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Close" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Close Others" })).toBeInTheDocument();
  });

  it("opens the menu from the tab title button", async () => {
    renderWorkspace();
    const root = await tabRoot("zsh-one");

    fireEvent.contextMenu(root.querySelector("button") as HTMLElement, {
      button: 2,
      clientX: 30,
      clientY: 30,
    });

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Close" })).toBeInTheDocument();
  });

  it("opens the menu from the restart and close buttons", async () => {
    renderWorkspace();
    const root = await tabRoot("zsh-one");
    const buttons = Array.from(root.querySelectorAll("button"));

    fireEvent.contextMenu(buttons[1], { button: 2, clientX: 30, clientY: 30 });
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());

    fireEvent.contextMenu(buttons[2], { button: 2, clientX: 30, clientY: 30 });
    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("closes the session from the Close menu item", async () => {
    renderWorkspace();
    const root = await tabRoot("zsh-one");

    fireEvent.contextMenu(root, { button: 2, clientX: 30, clientY: 30 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Close" }));

    await waitFor(() => expect(screen.queryByText("zsh-one")).not.toBeInTheDocument());
    expect(api.terminalClose).toHaveBeenCalledWith("t1");
  });

  it("closes only the other tabs from the Close Others menu item", async () => {
    renderWorkspace();
    const root = await tabRoot("zsh-two");

    fireEvent.contextMenu(root, { button: 2, clientX: 30, clientY: 30 });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Close Others" }));

    await waitFor(() => expect(screen.queryByText("zsh-one")).not.toBeInTheDocument());
    expect(screen.getByText("zsh-two")).toBeInTheDocument();
    expect(api.terminalClose).toHaveBeenCalledWith("t1");
    expect(api.terminalClose).not.toHaveBeenCalledWith("t2");
  });

  it("still switches the active session on left-click", async () => {
    renderWorkspace();
    const root = await tabRoot("zsh-one");
    expect(root.className).not.toContain("font-medium");

    fireEvent.click(root.querySelector("button") as HTMLElement);

    await waitFor(() => expect(root.className).toContain("font-medium"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
