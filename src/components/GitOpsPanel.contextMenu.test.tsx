import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GitOpsPanel } from "./GitOpsPanel";
import { gitDiscardFile, gitGetFiles } from "../lib/tauri";

const noop = async () => {};

vi.mock("../lib/tauri", () => ({
  gitGetFiles: vi.fn(),
  gitStashList: vi.fn().mockResolvedValue([]),
  gitGetStagedDiff: vi.fn().mockResolvedValue(""),
  gitPush: vi.fn().mockResolvedValue("ok"),
  gitStageFile: vi.fn().mockResolvedValue(undefined),
  gitUnstageFile: vi.fn().mockResolvedValue(undefined),
  gitDiscardFile: vi.fn().mockResolvedValue(undefined),
}));

const TRACKED = { path: "src/tracked.ts", status: "modified" as const, staged: true };
const UNTRACKED = { path: "new.txt", status: "untracked" as const, staged: false };

function renderPanel(onOuterContextMenu?: () => void) {
  vi.mocked(gitGetFiles).mockResolvedValue([TRACKED, UNTRACKED] as never);
  render(
    <div onContextMenu={onOuterContextMenu}>
      <GitOpsPanel path="/repos/x" onRefresh={noop} onSuccess={noop} onError={noop} onInfo={noop} />
    </div>
  );
  fireEvent.click(screen.getByLabelText("Toggle git operations"));
}

describe("GitOpsPanel file-row context menu", () => {
  it("offers state-specific actions for a tracked file", async () => {
    renderPanel();

    fireEvent.contextMenu(await screen.findByText("M"));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Unstage" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Blame…" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "File History…" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "View diff" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy Path" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Discard…" })).toBeInTheDocument();
  });

  it("offers Stage and hides tracked-only tools for an untracked file", async () => {
    renderPanel();

    fireEvent.contextMenu(await screen.findByText("??"));

    expect(screen.getByRole("menuitem", { name: "Stage" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Blame…" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "File History…" })).toBeNull();
  });

  it("keeps the native menu when the press lands on an interactive control", async () => {
    renderPanel();

    const diffButtons = await screen.findAllByTitle("View diff");
    fireEvent.contextMenu(diffButtons[0]);

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("does not bubble to the surrounding project row", async () => {
    const onOuterContextMenu = vi.fn();
    renderPanel(onOuterContextMenu);

    fireEvent.contextMenu(await screen.findByText("M"));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(onOuterContextMenu).not.toHaveBeenCalled();
  });

  it("asks for confirmation and only discards after it is confirmed", async () => {
    renderPanel();

    fireEvent.contextMenu(await screen.findByText("M"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Discard…" }));

    expect(await screen.findByText("Discard changes?")).toBeInTheDocument();
    expect(gitDiscardFile).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));

    await waitFor(() =>
      expect(gitDiscardFile).toHaveBeenCalledWith("/repos/x", "src/tracked.ts")
    );
  });

  it("offers bulk actions when the list container is right-clicked", async () => {
    renderPanel();

    // Wait for the file list to render, then right-click the container itself
    // (not on a file row or its interactive children, which open the file menu).
    await screen.findByText("M");
    const container = screen.getByText("M").closest(".max-h-32");
    expect(container).not.toBeNull();
    fireEvent.contextMenu(container!, { target: container! });

    expect(screen.getByRole("menuitem", { name: "Stage All" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Unstage All" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Preview staged diff" })).toBeInTheDocument();
  });
});
