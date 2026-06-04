import { memo } from "react";
import type { ProjectDetail } from "../lib/types";
import { StatusBadge, GroupDot, IconButton } from "./ui/primitives";
import { ClockIcon, CloseIcon } from "./ui/icons";
import { BranchDropdown } from "./BranchDropdown";
import { GitOpsPanel } from "./GitOpsPanel";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { GroupAssignDropdown } from "./ProjectGroupsPanel";
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
      {({ detail: d, row }) => {
        const { current_branch, branches, status } = d;
        const hasChanges = status.modified + status.staged + status.untracked > 0;

        return (
          <div className="relative group">
            <div className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors">
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

              {/* Action buttons */}
              <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                <GroupAssignDropdown
                  projectId={project.id}
                  currentGroup={group}
                  onRefresh={row.handleGitRefresh}
                  onError={onError}
                />
                <IconButton onClick={row.handleOpenLog} title="Commit history" hoverColor="purple">
                  <ClockIcon size={12} />
                </IconButton>
                <IconButton onClick={row.handleRefresh} title="Refresh" hoverColor="gray">
                  <span className={row.refreshing ? "animate-spin inline-block text-sm" : "text-sm"}>
                    &#x21BB;
                  </span>
                </IconButton>
                <ProjectContextMenu
                  path={project.path}
                  onSuccess={onSuccess}
                  onError={onError}
                  onOpenBranchManager={row.handleOpenBranchMgr}
                  onOpenLogViewer={row.handleOpenLog}
                  onOpenAiReview={row.handleOpenAiReview}
                />
                <IconButton onClick={row.handleRemove} title="Remove" hoverColor="red">
                  <CloseIcon size={12} />
                </IconButton>
              </div>
            </div>

            {row.error && (
              <div className="pl-6 pr-3 pb-2 text-xs text-red-600 dark:text-red-400">{row.error}</div>
            )}

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
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/50">
      {projects.map((detail) => (
        <ProjectCompactRow key={detail.project.id} detail={detail} />
      ))}
    </div>
  );
});
