export interface PickerItem {
  name: string;
  command: string;
  kind: "saved" | "script";
  isGlobal: boolean;
}

export interface SavedCommandInput {
  name: string;
  command: string;
  project_path?: string | null;
}

export interface ProjectScriptInput {
  name: string;
  command: string;
}

export function buildPickerItems(
  saved: SavedCommandInput[],
  scripts: ProjectScriptInput[],
  projectPath: string
): PickerItem[] {
  const savedItems: PickerItem[] = saved
    .filter((c) => !c.project_path || c.project_path === projectPath)
    .map((c) => ({
      name: c.name,
      command: c.command,
      kind: "saved" as const,
      isGlobal: !c.project_path,
    }));
  const scriptItems: PickerItem[] = scripts.map((s) => ({
    name: s.name,
    command: s.command,
    kind: "script" as const,
    isGlobal: false,
  }));
  return [...savedItems, ...scriptItems];
}

export function filterPickerItems(items: PickerItem[], query: string): PickerItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (s) => s.name.toLowerCase().includes(q) || s.command.toLowerCase().includes(q)
  );
}
