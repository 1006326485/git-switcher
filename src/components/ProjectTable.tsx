import { useState, useCallback, useMemo, memo } from "react";
import type { ProjectDetail } from "../lib/types";
import { StatusBadge, GroupDot } from "./ui/primitives";
import { BranchDropdown } from "./BranchDropdown";
import { GitOpsPanel } from "./GitOpsPanel";
import { ProjectRowShell } from "./ProjectRowShell";
import { useProjectActions } from "../context/ProjectContext";

interface ProjectTableProps {
  projects: ProjectDetail[];
}

type SortKey = "name" | "branch" | "modified" | "staged" | "untracked" | "ahead" | "behind";
type SortDir = "asc" | "desc";

const SortableHeader = memo(function SortableHeader({
  label,
  sortKey,
  currentSort,
  currentDir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = currentSort === sortKey;
  return (
    <th
      scope="col"
      role="columnheader"
      tabIndex={0}
      aria-sort={active ? (currentDir === "asc" ? "ascending" : "descending") : "none"}
      className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 select-none"
      onClick={() => onSort(sortKey)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSort(sortKey); } }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          <span className="text-[var(--accent)]">{currentDir === "asc" ? "▲" : "▼"}</span>
        )}
      </span>
    </th>
  );
});

export const ProjectTable = memo(function ProjectTable({ projects }: ProjectTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = useCallback(
    (key: SortKey) => {
      setSortKey((prev) => {
        if (prev === key) {
          setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          return prev;
        }
        setSortDir("asc");
        return key;
      });
    },
    []
  );

  const sorted = useMemo(() => {
    const copy = [...projects];
    copy.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.project.name.localeCompare(b.project.name); break;
        case "branch": cmp = a.current_branch.localeCompare(b.current_branch); break;
        case "modified": cmp = a.status.modified - b.status.modified; break;
        case "staged": cmp = a.status.staged - b.status.staged; break;
        case "untracked": cmp = a.status.untracked - b.status.untracked; break;
        case "ahead": cmp = a.status.ahead - b.status.ahead; break;
        case "behind": cmp = a.status.behind - b.status.behind; break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [projects, sortKey, sortDir]);

  return (
    <div className="bg-[var(--surface-1)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <table className="w-full" aria-label="Git projects">
        <thead className="bg-[var(--surface-2)] border-b border-[var(--border-color)]">
          <tr>
            <SortableHeader label="Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Branch" sortKey="branch" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Modified" sortKey="modified" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Staged" sortKey="staged" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Untracked" sortKey="untracked" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Ahead" sortKey="ahead" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <SortableHeader label="Behind" sortKey="behind" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
            <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-24">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {sorted.map((detail) => (
            <TableRow key={detail.project.id} detail={detail} />
          ))}
        </tbody>
      </table>
    </div>
  );
});

const TableRow = memo(function TableRow({ detail }: { detail: ProjectDetail }) {
  const { onSuccess, onError, onInfo } = useProjectActions();
  const { project, group } = detail;

  return (
    <ProjectRowShell detail={detail}>
      {({ detail: d, row, actionButtons, errorBanner }) => {
        const { current_branch, branches, status } = d;

        const StatusOrDash = ({ type, count }: { type: "modified" | "staged" | "untracked" | "ahead" | "behind"; count: number }) =>
          count > 0 ? <StatusBadge type={type} count={count} variant="text" /> : <span className="text-gray-300 dark:text-gray-600">—</span>;

        return (
          <>
            <tr className="hover:bg-[var(--surface-2)] transition-colors duration-150">
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-50">
                    {project.alias || project.name}
                  </div>
                  <GroupDot color={group.color} name={group.name} size="xs" />
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-50" title={project.path}>
                  {project.path}
                </div>
                {errorBanner}
              </td>
              <td className="px-3 py-2">
                <BranchDropdown
                  currentBranch={current_branch}
                  branches={branches}
                  onSwitch={row.handleSwitch}
                  loading={row.switching}
                />
              </td>
              <td className="px-3 py-2 text-sm text-center">
                <StatusOrDash type="modified" count={status.modified} />
              </td>
              <td className="px-3 py-2 text-sm text-center">
                <StatusOrDash type="staged" count={status.staged} />
              </td>
              <td className="px-3 py-2 text-sm text-center">
                <StatusOrDash type="untracked" count={status.untracked} />
              </td>
              <td className="px-3 py-2 text-sm text-center">
                <StatusOrDash type="ahead" count={status.ahead} />
              </td>
              <td className="px-3 py-2 text-sm text-center">
                <StatusOrDash type="behind" count={status.behind} />
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-0.5">
                  {actionButtons}
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={8} className="p-0">
                <GitOpsPanel
                  path={project.path}
                  onRefresh={row.handleGitRefresh}
                  onSuccess={onSuccess}
                  onError={onError}
                  onInfo={onInfo}
                />
              </td>
            </tr>
          </>
        );
      }}
    </ProjectRowShell>
  );
});
