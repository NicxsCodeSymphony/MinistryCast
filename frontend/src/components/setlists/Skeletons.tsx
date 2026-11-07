import { Skeleton } from "../Skeleton";
import { InsightsStripSkeleton } from "../library/InsightsStrip";

/** Placeholder rows shaped like the setlist index rows (date tile, title, meta). */
export function SetlistRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 min-h-[48px] pl-6 pr-4 border-b border-white/5"
        >
          <Skeleton className="w-9 h-9 rounded-lg" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3.5 w-48 max-w-[60%]" />
            <Skeleton className="h-3 w-28 max-w-[40%]" />
          </div>
          <Skeleton className="hidden md:block h-3 w-12" />
          <Skeleton className="hidden sm:block h-3 w-12" />
          <Skeleton className="h-3 w-24" />
          <span className="w-7" />
        </div>
      ))}
    </div>
  );
}

/** Whole index page while the first page of setlists loads. */
export function SetlistIndexSkeleton() {
  return (
    <section aria-busy="true" className="h-full flex flex-col bg-surface-container-lowest">
      <div className="shrink-0 border-b border-white/5">
        <div className="flex items-center gap-3 px-6 h-14">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="flex items-center gap-2 px-6 pb-3">
          <Skeleton className="h-8 w-32 rounded-lg" />
          <Skeleton className="h-8 w-64 rounded-lg" />
        </div>
      </div>
      <div className="px-4 sm:px-6 py-4">
        <InsightsStripSkeleton id="setlists" className="mb-4" />
        <div className="rounded-xl border border-white/5 overflow-hidden">
          <div className="h-9 bg-surface-container-high border-b border-white/5" />
          <SetlistRowsSkeleton />
        </div>
      </div>
    </section>
  );
}

/** Item cards of the run of show. */
export function RunOfShowSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="rounded-xl border border-white/5 px-4 py-3 flex items-center gap-3 sm:gap-4"
        >
          <Skeleton className="w-4 h-4 rounded" />
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3.5 w-52 max-w-[70%]" />
            <Skeleton className="h-3 w-32 max-w-[50%]" />
          </div>
          <div className="space-y-1.5 flex flex-col items-end">
            <Skeleton className="h-3.5 w-12" />
            <Skeleton className="h-2.5 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Open-setlist view while the setlist loads: header, run of show, side panel. */
export function SetlistDetailSkeleton() {
  return (
    <section aria-busy="true" className="h-full flex flex-col bg-surface-container-lowest">
      <div className="shrink-0 border-b border-white/5 flex items-center gap-3 px-6 h-14">
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-44" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-16 rounded-lg" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="px-6 py-5">
          <RunOfShowSkeleton />
        </div>
        <div className="hidden lg:block border-l border-white/5 px-5 py-4 space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-full rounded-lg" />
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Song results in the side panel while a search runs. */
export function SongResultsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 h-12 px-3">
          <Skeleton className="w-10 h-10 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-32 max-w-[80%]" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
