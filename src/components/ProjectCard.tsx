import { memo } from "react";
import type { ProjectDetail } from "../lib/types";
import { StatusBadge, GroupDot } from "./ui/primitives";
import { BranchDropdown } from "./BranchDropdown";
import { GitOpsPanel } from "./GitOpsPanel";
import { ProjectRowShell } from "./ProjectRowShell";
import { useProjectActions } from "../context/ProjectContext";

interface ProjectCardProps {
  detail: ProjectDetail;
}

export const ProjectCard = memo(function ProjectCard({ detail }: ProjectCardProps) {
  const { onSuccess, onError, onInfo } = useProjectActions();

  return (
    <ProjectRowShell detail={detail}>
      {({ detail: d, row, actionButtons, errorBanner }) => {
        const { project, current_branch, branches, status, group } = d;
        const totalChanges = status.modified + status.staged + status.untracked;
        const hasUpstream = status.ahead > 0 || status.behind > 0;

        return (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
            {/* Header */}
            <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {project.alias || project.name}
                  </h3>
                  <GroupDot color={group.color} name={group.name} size="sm" />
                </div>
                <p
                  className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5"
                  title={project.path}
                >
                  {project.path}
                </p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {actionButtons}
              </div>
            </div>

            {/* Branch selector */}
            <div className="px-4 py-2 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <BranchDropdown
                  currentBranch={current_branch}
                  branches={branches}
                  onSwitch={row.handleSwitch}
                  loading={row.switching}
                />
              </div>
            </div>

            {/* Error message */}
            {errorBanner}

            {/* Status bar */}
            <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
              {totalChanges === 0 && !hasUpstream && (
                <span className="text-xs text-gray-400 dark:text-gray-500">Clean</span>
              )}
              <StatusBadge type="modified" count={status.modified} variant="pill" />
              <StatusBadge type="staged" count={status.staged} variant="pill" />
              <StatusBadge type="untracked" count={status.untracked} variant="pill" />
              <StatusBadge type="ahead" count={status.ahead} variant="pill" />
              <StatusBadge type="behind" count={status.behind} variant="pill" />
            </div>

            {/* Git Operations Panel */}
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
