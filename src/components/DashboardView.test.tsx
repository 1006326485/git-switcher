import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectDetail } from "../lib/types";
import { DashboardView } from "./DashboardView";

vi.mock("../lib/tauri", () => ({
  analyzeBranchHealth: vi.fn().mockResolvedValue({ branches: [] }),
}));

const group = {
  id: "default",
  name: "Default",
  color: null,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
};

const projects: ProjectDetail[] = [
  {
    project: {
      id: "api",
      name: "api",
      path: "/repos/api",
      alias: null,
      sort_order: 0,
      group_id: group.id,
      last_active_at: null,
      last_commit_hash: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    current_branch: "feature/api",
    branches: [],
    status: { modified: 2, staged: 1, untracked: 0, ahead: 0, behind: 3 },
    group,
    stash_count: 0,
  },
  {
    project: {
      id: "web",
      name: "web",
      path: "/repos/web",
      alias: "Web app",
      sort_order: 1,
      group_id: group.id,
      last_active_at: "2026-07-19T00:00:00Z",
      last_commit_hash: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    current_branch: "main",
    branches: [],
    status: { modified: 0, staged: 0, untracked: 0, ahead: 2, behind: 0 },
    group,
    stash_count: 0,
  },
];

describe("DashboardView", () => {
  // Stale detection is relative to the current date, so pin the clock to keep
  // the "inactive" classification deterministic regardless of when tests run.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("turns summary cards into filter drill-downs", () => {
    const onDrillDown = vi.fn();
    render(<DashboardView projects={projects} onDrillDown={onDrillDown} />);

    fireEvent.click(screen.getByRole("button", { name: "View 1 project with changes" }));
    expect(onDrillDown).toHaveBeenLastCalledWith("modified");

    fireEvent.click(screen.getByRole("button", { name: "View 1 project ahead of remote" }));
    expect(onDrillDown).toHaveBeenLastCalledWith("ahead");

    fireEvent.click(screen.getByRole("button", { name: "View 1 project behind remote" }));
    expect(onDrillDown).toHaveBeenLastCalledWith("behind");

    fireEvent.click(screen.getByRole("button", { name: "View all 2 projects" }));
    expect(onDrillDown).toHaveBeenLastCalledWith("all");
  });

  it("keeps risk and attention lists connected to their existing filters", () => {
    const onDrillDown = vi.fn();
    render(<DashboardView projects={projects} onDrillDown={onDrillDown} />);

    fireEvent.click(screen.getByRole("button", { name: "View 1 conflict risk" }));
    expect(onDrillDown).toHaveBeenLastCalledWith("behind");

    fireEvent.click(screen.getByRole("button", { name: "View 1 inactive projects" }));
    expect(onDrillDown).toHaveBeenLastCalledWith("stale");

    fireEvent.click(screen.getByRole("button", { name: "View 1 needs attention" }));
    expect(onDrillDown).toHaveBeenLastCalledWith("modified");
  });
});
