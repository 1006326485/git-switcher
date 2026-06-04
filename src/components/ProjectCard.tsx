import { useState, useCallback, useRef, memo } from "react";
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

interface DragHandleProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  attributes?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listeners?: Record<string, any>;
}

interface ProjectCardProps extends ProjectRowCallbacks, DragHandleProps {
  detail: ProjectDetail;
  onAliasChange?: (id: string, alias: string) => Promise<void>;
}

export const ProjectCard = memo(function ProjectCard({
  detail,
  onSwitchBranch,
  onRefresh,
  onRemove,
  onSuccess,
  onError,
  onInfo,
  onAliasChange,
  attributes: dragAttributes,
  listeners: dragListeners,
}: ProjectCardProps) {
  const {
    project, current_branch, branches, status, group,
  } = detail;

  const {
    switching, refreshing, error,
    logOpen, branchMgrOpen, aiReviewOpen,
    handleSwitch, handleRefresh, handleGitRefresh,
    handleOpenLog, handleCloseLog,
    handleOpenBranchMgr, handleCloseBranchMgr,
    handleOpenAiReview, handleCloseAiReview,
    handleRemove,
  } = useProjectRow({ detail, onSwitchBranch, onRefresh, onRemove });

  // Inline alias editing
  const [editing, setEditing] = useState(false);
  const [aliasValue, setAliasValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    setAliasValue(project.alias || project.name);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }, [project.alias, project.name]);

  const commitEdit = useCallback(async () => {
    const trimmed = aliasValue.trim();
    if (!onAliasChange) { setEditing(false); return; }
    if (trimmed && trimmed !== (project.alias || project.name)) {
      try {
        await onAliasChange(project.id, trimmed);
      } catch { /* toast handles error */ }
    }
    setEditing(false);
  }, [aliasValue, onAliasChange, project.id, project.alias, project.name]);

  const cancelEdit = useCallback(() => setEditing(false), []);

  const totalChanges = status.modified + status.staged + status.untracked;
  const hasUpstream = status.ahead > 0 || status.behind > 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <DragHandle attributes={dragAttributes} listeners={dragListeners} width={12} height={16} />
            {editing ? (
              <input
                ref={inputRef}
                type="text"
                value={aliasValue}
                onChange={(e) => setAliasValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") cancelEdit();
                }}
                className="text-base font-semibold text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-700 border border-blue-400 dark:border-blue-500 rounded px-1 py-0.5 outline-none w-full min-w-0"
              />
            ) : (
              <h3
                className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate cursor-text"
                title="Double-click to edit alias"
                onDoubleClick={startEdit}
              >
                {project.alias || project.name}
              </h3>
            )}
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
          <IconButton onClick={handleRemove} title="Remove project" hoverColor="red">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.749.749 0 111.06 1.06L9.06 8l3.22 3.22a.749.749 0 11-1.06 1.06L8 9.06l-3.22 3.22a.749.749 0 11-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </IconButton>
        </div>
      </div>

      {/* Branch selector + context menu */}
      <div className="px-4 py-2 flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <BranchDropdown
            currentBranch={current_branch}
            branches={branches}
            onSwitch={handleSwitch}
            loading={switching}
          />
        </div>
        <ProjectContextMenu
          path={project.path}
          onSuccess={onSuccess}
          onError={onError}
          onOpenBranchManager={handleOpenBranchMgr}
          onOpenLogViewer={handleOpenLog}
          onOpenAiReview={handleOpenAiReview}
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 pb-2">
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        </div>
      )}

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
        onRefresh={handleGitRefresh}
        onSuccess={onSuccess}
        onError={onError}
        onInfo={onInfo}
      />

      {/* Modals — only mount when open to avoid 3N portals + listeners */}
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
