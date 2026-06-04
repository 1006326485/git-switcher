import { createContext, useContext, type ReactNode } from "react";
import type { ProjectDetail } from "../lib/types";

/**
 * Shared callbacks that every project row / card needs.
 * Wrapping them in a context eliminates ~40 prop declarations
 * across ProjectGrid -> view components -> row components.
 */
export interface ProjectActions {
  onSwitchBranch: (path: string, branch: string) => Promise<ProjectDetail>;
  onRefresh: (path: string) => Promise<ProjectDetail>;
  onRemove: (id: string) => Promise<void>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onInfo: (msg: string) => void;
  onReorder?: (orderedIds: string[]) => Promise<void>;
  onAliasChange?: (id: string, alias: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectActions | null>(null);

export function ProjectProvider({
  value,
  children,
}: {
  value: ProjectActions;
  children: ReactNode;
}) {
  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

/**
 * Hook to consume project actions from context.
 * Throws if used outside <ProjectProvider>.
 */
export function useProjectActions(): ProjectActions {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error("useProjectActions must be used within <ProjectProvider>");
  }
  return ctx;
}
