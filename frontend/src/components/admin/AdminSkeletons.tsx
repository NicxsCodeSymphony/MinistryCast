import type { ReactNode } from "react";
import { Skeleton } from "../Skeleton";

/**
 * Rows shaped like the LibraryTable container the Platform rosters use:
 * hairline-bordered surface, 36px column header, rows with a 44px tile.
 */
export function AdminRowsSkeleton({
  rows = 8,
  group = false,
}: {
  rows?: number;
  /** Show a day-group label row first (audit log). */
  group?: boolean;
}) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="flex-1 min-h-0 overflow-hidden card-surface rounded-xl border border-white/5"
    >
      <div className="h-9 px-5 flex items-center gap-6 border-b border-white/5 bg-surface-container-high">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-2.5 w-14 ml-auto hidden md:block" />
        <Skeleton className="h-2.5 w-14 hidden lg:block" />
        <Skeleton className="h-2.5 w-12" />
      </div>
      {group ? (
        <div className="h-8 px-5 flex items-center border-b border-white/5 bg-surface-container-low">
          <Skeleton className="h-2.5 w-20" />
        </div>
      ) : null}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 h-[60px] px-5 border-b border-white/5 last:border-b-0">
          <Skeleton className="h-11 w-11 rounded-lg shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-48 max-w-[60%]" />
            <Skeleton className="h-2.5 w-32 max-w-[40%]" />
          </div>
          <Skeleton className="h-3 w-20 hidden md:block" />
          <Skeleton className="h-3 w-16 hidden lg:block" />
          <Skeleton className="h-5 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function CardShell({ className, children }: { className: string; children?: ReactNode }) {
  return (
    <div className={`rounded-[14px] border border-white/5 bg-surface-container p-5 ${className}`}>
      {children}
    </div>
  );
}

function StatShell({ className = "" }: { className?: string }) {
  return (
    <CardShell className={`sm:col-span-3 lg:col-span-3 space-y-3 ${className}`}>
      <Skeleton className="h-2.5 w-20" />
      <div className="flex items-end justify-between">
        <Skeleton className="h-7 w-12" />
        <Skeleton className="h-6 w-20" />
      </div>
      <Skeleton className="h-2.5 w-28" />
    </CardShell>
  );
}

/** Overview bento: hero + four stat tiles, activity chart + two tiles, two lists. */
export function OverviewSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading platform overview"
      className="grid grid-cols-1 sm:grid-cols-6 lg:grid-cols-12 auto-rows-[minmax(120px,auto)] gap-4"
    >
      <CardShell className="sm:col-span-6 lg:col-span-6 lg:row-span-2 space-y-4">
        <Skeleton className="h-3 w-28" />
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-40 max-w-[70%]" />
              <Skeleton className="h-2.5 w-56 max-w-[80%]" />
            </div>
            <Skeleton className="h-7 w-16 rounded-md" />
          </div>
        ))}
      </CardShell>
      <StatShell />
      <StatShell />
      <StatShell />
      <StatShell />
      <CardShell className="sm:col-span-6 lg:col-span-8 lg:row-span-2 space-y-4">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-[200px] w-full rounded-lg" />
      </CardShell>
      <StatShell className="sm:col-span-3 lg:col-span-4" />
      <CardShell className="sm:col-span-3 lg:col-span-4 space-y-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-2.5 w-40" />
      </CardShell>
      <CardShell className="sm:col-span-6 lg:col-span-5 space-y-4">
        <Skeleton className="h-3 w-36" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </CardShell>
      <CardShell className="sm:col-span-6 lg:col-span-7 space-y-4">
        <Skeleton className="h-3 w-28" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-7 w-7 rounded-full shrink-0" />
            <Skeleton className="h-3 flex-1" />
            <Skeleton className="h-2.5 w-12" />
          </div>
        ))}
      </CardShell>
    </div>
  );
}
