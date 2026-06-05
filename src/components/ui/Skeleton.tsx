import { memo } from "react";

interface SkeletonProps {
  className?: string;
}

export const Skeleton = memo(function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`bg-gray-200 dark:bg-gray-700 rounded animate-pulse ${className}`}
      aria-hidden="true"
    />
  );
});

export function SkeletonRow({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`bg-[var(--surface-1)] border border-[var(--border-color)] rounded-xl animate-pulse ${
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

export function SkeletonCard() {
  return (
    <div className="bg-[var(--surface-1)] rounded-xl border border-[var(--border-color)] p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="w-2 h-2 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full mb-3" />
      <Skeleton className="h-8 w-full rounded-lg mb-3" />
      <div className="flex gap-2">
        <Skeleton className="h-5 rounded-full w-16" />
        <Skeleton className="h-5 rounded-full w-14" />
      </div>
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="bg-[var(--surface-1)] border border-[var(--border-color)] rounded-xl overflow-hidden animate-pulse">
      <div className="bg-[var(--surface-2)] border-b border-[var(--border-color)] px-3 py-2.5">
        <div className="flex gap-4">
          {["w-16", "w-14", "w-12", "w-12", "w-14", "w-10", "w-10"].map((w, i) => (
            <Skeleton key={i} className={`h-3 ${w}`} />
          ))}
        </div>
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
          <div className="flex gap-4 items-center">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-6 w-32 rounded-lg" />
            {Array.from({ length: 5 }).map((_, j) => (
              <Skeleton key={j} className="h-3 w-6 mx-auto" />
            ))}
            <div className="flex gap-0.5 justify-end">
              <Skeleton className="w-6 h-6 rounded" />
              <Skeleton className="w-6 h-6 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
