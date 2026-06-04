import { memo } from "react";
import type { ProjectDetail, ViewMode } from "../lib/types";
import { ProjectCard } from "./ProjectCard";
import { ProjectList } from "./ProjectList";
import { ProjectCompact } from "./ProjectCompact";
import { ProjectTable } from "./ProjectTable";
import { DashboardView } from "./DashboardView";

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
