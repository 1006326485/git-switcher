import { memo, useRef, useState } from "react";
import type { ProjectDetail } from "../lib/types";
import { StatusBadge, GroupDot } from "./ui/primitives";
import { BranchDropdown } from "./BranchDropdown";
import { GitOpsPanel } from "./GitOpsPanel";
import { ProjectRowShell } from "./ProjectRowShell";
import { CommitPreview } from "./CommitPreview";
import { useProjectActions } from "../context/ProjectContext";

interface ProjectCardProps {
  detail: ProjectDetail;
}

export const ProjectCard = memo(function ProjectCard({ detail }: ProjectCardProps) {
  const { onSuccess, onError, onInfo } = useProjectActions();
  const nameRef = useRef<HTMLHeadingElement>(null);
  const [showPreview, setShowPreview] = useState(false);

  return (
    <ProjectRowShell detail={detail}>
      {({ detail: d, row, actionButtons, errorBanner }) => {
        const { project, current_branch, branches, status, group } = d;
        const totalChanges = status.modified + status.staged + status.untracked;
        const hasUpstream = status.ahead > 0 || status.behind > 0;

        return (
          <div
            data-dragging={undefined}
            className="bg-[var(--surface-1)] rounded-xl border border-[var(--border-color)] shadow-sm dark:shadow-none dark:ring-1 dark:ring-white/5 hover:shadow-md dark:hover:ring-white/10 hover:-translate-y-px transition-all duration-150"
          >
            {/* Header */}
            <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3
                    ref={nameRef}
                    className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate cursor-default"
                    onMouseEnter={() => setShowPreview(true)}
                    onMouseLeave={() => setShowPreview(false)}
                  >
                    {project.alias || project.name}
                  </h3>
                  <GroupDot color={group.color} name={group.name} size="sm" />
                </div>
                <button
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-[var(--accent)] dark:hover:text-blue-400 truncate mt-0.5 transition-colors duration-150 flex items-center gap-1 group/path"
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

            {/* Commit Preview */}
            {showPreview && (
              <CommitPreview
                path={project.path}
                anchorRef={nameRef}
                onClose={() => setShowPreview(false)}
              />
            )}
          </div>
        );
      }}
    </ProjectRowShell>
  );
});
