import { memo, useMemo } from "react";
import type { ProjectDetail } from "../lib/types";

interface DashboardViewProps {
  projects: ProjectDetail[];
}

export const DashboardView = memo(function DashboardView({ projects }: DashboardViewProps) {
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

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard
          label="Total Projects"
          value={stats.total}
          color="blue"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          }
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
        />
      </div>

      {/* Visualization row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BranchDistribution branches={stats.topBranches} />
        <SyncRing
          ahead={projects.filter((p) => p.status.ahead > 0).length}
          behind={projects.filter((p) => p.status.behind > 0).length}
          synced={stats.upToDate}
        />
      </div>

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
              <div key={branch} className="flex items-center justify-between text-sm">
                <span className="font-mono text-gray-700 dark:text-gray-300">{branch}</span>
                <span className="text-gray-500">{count} project{count !== 1 ? "s" : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conflict risk */}
      {stats.conflictRisk.length > 0 && (
        <div className="bg-(--surface-1) rounded-xl border border-red-200 dark:border-red-900 p-4">
          <h3 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-3">Conflict Risk</h3>
          <div className="space-y-1">
            {stats.conflictRisk.map((p) => (
              <div key={p.project.id} className="flex items-center justify-between text-sm py-1">
                <span className="text-gray-700 dark:text-gray-300">{p.project.alias || p.project.name}</span>
                <div className="flex gap-2 text-xs">
                  <span className="text-red-600">behind {p.status.behind}</span>
                  {p.status.modified > 0 && <span className="text-yellow-600">{p.status.modified}M</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stale projects */}
      {stats.stale.length > 0 && (
        <div className="bg-(--surface-1) rounded-xl border border-(--border-color) p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Inactive Projects ({stats.stale.length})
          </h3>
          <div className="space-y-1">
            {stats.stale.slice(0, 10).map((p) => (
              <div key={p.project.id} className="flex items-center justify-between text-sm py-1">
                <span className="text-gray-700 dark:text-gray-300">{p.project.alias || p.project.name}</span>
                <span className="text-xs text-gray-500">
                  {p.project.last_active_at
                    ? `${Math.floor((Date.now() - new Date(p.project.last_active_at).getTime()) / (1000 * 60 * 60 * 24))}d ago`
                    : "never"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Projects needing attention */}
      {stats.withChangesList.length > 0 && (
        <div className="bg-(--surface-1) rounded-xl border border-(--border-color) p-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Needs Attention</h3>
          <div className="space-y-1">
            {stats.withChangesList.slice(0, 10).map((p) => (
              <div key={p.project.id} className="flex items-center justify-between text-sm py-1">
                <span className="text-gray-700 dark:text-gray-300">{p.project.alias || p.project.name}</span>
                <div className="flex gap-2 text-xs">
                  {p.status.modified > 0 && <span className="text-yellow-600">{p.status.modified}M</span>}
                  {p.status.staged > 0 && <span className="text-green-600">{p.status.staged}S</span>}
                  {p.status.untracked > 0 && <span className="text-gray-500">{p.status.untracked}U</span>}
                  {p.status.ahead > 0 && <span className="text-blue-600">↑{p.status.ahead}</span>}
                  {p.status.behind > 0 && <span className="text-red-600">↓{p.status.behind}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: "blue" | "yellow" | "green" | "red";
  icon: React.ReactNode;
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
  return (
    <div className={`rounded-xl p-4 border bg-gradient-to-br ${gradients[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-medium opacity-75 ${textColors[color]}`}>{label}</span>
        <span className={`${textColors[color]} opacity-60`}>{icon}</span>
      </div>
      <div className={`text-4xl font-bold ${textColors[color]}`}>{value}</div>
    </div>
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
