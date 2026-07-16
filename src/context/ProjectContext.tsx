import { createContext, useContext, type ReactNode } from "react";
import type { ProjectDetail } from "../lib/types";
import type { ActiveGitOp } from "../hooks/useGitOpTracker";

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
  /** Synchronize a successfully persisted color change into the project list. */
  onColorChange?: (id: string, color: string | null) => void;
  /** Check if a specific op is active for a path */
  isOpActive?: (op: string, path: string) => boolean;
  /** Get the active op details for a specific op+path */
  getActiveOp?: (op: string, path: string) => ActiveGitOp | undefined;
  /** Get any active op for a path (most efficient for per-row checks) */
  getAnyActiveOp?: (path: string) => ActiveGitOp | undefined;
  /** Cancel an active operation by ID */
  cancelOp?: (id: number) => void;
  /** Single-project git operations */
  onFetch?: (path: string) => Promise<void>;
  onPull?: (path: string) => Promise<void>;
  onPush?: (path: string) => Promise<void>;
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
