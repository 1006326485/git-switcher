import { useState, useCallback, useMemo, memo } from "react";
import type { ProjectDetail, ProjectRowCallbacks } from "../lib/types";
import { StatusBadge, GroupDot, IconButton } from "./ui/primitives";
import { BranchDropdown } from "./BranchDropdown";
import { GitLogViewer } from "./GitLogViewer";
import { BranchManager } from "./BranchManager";
import { TagManager } from "./TagManager";
import { AiReviewDialog } from "./AiReviewDialog";
import { ProjectContextMenu } from "./ProjectContextMenu";
import { GroupAssignDropdown } from "./ProjectGroupsPanel";
import { useProjectRow } from "../hooks/useProjectRow";

interface ProjectTableProps extends ProjectRowCallbacks {
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
          <span className="text-gray-400">{currentDir === "asc" ? "▲" : "▼"}</span>
        )}
      </span>
    </th>
  );
});

export const ProjectTable = memo(function ProjectTable({
  projects,
  onSwitchBranch,
  onRefresh,
  onRemove,
  onSuccess,
  onError,
  onInfo,
}: ProjectTableProps) {
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
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <table className="w-full" aria-label="Git projects">
        <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
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
            <TableRow
              key={detail.project.id}
              detail={detail}
              onSwitchBranch={onSwitchBranch}
              onRefresh={onRefresh}
              onRemove={onRemove}
              onSuccess={onSuccess}
              onError={onError}
              onInfo={onInfo}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
});

const TableRow = memo(function TableRow({
  detail,
  onSwitchBranch,
  onRefresh,
  onRemove,
  onSuccess,
  onError,
  onInfo: _onInfo,
}: ProjectRowCallbacks & { detail: ProjectDetail }) {
  const { project, current_branch, branches, status, group } = detail;
  const {
    switching,
    refreshing,
    error,
    logOpen,
    branchMgrOpen,
    aiReviewOpen,
    tagMgrOpen,
    handleSwitch,
    handleRefresh,
    handleGitRefresh,
    handleOpenLog,
    handleCloseLog,
    handleOpenBranchMgr,
    handleCloseBranchMgr,
    handleOpenAiReview,
    handleCloseAiReview,
    handleOpenTagMgr,
    handleCloseTagMgr,
    handleRemove,
  } = useProjectRow({ detail, onSwitchBranch, onRefresh, onRemove });

  return (
    <>
      <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
        <td className="px-3 py-2">
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-50">
              {project.alias || project.name}
            </div>
            <GroupDot color={group.color} name={group.name} size="xs" />
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-50">
            {project.path}
          </div>
          {error && <div className="text-xs text-red-600 dark:text-red-400 mt-0.5">{error}</div>}
        </td>
        <td className="px-3 py-2">
          <BranchDropdown
            currentBranch={current_branch}
            branches={branches}
            onSwitch={handleSwitch}
            loading={switching}
          />
        </td>
        <td className="px-3 py-2 text-sm text-center">
          <StatusBadge type="modified" count={status.modified} variant="text" />
          {status.modified === 0 && <span className="text-gray-300 dark:text-gray-600">—</span>}
        </td>
        <td className="px-3 py-2 text-sm text-center">
          <StatusBadge type="staged" count={status.staged} variant="text" />
          {status.staged === 0 && <span className="text-gray-300 dark:text-gray-600">—</span>}
        </td>
        <td className="px-3 py-2 text-sm text-center">
          <StatusBadge type="untracked" count={status.untracked} variant="text" />
          {status.untracked === 0 && <span className="text-gray-300 dark:text-gray-600">—</span>}
        </td>
        <td className="px-3 py-2 text-sm text-center">
          <StatusBadge type="ahead" count={status.ahead} variant="text" />
          {status.ahead === 0 && <span className="text-gray-300 dark:text-gray-600">—</span>}
        </td>
        <td className="px-3 py-2 text-sm text-center">
          <StatusBadge type="behind" count={status.behind} variant="text" />
          {status.behind === 0 && <span className="text-gray-300 dark:text-gray-600">—</span>}
        </td>
        <td className="px-3 py-2 text-right">
          <div className="flex items-center justify-end gap-0.5">
            <GroupAssignDropdown
              projectId={project.id}
              currentGroup={group}
              onRefresh={handleGitRefresh}
              onError={onError}
            />
            <IconButton onClick={handleOpenLog} title="Commit history" hoverColor="purple">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.643 3.143L.427 1.927A.25.25 0 000 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 00.177-.427L2.715 4.215a6.5 6.5 0 11-1.18 4.458.75.75 0 10-1.493.154 8.001 8.001 0 101.6-5.684zM7.75 4a.75.75 0 01.75.75v2.992l2.028.812a.75.75 0 01-.557 1.392l-2.5-1A.75.75 0 017 8.25v-3.5A.75.75 0 017.75 4z" />
              </svg>
            </IconButton>
            <IconButton onClick={handleRefresh} title="Refresh" hoverColor="gray">
              <span className={refreshing ? "animate-spin inline-block text-sm" : "text-sm"}>
                &#x21BB;
              </span>
            </IconButton>
            <ProjectContextMenu
              path={project.path}
              onSuccess={onSuccess}
              onError={onError}
              onOpenBranchManager={handleOpenBranchMgr}
              onOpenTagManager={handleOpenTagMgr}
              onOpenLogViewer={handleOpenLog}
              onOpenAiReview={handleOpenAiReview}
            />
            <IconButton onClick={handleRemove} title="Remove" hoverColor="red">
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.749.749 0 111.06 1.06L9.06 8l3.22 3.22a.749.749 0 11-1.06 1.06L8 9.06l-3.22 3.22a.749.749 0 11-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </IconButton>
          </div>
        </td>
      </tr>
      {logOpen && (
        <GitLogViewer
          path={project.path}
          projectName={project.name}
          open
          onClose={handleCloseLog}
        />
      )}
      {branchMgrOpen && (
        <BranchManager
          path={project.path}
          branches={branches}
          currentBranch={current_branch}
          open
          onClose={handleCloseBranchMgr}
          onRefresh={handleGitRefresh}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}
      {tagMgrOpen && (
        <TagManager
          path={project.path}
          open
          onClose={handleCloseTagMgr}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}
      {aiReviewOpen && (
        <AiReviewDialog
          open
          onClose={handleCloseAiReview}
          projectPath={project.path}
          projectName={project.name}
          branches={branches}
          currentBranch={current_branch}
          onSuccess={onSuccess}
          onError={onError}
        />
      )}
    </>
  );
});
