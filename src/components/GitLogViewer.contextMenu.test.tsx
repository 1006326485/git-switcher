import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CommitInfo } from "../lib/types";
import { GitLogViewer } from "./GitLogViewer";
import {
  getOperationPreview,
  gitDropCommit,
  gitGetLog,
  gitListConflicts,
  gitOperationState,
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

const writeText = vi.fn().mockResolvedValue(undefined);

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

async function openRowMenu(message: string) {
  const row = (await screen.findByText(message)).closest("li") as HTMLElement;
  fireEvent.contextMenu(row, { button: 2, clientX: 40, clientY: 40 });
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
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

describe("GitLogViewer commit row context menu", () => {
  it("opens a context menu when a commit row is right-clicked", async () => {
    renderViewer();

    await openRowMenu("latest commit");

    expect(await screen.findByRole("menu")).toBeInTheDocument();
  });

  it("offers Amend only on the first commit", async () => {
    renderViewer();

    await openRowMenu("latest commit");
    expect(await screen.findByRole("menuitem", { name: "Amend" })).toBeInTheDocument();

    await openRowMenu("older commit");
    expect(await screen.findByRole("menuitem", { name: "Revert" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Amend" })).toBeNull();
  });

  it("hides Reword and Drop on rows past the unpushed count", async () => {
    renderViewer();

    await openRowMenu("latest commit");
    expect(await screen.findByRole("menuitem", { name: "Reword" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Drop" })).toBeInTheDocument();

    await openRowMenu("older commit");
    expect(await screen.findByRole("menuitem", { name: "Revert" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Reword" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Drop" })).toBeNull();
  });

  it("leaves the native menu when right-clicking an inline action button", async () => {
    renderViewer();

    const revertButtons = await screen.findAllByRole("button", { name: "Revert" });
    fireEvent.contextMenu(revertButtons[0], { button: 2, clientX: 40, clientY: 40 });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("asks for confirmation before dropping a commit", async () => {
    renderViewer();

    await openRowMenu("latest commit");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Drop" }));

    expect(await screen.findByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(gitDropCommit).not.toHaveBeenCalled();
  });

  it("copies the short hash to the clipboard", async () => {
    renderViewer();

    await openRowMenu("latest commit");
    fireEvent.click(await screen.findByRole("menuitem", { name: "Copy hash" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("abc1234"));
  });
});
