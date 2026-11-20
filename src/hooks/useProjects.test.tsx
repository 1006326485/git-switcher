import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjects } from "./useProjects";
import * as api from "../lib/tauri";
import type { ProjectDetail } from "../lib/types";

vi.mock("../lib/tauri", () => ({
  listProjects: vi.fn(),
  listGroups: vi.fn(() => Promise.resolve([{ id: "g1", name: "Default" }])),
  rebuildTrayMenu: vi.fn(() => Promise.resolve()),
  refreshProject: vi.fn(),
  addProject: vi.fn(),
  removeProject: vi.fn(),
  importWorkspace: vi.fn(),
  initGitProject: vi.fn(),
  switchBranch: vi.fn(),
  setProjectAlias: vi.fn(),
  reorderProjects: vi.fn(() => Promise.resolve()),
}));

function detail(path: string, overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    project: {
      id: path,
      name: path.split("/").pop() ?? path,
      path,
      alias: null,
      description: null,
      notes: null,
      last_commit_hash: "abc",
      group_id: "g1",
      sort_order: 0,
      created_at: "2024-01-01T00:00:00Z",
      last_active_at: null,
    },
    current_branch: "main",
    branches: [],
    status: { modified: 0, staged: 0, untracked: 0, ahead: 0, behind: 0, unmodified: 0, conflicted: 0 },
    group: { id: "g1", name: "Default", color: null, sort_order: 0, created_at: "" },
    stash_count: 0,
    ...overrides,
  } as ProjectDetail;
}

/** A promise whose settlement the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.mocked(api.listProjects).mockReset();
  vi.mocked(api.refreshProject).mockReset();
});

describe("useProjects initial paint", () => {
  it("starts in the first-paint loading state and settles with a timestamp", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([detail("/a")]);
    const { result } = renderHook(() => useProjects());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.projects).toHaveLength(1);
    expect(result.current.lastRefreshedAt).not.toBeNull();
    // First paint must not look like a refresh: no hairline on top of the skeleton.
    expect(result.current.isRefreshing).toBe(false);
  });
});

describe("useProjects refreshAll", () => {
  it("coalesces concurrent refreshes into one list_projects call", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([detail("/a")]);
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));
    vi.mocked(api.listProjects).mockClear();

    const gate = deferred<ProjectDetail[]>();
    vi.mocked(api.listProjects).mockReturnValue(gate.promise);

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.refreshAll();
      second = result.current.refreshAll();
    });

    // Hammering Cmd+R must not queue overlapping reads.
    expect(api.listProjects).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve([detail("/a")]);
      await Promise.all([first, second]);
    });
    expect(result.current.isRefreshing).toBe(false);
  });

  it("reports isRefreshing[All] while the read is in flight", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([detail("/a")]);
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const gate = deferred<ProjectDetail[]>();
    vi.mocked(api.listProjects).mockReturnValue(gate.promise);

    let run!: Promise<void>;
    act(() => {
      run = result.current.refreshAll();
    });
    await waitFor(() => expect(result.current.isRefreshingAll).toBe(true));
    expect(result.current.isRefreshing).toBe(true);

    await act(async () => {
      gate.resolve([detail("/a")]);
      await run;
    });
    await waitFor(() => expect(result.current.isRefreshingAll).toBe(false));
  });

  it("discards a snapshot that a local write superseded", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([detail("/a", { current_branch: "main" })]);
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // The read returns the pre-switch branch, but a switch landed meanwhile.
    const stale = deferred<ProjectDetail[]>();
    vi.mocked(api.listProjects).mockReturnValueOnce(stale.promise);
    vi.mocked(api.listProjects).mockResolvedValueOnce([detail("/a", { current_branch: "feature" })]);

    let run!: Promise<void>;
    act(() => {
      run = result.current.refreshAll();
    });

    await act(async () => {
      // switchBranch bumps the generation before the stale read lands.
      const switched = deferred<ProjectDetail>();
      vi.mocked(api.switchBranch).mockReturnValue(switched.promise);
      const pending = result.current.switchBranch("/a", "feature");
      switched.resolve(detail("/a", { current_branch: "feature" }));
      await pending;
    });

    await act(async () => {
      stale.resolve([detail("/a", { current_branch: "main" })]);
      await run;
    });

    // The optimistic branch survives: the pre-switch snapshot was dropped and
    // the follow-up read confirmed it.
    expect(result.current.projects[0].current_branch).toBe("feature");
    expect(api.listProjects).toHaveBeenCalledTimes(3);
  });
});

describe("useProjects refreshProject", () => {
  it("coalesces repeat refreshes of the same path", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([detail("/a")]);
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const gate = deferred<ProjectDetail>();
    vi.mocked(api.refreshProject).mockReturnValue(gate.promise);

    let first!: Promise<ProjectDetail>;
    let second!: Promise<ProjectDetail>;
    act(() => {
      first = result.current.refreshProject("/a");
      second = result.current.refreshProject("/a");
    });

    // A key-repeat on Space must not stack git walks against one repo.
    expect(api.refreshProject).toHaveBeenCalledTimes(1);

    await act(async () => {
      gate.resolve(detail("/a"));
      await Promise.all([first, second]);
    });
    expect(first).toBe(second);
  });

  it("publishes the path as refreshing for the whole read", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([detail("/a"), detail("/b")]);
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const gate = deferred<ProjectDetail>();
    vi.mocked(api.refreshProject).mockReturnValue(gate.promise);

    let run!: Promise<ProjectDetail>;
    act(() => {
      run = result.current.refreshProject("/a");
    });
    await waitFor(() => expect(result.current.refreshingPaths.has("/a")).toBe(true));
    expect(result.current.refreshingProjectCount).toBe(1);
    expect(result.current.isRefreshing).toBe(true);

    await act(async () => {
      gate.resolve(detail("/a"));
      await run;
    });
    await waitFor(() => expect(result.current.refreshingPaths.has("/a")).toBe(false));
    expect(result.current.isRefreshing).toBe(false);
  });

  it("clears the busy path even when the read fails", async () => {
    vi.mocked(api.listProjects).mockResolvedValue([detail("/a")]);
    const { result } = renderHook(() => useProjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(api.refreshProject).mockRejectedValue(new Error("boom"));
    await act(async () => {
      await result.current.refreshProject("/a").catch(() => {});
    });
    expect(result.current.refreshingPaths.has("/a")).toBe(false);
  });
});
