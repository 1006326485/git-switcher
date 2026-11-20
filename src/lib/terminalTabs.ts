export interface TerminalSessionState {
  id: string;
  title: string;
  cwd: string;
  projectKey: string;
  projectTitle: string;
  command?: string;
  exited: boolean;
}

export interface TerminalTabsState {
  sessions: TerminalSessionState[];
  activeId: string | null;
  activeProject: string | null;
  activeByProject: Record<string, string>;
}

export const EMPTY_TABS: TerminalTabsState = {
  sessions: [],
  activeId: null,
  activeProject: null,
  activeByProject: {},
};

function pruneActiveByProject(
  activeByProject: Record<string, string>,
  sessions: TerminalSessionState[]
): Record<string, string> {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const pruned: Record<string, string> = {};
  for (const [projectKey, id] of Object.entries(activeByProject)) {
    const session = byId.get(id);
    if (session && session.projectKey === projectKey) pruned[projectKey] = id;
  }
  return pruned;
}

export function preferredSessionOfProject(
  state: TerminalTabsState,
  projectKey: string
): TerminalSessionState | null {
  const group = sessionsOfProject(state, projectKey);
  if (group.length === 0) return null;
  const remembered = state.activeByProject[projectKey];
  if (remembered != null) {
    const match = group.find((s) => s.id === remembered);
    if (match) return match;
  }
  return group[group.length - 1] ?? null;
}

export function projectKeys(state: TerminalTabsState): string[] {
  const keys: string[] = [];
  for (const s of state.sessions) {
    if (!keys.includes(s.projectKey)) keys.push(s.projectKey);
  }
  return keys;
}

export function sessionsOfProject(
  state: TerminalTabsState,
  projectKey: string
): TerminalSessionState[] {
  return state.sessions.filter((s) => s.projectKey === projectKey);
}

export function latestSessionOfProject(
  state: TerminalTabsState,
  projectKey: string
): TerminalSessionState | null {
  const group = sessionsOfProject(state, projectKey);
  return group[group.length - 1] ?? null;
}

export function findCommandSession(
  sessions: TerminalSessionState[],
  projectKey: string,
  command: string
): TerminalSessionState | null {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    if (s.projectKey === projectKey && s.command === command) return s;
  }
  return null;
}

export function nextProjectKey(
  keys: string[],
  current: string | null,
  dir: 1 | -1
): string | null {
  if (keys.length === 0) return null;
  const index = current == null ? -1 : keys.indexOf(current);
  if (index < 0) return dir === 1 ? keys[0] : keys[keys.length - 1];
  return keys[(index + dir + keys.length) % keys.length];
}

export function nextActiveInProject(
  sessions: TerminalSessionState[],
  projectKey: string,
  currentIndex: number,
  dir: 1 | -1
): string | null {
  const group = sessions.filter((s) => s.projectKey === projectKey);
  if (group.length === 0) return null;
  const index = (((currentIndex + dir) % group.length) + group.length) % group.length;
  return group[index].id;
}

/**
 * Applies the shared session snapshot (from the backend) while keeping the
 * local selection; falls back to the nearest sibling when it disappeared.
 */
export function applySessions(
  state: TerminalTabsState,
  sessions: TerminalSessionState[]
): TerminalTabsState {
  const pruned = pruneActiveByProject(state.activeByProject, sessions);
  const activeAlive = state.activeId != null && sessions.some((s) => s.id === state.activeId);
  if (activeAlive) {
    const active = sessions.find((s) => s.id === state.activeId)!;
    return {
      sessions,
      activeId: state.activeId,
      activeProject: state.activeProject,
      activeByProject: {
        ...pruned,
        [active.projectKey]: active.id,
      },
    };
  }
  const group =
    state.activeProject != null
      ? sessions.filter((s) => s.projectKey === state.activeProject)
      : [];
  const remembered =
    state.activeProject != null ? pruned[state.activeProject] : undefined;
  const next =
    group.find((s) => s.id === remembered) ??
    group[group.length - 1] ??
    sessions[sessions.length - 1] ??
    null;
  if (next == null) return { sessions, activeId: null, activeProject: null, activeByProject: pruned };
  return {
    sessions,
    activeId: next.id,
    activeProject: next.projectKey,
    activeByProject: { ...pruned, [next.projectKey]: next.id },
  };
}

/** Optimistically merges one session (e.g. right after opening it) and makes it active. */
export function upsertSession(
  state: TerminalTabsState,
  session: TerminalSessionState
): TerminalTabsState {
  const index = state.sessions.findIndex((s) => s.id === session.id);
  const sessions =
    index < 0
      ? [...state.sessions, session]
      : state.sessions.map((s) => (s.id === session.id ? session : s));
  return setActive({ ...state, sessions }, session.id);
}

/**
 * Rewrites the session list into `orderedIds`. Ids the caller does not know
 * about (a session opened by another window mid-drag) keep their relative
 * position at the end, so a reorder can never drop a tab.
 */
export function orderSessions(
  sessions: TerminalSessionState[],
  orderedIds: string[]
): TerminalSessionState[] {
  const remaining = new Map(sessions.map((s) => [s.id, s]));
  const ordered: TerminalSessionState[] = [];
  for (const id of orderedIds) {
    const session = remaining.get(id);
    if (!session) continue;
    ordered.push(session);
    remaining.delete(id);
  }
  for (const session of sessions) {
    if (remaining.has(session.id)) ordered.push(session);
  }
  return ordered;
}

/**
 * Moves one tab onto another tab's slot and returns the full session id order.
 * Only the project's own tabs are permuted: other projects' sessions keep the
 * slots they already occupy, so a tab drag never reorders a sibling group.
 */
export function moveTabIds(
  sessions: TerminalSessionState[],
  projectKey: string,
  activeId: string,
  overId: string
): string[] {
  const groupIds = sessions.filter((s) => s.projectKey === projectKey).map((s) => s.id);
  const from = groupIds.indexOf(activeId);
  const to = groupIds.indexOf(overId);
  if (from < 0 || to < 0 || from === to) return sessions.map((s) => s.id);
  const [moved] = groupIds.splice(from, 1);
  groupIds.splice(to, 0, moved);
  let next = 0;
  return sessions.map((s) => (s.projectKey === projectKey ? groupIds[next++] : s.id));
}

/**
 * Moves a whole project group onto another group's slot and returns the full
 * session id order. Groups are blocks: their tabs keep their internal order,
 * and the blocks are written back contiguously, which is the flat order the
 * sidebar reads its groups from.
 */
export function moveProjectIds(
  sessions: TerminalSessionState[],
  fromKey: string,
  toKey: string
): string[] {
  const blocks = new Map<string, TerminalSessionState[]>();
  for (const session of sessions) {
    const block = blocks.get(session.projectKey);
    if (block) block.push(session);
    else blocks.set(session.projectKey, [session]);
  }
  const keys = [...blocks.keys()];
  const from = keys.indexOf(fromKey);
  const to = keys.indexOf(toKey);
  if (from < 0 || to < 0 || from === to) return sessions.map((s) => s.id);
  const [moved] = keys.splice(from, 1);
  keys.splice(to, 0, moved);
  return keys.flatMap((key) => blocks.get(key)!.map((s) => s.id));
}

export function setActive(state: TerminalTabsState, id: string): TerminalTabsState {
  const session = state.sessions.find((s) => s.id === id);
  if (!session) return state;
  return {
    ...state,
    activeId: id,
    activeProject: session.projectKey,
    activeByProject: { ...state.activeByProject, [session.projectKey]: id },
  };
}

export function setActiveProject(state: TerminalTabsState, projectKey: string): TerminalTabsState {
  const group = sessionsOfProject(state, projectKey);
  if (group.length === 0) return state;
  const rememberedBase = { ...state.activeByProject };
  const leaving = state.activeId != null ? state.sessions.find((s) => s.id === state.activeId) : undefined;
  if (leaving) rememberedBase[leaving.projectKey] = leaving.id;
  const withLeaving: TerminalTabsState = { ...state, activeByProject: rememberedBase };
  const keepActive =
    state.activeId != null && group.some((s) => s.id === state.activeId)
      ? state.activeId
      : null;
  if (keepActive != null) {
    return {
      ...withLeaving,
      activeProject: projectKey,
      activeId: keepActive,
      activeByProject: { ...rememberedBase, [projectKey]: keepActive },
    };
  }
  const nextId =
    preferredSessionOfProject(withLeaving, projectKey)?.id ?? group[group.length - 1].id;
  return {
    ...withLeaving,
    activeProject: projectKey,
    activeId: nextId,
    activeByProject: { ...rememberedBase, [projectKey]: nextId },
  };
}
