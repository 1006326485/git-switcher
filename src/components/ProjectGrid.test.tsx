import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectDetail } from "../lib/types";
import { ProjectGrid } from "./ProjectGrid";

// The grid layout is the unit under test; leaf item components are stubbed
// so their Tauri-dependent internals don't need mocking here.
vi.mock("./ProjectCard", () => ({
  ProjectCard: ({ detail }: { detail: ProjectDetail }) => (
    <div data-testid={`card-${detail.project.id}`} />
  ),
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
      id: "a",
      name: "a",
      path: "/repos/a",
      alias: null,
      sort_order: 0,
      group_id: group.id,
      last_active_at: null,
      last_commit_hash: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
    current_branch: "main",
    branches: [],
    status: { modified: 0, staged: 0, untracked: 0, ahead: 0, behind: 0 },
    group,
    stash_count: 0,
  },
];

describe("ProjectGrid card view layout", () => {
  it("keeps grid rows unstretched so an expanding card does not resize its neighbours", () => {
    // Regression: GitOpsPanel expands inline inside a card. With the default
    // `align-items: stretch`, CSS Grid grew every card in the same row to the
    // tallest one. `items-start` pins each card to its own content height.
    render(
      <ProjectGrid projects={projects} loading={false} viewMode="card" isFiltered={false} />
    );

    const grid = screen.getByTestId("card-a").parentElement;
    expect(grid?.className).toContain("grid");
    expect(grid?.className).toContain("items-start");
  });
});
