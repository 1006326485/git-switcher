import { memo, useCallback, useMemo, useState } from "react";
import type { ProjectDetail, BranchHealthReport } from "../lib/types";
import { analyzeBranchHealth } from "../lib/tauri";
import { BranchHealthPanel } from "./BranchHealthPanel";

export type DashboardFilter = "all" | "modified" | "ahead" | "behind" | "stale";

interface DashboardViewProps {
  projects: ProjectDetail[];
  onDrillDown?: (filter: DashboardFilter) => void;
}

export const DashboardView = memo(function DashboardView({ projects, onDrillDown }: DashboardViewProps) {
  const [healthReports, setHealthReports] = useState<
    Array<{ projectName: string; path: string; report: BranchHealthReport }>
  >([]);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(null);
    try {
      const results: Array<{ projectName: string; path: string; report: BranchHealthReport }> = [];
      await Promise.allSettled(
        projects.map(async (p) => {
          try {
            const report = await analyzeBranchHealth(p.project.path);
            results.push({
              projectName: p.project.alias || p.project.name,
              path: p.project.path,
              report,
            });
          } catch {
            // skip failed repos
          }
        })
      );
      setHealthReports(results);
    } catch (e) {
      setHealthError(e instanceof Error ? e.message : "Failed to load branch health");
    } finally {
      setHealthLoading(false);
    }
  }, [projects]);

  const [healthLoaded, setHealthLoaded] = useState(false);

  const loadHealthLazy = useCallback(async () => {
    if (healthLoaded) return;
    setHealthLoaded(true);
    await loadHealth();
  }, [healthLoaded, loadHealth]);

  const drillDown = useCallback(
    (filter: DashboardFilter) => onDrillDown?.(filter),
    [onDrillDown]
  );

  const stats = useMemo(() => {
    const withChanges = projects.filter(
      (p) => p.status.modified > 0 || p.status.staged > 0 || p.status.untracked > 0
    );
    const ahead = projects.filter((p) => p.status.ahead > 0);
    const behind = projects.filter((p) => p.status.behind > 0);
    const upToDate = projects.filter(
      (p) => p.status.modified === 0 && p.status.staged === 0 &&
             p.status.untracked === 0 && p.status.ahead === 0 && p.status.behind === 0
    );
    const totalModified = projects.reduce((sum, p) => sum + p.status.modified, 0);
    const totalStaged = projects.reduce((sum, p) => sum + p.status.staged, 0);
    const totalUntracked = projects.reduce((sum, p) => sum + p.status.untracked, 0);
    const totalAhead = projects.reduce((sum, p) => sum + p.status.ahead, 0);
    const totalBehind = projects.reduce((sum, p) => sum + p.status.behind, 0);

    // Group by branch
    const branchMap = new Map<string, number>();
    projects.forEach((p) => {
      branchMap.set(p.current_branch, (branchMap.get(p.current_branch) || 0) + 1);
    });
    const topBranches = [...branchMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Stale projects: no activity in 30+ days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const stale = projects.filter((p) => {
      if (!p.project.last_active_at) return true;
      const lastActive = new Date(p.project.last_active_at).getTime();
      return lastActive < thirtyDaysAgo;
    });

    // Potential conflicts: behind remote with local changes
    const conflictRisk = projects.filter(
      (p) => p.status.behind > 0 && (p.status.modified > 0 || p.status.staged > 0)
    );

    return {
      total: projects.length,
      withChanges: withChanges.length,
      ahead: ahead.length,
      behind: behind.length,
      upToDate: upToDate.length,
      totalModified,
      totalStaged,
      totalUntracked,
      totalAhead,
      totalBehind,
      topBranches,
      withChangesList: withChanges,
      aheadList: ahead,
      behindList: behind,
      stale,
      conflictRisk,
    };
  }, [projects]);

  const needsSync = stats.behind > 0;
  const hasConflictRisk = stats.conflictRisk.length > 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Quick Action Banner */}
      {(needsSync || hasConflictRisk) && (
        <div className={`rounded-xl border p-4 ${
          hasConflictRisk
            ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50"
            : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50"
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {hasConflictRisk ? (
                <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
              ) : (
                <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                </div>
              )}
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${
                  hasConflictRisk
                    ? "text-red-800 dark:text-red-200"
                    : "text-amber-800 dark:text-amber-200"
                }`}>
                  {hasConflictRisk
                    ? `${stats.conflictRisk.length} project${stats.conflictRisk.length !== 1 ? "s" : ""} at conflict risk`
                    : `${stats.behind} project${stats.behind !== 1 ? "s" : ""} behind remote`}
                </p>
                <p className={`text-xs ${
                  hasConflictRisk
                    ? "text-red-600 dark:text-red-400"
                    : "text-amber-600 dark:text-amber-400"
                }`}>
                  {hasConflictRisk
                    ? "Local changes may conflict when pulling. Review before syncing."
                    : `${stats.totalBehind} commit${stats.totalBehind !== 1 ? "s" : ""} to pull from remote`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => drillDown("behind")}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  hasConflictRisk
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-amber-600 hover:bg-amber-700 text-white"
                }`}
              >
                View projects
              </button>
              {!hasConflictRisk && (
                <button
                  onClick={() => drillDown("behind")}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                >
                  Pull all
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <StatCard
          label="Total Projects"
          value={stats.total}
          color="blue"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0121.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          }
          onClick={() => drillDown("all")}
          actionLabel={`View all ${stats.total} project${stats.total === 1 ? "" : "s"}`}
        />
        <StatCard
          label="With Changes"
          value={stats.withChanges}
          color="yellow"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          }
          onClick={() => drillDown("modified")}
          actionLabel={`View ${stats.withChanges} project${stats.withChanges === 1 ? "" : "s"} with changes`}
        />
        <StatCard
          label="Ahead"
          value={stats.ahead}
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
          }
          onClick={() => drillDown("ahead")}
          actionLabel={`View ${stats.ahead} project${stats.ahead === 1 ? "" : "s"} ahead of remote`}
        />
        <StatCard
          label="Behind"
          value={stats.behind}
          color="red"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
            </svg>
          }
          onClick={() => drillDown("behind")}
          actionLabel={`View ${stats.behind} project${stats.behind === 1 ? "" : "s"} behind remote`}
        />
      </div>

      {/* Visualization row */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
        <BranchDistribution branches={stats.topBranches} />
        <SyncRing
          ahead={projects.filter((p) => p.status.ahead > 0).length}
          behind={projects.filter((p) => p.status.behind > 0).length}
          synced={stats.upToDate}
        />
      </div>

      {/* Branch health — lazy loaded on demand */}
      {!healthLoaded ? (
        <button
          onClick={loadHealthLazy}
          className="w-full p-4 rounded-xl border border-dashed border-[var(--border-color)] bg-[var(--surface-1)] hover:bg-[var(--surface-2)] transition-colors text-center group"
        >
          <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
            </svg>
            <span className="text-sm font-medium">Analyze branch health</span>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Identifies merged, stale, and behind branches</p>
        </button>
      ) : (
        <BranchHealthPanel
          reports={healthReports}
          loading={healthLoading}
          error={healthError}
          onRefresh={loadHealth}
        />
      )}

      {/* Change heat bar */}
      <ChangeHeatBar projects={projects} />

      {/* File changes summary */}
      <div className="bg-(--surface-1) rounded-xl border border-(--border-color) p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">File Changes</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.totalModified}</div>
            <div className="text-xs text-gray-500">Modified</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.totalStaged}</div>
            <div className="text-xs text-gray-500">Staged</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{stats.totalUntracked}</div>
            <div className="text-xs text-gray-500">Untracked</div>
          </div>
        </div>
      </div>

      {/* Sync status */}
      <div className="bg-(--surface-1) rounded-xl border border-(--border-color) p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Sync Status</h3>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.totalAhead}</div>
            <div className="text-xs text-gray-500">Commits Ahead</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.totalBehind}</div>
            <div className="text-xs text-gray-500">Commits Behind</div>
          </div>
        </div>
      </div>

      {/* Top branches */}
      {stats.topBranches.length > 0 && (
        <div className="bg-(--surface-1) rounded-xl border border-(--border-color) p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Active Branches</h3>
          <div className="space-y-2">
            {stats.topBranches.map(([branch, count]) => (
              <div key={branch} className="flex min-w-0 items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-mono text-gray-700 dark:text-gray-300" title={branch}>{branch}</span>
                <span className="shrink-0 text-gray-500">{count} project{count !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conflict risk */}
      {stats.conflictRisk.length > 0 && (
        <div className="bg-(--surface-1) rounded-xl border border-red-200 dark:border-red-900 p-4">
          <SectionAction
            label="Conflict Risk"
            count={stats.conflictRisk.length}
            onClick={() => drillDown("behind")}
            tone="danger"
          />
          <div className="space-y-1">
            {stats.conflictRisk.map((p) => (
              <button
                key={p.project.id}
                type="button"
                onClick={() => drillDown("behind")}
                className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-950/30"
              >
                <span className="min-w-0 truncate text-gray-700 dark:text-gray-300" title={p.project.alias || p.project.name}>{p.project.alias || p.project.name}</span>
                <div className="flex gap-2 text-xs">
                  <span className="text-red-600">behind {p.status.behind}</span>
                  {p.status.modified > 0 && <span className="text-yellow-600">{p.status.modified}M</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stale projects */}
      {stats.stale.length > 0 && (
        <div className="bg-(--surface-1) rounded-xl border border-(--border-color) p-4">
          <SectionAction
            label="Inactive Projects"
            count={stats.stale.length}
            onClick={() => drillDown("stale")}
          />
          <div className="space-y-1">
            {stats.stale.slice(0, 10).map((p) => (
              <button
                key={p.project.id}
                type="button"
                onClick={() => drillDown("stale")}
                className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) dark:hover:bg-gray-800"
              >
                <span className="min-w-0 truncate text-gray-700 dark:text-gray-300" title={p.project.alias || p.project.name}>{p.project.alias || p.project.name}</span>
                <span className="text-xs text-gray-500">
                  {p.project.last_active_at
                    ? `${Math.floor((Date.now() - new Date(p.project.last_active_at).getTime()) / (1000 * 60 * 60 * 24))}d ago`
                    : "never"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Projects needing attention */}
      {stats.withChangesList.length > 0 && (
        <div className="bg-(--surface-1) rounded-xl border border-(--border-color) p-4">
          <SectionAction
            label="Needs Attention"
            count={stats.withChangesList.length}
            onClick={() => drillDown("modified")}
          />
          <div className="space-y-1">
            {stats.withChangesList.slice(0, 10).map((p) => (
              <button
                key={p.project.id}
                type="button"
                onClick={() => drillDown("modified")}
                className="flex w-full min-w-0 items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) dark:hover:bg-gray-800"
              >
                <span className="min-w-0 truncate text-gray-700 dark:text-gray-300" title={p.project.alias || p.project.name}>{p.project.alias || p.project.name}</span>
                <div className="flex gap-2 text-xs">
                  {p.status.modified > 0 && <span className="text-yellow-600">{p.status.modified}M</span>}
                  {p.status.staged > 0 && <span className="text-green-600">{p.status.staged}S</span>}
                  {p.status.untracked > 0 && <span className="text-gray-500">{p.status.untracked}U</span>}
                  {p.status.ahead > 0 && <span className="text-blue-600">↑{p.status.ahead}</span>}
                  {p.status.behind > 0 && <span className="text-red-600">↓{p.status.behind}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

function SectionAction({
  label,
  count,
  onClick,
  tone = "default",
}: {
  label: string;
  count: number;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  const color = tone === "danger" ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-3 flex w-full items-center justify-between gap-3 text-left text-sm font-semibold ${color} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900`}
      aria-label={`View ${count} ${label.toLowerCase()}`}
    >
      <span>{label} ({count})</span>
      <span className="text-xs font-medium text-(--accent)">View projects →</span>
    </button>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
  onClick,
  actionLabel,
}: {
  label: string;
  value: number;
  color: "blue" | "yellow" | "green" | "red";
  icon: React.ReactNode;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const gradients: Record<string, string> = {
    blue: "from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10 border-blue-200 dark:border-blue-800/50",
    yellow: "from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-900/10 border-yellow-200 dark:border-yellow-800/50",
    green: "from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/10 border-green-200 dark:border-green-800/50",
    red: "from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/10 border-red-200 dark:border-red-800/50",
  };
  const textColors: Record<string, string> = {
    blue: "text-blue-700 dark:text-blue-300",
    yellow: "text-yellow-700 dark:text-yellow-300",
    green: "text-green-700 dark:text-green-300",
    red: "text-red-700 dark:text-red-300",
  };
  const content = (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-medium opacity-75 ${textColors[color]}`}>{label}</span>
        <span className={`${textColors[color]} opacity-60`}>{icon}</span>
      </div>
      <div className={`text-4xl font-bold ${textColors[color]}`}>{value}</div>
      {onClick && <span className={`mt-2 block text-xs font-medium ${textColors[color]}`}>View projects →</span>}
    </>
  );

  const className = `w-full rounded-xl p-4 border bg-gradient-to-br text-left ${gradients[color]}`;
  if (!onClick) return <div className={className}>{content}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${className} cursor-pointer transition-transform hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--accent) focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900`}
      aria-label={actionLabel ?? `View ${value} ${label.toLowerCase()}`}
    >
      {content}
    </button>
  );
}

function BranchDistribution({ branches }: { branches: [string, number][] }) {
  const total = branches.reduce((sum, [, count]) => sum + count, 0);
  const palette = [
    "bg-blue-500", "bg-green-500", "bg-amber-500", "bg-purple-500", "bg-pink-500",
  ];

  return (
    <div className="bg-(--surface-1) rounded-xl border border-(--border-color) p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Branch Distribution
      </h3>
      <div className="flex rounded-full h-3 overflow-hidden mb-3">
        {branches.map(([branch, count], i) => (
          <div
            key={branch}
            className={`${palette[i % palette.length]} transition-all duration-500`}
            style={{ width: `${(count / total) * 100}%` }}
            title={`${branch}: ${count} projects`}
          />
        ))}
      </div>
      <div className="space-y-1.5">
        {branches.map(([branch, count], i) => (
          <div key={branch} className="flex items-center gap-2 text-sm">
            <span className={`w-2.5 h-2.5 rounded-full ${palette[i % palette.length]}`} />
            <span className="font-mono text-gray-700 dark:text-gray-300 truncate flex-1">{branch}</span>
            <span className="text-gray-500 text-xs">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SyncRing({ ahead, behind, synced }: { ahead: number; behind: number; synced: number }) {
  const total = ahead + behind + synced;
  if (total === 0) return null;

  const aheadPct = (ahead / total) * 100;
  const behindPct = (behind / total) * 100;

  return (
    <div className="bg-(--surface-1) rounded-xl border border-(--border-color) p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Sync Status
      </h3>
      <div className="flex items-center gap-4">
        <div
          className="w-20 h-20 rounded-full shrink-0"
          style={{
            background: `conic-gradient(
              #22c55e 0% ${aheadPct}%,
              #ef4444 ${aheadPct}% ${aheadPct + behindPct}%,
              #6b7280 ${aheadPct + behindPct}% 100%
            )`,
          }}
        >
          <div className="w-14 h-14 rounded-full bg-(--surface-1) m-auto mt-3 flex items-center justify-center">
            <span className="text-lg font-bold text-gray-700 dark:text-gray-300">{total}</span>
          </div>
        </div>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span className="text-gray-600 dark:text-gray-400">Ahead: {ahead}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-gray-600 dark:text-gray-400">Behind: {behind}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-500" />
            <span className="text-gray-600 dark:text-gray-400">Synced: {synced}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChangeHeatBar({ projects }: { projects: ProjectDetail[] }) {
  const withChanges = projects
    .filter((p) => p.status.modified + p.status.staged + p.status.untracked > 0)
    .sort(
      (a, b) =>
        b.status.modified +
        b.status.staged +
        b.status.untracked -
        (a.status.modified + a.status.staged + a.status.untracked)
    )
    .slice(0, 10);

  if (withChanges.length === 0) return null;

  const maxChanges = Math.max(
    ...withChanges.map((p) => p.status.modified + p.status.staged + p.status.untracked)
  );

  return (
    <div className="bg-(--surface-1) rounded-xl border border-(--border-color) p-4">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Change Activity
      </h3>
      <div className="space-y-2">
        {withChanges.map((p) => {
          const total = p.status.modified + p.status.staged + p.status.untracked;
          const pct = (total / maxChanges) * 100;
          return (
            <div key={p.project.id} className="flex items-center gap-3">
              <span className="text-xs text-gray-600 dark:text-gray-400 w-24 truncate text-right">
                {p.project.alias || p.project.name}
              </span>
              <div className="flex-1 flex rounded-full h-3 overflow-hidden bg-gray-100 dark:bg-gray-800">
                <div
                  className="bg-yellow-500 transition-all duration-500"
                  style={{ width: `${(p.status.modified / total) * pct}%` }}
                  title={`${p.status.modified} modified`}
                />
                <div
                  className="bg-green-500 transition-all duration-500"
                  style={{ width: `${(p.status.staged / total) * pct}%` }}
                  title={`${p.status.staged} staged`}
                />
                <div
                  className="bg-gray-400 transition-all duration-500"
                  style={{ width: `${(p.status.untracked / total) * pct}%` }}
                  title={`${p.status.untracked} untracked`}
                />
              </div>
              <span className="text-xs text-gray-500 w-8 text-right">{total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
