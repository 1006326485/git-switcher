import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BranchInfo } from "../lib/types";
import { BranchManager } from "./BranchManager";
import {
  getOperationPreview,
  gitDeleteRemoteBranch,
  gitListConflicts,
  gitOperationState,
  switchBranch,
} from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  gitOperationState: vi.fn(),
  gitListConflicts: vi.fn(),
  gitRebaseContinue: vi.fn(),
  gitRebaseSkip: vi.fn(),
  gitRebaseAbort: vi.fn(),
  gitDeleteRemoteBranch: vi.fn(),
  gitCompareBranches: vi.fn(),
  getOperationPreview: vi.fn(),
  switchBranch: vi.fn(),
}));

const branches: BranchInfo[] = [
  { name: "main", is_current: true, is_remote: false, is_merged: true, is_tag: false },
  { name: "origin/feature", is_current: false, is_remote: true, is_merged: false, is_tag: false },
  { name: "origin/release", is_current: false, is_remote: true, is_merged: false, is_tag: false },
];

const writeText = vi.fn().mockResolvedValue(undefined);

function renderManager(currentBranch = "main") {
  return render(
    <BranchManager
      path="/repos/x"
      branches={branches}
      currentBranch={currentBranch}
      open
      onClose={vi.fn()}
      onRefresh={vi.fn(async () => {})}
      onSuccess={vi.fn()}
      onError={vi.fn()}
    />
  );
}

function rowFor(name: string): HTMLElement {
  const cell = screen.getByText(name);
  return cell.closest("div.flex.items-center.gap-2") as HTMLElement;
}

async function openRowMenu(name: string) {
  fireEvent.click(screen.getByRole("tab", { name: "Delete" }));
  const row = rowFor(name);
  fireEvent.contextMenu(row, { button: 2, clientX: 40, clientY: 40 });
}

beforeEach(() => {
  vi.mocked(gitOperationState).mockResolvedValue("clean");
  vi.mocked(gitListConflicts).mockResolvedValue([]);
  vi.mocked(gitDeleteRemoteBranch).mockResolvedValue("ok");
  vi.mocked(switchBranch).mockResolvedValue(undefined as never);
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
    targets: [{ path: "/repos/x", label: "target" }],
  }));
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

describe("BranchManager remote branch row context menu", () => {
  it("opens a menu with Checkout locally, Copy name and Delete remote", async () => {
    renderManager();

    await openRowMenu("origin/feature");

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Checkout locally" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy name" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete remote" })).toBeInTheDocument();
  });

  it("leaves the native menu when right-clicking the inline Delete button", async () => {
    renderManager();

    fireEvent.click(screen.getByRole("tab", { name: "Delete" }));
    const row = rowFor("origin/feature");
    fireEvent.contextMenu(within(row).getByRole("button"), {
      button: 2,
      clientX: 40,
      clientY: 40,
    });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("hides Checkout locally for the current branch", async () => {
    renderManager("origin/feature");

    await openRowMenu("origin/feature");

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Checkout locally" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Copy name" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete remote" })).toBeInTheDocument();
  });

  it("asks for confirmation before deleting the remote branch and does not delete yet", async () => {
    renderManager();

    await openRowMenu("origin/feature");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete remote" }));

    expect(await screen.findByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(gitDeleteRemoteBranch).not.toHaveBeenCalled();
  });

  it("copies the remote branch name to the clipboard from the menu", async () => {
    renderManager();

    await openRowMenu("origin/feature");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy name" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("origin/feature"));
  });

  it("checks out the remote branch locally from the menu", async () => {
    renderManager();

    await openRowMenu("origin/feature");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Checkout locally" }));

    await waitFor(() => expect(switchBranch).toHaveBeenCalledWith("/repos/x", "origin/feature"));
  });
});
