import { memo, useCallback, useState } from "react";
import type { BranchHealthItem, BranchHealthReport } from "../lib/types";
import { deleteMergedBranches } from "../lib/tauri";
import { OperationConfirmDialog } from "./OperationConfirmDialog";

interface BranchHealthPanelProps {
  reports: Array<{ projectName: string; path: string; report: BranchHealthReport }>;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp * 1000;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 1) return "today";
  if (diffDays < 30) return rtf.format(-diffDays, "day");
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return rtf.format(-diffMonths, "month");
  const diffYears = Math.floor(diffMonths / 12);
  return rtf.format(-diffYears, "year");
}

export const BranchHealthPanel = memo(function BranchHealthPanel({
  reports,
  loading,
  error,
  onRefresh,
}: BranchHealthPanelProps) {
  const [expandedMerged, setExpandedMerged] = useState(true);
  const [expandedStale, setExpandedStale] = useState(true);
  const [expandedBehind, setExpandedBehind] = useState(true);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const allMerged = reports.flatMap((r) =>
    r.report.merged.map((item) => ({ ...item, projectPath: r.path, projectName: r.projectName }))
  );
  const allStale = reports.flatMap((r) =>
    r.report.stale.map((item) => ({ ...item, projectPath: r.path, projectName: r.projectName }))
  );
  const allBehind = reports.flatMap((r) =>
    r.report.behind.map((item) => ({ ...item, projectPath: r.path, projectName: r.projectName }))
  );

  const handleDeleteAllMerged = useCallback(async () => {
    setDeleting(true);
    try {
      const byPath = new Map<string, string[]>();
      for (const item of allMerged) {
        const arr = byPath.get(item.projectPath) || [];
        arr.push(item.name);
        byPath.set(item.projectPath, arr);
      }
      for (const [path, branches] of byPath) {
        await deleteMergedBranches(path, branches);
      }
      onRefresh();
    } finally {
      setDeleting(false);
      setConfirmDeleteAll(false);
    }
  }, [allMerged, onRefresh]);

  if (loading) {
    return (
      <div className="bg-(--surface-1) rounded-xl border border-(--border-color) p-4 animate-pulse">
        <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-40 mb-4" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-(--surface-1) rounded-xl border border-red-200 dark:border-red-900 p-4">
        <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">Branch Health</h3>
        <p className="text-sm text-red-500">{error}</p>
      </div>
    );
  }

  const totalItems = allMerged.length + allStale.length + allBehind.length;

  if (totalItems === 0) {
    return (
      <div className="bg-(--surface-1) rounded-xl border border-green-200 dark:border-green-900 p-4">
        <h3 className="text-sm font-semibold text-green-600 dark:text-green-400 mb-1">Branch Health</h3>
        <p className="text-sm text-green-500">All branches are healthy</p>
      </div>
    );
  }

  return (
    <>
    <div className="bg-(--surface-1) rounded-xl border border-(--border-color) p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Branch Health</h3>

      {/* Merged branches */}
      {allMerged.length > 0 && (
        <CollapsibleSection
          title="Merged (ready to delete)"
          count={allMerged.length}
          expanded={expandedMerged}
          onToggle={() => setExpandedMerged(!expandedMerged)}
          color="green"
          action={
            <button
              onClick={() => setConfirmDeleteAll(true)}
              disabled={deleting}
              className="text-xs px-2 py-1 rounded transition-colors bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Delete All
            </button>
          }
        >
          {allMerged.map((item) => (
            <BranchItem key={`${item.projectPath}-${item.name}`} item={item} projectName={item.projectName} />
          ))}
        </CollapsibleSection>
      )}

      {/* Stale branches */}
      {allStale.length > 0 && (
        <CollapsibleSection
          title="Stale (>30 days)"
          count={allStale.length}
          expanded={expandedStale}
          onToggle={() => setExpandedStale(!expandedStale)}
          color="amber"
        >
          {allStale.map((item) => (
            <BranchItem key={`${item.projectPath}-${item.name}`} item={item} projectName={item.projectName} />
          ))}
        </CollapsibleSection>
      )}

      {/* Behind branches */}
      {allBehind.length > 0 && (
        <CollapsibleSection
          title="Behind (>10 commits)"
          count={allBehind.length}
          expanded={expandedBehind}
          onToggle={() => setExpandedBehind(!expandedBehind)}
          color="red"
        >
          {allBehind.map((item) => (
            <BranchItem key={`${item.projectPath}-${item.name}`} item={item} projectName={item.projectName} />
          ))}
        </CollapsibleSection>
      )}
    </div>
      {confirmDeleteAll && (
        <OperationConfirmDialog
          open
          operation="delete_merged_branches"
          targets={allMerged.map((item) => ({ path: item.projectPath, label: item.name }))}
          onConfirm={handleDeleteAllMerged}
          onCancel={() => setConfirmDeleteAll(false)}
        />
      )}
    </>
  );
});

function CollapsibleSection({
  title,
  count,
  expanded,
  onToggle,
  color,
  action,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  color: "green" | "amber" | "red";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const badgeColors = {
    green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div className="mb-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={onToggle}
          className="flex min-w-0 items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          {title}
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${badgeColors[color]}`}>{count}</span>
        </button>
        {action}
      </div>
      {expanded && <div className="ml-3 space-y-1 sm:ml-5">{children}</div>}
    </div>
  );
}

function BranchItem({
  item,
  projectName,
}: {
  item: BranchHealthItem;
  projectName?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm py-1">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
        {projectName && (
          <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">{projectName}</span>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0">
        {item.behind > 0 && <span className="text-red-500">-{item.behind}</span>}
        <span className="hidden sm:inline">{formatRelativeTime(item.last_commit_timestamp)}</span>
      </div>
    </div>
  );
}
