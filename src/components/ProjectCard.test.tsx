import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ProjectDetail } from "../lib/types";
import { ProjectCard } from "./ProjectCard";
import { ProjectProvider, type ProjectActions } from "../context/ProjectContext";

// This test is about where the Git Operations body lives, not about Tauri:
// every backend call is auto-mocked to resolve to an empty list.
vi.mock("../lib/tauri", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const mock: Record<string, unknown> = {};
  for (const key of Object.keys(actual)) {
    mock[key] = vi.fn(async () => []);
  }
  return mock;
});

const group = {
  id: "default",
  name: "Default",
  color: null,
  sort_order: 0,
  created_at: "2026-01-01T00:00:00Z",
};

const detail: ProjectDetail = {
  project: {
    id: "a",
    name: "alpha",
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
};

const actions = {
  onSwitchBranch: vi.fn(),
  onRefresh: vi.fn(async () => detail),
  onRemove: vi.fn(),
  onSuccess: vi.fn(),
  onError: vi.fn(),
  onInfo: vi.fn(),
} as unknown as ProjectActions;

function renderCard(gitOpsOpen: boolean) {
  return render(
    <ProjectProvider value={actions}>
      <ProjectCard
        detail={detail}
        gitOpsOpen={gitOpsOpen}
        onToggleGitOps={vi.fn()}
        sortable={false}
      />
    </ProjectProvider>
  );
}

/** The card's own root element (the bordered, rounded surface). */
function cardRoot() {
  return document.querySelector("[data-project-id='a']") as HTMLElement;
}

describe("ProjectCard Git Operations containment", () => {
  it("keeps the panel body inside the card so an expanded card stays one card", async () => {
    renderCard(true);

    // The panel content is a descendant of the card surface, not a sibling
    // full-width element: one card, one border, one background.
    const fetch = await screen.findByLabelText("Fetch from remote");
    expect(cardRoot().contains(fetch)).toBe(true);
    // The card stops at its own border — the grid wrapper owns the row span.
    expect(cardRoot().className).not.toContain("col-span-full");
  });

  it("shows only the trigger while collapsed", () => {
    renderCard(false);

    expect(screen.getByLabelText("Toggle git operations")).toBeInTheDocument();
    expect(screen.queryByLabelText("Fetch from remote")).toBeNull();
  });

  it("toggles through the controlled state instead of expanding on its own", () => {
    const onToggleGitOps = vi.fn();
    render(
      <ProjectProvider value={actions}>
        <ProjectCard
          detail={detail}
          gitOpsOpen={false}
          onToggleGitOps={onToggleGitOps}
          sortable={false}
        />
      </ProjectProvider>
    );

    fireEvent.click(screen.getByLabelText("Toggle git operations"));

    expect(onToggleGitOps).toHaveBeenCalledTimes(1);
    // Still collapsed: the parent owns `gitOpsOpen`, so nothing opened here.
    expect(screen.queryByLabelText("Fetch from remote")).toBeNull();
  });
});
