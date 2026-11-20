import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectDetail } from "../lib/types";
import { ProjectGrid } from "./ProjectGrid";
import { ProjectProvider, type ProjectActions } from "../context/ProjectContext";
import { TaskWorkspaceDialog } from "./TaskWorkspaceDialog";
import { ProjectGroupsPanel } from "./ProjectGroupsPanel";
import { GitOpsPanel } from "./GitOpsPanel";
import * as api from "../lib/tauri";

// Regression coverage for the "fake empty" loading states that batch B5
// removed: a list that is still fetching must never render its empty copy,
// and the skeleton → content swap must be the only thing that fades.

vi.mock("./ProjectCard", () => ({
  ProjectCard: ({ detail }: { detail: ProjectDetail }) => (
    <div data-testid={`card-${detail.project.id}`} />
  ),
}));

vi.mock("../lib/tauri", () => ({
  gitGetFiles: vi.fn(),
  gitStashList: vi.fn().mockResolvedValue([]),
  gitGetStagedDiff: vi.fn().mockResolvedValue(""),
  listGroups: vi.fn(),
  createGroup: vi.fn(),
  deleteGroup: vi.fn(),
  updateGroup: vi.fn(),
  listTaskWorkspaces: vi.fn(),
  createTaskWorkspace: vi.fn(),
  getTaskWorkspace: vi.fn(),
  archiveTaskWorkspace: vi.fn(),
  addTaskWorkspaceProject: vi.fn(),
  removeTaskWorkspaceProject: vi.fn(),
  updateTaskWorkspaceEntry: vi.fn(),
  preflightTaskWorkspace: vi.fn(),
  executeTaskWorkspacePlan: vi.fn(),
  listTaskWorkspaceOutcomes: vi.fn(),
}));

const noop = async () => {};

function makeProject(id: string): ProjectDetail {
  const group = { id: "g", name: "Default", color: null, sort_order: 0, created_at: "2026-01-01T00:00:00Z" };
  return {
    project: {
      id,
      name: id,
      path: `/repos/${id}`,
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
}

const actions = {
  onSwitchBranch: vi.fn(),
  onRefresh: vi.fn(async () => makeProject("a")),
  onRemove: vi.fn(),
  onSuccess: vi.fn(),
  onError: vi.fn(),
  onInfo: vi.fn(),
} as unknown as ProjectActions;

/** A promise whose settlement the test controls. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("TaskWorkspaceDialog list states", () => {
  it("shows loading, then the retryable error, and only then the empty copy", async () => {
    const pending = deferred<never>();
    vi.mocked(api.listTaskWorkspaces).mockReturnValueOnce(pending.promise);

    render(
      <TaskWorkspaceDialog open projects={[]} onClose={vi.fn()} onSuccess={vi.fn()} onError={vi.fn()} />
    );

    // In flight: the empty hint must not appear yet.
    expect(await screen.findByText("Loading…")).toBeInTheDocument();
    expect(
      screen.queryByText("Create a task to coordinate work across repositories.")
    ).not.toBeInTheDocument();

    pending.reject(new Error("list failed"));

    expect(await screen.findByText("Failed to load task workspaces.")).toBeInTheDocument();
    expect(
      screen.queryByText("Create a task to coordinate work across repositories.")
    ).not.toBeInTheDocument();

    vi.mocked(api.listTaskWorkspaces).mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(
      await screen.findByText("Create a task to coordinate work across repositories.")
    ).toBeInTheDocument();
  });
});

describe("ProjectGroupsPanel list states", () => {
  it("distinguishes loading, error+retry and empty", async () => {
    const pending = deferred<never>();
    vi.mocked(api.listGroups).mockReturnValueOnce(pending.promise);

    render(
      <ProjectGroupsPanel
        activeGroup={null}
        onGroupChange={vi.fn()}
        onSuccess={vi.fn()}
        onError={vi.fn()}
      />
    );

    expect(await screen.findByText("Loading…")).toBeInTheDocument();
    expect(screen.queryByText("No groups yet")).not.toBeInTheDocument();

    pending.reject(new Error("nope"));

    expect(await screen.findByText("Failed to load groups")).toBeInTheDocument();
    expect(screen.queryByText("No groups yet")).not.toBeInTheDocument();

    vi.mocked(api.listGroups).mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("No groups yet")).toBeInTheDocument();
  });
});

describe("GitOpsPanel changed-files loading", () => {
  it("shows a skeleton for the first load of a path only", async () => {
    const first = deferred<never>();
    vi.mocked(api.gitGetFiles).mockReturnValueOnce(first.promise);

    render(
      <GitOpsPanel path="/repos/x" onRefresh={noop} onSuccess={noop} onError={noop} onInfo={noop} />
    );

    fireEvent.click(screen.getByLabelText("Toggle git operations"));

    // First load: placeholder instead of a silently empty "no changes" panel.
    expect(await screen.findByTestId("gitops-files-skeleton")).toBeInTheDocument();

    first.resolve([
      { path: "src/a.ts", status: "modified", staged: false },
    ] as never);

    expect(await screen.findByText("src/a.ts")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("gitops-files-skeleton")).not.toBeInTheDocument()
    );

    // Reopening the same path is a refresh: the stale rows stay put and no
    // skeleton flashes.
    const refresh = deferred<never>();
    vi.mocked(api.gitGetFiles).mockReturnValueOnce(refresh.promise);
    fireEvent.click(screen.getByLabelText("Toggle git operations"));
    fireEvent.click(screen.getByLabelText("Toggle git operations"));

    expect(screen.queryByTestId("gitops-files-skeleton")).not.toBeInTheDocument();
    expect(screen.getByText("src/a.ts")).toBeInTheDocument();

    refresh.resolve([{ path: "src/a.ts", status: "modified", staged: false }] as never);
    await waitFor(() => expect(api.gitGetFiles).toHaveBeenCalledTimes(2));
  });
});

describe("ProjectGrid skeleton → content crossfade", () => {
  it("fades once when the skeleton is replaced and not on plain remounts", async () => {
    vi.useFakeTimers();
    const projects = [makeProject("a"), makeProject("b")];

    const view = render(
      <ProjectProvider value={actions}>
        <ProjectGrid projects={projects} loading viewMode="card" isFiltered={false} />
      </ProjectProvider>
    );

    // First paint is the skeleton: nothing fades yet.
    expect(view.container.querySelector(".loading-fade-in")).toBeNull();
    expect(view.container.querySelector(".skeleton-shimmer")).not.toBeNull();

    view.rerender(
      <ProjectProvider value={actions}>
        <ProjectGrid projects={projects} loading={false} viewMode="card" isFiltered={false} />
      </ProjectProvider>
    );

    // The content root carries the one-shot fade…
    const grid = view.container.querySelector(".loading-fade-in");
    expect(grid).not.toBeNull();

    // …and it is dropped once the fade is over, so it cannot replay later.
    act(() => vi.advanceTimersByTime(200));
    expect(view.container.querySelector(".loading-fade-in")).toBeNull();
    expect(screen.getByTestId("card-a")).toBeInTheDocument();
  });
});
