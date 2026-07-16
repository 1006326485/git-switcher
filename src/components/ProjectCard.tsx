import { memo, useRef, useState, useEffect, useCallback } from "react";
import type { ProjectDetail } from "../lib/types";
import { PROJECT_COLORS } from "../lib/types";
import { StatusBadge, GroupDot } from "./ui/primitives";
import { HoverTooltip } from "./ui/HoverTooltip";
import { BranchDropdown } from "./BranchDropdown";
import { GitOpsPanel } from "./GitOpsPanel";
import { ProjectRowShell } from "./ProjectRowShell";
import { DescriptionEditor } from "./ProjectRowShell";
import { CommitPreview } from "./CommitPreview";
import { useProjectActions } from "../context/ProjectContext";
import { useSortableRow } from "../hooks/useSortableRow";
import { getReadmePreview } from "../lib/tauri";

interface ProjectCardProps {
  detail: ProjectDetail;
  sortable?: boolean;
  projectIndex?: number;
  isFocused?: boolean;
}

export const ProjectCard = memo(function ProjectCard({ detail, sortable, projectIndex, isFocused }: ProjectCardProps) {
  const { onSuccess, onError, onInfo } = useProjectActions();
  const nameRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [readmePreview, setReadmePreview] = useState<string | null>(null);
  const [readmeLoaded, setReadmeLoaded] = useState(false);
  const [hovering, setHovering] = useState(false);

  const loadReadme = useCallback(async (path: string) => {
    if (readmeLoaded) return;
    setReadmeLoaded(true);
    try {
      const text = await getReadmePreview(path);
      if (text) {
        // Truncate to ~150 chars for card display
        setReadmePreview(text.length > 150 ? text.slice(0, 150) + "..." : text);
      }
    } catch {
      // Silently ignore - README is optional
    }
  }, [readmeLoaded]);

  useEffect(() => {
    if (hovering && detail.project.path) {
      loadReadme(detail.project.path);
    }
  }, [hovering, detail.project.path, loadReadme]);

  const {
    attributes,
    listeners,
    setNodeRef,
    style: sortableStyle,
    isDragging,
  } = useSortableRow({ id: detail.project.id, sortable });

  return (
    <ProjectRowShell detail={detail}>
      {({ detail: d, row, actionButtons, errorBanner, activeOpIndicator }) => {
        const { project, current_branch, branches, status, group } = d;
        const totalChanges = status.modified + status.staged + status.untracked;
        const hasUpstream = status.ahead > 0 || status.behind > 0;

        return (
          <div
            ref={(node) => {
              setNodeRef(node);
              (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            }}
            style={sortableStyle}
            data-project-id={project.id}
            data-project-index={projectIndex}
            data-dragging={isDragging ? "" : undefined}
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            role="article"
            aria-label={`${project.alias || project.name}, branch ${current_branch}${totalChanges > 0 ? `, ${totalChanges} changes` : ""}${status.behind > 0 ? `, ${status.behind} behind` : ""}${status.ahead > 0 ? `, ${status.ahead} ahead` : ""}`}
            className={`bg-[var(--surface-1)] rounded-xl border border-[var(--border-color)] shadow-sm dark:shadow-none dark:ring-1 dark:ring-white/5 hover:shadow-md dark:hover:ring-white/10 hover:-translate-y-px transition-all duration-150 relative overflow-hidden ${isDragging ? "z-50 shadow-lg dark:ring-2 dark:ring-[var(--accent)]/30 ring-2 ring-[var(--accent)]/20" : ""} ${isFocused ? "ring-2 ring-blue-500 dark:ring-blue-400" : ""}`}
          >
            {/* Color stripe */}
            {project.color && (() => {
              const c = PROJECT_COLORS.find((p) => p.id === project.color);
              return c ? <div className={`absolute inset-y-0 left-0 w-1 ${c.bg} rounded-l-xl`} /> : null;
            })()}
            {/* Status dot */}
            {status.behind > 0 ? (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-[var(--surface-1)]" />
            ) : status.modified + status.staged + status.untracked > 0 ? (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-yellow-500 border-2 border-[var(--surface-1)]" />
            ) : status.ahead > 0 ? (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-[var(--surface-1)]" />
            ) : null}
            {/* Header */}
            <div className="px-4 pt-4 pb-2 flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 flex items-start gap-1.5">
                {sortable && (
                  <button
                    className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    title="Drag to reorder"
                    {...attributes}
                    {...listeners}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                    </svg>
                  </button>
                )}
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
                  <DescriptionEditor
                    projectId={project.id}
                    description={project.description}
                    editTrigger={row.descEditTrigger}
                    onError={(msg) => onError(msg)}
                  />
                  {readmePreview && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-2 leading-relaxed">
                      {readmePreview}
                    </p>
                  )}
                </div>
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

            {/* Active operation indicator */}
            {activeOpIndicator}

            {/* Status bar */}
            <div className="px-4 pb-2 flex items-center gap-2 flex-wrap">
              {totalChanges === 0 && !hasUpstream && detail.stash_count === 0 && (
                <span className="text-xs text-gray-400 dark:text-gray-500">Clean</span>
              )}
              <StatusBadge type="modified" count={status.modified} variant="pill" />
              <StatusBadge type="staged" count={status.staged} variant="pill" />
              <StatusBadge type="untracked" count={status.untracked} variant="pill" />
              <StatusBadge type="ahead" count={status.ahead} variant="pill" />
              <StatusBadge type="behind" count={status.behind} variant="pill" />
              <StatusBadge type="stash" count={detail.stash_count} variant="pill" />
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

            {/* Hover tooltip */}
            <HoverTooltip anchorRef={cardRef} visible={hovering}>
              {project.description && (
                <div style={{ marginBottom: 6, color: "#d1d5db" }}>{project.description}</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ color: "#9ca3af", wordBreak: "break-all" }}>{project.path}</span>
                <span style={{ color: "#9ca3af" }}>
                  {branches.length} branch{branches.length !== 1 ? "es" : ""}
                </span>
              </div>
            </HoverTooltip>
          </div>
        );
      }}
    </ProjectRowShell>
  );
});
