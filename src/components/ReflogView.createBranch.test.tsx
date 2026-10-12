import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReflogView } from "./ReflogView";
import { createBranch, gitCheckoutCommit, gitGetReflog } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  gitGetReflog: vi.fn(),
  gitCheckoutCommit: vi.fn(),
  createBranch: vi.fn(),
}));

const entries = [
  {
    hash: "aaa111aaa111aaa111aaa111aaa111aaa111aaa1",
    short_hash: "aaa111a",
    message: "checkout: moving from main to feature",
    author: "alice",
    timestamp: Math.floor(Date.now() / 1000) - 120,
  },
  {
    hash: "bbb222bbb222bbb222bbb222bbb222bbb222bbb2",
    short_hash: "bbb222b",
    message: "commit: fix parser",
    author: "bob",
    timestamp: Math.floor(Date.now() / 1000) - 7200,
  },
];

const FULL_HASH = "bbb222bbb222bbb222bbb222bbb222bbb222bbb2";

function renderView() {
  const onRefresh = vi.fn(async () => {});
  const onSuccess = vi.fn();
  const onError = vi.fn();
  render(
    <ReflogView
      path="/repos/x"
      onRefresh={onRefresh}
      onSuccess={onSuccess}
      onError={onError}
    />
  );
  return { onRefresh, onSuccess, onError };
}

async function openRowMenu(message: string) {
  const label = await screen.findByText(message);
  const row = label.closest("button") as HTMLElement;
  fireEvent.contextMenu(row, { button: 2, clientX: 40, clientY: 40 });
  return row;
}

async function openCreateBranchForm() {
  await openRowMenu("commit: fix parser");
  expect(await screen.findByRole("menu")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitem", { name: "Create branch here…" }));
  return (await screen.findByRole("textbox", {
    name: "Branch name",
  })) as HTMLInputElement;
}

beforeEach(() => {
  vi.mocked(gitGetReflog).mockResolvedValue(entries);
  vi.mocked(gitCheckoutCommit).mockResolvedValue(undefined as never);
  vi.mocked(createBranch).mockClear();
  vi.mocked(createBranch).mockResolvedValue(undefined as never);
});

describe("ReflogView create branch here", () => {
  it("opens the row context menu and offers Create branch here before the existing items", async () => {
    renderView();

    await openRowMenu("commit: fix parser");

    expect(await screen.findByRole("menu")).toBeInTheDocument();
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveTextContent("Create branch here…");
    expect(
      screen.getByRole("menuitem", { name: "Create branch here…" })
    ).toBeInTheDocument();
  });

  it("creates a branch at the entry hash from the inline form", async () => {
    const { onRefresh, onSuccess } = renderView();

    const input = await openCreateBranchForm();
    fireEvent.change(input, { target: { value: "feature-x" } });

    const confirm = screen.getByRole("button", { name: "Create" });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(createBranch).toHaveBeenCalledWith("/repos/x", "feature-x", FULL_HASH)
    );
    await waitFor(() => expect(onRefresh).toHaveBeenCalled());
    expect(onSuccess).toHaveBeenCalledWith("Created branch 'feature-x'");
    await waitFor(() =>
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    );
  });

  it("keeps the confirm button disabled for an empty or invalid branch name", async () => {
    renderView();

    const input = await openCreateBranchForm();
    const confirm = screen.getByRole("button", { name: "Create" });
    expect(confirm).toBeDisabled();

    fireEvent.change(input, { target: { value: "   " } });
    expect(confirm).toBeDisabled();

    fireEvent.change(input, { target: { value: "bad name" } });
    expect(confirm).toBeDisabled();

    fireEvent.change(input, { target: { value: "good-name" } });
    expect(confirm).not.toBeDisabled();
    expect(createBranch).not.toHaveBeenCalled();
  });

  it("closes the inline form on cancel without creating a branch", async () => {
    renderView();

    const input = await openCreateBranchForm();
    fireEvent.change(input, { target: { value: "feature-y" } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    );
    expect(createBranch).not.toHaveBeenCalled();
  });
});
