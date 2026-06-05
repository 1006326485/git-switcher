import { memo } from "react";
import type { ProjectDetail, ViewMode } from "../lib/types";
import { ProjectCard } from "./ProjectCard";
import { ProjectList } from "./ProjectList";
import { ProjectCompact } from "./ProjectCompact";
import { ProjectTable } from "./ProjectTable";
import { DashboardView } from "./DashboardView";
import { SkeletonRow, SkeletonCard, SkeletonTable } from "./ui/Skeleton";

interface ProjectGridProps {
  projects: ProjectDetail[];
  loading: boolean;
  viewMode: ViewMode;
  isFiltered: boolean;
}

export const ProjectGrid = memo(function ProjectGrid({
  projects,
  loading,
  viewMode,
  isFiltered,
}: ProjectGridProps) {
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        {isFiltered ? (
          <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        ) : (
          <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
        )}
        <h3 className="text-lg font-medium text-gray-600 dark:text-gray-400 mb-2">
          {isFiltered ? "No matching projects" : "No projects yet"}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-500 max-w-md mb-4">
          {isFiltered
            ? "No projects match your search. Try a different term."
            : "Add a git project by clicking the button above, or import a VSCode workspace file."}
        </p>
        {!isFiltered && (
          <button className="h-8 px-4 rounded-lg bg-(--accent) hover:bg-(--accent-hover) text-white text-sm font-medium transition-colors shadow-sm active:scale-[0.98]">
            Add your first project
          </button>
        )}
      </div>
    );
  }

  switch (viewMode) {
    case "dashboard":
      return <DashboardView projects={projects} />;
    case "list":
      return <ProjectList projects={projects} />;
    case "compact":
      return <ProjectCompact projects={projects} />;
    case "table":
      return <ProjectTable projects={projects} />;
    case "card":
    default:
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map((detail) => (
            <ProjectCard key={detail.project.id} detail={detail} />
          ))}
        </div>
      );
  }
});
