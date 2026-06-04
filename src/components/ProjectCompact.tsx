import { memo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ProjectDetail, ProjectRowCallbacks } from "../lib/types";
import { StatusBadge, GroupDot, IconButton } from "./ui/primitives";
import { DragHandle } from "./ui/DragHandle";
import { BranchDropdown } from "./BranchDropdown";
import { GitOpsPanel } from "./GitOpsPanel";
import { GitLogViewer } from "./GitLogViewer";
import { BranchManager } from "./BranchManager";
import { AiReviewDialog } from "./AiReviewDialog";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { GroupAssignDropdown } from "./ProjectGroupsPanel";
import { useProjectRow } from "../hooks/useProjectRow";
import { useSortableRow } from "../hooks/useSortableRow";

interface ProjectCompactProps extends ProjectRowCallbacks {
  projects: ProjectDetail[];
  sortable?: boolean;
}

const ProjectCompactRow = memo(function ProjectCompactRow({
  detail,
  sortable,
  onSwitchBranch,
  onRefresh,
  onRemove,
  onSuccess,
  onError,
  onInfo,
}: ProjectRowCallbacks & { detail: ProjectDetail; sortable?: boolean }) {
  const { project, current_branch, branches, status, group } = detail;
  const {
    switching,
    refreshing,
    error,
    logOpen,
    branchMgrOpen,
    aiReviewOpen,
    handleSwitch,
    handleRefresh,
    handleGitRefresh,
    handleOpenLog,
    handleCloseLog,
    handleOpenBranchMgr,
    handleCloseBranchMgr,
    handleOpenAiReview,
    handleCloseAiReview,
    handleRemove,
  } = useProjectRow({ detail, onSwitchBranch, onRefresh, onRemove });

  const { attributes, listeners, setNodeRef, style } = useSortableRow({
    id: project.id,
    sortable,
  });

  const hasChanges = status.modified + status.staged + status.untracked > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group"
    >
      <div className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg transition-colors">
        {sortable && <DragHandle attributes={attributes} listeners={listeners} />}
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
          onSwitch={handleSwitch}
          loading={switching}
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

        {/* Action buttons — always visible */}
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <GroupAssignDropdown
            projectId={project.id}
            currentGroup={group}
            onRefresh={handleGitRefresh}
            onError={onError}
          />
          <IconButton onClick={handleOpenLog} title="Commit history" hoverColor="purple">
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
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
            onOpenLogViewer={handleOpenLog}
            onOpenAiReview={handleOpenAiReview}
          />
          <IconButton onClick={handleRemove} title="Remove" hoverColor="red">
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.749.749 0 111.06 1.06L9.06 8l3.22 3.22a.749.749 0 11-1.06 1.06L8 9.06l-3.22 3.22a.749.749 0 11-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </IconButton>
        </div>
      </div>

      {error && (
        <div className="pl-6 pr-3 pb-2 text-xs text-red-600 dark:text-red-400">{error}</div>
      )}

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

export const ProjectCompact = memo(function ProjectCompact({
  projects,
  sortable,
  onSwitchBranch,
  onRefresh,
  onRemove,
  onSuccess,
  onError,
  onInfo,
}: ProjectCompactProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40,
    overscan: 5,
  });

  return (
    <div
      ref={parentRef}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-auto divide-y divide-gray-100 dark:divide-gray-700/50"
      style={{ maxHeight: "100vh" }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const detail = projects[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <ProjectCompactRow
                detail={detail}
                sortable={sortable}
                onSwitchBranch={onSwitchBranch}
                onRefresh={onRefresh}
                onRemove={onRemove}
                onSuccess={onSuccess}
                onError={onError}
                onInfo={onInfo}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
});
