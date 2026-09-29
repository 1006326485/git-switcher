import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectContextMenu } from "./ProjectContextMenu";

vi.mock("../lib/tauri", () => ({
  gitGetFiles: vi.fn().mockResolvedValue([]),
  gitGetReflog: vi.fn().mockResolvedValue([]),
  setProjectColor: vi.fn().mockResolvedValue(undefined),
  openInTerminal: vi.fn().mockResolvedValue(undefined),
  openInFinder: vi.fn().mockResolvedValue(undefined),
  openInVscode: vi.fn().mockResolvedValue(undefined),
  gitListWorktrees: vi.fn().mockResolvedValue([]),
  gitListSubmodules: vi.fn().mockResolvedValue([]),
  gitBisectStatus: vi.fn().mockResolvedValue({}),
}));

const noop = () => {};

describe("ProjectContextMenu tools menu", () => {
  it("opens the second-level tools panel grouped by git domain", async () => {
    render(
      <ProjectContextMenu
        projectId="p1"
        path="/repos/x"
        title="demo"
        onSuccess={noop}
        onError={noop}
      />
    );
    fireEvent.click(screen.getByTitle("More actions"));
    fireEvent.click(await screen.findByText("Project Tools"));

    // Second-level panel with the three git-domain groups
    expect(await screen.findByRole("group", { name: "History" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Worktree" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Tools" })).toBeInTheDocument();

    // Orphaned panels now have an entry point
    expect(screen.getByRole("button", { name: "Reflog" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Worktrees" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bisect" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: ".gitignore Editor…" })).toBeInTheDocument();
  });
});
