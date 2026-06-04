import { memo, type ReactNode } from "react";
import type { ProjectDetail } from "../lib/types";
import { IconButton } from "./ui/primitives";
import { ClockIcon, CloseIcon } from "./ui/icons";
import { GitLogViewer } from "./GitLogViewer";
import { BranchManager } from "./BranchManager";
import { AiReviewDialog } from "./AiReviewDialog";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { GroupAssignDropdown } from "./ProjectGroupsPanel";
import { useProjectRow } from "../hooks/useProjectRow";
import { useProjectActions } from "../context/ProjectContext";

// ── Types ───────────────────────────────────────────────────────────────────

export type RowState = ReturnType<typeof useProjectRow>;

/**
 * Everything a view component needs to render a project row.
 * Passed to the `children` render prop.
 */
export interface RowRenderProps {
  detail: ProjectDetail;
  row: RowState;
  /** Pre-built action buttons: history, refresh, context menu, remove */
  actionButtons: ReactNode;
  /** Conditional error banner */
  errorBanner: ReactNode | null;
}

interface ProjectRowShellProps {
  detail: ProjectDetail;
  children: (props: RowRenderProps) => ReactNode;
}

// ── Action Buttons Group ────────────────────────────────────────────────────

const ActionButtons = memo(function ActionButtons({
  detail,
  row,
}: {
  detail: ProjectDetail;
  row: RowState;
}) {
  const { onSuccess, onError } = useProjectActions();
  const { project, group } = detail;

  return (
    <>
      <GroupAssignDropdown
        projectId={project.id}
        currentGroup={group}
        onRefresh={row.handleGitRefresh}
        onError={onError}
      />
      <IconButton onClick={row.handleOpenLog} title="Commit history" hoverColor="purple">
        <ClockIcon />
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
      <IconButton onClick={row.handleRemove} title="Remove project" hoverColor="red">
        <CloseIcon />
      </IconButton>
    </>
  );
});

// ── Modals ──────────────────────────────────────────────────────────────────

function RowModals({ detail, row }: { detail: ProjectDetail; row: RowState }) {
  const { onSuccess, onError } = useProjectActions();
  const { project, current_branch, branches } = detail;

  return (
    <>
      {row.logOpen && (
        <GitLogViewer
          path={project.path}
          projectName={project.name}
          open
          onClose={row.handleCloseLog}
        />
      )}
      {row.branchMgrOpen && (
        <BranchManager
          path={project.path}
          branches={branches}
          currentBranch={current_branch}
          open
          onClose={row.handleCloseBranchMgr}
          onRefresh={row.handleGitRefresh}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}
      {row.aiReviewOpen && (
        <AiReviewDialog
          open
          onClose={row.handleCloseAiReview}
          projectPath={project.path}
          projectName={project.name}
          branches={branches}
          currentBranch={current_branch}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}
    </>
  );
}

// ── Error Banner ────────────────────────────────────────────────────────────

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="px-4 pb-2">
      <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300">
        {error}
      </div>
    </div>
  );
}

// ── Shell Component ─────────────────────────────────────────────────────────

/**
 * Provides shared logic (useProjectRow), modals, and action buttons for a
 * single project row. View components supply only layout via the `children`
 * render prop.
 */
export const ProjectRowShell = memo(function ProjectRowShell({
  detail,
  children,
}: ProjectRowShellProps) {
  const { onSwitchBranch, onRefresh, onRemove } = useProjectActions();

  const row = useProjectRow({
    detail,
    onSwitchBranch,
    onRefresh,
    onRemove,
  });

  const actionButtons = <ActionButtons detail={detail} row={row} />;
  const errorBanner = <ErrorBanner error={row.error} />;

  return (
    <>
      {children({ detail, row, actionButtons, errorBanner })}
      <RowModals detail={detail} row={row} />
    </>
  );
});
