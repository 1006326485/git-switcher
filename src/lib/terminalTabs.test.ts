import { describe, it, expect } from "vitest";
import {
  applySessions,
  findCommandSession,
  latestSessionOfProject,
  moveProjectIds,
  moveTabIds,
  nextActiveInProject,
  orderSessions,
  nextProjectKey,
  preferredSessionOfProject,
  projectKeys,
  setActive,
  setActiveProject,
  sessionsOfProject,
  upsertSession,
  type TerminalSessionState,
  type TerminalTabsState,
} from "./terminalTabs";

function session(id: string, projectKey = `proj-${id}`): TerminalSessionState {
  return {
    id,
    title: `tab-${id}`,
    cwd: projectKey,
    projectKey,
    projectTitle: `Project ${projectKey}`,
    exited: false,
  };
}

function tabs(
  ...sessions: TerminalSessionState[]
): TerminalTabsState {
  return { sessions, activeId: null, activeProject: null, activeByProject: {} };
}

function activeTabs(
  sessions: TerminalSessionState[],
  activeId: string,
  activeProject: string,
  activeByProject: Record<string, string> = {}
): TerminalTabsState {
  return { sessions, activeId, activeProject, activeByProject };
}

describe("shared session snapshot", () => {
  it("keeps the local selection when it survives the snapshot", () => {
    const start: TerminalTabsState = activeTabs([session("a", "pa")], "a", "pa");
    const next = [session("a", "pa"), session("b", "pb")];
    const state = applySessions(start, next);
    expect(state.sessions).toEqual(next);
    expect(state.activeId).toBe("a");
    expect(state.activeProject).toBe("pa");
  });

  it("falls back to the same project group when the active tab is gone", () => {
    const start: TerminalTabsState = activeTabs(
      [session("a1", "pa"), session("a2", "pa"), session("b1", "pb")],
      "a2",
      "pa"
    );
    const state = applySessions(start, [session("a1", "pa"), session("b1", "pb")]);
    expect(state.activeId).toBe("a1");
    expect(state.activeProject).toBe("pa");
  });

  it("falls back to the last session when its group is gone too", () => {
    const start: TerminalTabsState = activeTabs(
      [session("a1", "pa"), session("b1", "pb")],
      "a1",
      "pa"
    );
    const state = applySessions(start, [session("b1", "pb")]);
    expect(state.activeId).toBe("b1");
    expect(state.activeProject).toBe("pb");
  });

  it("leaves no active tab for an empty snapshot", () => {
    const start: TerminalTabsState = activeTabs([session("a", "pa")], "a", "pa");
    const state = applySessions(start, []);
    expect(state.sessions).toEqual([]);
    expect(state.activeId).toBeNull();
    expect(state.activeProject).toBeNull();
  });

  it("upserts a new session and activates it with its project", () => {
    const state = upsertSession(tabs(session("a", "pa")), session("b", "pb"));
    expect(state.sessions.map((s) => s.id)).toEqual(["a", "b"]);
    expect(state.activeId).toBe("b");
    expect(state.activeProject).toBe("pb");
  });

  it("replaces an existing session by id without duplicating it", () => {
    const start: TerminalTabsState = activeTabs(
      [session("a", "pa"), session("b", "pb")],
      "b",
      "pb"
    );
    const updated = { ...session("a", "pa"), exited: true };
    const state = upsertSession(start, updated);
    expect(state.sessions.map((s) => s.id)).toEqual(["a", "b"]);
    expect(state.sessions[0].exited).toBe(true);
    expect(state.activeId).toBe("a");
  });
});

describe("project grouping", () => {
  const grouped: TerminalTabsState = activeTabs(
    [session("a1", "pa"), session("b1", "pb"), session("a2", "pa"), session("c1", "pc")],
    "a2",
    "pa"
  );

  it("lists project keys in first-appearance order", () => {
    expect(projectKeys(grouped)).toEqual(["pa", "pb", "pc"]);
  });

  it("lists only the sessions of a project", () => {
    expect(sessionsOfProject(grouped, "pa").map((s) => s.id)).toEqual(["a1", "a2"]);
    expect(sessionsOfProject(grouped, "missing")).toEqual([]);
  });

  it("finds the latest session of a project", () => {
    expect(latestSessionOfProject(grouped, "pa")?.id).toBe("a2");
    expect(latestSessionOfProject(grouped, "missing")).toBeNull();
  });

  it("activates a session together with its project", () => {
    const state = setActive(grouped, "b1");
    expect(state.activeId).toBe("b1");
    expect(state.activeProject).toBe("pb");
    expect(setActive(grouped, "missing")).toBe(grouped);
  });

  it("activates the latest session of a project and keeps a session already in it", () => {
    const state = setActiveProject(grouped, "pb");
    expect(state.activeId).toBe("b1");
    expect(state.activeProject).toBe("pb");

    const same = setActiveProject(grouped, "pa");
    expect(same.activeId).toBe("a2");
    expect(same.activeProject).toBe("pa");

    expect(setActiveProject(grouped, "missing")).toBe(grouped);
  });

  it("remembers the selected tab of each project across switches", () => {
    let state = activeTabs(
      [session("a1", "pa"), session("a2", "pa"), session("b1", "pb"), session("b2", "pb")],
      "a1",
      "pa"
    );
    state = setActiveProject(state, "pb");
    state = setActive(state, "b1");
    state = setActiveProject(state, "pa");
    expect(state.activeId).toBe("a1");
    state = setActiveProject(state, "pb");
    expect(state.activeId).toBe("b1");
    expect(preferredSessionOfProject(state, "pa")?.id).toBe("a1");
  });

  it("falls back to the latest tab once the remembered one is gone", () => {
    let state = activeTabs(
      [session("a1", "pa"), session("a2", "pa"), session("b1", "pb")],
      "b1",
      "pb",
      { pa: "a1" }
    );
    state = applySessions(state, [session("a2", "pa"), session("b1", "pb")]);
    state = setActiveProject(state, "pa");
    expect(state.activeId).toBe("a2");
  });
});

describe("cyclic navigation", () => {
  it("cycles project keys in both directions and wraps", () => {
    const keys = ["pa", "pb", "pc"];
    expect(nextProjectKey(keys, "pa", 1)).toBe("pb");
    expect(nextProjectKey(keys, "pc", 1)).toBe("pa");
    expect(nextProjectKey(keys, "pa", -1)).toBe("pc");
    expect(nextProjectKey(keys, "pb", -1)).toBe("pa");
    expect(nextProjectKey(keys, "missing", 1)).toBe("pa");
    expect(nextProjectKey(keys, "missing", -1)).toBe("pc");
    expect(nextProjectKey([], "pa", 1)).toBeNull();
  });

  it("cycles sessions within a project and wraps", () => {
    const sessions = [session("a1", "pa"), session("b1", "pb"), session("a2", "pa"), session("a3", "pa")];
    expect(nextActiveInProject(sessions, "pa", 0, 1)).toBe("a2");
    expect(nextActiveInProject(sessions, "pa", 2, 1)).toBe("a1");
    expect(nextActiveInProject(sessions, "pa", 0, -1)).toBe("a3");
    expect(nextActiveInProject(sessions, "pa", 1, -1)).toBe("a1");
    expect(nextActiveInProject(sessions, "missing", 0, 1)).toBeNull();
  });
});

describe("command session lookup", () => {
  const cmd = (id: string, projectKey: string, command: string): TerminalSessionState => ({
    ...session(id, projectKey),
    command,
  });

  it("returns null for an empty session list", () => {
    expect(findCommandSession([], "pa", "yarn run serve:watch")).toBeNull();
  });

  it("matches a session on project and command", () => {
    const target = cmd("a1", "pa", "yarn run serve:watch");
    const sessions = [target, cmd("a2", "pa", "yarn run build"), cmd("b1", "pb", "yarn run serve:watch")];
    expect(findCommandSession(sessions, "pa", "yarn run serve:watch")).toBe(target);
  });

  it("ignores sessions without the command or project", () => {
    const sessions = [cmd("a1", "pa", "yarn run build"), session("a2", "pa")];
    expect(findCommandSession(sessions, "pa", "yarn run serve:watch")).toBeNull();
    expect(findCommandSession(sessions, "pb", "yarn run build")).toBeNull();
  });

  it("returns the latest match regardless of exit state", () => {
    const first = cmd("a1", "pa", "yarn run serve:watch");
    const latest = { ...cmd("a2", "pa", "yarn run serve:watch"), exited: true };
    expect(findCommandSession([first, latest], "pa", "yarn run serve:watch")).toBe(latest);
  });
});

describe("drag reordering", () => {
  // Sessions are not stored contiguously per project: a project's tabs may sit
  // either side of another project's tab, and only the flat order is shared.
  const interleaved = () => [
    session("a1", "pa"),
    session("b1", "pb"),
    session("a2", "pa"),
    session("c1", "pc"),
  ];

  it("moves a tab onto the slot it was dropped on", () => {
    expect(moveTabIds(interleaved(), "pa", "a2", "a1")).toEqual(["a2", "b1", "a1", "c1"]);
  });

  it("leaves other projects' slots untouched when a tab moves", () => {
    const moved = moveTabIds(interleaved(), "pa", "a1", "a2");
    expect(moved).toEqual(["a2", "b1", "a1", "c1"]);
    // Same slots for the other projects, same membership for the moved one.
    expect(moved[1]).toBe("b1");
    expect(moved[3]).toBe("c1");
  });

  it("ignores a drop that is not a move", () => {
    expect(moveTabIds(interleaved(), "pa", "a1", "a1")).toEqual(["a1", "b1", "a2", "c1"]);
    expect(moveTabIds(interleaved(), "pa", "a1", "missing")).toEqual(["a1", "b1", "a2", "c1"]);
  });

  it("moves a whole project block past its neighbours", () => {
    expect(moveProjectIds(interleaved(), "pa", "pc")).toEqual(["b1", "c1", "a1", "a2"]);
    expect(moveProjectIds(interleaved(), "pc", "pa")).toEqual(["c1", "a1", "a2", "b1"]);
  });

  it("writes blocks back contiguously so grouping follows the new order", () => {
    const state = tabs(...orderSessions(interleaved(), moveProjectIds(interleaved(), "pa", "pc")));
    expect(projectKeys(state)).toEqual(["pb", "pc", "pa"]);
    expect(sessionsOfProject(state, "pa").map((s) => s.id)).toEqual(["a1", "a2"]);
  });

  it("keeps a session the caller did not know about", () => {
    // A tab opened by another window between drag start and drop.
    expect(orderSessions(interleaved(), ["c1", "a2", "unknown"]).map((s) => s.id)).toEqual([
      "c1",
      "a2",
      "a1",
      "b1",
    ]);
  });
});
