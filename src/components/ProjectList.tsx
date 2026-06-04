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
          <div className="flex items-center gap-4 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-sm transition-shadow">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {project.alias || project.name}
                </div>
                <GroupDot color={group.color} name={group.name} size="sm" />
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{project.path}</div>
              {errorBanner}
            </div>

            <div className="shrink-0 w-55">
              <BranchDropdown
                currentBranch={current_branch}
                branches={branches}
                onSwitch={row.handleSwitch}
                loading={row.switching}
              />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <StatusBadge type="modified" count={status.modified} variant="pill" />
              <StatusBadge type="staged" count={status.staged} variant="pill" />
              <StatusBadge type="untracked" count={status.untracked} variant="pill" />
              <StatusBadge type="ahead" count={status.ahead} variant="pill" />
              <StatusBadge type="behind" count={status.behind} variant="pill" />
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              {actionButtons}
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
