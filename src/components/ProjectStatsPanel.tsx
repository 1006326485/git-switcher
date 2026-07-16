import { memo, useState, useEffect, useCallback } from "react";
import type { ProjectStats } from "../lib/types";
import { getProjectStats } from "../lib/tauri";

interface ProjectStatsPanelProps {
  path: string;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelativeTime(timestamp: number): string {
  if (!timestamp) return "never";
  const diffMs = Date.now() - timestamp * 1000;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return rtf.format(-diffMin, "minute");
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return rtf.format(-diffHrs, "hour");
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return rtf.format(-diffDays, "day");
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return rtf.format(-diffMonths, "month");
  const diffYears = Math.floor(diffMonths / 12);
  return rtf.format(-diffYears, "year");
}

function ActivityBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <div
        className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export const ProjectStatsPanel = memo(function ProjectStatsPanel({ path }: ProjectStatsPanelProps) {
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    if (stats) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProjectStats(path);
      setStats(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [path, stats]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24" />
        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-32" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-red-500 dark:text-red-400">
        Failed to load stats
      </div>
    );
  }

  if (!stats) return null;

  const activityMax = Math.max(stats.commits_last_30_days, 1);

  return (
    <div className="space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-gray-400">Commits</span>
          <span className="font-medium text-gray-800 dark:text-gray-200">{stats.total_commits.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-gray-400">Contributors</span>
          <span className="font-medium text-gray-800 dark:text-gray-200">{stats.contributors.length}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-gray-400">Branches</span>
          <span className="font-medium text-gray-800 dark:text-gray-200">{stats.branch_count}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500 dark:text-gray-400">Tags</span>
          <span className="font-medium text-gray-800 dark:text-gray-200">{stats.tag_count}</span>
        </div>
      </div>

      {/* Activity sparkline */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400 w-7">7d</span>
          <ActivityBar value={stats.commits_last_7_days} max={activityMax} />
          <span className="font-medium text-gray-800 dark:text-gray-200 w-6 text-right">{stats.commits_last_7_days}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-500 dark:text-gray-400 w-7">30d</span>
          <ActivityBar value={stats.commits_last_30_days} max={activityMax} />
          <span className="font-medium text-gray-800 dark:text-gray-200 w-6 text-right">{stats.commits_last_30_days}</span>
        </div>
      </div>

      {/* Last commit */}
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-gray-500 dark:text-gray-400">Last commit</span>
        <span className="font-medium text-gray-800 dark:text-gray-200">{formatRelativeTime(stats.last_commit_date)}</span>
      </div>
    </div>
  );
});
