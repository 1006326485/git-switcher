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
}

export const EMPTY_TABS: TerminalTabsState = { sessions: [], activeId: null, activeProject: null };

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
  const activeAlive = state.activeId != null && sessions.some((s) => s.id === state.activeId);
  if (activeAlive) {
    return { sessions, activeId: state.activeId, activeProject: state.activeProject };
  }
  const group =
    state.activeProject != null
      ? sessions.filter((s) => s.projectKey === state.activeProject)
      : [];
  const next = group[group.length - 1] ?? sessions[sessions.length - 1] ?? null;
  return { sessions, activeId: next?.id ?? null, activeProject: next?.projectKey ?? null };
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

export function setActive(state: TerminalTabsState, id: string): TerminalTabsState {
  const session = state.sessions.find((s) => s.id === id);
  if (!session) return state;
  return { ...state, activeId: id, activeProject: session.projectKey };
}

export function setActiveProject(state: TerminalTabsState, projectKey: string): TerminalTabsState {
  const group = sessionsOfProject(state, projectKey);
  if (group.length === 0) return state;
  const keepActive = state.activeId != null && group.some((s) => s.id === state.activeId);
  return {
    ...state,
    activeProject: projectKey,
    activeId: keepActive ? state.activeId : group[group.length - 1].id,
  };
}
