import { useMemo, memo, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import type { ProjectDetail, ProjectRowCallbacks, ViewMode } from "../lib/types";
import { SortableItem } from "./ui/SortableItem";
import { ProjectCard } from "./ProjectCard";
import { ProjectList } from "./ProjectList";
import { ProjectCompact } from "./ProjectCompact";
import { ProjectTable } from "./ProjectTable";
import { DashboardView } from "./DashboardView";

interface ProjectGridProps extends ProjectRowCallbacks {
  projects: ProjectDetail[];
  loading: boolean;
  viewMode: ViewMode;
  isFiltered: boolean;
  onReorder?: (orderedIds: string[]) => Promise<void>;
  onAliasChange?: (id: string, alias: string) => Promise<void>;
}

export const ProjectGrid = memo(function ProjectGrid({
  projects,
  loading,
  viewMode,
  isFiltered,
  onSwitchBranch,
  onRefresh,
  onRemove,
  onSuccess,
  onError,
  onInfo,
  onReorder,
  onAliasChange,
}: ProjectGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const projectIds = useMemo(
    () => projects.map((p) => p.project.id),
    [projects]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const ids = projects.map((p) => p.project.id);
      const oldIndex = ids.indexOf(String(active.id));
      const newIndex = ids.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;

      const newOrder = arrayMove(ids, oldIndex, newIndex);
      if (onReorder) {
        try {
          await onReorder(newOrder);
        } catch {
          // error handled by caller
        }
      }
    },
    [projects, onReorder]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <span className="animate-spin text-xl">&#x21BB;</span>
          Loading projects...
        </div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="text-6xl mb-4 opacity-20">{isFiltered ? "&#x1F50D;" : "&#x1F4C2;"}</div>
        <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
          {isFiltered ? "No matching projects" : "No projects yet"}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-500 max-w-md">
          {isFiltered
            ? "No projects match your search. Try a different term."
            : "Add a git project by clicking the button above, or import a VSCode workspace file to add multiple projects at once."}
        </p>
      </div>
    );
  }

  if (viewMode === "dashboard") {
    return (
      <DashboardView
        projects={projects}
        onSwitchBranch={onSwitchBranch}
        onRefresh={onRefresh}
        onSuccess={onSuccess}
        onError={onError}
      />
    );
  }

  const strategy = viewMode === "card"
    ? rectSortingStrategy
    : verticalListSortingStrategy;

  const callbacks: ProjectRowCallbacks = {
    onSwitchBranch,
    onRefresh,
    onRemove,
    onSuccess,
    onError,
    onInfo,
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={projectIds} strategy={strategy}>
        {viewMode === "card" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((detail) => (
              <SortableItem key={detail.project.id} id={detail.project.id}>
                {({ attributes, listeners }) => (
                  <ProjectCard
                    detail={detail}
                    {...callbacks}
                    onAliasChange={onAliasChange}
                    attributes={attributes}
                    listeners={listeners}
                  />
                )}
              </SortableItem>
            ))}
          </div>
        )}
        {viewMode === "list" && (
          <ProjectList
            projects={projects}
            sortable
            {...callbacks}
          />
        )}
        {viewMode === "compact" && (
          <ProjectCompact
            projects={projects}
            sortable
            {...callbacks}
          />
        )}
        {viewMode === "table" && (
          <ProjectTable
            projects={projects}
            sortable
            {...callbacks}
          />
        )}
      </SortableContext>
    </DndContext>
  );
});
