import { useEffect, useRef, useState, type ReactNode } from "react";
import { BentoGrid } from "../bento";
import { Skeleton } from "../Skeleton";
import Icon from "../Icon";
import { subscribeContent } from "../../lib/offline/live";

function readHidden(key: string) {
  // Phones start collapsed so the list keeps the screen; the choice is remembered.
  const narrow = typeof window !== "undefined" && window.innerWidth < 640;
  try {
    const stored = localStorage.getItem(key);
    return stored === null ? narrow : stored === "1";
  } catch {
    return narrow;
  }
}

function writeHidden(key: string, hidden: boolean) {
  try {
    localStorage.setItem(key, hidden ? "1" : "0");
  } catch {
    // Storage unavailable: the choice just isn't remembered.
  }
}

/**
 * Compact, collapsible bento strip shown above a library list.
 * The open/closed choice is remembered per page in localStorage.
 */
export function InsightsStrip({
  id,
  label,
  children,
  className = "",
  plain = false,
}: {
  /** Children bring their own grid instead of the 12-column BentoGrid. */
  plain?: boolean;
  /** Page id, e.g. "songs" (storage key `mc.insights.<id>.hidden`). */
  id: string;
  /** Accessible name of the region. */
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const key = `mc.insights.${id}.hidden`;
  const [hidden, setHidden] = useState(() => readHidden(key));
  const toggle = () => {
    setHidden((prev) => {
      writeHidden(key, !prev);
      return !prev;
    });
  };
  return (
    <section aria-label={label} className={`shrink-0 ${className}`}>
      <div className="flex items-center justify-between h-6 mb-2">
        <span className="text-[12px] font-medium text-on-surface-variant">Insights</span>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!hidden}
          className="inline-flex items-center gap-1 h-6 px-2 -mr-2 rounded-md whitespace-nowrap text-[12px] text-on-surface-variant hover:text-on-surface hover:bg-white/5"
        >
          <Icon
            name="expand_more"
            className={`text-[14px] transition-transform ${hidden ? "" : "rotate-180"}`}
          />
          {hidden ? "Show insights" : "Hide insights"}
        </button>
      </div>
      {hidden ? null : plain ? children : <BentoGrid>{children}</BentoGrid>}
    </section>
  );
}

/** Four card-shaped skeletons matching the strip. */
export function InsightsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <>
      {Array.from({ length: cards }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className="col-span-1 sm:col-span-3 lg:col-span-3 rounded-[14px] border border-white/5 bg-surface-container p-5 space-y-3"
        >
          <Skeleton className="h-3 w-24 rounded" />
          <Skeleton className="h-7 w-16 rounded" />
          <Skeleton className="h-2 w-full rounded" />
        </div>
      ))}
    </>
  );
}

/** Load insights, reloading on local content changes and when `deps` change. */
export function useInsights<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const run = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void loadRef
          .current()
          .then((next) => {
            if (!cancelled) setData(next);
          })
          .catch(() => undefined);
      }, 60);
    };
    run();
    const stop = subscribeContent(run);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

/** Loading placeholder for a whole strip (respects the remembered collapsed state). */
export function InsightsStripSkeleton({ id, cards = 4, className = "" }: { id: string; cards?: number; className?: string }) {
  const hidden = readHidden(`mc.insights.${id}.hidden`);
  return (
    <div aria-hidden className={`shrink-0 ${className}`}>
      <div className="flex items-center justify-between h-6 mb-2">
        <Skeleton className="h-3 w-14 rounded" />
        <Skeleton className="h-3 w-20 rounded" />
      </div>
      {hidden ? null : (
        <BentoGrid>
          <InsightsSkeleton cards={cards} />
        </BentoGrid>
      )}
    </div>
  );
}
