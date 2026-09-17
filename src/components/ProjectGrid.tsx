import { memo, useCallback, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ProjectDetail, ViewMode, SortOption } from "../lib/types";
import { ProjectCard } from "./ProjectCard";
import { ProjectList } from "./ProjectList";
import { ProjectCompact } from "./ProjectCompact";
import { ProjectTable } from "./ProjectTable";
import { DashboardView, type DashboardFilter } from "./DashboardView";
import { SkeletonRow, SkeletonCard, SkeletonTable } from "./ui/Skeleton";

const SORT_LABELS: Record<SortOption, string> = {
  custom: "Custom Order",
  "name-asc": "Name A→Z",
  "name-desc": "Name Z→A",
  modified: "Last Modified",
  changes: "Most Changes",
  branch: "Branch Name",
};

interface ProjectGridProps {
  projects: ProjectDetail[];
  loading: boolean;
  viewMode: ViewMode;
  isFiltered: boolean;
  sortBy?: SortOption;
  onSortChange?: (sort: SortOption) => void;
  onAddProject?: () => void;
  onBulkImport?: () => void;
  onReorder?: (orderedIds: string[]) => void;
  onDashboardDrillDown?: (filter: DashboardFilter) => void;
  focusedIndex?: number;
}

export const ProjectGrid = memo(function ProjectGrid({
  projects,
  loading,
  viewMode,
  isFiltered,
  sortBy,
  onSortChange,
  onAddProject,
  onBulkImport,
  onReorder,
  onDashboardDrillDown,
  focusedIndex,
}: ProjectGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id || !onReorder) return;

      const oldIndex = projects.findIndex((p) => p.project.id === active.id);
      const newIndex = projects.findIndex((p) => p.project.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const orderedIds = projects.map((p) => p.project.id);
      const [moved] = orderedIds.splice(oldIndex, 1);
      orderedIds.splice(newIndex, 0, moved);
      onReorder(orderedIds);
    },
    [projects, onReorder]
  );

  const sortableIds = useMemo(() => projects.map((p) => p.project.id), [projects]);

  if (loading) {
    if (viewMode === "list" || viewMode === "compact") {
      return (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonRow key={i} compact={viewMode === "compact"} />
          ))}
        </div>
      );
    }

    if (viewMode === "table") {
      return <SkeletonTable />;
    }

    if (viewMode === "dashboard") {
      return (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-12 mb-2" />
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
              </div>
            ))}
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-3" />
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="text-center">
                  <div className="h-7 bg-gray-200 dark:bg-gray-700 rounded w-10 mx-auto mb-1" />
                  <div className="h-3 bg-gray-100 dark:bg-gray-700/50 rounded w-16 mx-auto" />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    // card (default)
    return (
      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-center px-4">
        {isFiltered ? (
          <>
            <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
              No matching projects
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-500 max-w-md">
              No projects match the current filters. Try changing your search, group, or status filter.
            </p>
          </>
        ) : (
          <div className="max-w-lg w-full space-y-6">
            {/* Welcome illustration */}
            <div className="flex justify-center">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-[var(--surface-2)] border border-[var(--border-color)] flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
                  </svg>
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 border-2 border-[var(--surface-1)] flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Welcome to Git Switcher
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Manage all your Git repositories from one place.<br />
                Get started by adding your first project.
              </p>
            </div>

            {/* Quick start actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={onAddProject}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] hover:border-[var(--accent)] hover:shadow-md transition-all duration-150 group"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50 transition-colors">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Add Project</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">Browse to a Git repo</span>
              </button>

              <button
                onClick={onBulkImport}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] hover:border-[var(--accent)] hover:shadow-md transition-all duration-150 group"
              >
                <div className="w-10 h-10 rounded-lg bg-purple-50 dark:bg-purple-900/30 flex items-center justify-center group-hover:bg-purple-100 dark:group-hover:bg-purple-900/50 transition-colors">
                  <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Bulk Import</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">Scan a directory</span>
              </button>

              <button
                onClick={onAddProject}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-[var(--surface-1)] border border-[var(--border-color)] hover:border-[var(--accent)] hover:shadow-md transition-all duration-150 group"
              >
                <div className="w-10 h-10 rounded-lg bg-green-50 dark:bg-green-900/30 flex items-center justify-center group-hover:bg-green-100 dark:group-hover:bg-green-900/50 transition-colors">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Drag & Drop</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">Drop a folder here</span>
              </button>
            </div>

            {/* Keyboard hint */}
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border-color)] font-mono text-[11px]">⌘ N</kbd> to add, <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border-color)] font-mono text-[11px]">⌘ K</kbd> for command palette, <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-2)] border border-[var(--border-color)] font-mono text-[11px]">⌘ /</kbd> for shortcuts
            </p>
          </div>
        )}
      </div>
    );
  }

  const sortable = viewMode !== "dashboard" && viewMode !== "table" && !!onReorder && sortBy === "custom";
  const strategy = viewMode === "card" ? rectSortingStrategy : verticalListSortingStrategy;

  const sortBanner = sortBy && sortBy !== "custom" && onSortChange ? (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--surface-2)] px-3 py-2 text-xs text-gray-600 dark:text-gray-400">
      <span>Sorted by: {SORT_LABELS[sortBy]} · Drag &amp; drop disabled</span>
      <button
        onClick={() => onSortChange("custom")}
        className="px-2 py-0.5 rounded text-[11px] font-medium hover:bg-gray-300/40 dark:hover:bg-gray-600/40 transition-colors"
      >
        Reset
      </button>
    </div>
  ) : null;

  const content = (() => {
    switch (viewMode) {
      case "dashboard":
        return <DashboardView projects={projects} onDrillDown={onDashboardDrillDown} />;
      case "list":
        return <ProjectList projects={projects} sortable={sortable} focusedIndex={focusedIndex} />;
      case "compact":
        return <ProjectCompact projects={projects} sortable={sortable} focusedIndex={focusedIndex} />;
      case "table":
        return <ProjectTable projects={projects} focusedIndex={focusedIndex} />;
      case "card":
      default:
        return (
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {projects.map((detail, index) => (
              <ProjectCard key={detail.project.id} detail={detail} sortable={sortable} projectIndex={index} isFocused={focusedIndex === index} />
            ))}
          </div>
        );
    }
  })();

  if (!sortable) return <>{sortBanner}{content}</>;

  return (
    <>
      {sortBanner}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={sortableIds} strategy={strategy}>
          {content}
        </SortableContext>
      </DndContext>
    </>
  );
});
