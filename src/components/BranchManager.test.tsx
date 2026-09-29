import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BranchInfo } from "../lib/types";
import { BranchManager } from "./BranchManager";
import {
  getOperationPreview,
  gitCompareBranches,
  gitDeleteRemoteBranch,
  gitListConflicts,
  gitOperationState,
  gitRebaseAbort,
  gitRebaseContinue,
  gitRebaseSkip,
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
}));

const branches: BranchInfo[] = [
  { name: "main", is_current: true, is_remote: false, is_merged: true, is_tag: false },
  { name: "origin/feature", is_current: false, is_remote: true, is_merged: false, is_tag: false },
];

function renderManager() {
  return render(
    <BranchManager
      path="/repos/x"
      branches={branches}
      currentBranch="main"
      open
      onClose={vi.fn()}
      onRefresh={vi.fn()}
      onSuccess={vi.fn()}
      onError={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.mocked(gitOperationState).mockResolvedValue("clean");
  vi.mocked(gitListConflicts).mockResolvedValue(["a.txt"]);
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
});

describe("BranchManager rebase recovery", () => {
  it("continues an interrupted rebase from the recovery panel", async () => {
    vi.mocked(gitOperationState).mockResolvedValue("rebase");
    renderManager();

    expect(await screen.findByText(/Rebase in progress/)).toBeInTheDocument();
    expect(screen.getByText("a.txt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => expect(gitRebaseContinue).toHaveBeenCalledWith("/repos/x"));
  });

  it("skips the conflicting commit during a rebase", async () => {
    vi.mocked(gitOperationState).mockResolvedValue("rebase");
    renderManager();

    fireEvent.click(await screen.findByRole("button", { name: "Skip" }));

    await waitFor(() => expect(gitRebaseSkip).toHaveBeenCalledWith("/repos/x"));
  });

  it("aborts an interrupted rebase", async () => {
    vi.mocked(gitOperationState).mockResolvedValue("rebase");
    renderManager();

    fireEvent.click(await screen.findByRole("button", { name: "Abort" }));

    await waitFor(() => expect(gitRebaseAbort).toHaveBeenCalledWith("/repos/x"));
  });

  it("hides the recovery panel when the repository is clean", async () => {
    renderManager();

    await waitFor(() => expect(gitOperationState).toHaveBeenCalledWith("/repos/x"));
    expect(screen.queryByText(/Rebase in progress/)).toBeNull();
  });
});

describe("BranchManager remote branch deletion", () => {
  it("deletes a remote branch through the destructive-operation dialog", async () => {
    renderManager();

    fireEvent.click(screen.getByRole("tab", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete remote branch origin/feature" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(gitDeleteRemoteBranch).toHaveBeenCalledWith("/repos/x", "origin", "feature")
    );
  });
});

const compareBranches: BranchInfo[] = [
  { name: "main", is_current: true, is_remote: false, is_merged: true, is_tag: false },
  { name: "dev", is_current: false, is_remote: false, is_merged: false, is_tag: false },
];

function renderCompareManager() {
  return render(
    <BranchManager
      path="/repos/x"
      branches={compareBranches}
      currentBranch="main"
      open
      onClose={vi.fn()}
      onRefresh={vi.fn()}
      onSuccess={vi.fn()}
      onError={vi.fn()}
    />
  );
}

describe("BranchManager compare tab", () => {
  it("enables Compare after picking only branch B (branch A defaults to current)", async () => {
    renderCompareManager();
    fireEvent.click(screen.getByRole("tab", { name: "Compare" }));

    const compareButton = screen.getByRole("button", { name: "Compare" });
    expect(compareButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Branch B" }));
    fireEvent.click(await screen.findByRole("option", { name: "dev" }));

    expect(compareButton).toBeEnabled();
  });

  it("compares against the current branch when branch A was never changed", async () => {
    vi.mocked(gitCompareBranches).mockResolvedValue({
      ahead: 1,
      behind: 0,
      ahead_commits: [],
      behind_commits: [],
      changed_files: [],
    });
    renderCompareManager();
    fireEvent.click(screen.getByRole("tab", { name: "Compare" }));
    fireEvent.click(screen.getByRole("button", { name: "Branch B" }));
    fireEvent.click(await screen.findByRole("option", { name: "dev" }));
    fireEvent.click(screen.getByRole("button", { name: "Compare" }));

    await waitFor(() =>
      expect(gitCompareBranches).toHaveBeenCalledWith("/repos/x", "main", "dev")
    );
    expect(await screen.findByText(/Comparing/)).toBeInTheDocument();
  });
});

describe("BranchManager stale selections", () => {
  it("clears a selected branch once it disappears from the list", async () => {
    const props = {
      path: "/repos/x",
      currentBranch: "main",
      open: true,
      onClose: vi.fn(),
      onRefresh: vi.fn(),
      onSuccess: vi.fn(),
      onError: vi.fn(),
    };
    const { rerender } = render(<BranchManager {...props} branches={compareBranches} />);

    fireEvent.click(screen.getByRole("tab", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Branch to delete" }));
    fireEvent.click(await screen.findByRole("option", { name: /dev/ }));
    expect(screen.getByRole("button", { name: "Delete Branch" })).toBeEnabled();

    rerender(<BranchManager {...props} branches={[compareBranches[0]]} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete Branch" })).toBeDisabled()
    );
  });
});
