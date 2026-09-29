import type { SavedCommandInput, ProjectScriptInput } from "./scriptPicker";
import type { RunPresetItem } from "./types";

export interface RunEntry {
  id: string;
  label: string;
  description: string;
  name: string;
  command: string;
  projectPath: string | null;
  workspaceItems?: RunPresetItem[];
}

export interface RunProjectInput {
  path: string;
  name: string;
  scripts: ProjectScriptInput[];
}

export function buildRunEntries(
  saved: SavedCommandInput[],
  projects: RunProjectInput[]
): RunEntry[] {
  const projectName = (path: string) => projects.find((p) => p.path === path)?.name ?? path;

  const savedEntries: RunEntry[] = saved.map((c) => ({
    id: `saved-${c.name}`,
    label: c.name,
    description: `${c.project_path ? projectName(c.project_path) : "Global"} · ${c.command}`,
    name: c.name,
    command: c.command,
    projectPath: c.project_path ?? null,
  }));

  const scriptEntries: RunEntry[] = projects.flatMap((p) =>
    p.scripts.map((s) => ({
      id: `script-${p.path}-${s.name}`,
      label: s.name,
      description: `${p.name} · ${s.command}`,
      name: s.name,
      command: s.command,
      projectPath: p.path,
    }))
  );

  return [...savedEntries, ...scriptEntries];
}
