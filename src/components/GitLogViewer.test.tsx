import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommitInfo } from "../lib/types";
import { GitLogViewer } from "./GitLogViewer";
import {
  getOperationPreview,
  gitAmendCommit,
  gitGetLog,
  gitListConflicts,
  gitOperationState,
  gitRevertAbort,
  gitRevertCommit,
  gitRevertContinue,
} from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  gitGetLog: vi.fn(),
  gitOperationState: vi.fn(),
  gitListConflicts: vi.fn(),
  gitRevertCommit: vi.fn(),
  gitAmendCommit: vi.fn(),
  gitRevertContinue: vi.fn(),
  gitRevertAbort: vi.fn(),
  gitRewordCommit: vi.fn(),
  gitDropCommit: vi.fn(),
  getOperationPreview: vi.fn(),
}));

const now = Math.floor(Date.now() / 1000);
const commits: CommitInfo[] = [
  {
    hash: "abc1234abc",
    short_hash: "abc1234",
    message: "latest commit",
    author: "Ann",
    email: "ann@example.com",
    timestamp: now,
    parents: [],
    refs: [],
  },
  {
    hash: "def5678def",
    short_hash: "def5678",
    message: "older commit",
    author: "Bob",
    email: "bob@example.com",
    timestamp: now - 3600,
    parents: [],
    refs: [],
  },
];

function renderViewer() {
  return render(
    <GitLogViewer
      path="/repos/x"
      projectName="x"
      open
      onClose={vi.fn()}
      unpushedCount={1}
      onRefresh={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.mocked(gitGetLog).mockResolvedValue(commits);
  vi.mocked(gitOperationState).mockResolvedValue("clean");
  vi.mocked(gitListConflicts).mockResolvedValue([]);
  vi.mocked(getOperationPreview).mockImplementation(async (operation: string) => ({
    policy: {
      operation,
      risk: "history_rewrite",
      title: "Confirm operation",
      description: "description",
      confirm_label: "Confirm",
      requires_confirmation: true,
      allow_skip_confirmation: false,
    },
    targets: [{ path: "/repos/x", label: "target" }],
  }));
});

describe("GitLogViewer revert and amend", () => {
  it("reverts a commit after the destructive-operation dialog is confirmed", async () => {
    vi.mocked(gitRevertCommit).mockResolvedValue({ success: true, message: "reverted", conflicts: [] });
    renderViewer();

    fireEvent.click((await screen.findAllByRole("button", { name: "Revert" }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(gitRevertCommit).toHaveBeenCalledWith("/repos/x", "abc1234abc")
    );
  });

  it("offers amend only on HEAD and amends with the edited message", async () => {
    vi.mocked(gitAmendCommit).mockResolvedValue("amended");
    renderViewer();

    const amendButtons = await screen.findAllByRole("button", { name: "Amend" });
    expect(amendButtons).toHaveLength(1);

    fireEvent.click(amendButtons[0]);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(gitAmendCommit).toHaveBeenCalledWith("/repos/x", "latest commit")
    );
  });

  it("keeps a conflicted revert recoverable with continue and abort", async () => {
    vi.mocked(gitRevertCommit).mockResolvedValue({
      success: false,
      message: "conflict",
      conflicts: ["a.txt"],
    });
    renderViewer();

    fireEvent.click((await screen.findAllByRole("button", { name: "Revert" }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("a.txt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(gitRevertContinue).toHaveBeenCalledWith("/repos/x"));

    vi.mocked(gitRevertCommit).mockClear();
    fireEvent.click((await screen.findAllByRole("button", { name: "Revert" }))[1]);
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("a.txt")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abort" }));
    await waitFor(() => expect(gitRevertAbort).toHaveBeenCalledWith("/repos/x"));
  });
});
