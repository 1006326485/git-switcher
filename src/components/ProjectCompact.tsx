import { memo } from "react";
import type { ProjectDetail } from "../lib/types";
import { PROJECT_COLORS } from "../lib/types";
import { StatusBadge, GroupDot } from "./ui/primitives";
import { BranchDropdown } from "./BranchDropdown";
import { GitOpsPanel } from "./GitOpsPanel";
import { ProjectRowShell } from "./ProjectRowShell";
import { useProjectActions } from "../context/ProjectContext";
import { useVirtualList } from "../hooks/useVirtualList";
import { useSortableRow } from "../hooks/useSortableRow";

interface ProjectCompactProps {
  projects: ProjectDetail[];
  sortable?: boolean;
  focusedIndex?: number;
}

const ROW_HEIGHT = 44; // estimated compact row height

const ProjectCompactRow = memo(function ProjectCompactRow({ detail, sortable, projectIndex, isFocused }: { detail: ProjectDetail; sortable?: boolean; projectIndex?: number; isFocused?: boolean }) {
  const { onSuccess, onError, onInfo } = useProjectActions();
  const { project, group } = detail;

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
        const { current_branch, branches, status } = d;
        const hasChanges = status.modified + status.staged + status.untracked > 0;

        return (
          <div
            ref={setNodeRef}
            style={sortableStyle}
            data-project-id={project.id}
            data-project-index={projectIndex}
            role="article"
            aria-label={`${project.alias || project.name}, branch ${detail.current_branch}${hasChanges ? `, ${status.modified + status.staged + status.untracked} changes` : ""}${status.behind > 0 ? `, ${status.behind} behind` : ""}${status.ahead > 0 ? `, ${status.ahead} ahead` : ""}`}
            className={`relative group overflow-hidden ${isDragging ? "z-50 shadow-lg dark:ring-2 dark:ring-[var(--accent)]/30 ring-2 ring-[var(--accent)]/20 rounded-lg" : ""} ${isFocused ? "ring-2 ring-blue-500 dark:ring-blue-400 rounded-lg" : ""}`}
          >
            {/* Color stripe */}
            {project.color && (() => {
              const c = PROJECT_COLORS.find((p) => p.id === project.color);
              return c ? <div className={`absolute inset-y-0 left-0 w-1 ${c.bg}`} /> : null;
            })()}
            {/* Status dot */}
            {status.behind > 0 ? (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-[var(--surface-1)] z-10" />
            ) : status.modified + status.staged + status.untracked > 0 ? (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-yellow-500 border-2 border-[var(--surface-1)] z-10" />
            ) : status.ahead > 0 ? (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-[var(--surface-1)] z-10" />
            ) : null}
            <div className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--surface-2)] rounded-lg transition-colors duration-150">
              {/* Drag handle */}
              {sortable && (
                <button
                  className="shrink-0 cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  title="Drag to reorder"
                  {...attributes}
                  {...listeners}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                  </svg>
                </button>
              )}

              {/* Group dot */}
              <GroupDot color={group.color} name={group.name} size="sm" />

              {/* Project name */}
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate block">
                  {project.alias || project.name}
                </span>
                {project.description && (
                  <span className="text-xs text-gray-400 dark:text-gray-500 truncate block" title={project.description}>
                    {project.description}
                  </span>
                )}
              </div>

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
                <StatusBadge type="stash" count={detail.stash_count} variant="compact" />
                {!hasChanges && status.ahead === 0 && status.behind === 0 && detail.stash_count === 0 && (
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
            {activeOpIndicator}
          </div>
        );
      }}
    </ProjectRowShell>
  );
});

export const ProjectCompact = memo(function ProjectCompact({ projects, sortable, focusedIndex }: ProjectCompactProps) {
  const { virtualizer, enabled } = useVirtualList({
    count: projects.length,
    estimateSize: ROW_HEIGHT,
  });

  // Disable virtualization when sortable (DnD requires all items in DOM)
  if (!enabled || sortable) {
    return (
      <div className="bg-[var(--surface-1)] border border-[var(--border-color)] rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/50">
        {projects.map((detail, index) => (
          <ProjectCompactRow key={detail.project.id} detail={detail} sortable={sortable} projectIndex={index} isFocused={focusedIndex === index} />
        ))}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="bg-[var(--surface-1)] border border-[var(--border-color)] rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-700/50">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualItems.map((vi) => {
          const detail = projects[vi.index];
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.start}px)`,
              }}
            >
              <ProjectCompactRow detail={detail} sortable={sortable} projectIndex={vi.index} isFocused={focusedIndex === vi.index} />
            </div>
          );
        })}
      </div>
    </div>
  );
});
