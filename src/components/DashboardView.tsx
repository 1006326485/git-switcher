import { memo, useMemo } from "react";
import type { ProjectDetail } from "../lib/types";

interface DashboardViewProps {
  projects: ProjectDetail[];
  onSwitchBranch: (path: string, branch: string) => Promise<ProjectDetail>;
  onRefresh: (path: string) => Promise<ProjectDetail>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
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
        <StatCard label="Total Projects" value={stats.total} color="blue" />
        <StatCard label="With Changes" value={stats.withChanges} color="yellow" />
        <StatCard label="Ahead" value={stats.ahead} color="green" />
        <StatCard label="Behind" value={stats.behind} color="red" />
      </div>

      {/* File changes summary */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
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
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
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
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
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
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-red-200 dark:border-red-900 p-4">
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
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
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
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
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

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",
    yellow: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300",
    green: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300",
    red: "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300",
  };
  return (
    <div className={`rounded-lg p-4 ${colorClasses[color] || colorClasses.blue}`}>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-xs opacity-75 mt-1">{label}</div>
    </div>
  );
}
