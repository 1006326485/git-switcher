import { Skeleton, SkeletonGroup } from "./loading";

// ═══════════════════════════════════════════════════════════════════════════
// Project-grid skeleton shapes (card / list / compact / table / dashboard)
//
// Built on the loading primitives so bars follow --skeleton and the shimmer
// highlight, and so the *container* owns the only `animate-pulse` (nested
// pulse used to compound opacity out of phase and pulsed card borders too).
//
// Shapes mirror the real views — colors stripe, branch control, status pills,
// action row — so the swap to content does not visibly jump.
// ═══════════════════════════════════════════════════════════════════════════

const CARD_GRID = "grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

function SkeletonRow({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`bg-[var(--surface-1)] border border-[var(--border-color)] rounded-xl overflow-hidden ${
        compact ? "px-3 py-2" : "px-4 py-3"
      }`}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="w-2 h-2 rounded-full" />
        <Skeleton className={compact ? "h-3.5 w-28" : "h-4 w-32"} />
        <Skeleton className={compact ? "h-5 w-20 rounded-lg" : "h-7 w-40 rounded-lg"} />
        <div className="flex gap-1.5 ml-auto">
          <Skeleton className="h-5 rounded-full w-12" />
          <Skeleton className="h-5 rounded-full w-10" />
        </div>
      </div>
    </div>
  );
}

/** Card view: color stripe + name/alias header, action row, branch control, status pills. */
function SkeletonCard() {
  return (
    <div className="bg-[var(--surface-1)] rounded-xl border border-[var(--border-color)] overflow-hidden">
      {/* Color stripe (matches ProjectCard's identity bar) */}
      <Skeleton className="h-1 w-full rounded-none" />
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="w-2 h-2 rounded-full" />
          <div className="ml-auto flex gap-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-6 rounded-lg" />
            ))}
          </div>
        </div>
        {/* Branch control */}
        <Skeleton className="h-8 w-full rounded-lg mb-3" />
        {/* Status pills */}
        <div className="flex gap-2">
          <Skeleton className="h-5 rounded-full w-16" />
          <Skeleton className="h-5 rounded-full w-14" />
        </div>
      </div>
    </div>
  );
}

/**
 * Table view: header + rows.
 *
 * `columns` comes from the caller so the placeholder cannot drift out of sync
 * with the real table the way the old hard-coded 7-cell header did while
 * ProjectTable rendered 9.
 */
function SkeletonTable({
  columns = 9,
  rows = 8,
}: {
  columns?: number;
  rows?: number;
}) {
  const track = Array.from({ length: columns });
  return (
    <div className="bg-[var(--surface-1)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      <div className="bg-[var(--surface-2)] border-b border-[var(--border-color)] px-3 py-2.5">
        <div className="flex gap-4">
          {track.map((_, i) => (
            <Skeleton key={i} className={i < 2 ? "h-3 w-20" : "h-3 w-12"} />
          ))}
          <Skeleton className="h-3 w-12 ml-auto" />
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-3 py-2.5 border-b border-[var(--border-color)] last:border-0">
          <div className="flex gap-4 items-center">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-6 w-32 rounded-lg" />
            {track.slice(2).map((_, j) => (
              <Skeleton key={j} className="h-3 w-6" />
            ))}
            <div className="flex gap-0.5 ml-auto">
              <Skeleton className="w-6 h-6 rounded" />
              <Skeleton className="w-6 h-6 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Dashboard view: stat tiles + a summary card. */
function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-[var(--surface-1)] rounded-lg p-4 border border-[var(--border-color)]">
            <Skeleton className="h-8 w-12 mb-2" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="bg-[var(--surface-1)] rounded-lg border border-[var(--border-color)] p-4">
        <Skeleton className="h-4 w-24 mb-3" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="text-center">
              <Skeleton className="h-7 w-10 mx-auto mb-1" />
              <Skeleton className="h-3 w-16 mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { SkeletonRow, SkeletonCard, SkeletonTable, SkeletonDashboard, CARD_GRID, SkeletonGroup };
