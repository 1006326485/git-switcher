import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorktreeManager } from "./WorktreeManager";
import {
  getOperationPreview,
  gitListWorktrees,
  gitRemoveWorktree,
  openInFinder,
  openInTerminal,
} from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  gitListWorktrees: vi.fn(),
  gitAddWorktree: vi.fn(),
  gitRemoveWorktree: vi.fn(),
  gitPruneWorktrees: vi.fn(),
  getOperationPreview: vi.fn(),
  openInFinder: vi.fn(),
  openInTerminal: vi.fn(),
}));

const worktrees = [
  {
    name: "wt-one",
    path: "/repos/x-worktrees/wt-one",
    branch: "feature",
    head: "abc1234",
    is_locked: false,
    is_prunable: false,
  },
  {
    name: "wt-locked",
    path: "/repos/x-worktrees/wt-locked",
    branch: null,
    head: "def5678",
    is_locked: true,
    is_prunable: false,
  },
];

const writeText = vi.fn().mockResolvedValue(undefined);

function renderManager() {
  const onSuccess = vi.fn();
  const onError = vi.fn();
  render(<WorktreeManager path="/repos/x" onSuccess={onSuccess} onError={onError} />);
  return { onSuccess, onError };
}

async function showList() {
  fireEvent.click(await screen.findByRole("button", { name: "Toggle worktree list" }));
  await screen.findByText("wt-one");
}

async function openRowMenu(name: string) {
  const label = await screen.findByText(name);
  fireEvent.contextMenu(label, { button: 2, clientX: 40, clientY: 40 });
  return label;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(gitListWorktrees).mockResolvedValue(worktrees);
  vi.mocked(gitRemoveWorktree).mockResolvedValue(undefined);
  vi.mocked(openInFinder).mockResolvedValue(undefined);
  vi.mocked(openInTerminal).mockResolvedValue(undefined);
  vi.mocked(getOperationPreview).mockImplementation(async (operation: string) => ({
    policy: {
      operation,
      risk: "destructive",
      title: "Confirm operation",
      description: "description",
      confirm_label: "Confirm",
      requires_confirmation: true,
      allow_skip_confirmation: false,
    },
    targets: [{ path: "/repos/x", label: "wt-one" }],
  }));
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

describe("WorktreeManager worktree row context menu", () => {
  it("opens a context menu with open, copy and remove entries on right-click", async () => {
    renderManager();
    await showList();

    await openRowMenu("wt-one");

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Open in Finder" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Open in Terminal" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Copy path" })
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Remove" })).toBeInTheDocument();
  });

  it("opens the right-clicked worktree in Finder from the menu", async () => {
    renderManager();
    await showList();

    await openRowMenu("wt-one");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Open in Finder" }));

    await waitFor(() =>
      expect(openInFinder).toHaveBeenCalledWith("/repos/x-worktrees/wt-one")
    );
  });

  it("copies the right-clicked worktree path from the menu", async () => {
    renderManager();
    await showList();

    await openRowMenu("wt-one");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy path" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("/repos/x-worktrees/wt-one")
    );
  });

  it("opens the existing removal confirmation without calling the API yet", async () => {
    renderManager();
    await showList();

    await openRowMenu("wt-one");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Remove" }));

    expect(
      await screen.findByRole("button", { name: "Confirm" })
    ).toBeInTheDocument();
    expect(gitRemoveWorktree).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(gitRemoveWorktree).toHaveBeenCalledWith("/repos/x", "wt-one")
    );
  });

  it("marks the remove entry disabled for a locked worktree", async () => {
    renderManager();
    await showList();

    await openRowMenu("wt-locked");
    const removeItem = await screen.findByRole("menuitem", { name: /Remove/ });

    expect(
      removeItem.getAttribute("disabled") !== null ||
        removeItem.getAttribute("aria-disabled") === "true"
    ).toBe(true);

    fireEvent.click(removeItem);
    await waitFor(() => expect(gitRemoveWorktree).not.toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });

  it("still opens the removal confirmation on left-click after a right-click", async () => {
    renderManager();
    await showList();

    await openRowMenu("wt-one");
    expect(await screen.findByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(
      await screen.findByRole("button", { name: "Remove worktree wt-one" })
    );

    expect(
      await screen.findByRole("button", { name: "Confirm" })
    ).toBeInTheDocument();
    expect(gitRemoveWorktree).not.toHaveBeenCalled();
  });
});
