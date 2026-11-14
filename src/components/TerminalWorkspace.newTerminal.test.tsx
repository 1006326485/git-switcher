import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  listProjectScripts: vi.fn(() =>
    Promise.resolve([
      { name: "dev", command: "npm run dev" },
      { name: "build", command: "npm run build" },
    ])
  ),
  listProjects: vi.fn(() => Promise.resolve([])),
  terminalWindowDismiss: vi.fn(() => Promise.resolve()),
  openInFinder: vi.fn(),
  openInTerminal: vi.fn(),
  createRunPreset: vi.fn(),
  deleteRunPreset: vi.fn(),
  getSettings: vi.fn(() =>
    Promise.resolve({ theme: "light", terminal_hotkey: "CmdOrCtrl+Shift+`", terminal_hide_on_blur: false })
  ),
}));

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

describe("TerminalWorkspace new-terminal entry points", () => {
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

  it("keeps the New project picker in the sidebar header, as before", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    render(<TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />);
    await screen.findByText("zsh");
    await waitFor(() => expect(api.listProjects).toHaveBeenCalled());

    // The page controls sit exactly where they always did: the sidebar
    // header carries the "New" project picker, and New is still the first
    // row before the project list.
    const sidebar = Array.from(document.querySelectorAll(".app-panel")).find((el) =>
      el.textContent?.includes("Projects")
    );
    expect(sidebar).toBeDefined();
    const picker = sidebar!.querySelector('[aria-label="New terminal in project"]');
    expect(picker).not.toBeNull();
    // …inside the sidebar header row, next to the "Projects" caption.
    const headerRow = picker!.closest(".px-3.pt-3");
    expect(headerRow).not.toBeNull();
    expect(headerRow?.textContent).toContain("Projects");

    fireEvent.click(picker as HTMLElement);
    const menu = await screen.findByRole("listbox");
    expect(within(menu).getAllByRole("option")[0]).toHaveTextContent("Home — default shell");
  });

  it("keeps the tab-bar + and opens exactly one tab per press", async () => {
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
    render(<TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />);
    await screen.findByText("zsh");
    await waitFor(() => expect(api.listProjects).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "New terminal" }));
    await waitFor(() => expect(api.terminalOpen).toHaveBeenCalledTimes(1));
    expect(api.terminalOpen).toHaveBeenCalledWith(
      "/tmp/demo",
      80,
      24,
      expect.objectContaining({ projectTitle: "demo" })
    );
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("has no new-terminal button on the blank slate (the tab bar is hidden there)", async () => {
    // A previous test in this file may have leaked sessions; start empty.
    vi.mocked(api.terminalList).mockResolvedValue([]);
    render(<TerminalWorkspace open initial={null} workspaceLaunch={null} onClose={() => {}} />);
    await screen.findByText("No terminals open");
    // No tab bar, and therefore no "+" before the first tab exists.
    expect(screen.queryAllByRole("button", { name: "New terminal" })).toHaveLength(0);
  });

});

describe("TerminalWindowApp Cmd+W precedence", () => {
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
    vi.mocked(api.terminalList).mockResolvedValue(demoSessions);
  });

  it("Cmd+W on a live tab closes the tab and does NOT hide the window", async () => {
    const { default: TerminalWindowApp } = await import("../TerminalWindowApp");
    render(<TerminalWindowApp />);
    await screen.findByText("zsh");

    // The terminal context owns keys pressed INSIDE the workspace (the
    // window root itself belongs to TerminalWindowApp, not the workspace).
    fireEvent.keyDown(screen.getByText("zsh"), { key: "w", code: "KeyW", ctrlKey: true });
    await waitFor(() => expect(api.terminalClose).toHaveBeenCalledWith("t1"));
    // The tab handler marked the chord as handled (preventDefault), so the
    // window's own bubble-phase listener stood down instead of hiding.
    const dismiss = api.terminalWindowDismiss as unknown as ReturnType<typeof vi.fn>;
    await new Promise((r) => setTimeout(r, 20));
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("Cmd+W with no terminal tab dismisses the window", async () => {
    vi.mocked(api.terminalList).mockResolvedValue([]);
    const { default: TerminalWindowApp } = await import("../TerminalWindowApp");
    render(<TerminalWindowApp />);
    await screen.findByText("No terminals open");

    fireEvent.keyDown(document.querySelector(".window-root")!, { key: "w", code: "KeyW", ctrlKey: true });
    const dismiss = api.terminalWindowDismiss as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() => expect(dismiss).toHaveBeenCalled());
  });
});
