import { memo } from "react";
import type { ProjectDetail } from "../lib/types";
import { PROJECT_COLORS } from "../lib/types";
import { StatusBadge, GroupDot } from "./ui/primitives";
import { BranchDropdown } from "./BranchDropdown";
import { GitOpsPanel } from "./GitOpsPanel";
import { ProjectRowShell } from "./ProjectRowShell";
import { DescriptionEditor } from "./ProjectRowShell";
import { useProjectActions } from "../context/ProjectContext";
import { useVirtualList } from "../hooks/useVirtualList";
import { useSortableRow } from "../hooks/useSortableRow";

interface ProjectListProps {
  projects: ProjectDetail[];
  sortable?: boolean;
  focusedIndex?: number;
}

const ROW_HEIGHT = 88; // estimated list row height (80px card + 8px gap)

const ProjectListRow = memo(function ProjectListRow({ detail, sortable, projectIndex, isFocused }: { detail: ProjectDetail; sortable?: boolean; projectIndex?: number; isFocused?: boolean }) {
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

        return (
          <div
            ref={setNodeRef}
            style={sortableStyle}
            data-project-id={project.id}
            data-project-index={projectIndex}
            data-dragging={isDragging ? "" : undefined}
            role="article"
            aria-label={`${project.alias || project.name}, branch ${current_branch}${status.modified + status.staged + status.untracked > 0 ? `, ${status.modified + status.staged + status.untracked} changes` : ""}${status.behind > 0 ? `, ${status.behind} behind` : ""}${status.ahead > 0 ? `, ${status.ahead} ahead` : ""}`}
            className={`bg-[var(--surface-1)] border border-[var(--border-color)] rounded-xl shadow-sm dark:shadow-none dark:ring-1 dark:ring-white/5 hover:shadow-md dark:hover:ring-white/10 hover:-translate-y-px transition-all duration-150 relative overflow-hidden ${isDragging ? "z-50 shadow-lg dark:ring-2 dark:ring-[var(--accent)]/30 ring-2 ring-[var(--accent)]/20" : ""} ${isFocused ? "ring-2 ring-blue-500 dark:ring-blue-400" : ""}`}
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
            <div className="flex items-center gap-4 px-4 py-3">
              {sortable && (
                <button
                  className="shrink-0 cursor-grab active:cursor-grabbing text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {project.alias || project.name}
                  </div>
                  <GroupDot color={group.color} name={group.name} size="sm" />
                </div>
                <button
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-[var(--accent)] dark:hover:text-blue-400 truncate transition-colors duration-150 flex items-center gap-1 group/path"
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
                {errorBanner}
              </div>

              <div className="shrink-0 w-44">
                <BranchDropdown
                  currentBranch={current_branch}
                  branches={branches}
                  onSwitch={row.handleSwitch}
                  loading={row.switching}
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {status.modified === 0 && status.staged === 0 && status.untracked === 0 && status.ahead === 0 && status.behind === 0 && d.stash_count === 0 && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">Clean</span>
                )}
                <StatusBadge type="modified" count={status.modified} variant="pill" />
                <StatusBadge type="staged" count={status.staged} variant="pill" />
                <StatusBadge type="untracked" count={status.untracked} variant="pill" />
                <StatusBadge type="ahead" count={status.ahead} variant="pill" />
                <StatusBadge type="behind" count={status.behind} variant="pill" />
                <StatusBadge type="stash" count={d.stash_count} variant="pill" />
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                {actionButtons}
              </div>
            </div>
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

export const ProjectList = memo(function ProjectList({ projects, sortable, focusedIndex }: ProjectListProps) {
  const { virtualizer, enabled } = useVirtualList({
    count: projects.length,
    estimateSize: ROW_HEIGHT,
  });

  // Disable virtualization when sortable (DnD requires all items in DOM)
  if (!enabled || sortable) {
    return (
      <div className="flex flex-col gap-2">
        {projects.map((detail, index) => (
          <ProjectListRow key={detail.project.id} detail={detail} sortable={sortable} projectIndex={index} isFocused={focusedIndex === index} />
        ))}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
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
            <ProjectListRow detail={detail} sortable={sortable} projectIndex={vi.index} isFocused={focusedIndex === vi.index} />
          </div>
        );
      })}
    </div>
  );
});
