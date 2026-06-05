import { memo } from "react";
import type { ProjectDetail } from "../lib/types";
import { StatusBadge, GroupDot } from "./ui/primitives";
import { BranchDropdown } from "./BranchDropdown";
import { GitOpsPanel } from "./GitOpsPanel";
import { ProjectRowShell } from "./ProjectRowShell";
import { useProjectActions } from "../context/ProjectContext";

interface ProjectCompactProps {
  projects: ProjectDetail[];
}

const ProjectCompactRow = memo(function ProjectCompactRow({ detail }: { detail: ProjectDetail }) {
  const { onSuccess, onError, onInfo } = useProjectActions();
  const { project, group } = detail;

  return (
    <ProjectRowShell detail={detail}>
      {({ detail: d, row, actionButtons, errorBanner }) => {
        const { current_branch, branches, status } = d;
        const hasChanges = status.modified + status.staged + status.untracked > 0;

        return (
          <div className="relative group">
            <div className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--surface-2)] rounded-lg transition-colors duration-150">
              {/* Group dot */}
              <GroupDot color={group.color} name={group.name} size="sm" />

              {/* Project name */}
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate flex-1 min-w-0">
                {project.alias || project.name}
              </span>

              {/* Branch pill */}
              <BranchDropdown
                currentBranch={current_branch}
                branches={branches}
                onSwitch={row.handleSwitch}
                loading={row.switching}
                variant="compact"
              />

              {/* Status chips */}
              <div className="flex items-center gap-1 shrink-0">
                <StatusBadge type="modified" count={status.modified} variant="compact" />
                <StatusBadge type="staged" count={status.staged} variant="compact" />
                <StatusBadge type="untracked" count={status.untracked} variant="compact" />
                <StatusBadge type="ahead" count={status.ahead} variant="compact" />
                <StatusBadge type="behind" count={status.behind} variant="compact" />
                {!hasChanges && status.ahead === 0 && status.behind === 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">clean</span>
                )}
              </div>

              {/* Action buttons — visible on hover */}
              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                {actionButtons}
              </div>
            </div>

            {errorBanner}

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

export const ProjectCompact = memo(function ProjectCompact({ projects }: ProjectCompactProps) {
  return (
    <div className="bg-[var(--surface-1)] border border-[var(--border-color)] rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/50">
      {projects.map((detail) => (
        <ProjectCompactRow key={detail.project.id} detail={detail} />
      ))}
    </div>
  );
});
