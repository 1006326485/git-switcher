export interface RecentCommandEntry {
  name: string;
  command: string;
}

const STORAGE_KEY = "recent-commands";

function readAll(): Record<string, RecentCommandEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, RecentCommandEntry>;
  } catch {
    return {};
  }
}

export function getRecentCommand(path: string): RecentCommandEntry | null {
  const entry = readAll()[path];
  if (!entry || typeof entry.command !== "string" || !entry.command) return null;
  return { name: typeof entry.name === "string" ? entry.name : "", command: entry.command };
}

export function setRecentCommand(path: string, entry: RecentCommandEntry): void {
  const all = readAll();
  all[path] = entry;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Storage may be unavailable or full; recent commands are best-effort.
  }
}
