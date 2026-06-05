import { memo } from "react";
import type { ProjectDetail } from "../lib/types";
import { StatusBadge, GroupDot } from "./ui/primitives";
import { BranchDropdown } from "./BranchDropdown";
import { GitOpsPanel } from "./GitOpsPanel";
import { ProjectRowShell } from "./ProjectRowShell";
import { useProjectActions } from "../context/ProjectContext";

interface ProjectListProps {
  projects: ProjectDetail[];
}

const ProjectListRow = memo(function ProjectListRow({ detail }: { detail: ProjectDetail }) {
  const { onSuccess, onError, onInfo } = useProjectActions();
  const { project, group } = detail;

  return (
    <ProjectRowShell detail={detail}>
      {({ detail: d, row, actionButtons, errorBanner }) => {
        const { current_branch, branches, status } = d;

        return (
          <div
            data-dragging={undefined}
            className="bg-[var(--surface-1)] border border-[var(--border-color)] rounded-xl shadow-sm dark:shadow-none dark:ring-1 dark:ring-white/5 hover:shadow-md dark:hover:ring-white/10 hover:-translate-y-px transition-all duration-150"
          >
            <div className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {project.alias || project.name}
                  </div>
                  <GroupDot color={group.color} name={group.name} size="sm" />
                </div>
                <button
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-[var(--accent)] dark:hover:text-blue-400 truncate transition-colors duration-150 flex items-center gap-1 group/path"
                  title={`Open in file manager: ${project.path}`}
                  onClick={async () => {
                    try {
                      const { open } = await import("@tauri-apps/plugin-shell");
                      await open(project.path);
                    } catch {
                      await navigator.clipboard.writeText(project.path);
                    }
                  }}
                >
                  <span className="truncate">{project.path}</span>
                  <svg className="w-3 h-3 opacity-0 group-hover/path:opacity-100 transition-opacity shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </button>
                {errorBanner}
              </div>

              <div className="shrink-0 w-44">
                <BranchDropdown
                  currentBranch={current_branch}
                  branches={branches}
                  onSwitch={row.handleSwitch}
                  loading={row.switching}
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {status.modified === 0 && status.staged === 0 && status.untracked === 0 && status.ahead === 0 && status.behind === 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">Clean</span>
                )}
                <StatusBadge type="modified" count={status.modified} variant="pill" />
                <StatusBadge type="staged" count={status.staged} variant="pill" />
                <StatusBadge type="untracked" count={status.untracked} variant="pill" />
                <StatusBadge type="ahead" count={status.ahead} variant="pill" />
                <StatusBadge type="behind" count={status.behind} variant="pill" />
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                {actionButtons}
              </div>
            </div>
            <GitOpsPanel
              path={project.path}
              onRefresh={row.handleGitRefresh}
              onSuccess={onSuccess}
              onError={onError}
              onInfo={onInfo}
            />
          </div>
        );
      }}
    </ProjectRowShell>
  );
});

export const ProjectList = memo(function ProjectList({ projects }: ProjectListProps) {
  return (
    <div className="flex flex-col gap-2">
      {projects.map((detail) => (
        <ProjectListRow key={detail.project.id} detail={detail} />
      ))}
    </div>
  );
});
