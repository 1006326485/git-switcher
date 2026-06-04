import { memo } from "react";
import type { ProjectDetail, ProjectRowCallbacks } from "../lib/types";
import { StatusBadge, GroupDot, IconButton } from "./ui/primitives";
import { BranchDropdown } from "./BranchDropdown";
import { GitOpsPanel } from "./GitOpsPanel";
import { GitLogViewer } from "./GitLogViewer";
import { BranchManager } from "./BranchManager";
import { TagManager } from "./TagManager";
import { AiReviewDialog } from "./AiReviewDialog";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { GroupAssignDropdown } from "./ProjectGroupsPanel";
import { useProjectRow } from "../hooks/useProjectRow";

interface ProjectListProps extends ProjectRowCallbacks {
  projects: ProjectDetail[];
}

const ProjectListRow = memo(function ProjectListRow({
  detail,
  onSwitchBranch,
  onRefresh,
  onRemove,
  onSuccess,
  onError,
  onInfo,
}: ProjectRowCallbacks & { detail: ProjectDetail }) {
  const { project, current_branch, branches, status, group } = detail;
  const {
    switching,
    refreshing,
    error,
    logOpen,
    branchMgrOpen,
    aiReviewOpen,
    tagMgrOpen,
    handleSwitch,
    handleRefresh,
    handleGitRefresh,
    handleOpenLog,
    handleCloseLog,
    handleOpenBranchMgr,
    handleCloseBranchMgr,
    handleOpenAiReview,
    handleCloseAiReview,
    handleOpenTagMgr,
    handleCloseTagMgr,
    handleRemove,
  } = useProjectRow({ detail, onSwitchBranch, onRefresh, onRemove });

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
        {error && <div className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</div>}
      </div>

      <div className="shrink-0 w-55">
        <BranchDropdown
          currentBranch={current_branch}
          branches={branches}
          onSwitch={handleSwitch}
          loading={switching}
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
        <GroupAssignDropdown
          projectId={project.id}
          currentGroup={group}
          onRefresh={handleGitRefresh}
          onError={onError}
        />
        <IconButton onClick={handleOpenLog} title="Commit history" hoverColor="purple">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1.643 3.143L.427 1.927A.25.25 0 000 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 00.177-.427L2.715 4.215a6.5 6.5 0 11-1.18 4.458.75.75 0 10-1.493.154 8.001 8.001 0 101.6-5.684zM7.75 4a.75.75 0 01.75.75v2.992l2.028.812a.75.75 0 01-.557 1.392l-2.5-1A.75.75 0 017 8.25v-3.5A.75.75 0 017.75 4z" />
          </svg>
        </IconButton>
        <IconButton onClick={handleRefresh} title="Refresh" hoverColor="gray">
          <span className={refreshing ? "animate-spin inline-block text-sm" : "text-sm"}>
            &#x21BB;
          </span>
        </IconButton>
        <ProjectContextMenu
          path={project.path}
          onSuccess={onSuccess}
          onError={onError}
          onOpenBranchManager={handleOpenBranchMgr}
          onOpenTagManager={handleOpenTagMgr}
          onOpenLogViewer={handleOpenLog}
          onOpenAiReview={handleOpenAiReview}
        />
        <IconButton onClick={handleRemove} title="Remove" hoverColor="red">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.749.749 0 111.06 1.06L9.06 8l3.22 3.22a.749.749 0 11-1.06 1.06L8 9.06l-3.22 3.22a.749.749 0 11-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </IconButton>
      </div>

      <GitOpsPanel
        path={project.path}
        onRefresh={handleGitRefresh}
        onSuccess={onSuccess}
        onError={onError}
        onInfo={onInfo}
      />

      {logOpen && (
        <GitLogViewer
          path={project.path}
          projectName={project.name}
          open
          onClose={handleCloseLog}
        />
      )}
      {branchMgrOpen && (
        <BranchManager
          path={project.path}
          branches={branches}
          currentBranch={current_branch}
          open
          onClose={handleCloseBranchMgr}
          onRefresh={handleGitRefresh}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}
      {tagMgrOpen && (
        <TagManager
          path={project.path}
          open
          onClose={handleCloseTagMgr}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}
      {aiReviewOpen && (
        <AiReviewDialog
          open
          onClose={handleCloseAiReview}
          projectPath={project.path}
          projectName={project.name}
          branches={branches}
          currentBranch={current_branch}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}
    </div>
  );
});

export const ProjectList = memo(function ProjectList({
  projects,
  onSwitchBranch,
  onRefresh,
  onRemove,
  onSuccess,
  onError,
  onInfo,
}: ProjectListProps) {
  return (
    <div className="flex flex-col gap-2">
      {projects.map((detail) => (
        <ProjectListRow
          key={detail.project.id}
          detail={detail}
          onSwitchBranch={onSwitchBranch}
          onRefresh={onRefresh}
          onRemove={onRemove}
          onSuccess={onSuccess}
          onError={onError}
          onInfo={onInfo}
        />
      ))}
    </div>
  );
});
