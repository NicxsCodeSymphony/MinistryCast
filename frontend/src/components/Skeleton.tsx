type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`skeleton ${className}`} />;
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24 hidden sm:block" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20 hidden md:block" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {Array.from({ length: cards }, (_, i) => (
        <Skeleton key={i} className="h-56 rounded-xl" />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    </div>
  );
}

/** Rows of a list while more items load (load-more, pickers). */
export function RowsSkeleton({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`space-y-2.5 ${className}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Lines of text (verses, previews). */
export function TextSkeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`} aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3 ${i === lines - 1 ? "w-3/5" : "w-full"}`} />
      ))}
    </div>
  );
}

/** Whole app shell while the session and workspace load. */
export function AppShellSkeleton() {
  return (
    <div className="h-full w-full flex bg-surface-container-lowest" aria-busy="true" aria-label="Loading MinistryCast">
      <div className="hidden md:flex w-[260px] shrink-0 flex-col gap-2 border-r border-white/5 p-4">
        <div className="flex items-center gap-3 mb-6">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-2.5 w-20" />
          </div>
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded-lg" />
        ))}
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-16 shrink-0 border-b border-white/5 flex items-center gap-4 px-6">
          <Skeleton className="h-8 w-96 max-w-[40%] rounded-full" />
          <div className="flex-1" />
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
        <PageSkeleton />
      </div>
    </div>
  );
}

/** Dashboard: header bar, next service + upcoming rows, library and system column. */
export function DashboardSkeleton() {
  return (
    <div className="h-full flex flex-col" aria-busy="true" aria-label="Loading dashboard">
      <div className="h-14 px-6 flex items-center gap-3 border-b border-white/5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-28" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-20 rounded-lg" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      <div className="px-6 py-6 space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
          <div className="space-y-6">
            <div className="rounded-xl border border-white/5 p-6 space-y-4">
              <Skeleton className="h-3 w-24" />
              <div className="flex items-center gap-4">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <RowsSkeleton rows={3} />
            </div>
            <div className="rounded-xl border border-white/5 p-6">
              <RowsSkeleton rows={2} />
            </div>
          </div>
          <div className="space-y-6">
            <div className="rounded-xl border border-white/5 p-4 grid grid-cols-2 gap-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
            <div className="rounded-xl border border-white/5 p-4 space-y-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Presentation console: top bar, run of show, stage, controls. */
export function ConsoleSkeleton() {
  return (
    <div className="h-full w-full flex flex-col bg-surface-container-lowest" aria-busy="true" aria-label="Loading presentation">
      <div className="h-12 shrink-0 border-b border-white/5 flex items-center gap-3 px-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-7 w-36 rounded-lg" />
        <Skeleton className="h-6 w-20 rounded-md" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="w-[260px] shrink-0 border-r border-white/5 p-4 hidden md:block">
          <RowsSkeleton rows={6} />
        </div>
        <div className="flex-1 min-w-0 p-6 space-y-4">
          <Skeleton className="w-full max-w-4xl mx-auto aspect-video rounded-xl" />
          <Skeleton className="h-8 w-full max-w-4xl mx-auto" />
          <div className="flex gap-3 max-w-4xl mx-auto">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-36 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="w-[300px] shrink-0 border-l border-white/5 p-4 space-y-3 hidden lg:block">
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-11 rounded-lg" />
            <Skeleton className="h-11 rounded-lg" />
          </div>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Settings: tab strip and a form card. */
export function SettingsSkeleton() {
  return (
    <div className="h-full flex" aria-busy="true" aria-label="Loading settings">
      <div className="hidden md:flex w-[232px] shrink-0 border-r border-white/5 flex-col gap-5 px-5 py-5">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
        {[2, 2, 3].map((count, group) => (
          <div key={group} className="space-y-2.5">
            <Skeleton className="h-2.5 w-14" />
            {Array.from({ length: count }, (_, i) => (
              <Skeleton key={i} className="h-4 w-32" />
            ))}
          </div>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="max-w-[880px] mx-auto px-4 sm:px-10 pt-8 sm:pt-10 space-y-8">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-3.5 w-64" />
          </div>
          <div className="rounded-[10px] border border-white/10">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-8 px-4 py-4 border-t border-white/5 first:border-t-0"
              >
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-2.5 w-48" />
                </div>
                <Skeleton className="h-[34px] w-[280px] rounded-lg" />
              </div>
            ))}
          </div>
          <div className="rounded-[10px] border border-white/10">
            {Array.from({ length: 2 }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-8 px-4 py-4 border-t border-white/5 first:border-t-0"
              >
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-2.5 w-40" />
                </div>
                <Skeleton className="h-[34px] w-[280px] rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Chat: channel list and a conversation. */
export function ChatSkeleton() {
  return (
    <div className="h-full flex flex-col" aria-busy="true" aria-label="Loading chat">
      <div className="h-14 shrink-0 border-b border-white/5 px-6 flex items-center gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-44" />
      </div>
      <div className="flex-1 min-h-0 p-6 flex gap-4">
      <div className="w-[300px] shrink-0 rounded-xl border border-white/5 p-4 space-y-4 hidden lg:block">
        <Skeleton className="h-9 w-full rounded-lg" />
        <RowsSkeleton rows={6} />
      </div>
      <div className="flex-1 rounded-xl border border-white/5 p-6 flex flex-col">
        <div className="flex items-center gap-3 pb-4 border-b border-white/5">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        </div>
        <div className="flex-1 py-6 space-y-5">
          {[60, 40, 70, 35].map((w, i) => (
            <div key={i} className={`flex ${i % 2 ? "justify-end" : ""}`}>
              <div style={{ width: `${w}%` }}>
                <Skeleton className="h-12 w-full rounded-2xl" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
      <div className="w-[280px] shrink-0 rounded-[14px] border border-white/5 p-5 space-y-3 hidden xl:block">
        <Skeleton className="h-14 w-14 rounded-full mx-auto" />
        <Skeleton className="h-3.5 w-28 mx-auto" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
      </div>
      </div>
    </div>
  );
}
