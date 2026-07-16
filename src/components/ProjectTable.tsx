import { useState, useCallback, useMemo, memo } from "react";
import type { ProjectDetail } from "../lib/types";
import { StatusBadge, GroupDot } from "./ui/primitives";
import { BranchDropdown } from "./BranchDropdown";
import { GitOpsPanel } from "./GitOpsPanel";
import { ProjectRowShell } from "./ProjectRowShell";
import { useProjectActions } from "../context/ProjectContext";
import { useVirtualList } from "../hooks/useVirtualList";

interface ProjectTableProps {
  projects: ProjectDetail[];
  focusedIndex?: number;
}

type SortKey = "name" | "branch" | "modified" | "staged" | "untracked" | "ahead" | "behind";
type SortDir = "asc" | "desc";

const BORDER_COLOR_MAP: Record<string, string> = {
  red: "border-l-red-500",
  orange: "border-l-orange-500",
  yellow: "border-l-yellow-500",
  green: "border-l-green-500",
  blue: "border-l-blue-500",
  purple: "border-l-purple-500",
  pink: "border-l-pink-500",
  gray: "border-l-gray-500",
};

function colorBorderClass(color?: string): string {
  if (!color) return "";
  return BORDER_COLOR_MAP[color] ?? "";
}

const ROW_HEIGHT = 44; // estimated table row height

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

export const ProjectTable = memo(function ProjectTable({ projects, focusedIndex }: ProjectTableProps) {
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

  const { virtualizer, enabled } = useVirtualList({
    count: sorted.length,
    estimateSize: ROW_HEIGHT,
  });

  // Small lists: use native table
  if (!enabled) {
    return (
      <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--surface-1)] [-webkit-overflow-scrolling:touch]">
        <table className="min-w-[900px] w-full" aria-label="Git projects">
          <thead className="bg-[var(--surface-2)] border-b border-[var(--border-color)]">
            <tr>
              <SortableHeader label="Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Branch" sortKey="branch" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Modified" sortKey="modified" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Staged" sortKey="staged" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Untracked" sortKey="untracked" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Ahead" sortKey="ahead" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <SortableHeader label="Behind" sortKey="behind" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
              <th scope="col" className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
                Stash
              </th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
            {sorted.map((detail, index) => (
              <TableRow key={detail.project.id} detail={detail} projectIndex={index} isFocused={focusedIndex === index} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Large lists: use virtualized div-based grid
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-color)] bg-[var(--surface-1)] [-webkit-overflow-scrolling:touch]">
      <div className="min-w-[1056px]">
      {/* Table header */}
      <div className="grid grid-cols-[minmax(200px,1fr)_180px_100px_100px_100px_100px_100px_80px_96px] bg-[var(--surface-2)] border-b border-[var(--border-color)]">
        <SortableHeaderDiv label="Name" sortKey="name" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortableHeaderDiv label="Branch" sortKey="branch" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortableHeaderDiv label="Modified" sortKey="modified" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortableHeaderDiv label="Staged" sortKey="staged" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortableHeaderDiv label="Untracked" sortKey="untracked" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortableHeaderDiv label="Ahead" sortKey="ahead" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        <SortableHeaderDiv label="Behind" sortKey="behind" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
        <div className="px-3 py-2.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Stash</div>
        <div className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Actions</div>
      </div>
      {/* Virtualized rows */}
      <div className="divide-y divide-gray-100 dark:divide-gray-700/50" style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualItems.map((vi) => {
          const detail = sorted[vi.index];
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
              <TableRowGrid detail={detail} projectIndex={vi.index} isFocused={focusedIndex === vi.index} />
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
});

// ── Sortable header for div-based grid ───────────────────────────────────

const SortableHeaderDiv = memo(function SortableHeaderDiv({
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
    <div
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
    </div>
  );
});

// ── Native table row (for small lists) ───────────────────────────────────

const TableRow = memo(function TableRow({ detail, projectIndex, isFocused }: { detail: ProjectDetail; projectIndex?: number; isFocused?: boolean }) {
  const { onSuccess, onError, onInfo } = useProjectActions();
  const { project, group } = detail;

  return (
    <ProjectRowShell detail={detail}>
      {({ detail: d, row, actionButtons, errorBanner, activeOpIndicator }) => {
        const { current_branch, branches, status } = d;

        const StatusOrDash = ({ type, count }: { type: "modified" | "staged" | "untracked" | "ahead" | "behind"; count: number }) =>
          count > 0 ? <StatusBadge type={type} count={count} variant="text" /> : <span className="text-gray-300 dark:text-gray-600">—</span>;

        return (
          <>
            <tr data-project-id={project.id} data-project-index={projectIndex} role="row" aria-label={`${project.alias || project.name}, branch ${current_branch}`} className={`hover:bg-[var(--surface-2)] transition-colors duration-150 border-l-[3px] ${colorBorderClass(project.color) || "border-l-transparent"} ${isFocused ? "ring-2 ring-inset ring-blue-500 dark:ring-blue-400" : ""}`}>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {status.behind > 0 ? (
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  ) : status.modified + status.staged + status.untracked > 0 ? (
                    <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                  ) : status.ahead > 0 ? (
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  ) : null}
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-50">
                    {project.alias || project.name}
                  </div>
                  <GroupDot color={group.color} name={group.name} size="xs" />
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-50" title={project.path}>
                  {project.path}
                </div>
                {project.description && (
                  <div className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-50" title={project.description}>
                    {project.description}
                  </div>
                )}
                {errorBanner}
                {activeOpIndicator}
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
              <td className="px-3 py-2 text-sm text-center">
                {d.stash_count > 0 ? <StatusBadge type="stash" count={d.stash_count} variant="text" /> : <span className="text-gray-300 dark:text-gray-600">—</span>}
              </td>
              <td className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-0.5">
                  {actionButtons}
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={9} className="p-0">
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

// ── Div-based grid row (for virtualized lists) ───────────────────────────

const TableRowGrid = memo(function TableRowGrid({ detail, projectIndex, isFocused }: { detail: ProjectDetail; projectIndex?: number; isFocused?: boolean }) {
  const { onSuccess, onError, onInfo } = useProjectActions();
  const { project, group } = detail;

  return (
    <ProjectRowShell detail={detail}>
      {({ detail: d, row, actionButtons, errorBanner, activeOpIndicator }) => {
        const { current_branch, branches, status } = d;

        const StatusOrDash = ({ type, count }: { type: "modified" | "staged" | "untracked" | "ahead" | "behind"; count: number }) =>
          count > 0 ? <StatusBadge type={type} count={count} variant="text" /> : <span className="text-gray-300 dark:text-gray-600">—</span>;

        return (
          <div data-project-id={project.id} data-project-index={projectIndex} role="article" aria-label={`${project.alias || project.name}, branch ${current_branch}`} className={`hover:bg-[var(--surface-2)] transition-colors duration-150 border-l-[3px] ${colorBorderClass(project.color) || "border-l-transparent"} ${isFocused ? "ring-2 ring-inset ring-blue-500 dark:ring-blue-400" : ""}`}>
            <div className="grid grid-cols-[minmax(200px,1fr)_180px_100px_100px_100px_100px_100px_80px_96px] items-center">
              <div className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {status.behind > 0 ? (
                    <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                  ) : status.modified + status.staged + status.untracked > 0 ? (
                    <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" />
                  ) : status.ahead > 0 ? (
                    <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                  ) : null}
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-50">
                    {project.alias || project.name}
                  </div>
                  <GroupDot color={group.color} name={group.name} size="xs" />
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-50" title={project.path}>
                  {project.path}
                </div>
                {project.description && (
                  <div className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-50" title={project.description}>
                    {project.description}
                  </div>
                )}
                {errorBanner}
                {activeOpIndicator}
              </div>
              <div className="px-3 py-2">
                <BranchDropdown
                  currentBranch={current_branch}
                  branches={branches}
                  onSwitch={row.handleSwitch}
                  loading={row.switching}
                />
              </div>
              <div className="px-3 py-2 text-sm text-center">
                <StatusOrDash type="modified" count={status.modified} />
              </div>
              <div className="px-3 py-2 text-sm text-center">
                <StatusOrDash type="staged" count={status.staged} />
              </div>
              <div className="px-3 py-2 text-sm text-center">
                <StatusOrDash type="untracked" count={status.untracked} />
              </div>
              <div className="px-3 py-2 text-sm text-center">
                <StatusOrDash type="ahead" count={status.ahead} />
              </div>
              <div className="px-3 py-2 text-sm text-center">
                <StatusOrDash type="behind" count={status.behind} />
              </div>
              <div className="px-3 py-2 text-sm text-center">
                {d.stash_count > 0 ? <StatusBadge type="stash" count={d.stash_count} variant="text" /> : <span className="text-gray-300 dark:text-gray-600">—</span>}
              </div>
              <div className="px-3 py-2 text-right">
                <div className="flex items-center justify-end gap-0.5">
                  {actionButtons}
                </div>
              </div>
            </div>
            <GitOpsPanel
              path={project.path}
              onRefresh={row.handleGitRefresh}
              onSuccess={onSuccess}
              onError={onError}
              onInfo={onInfo}
            />
          </div>
        );
      }}
    </ProjectRowShell>
  );
});
