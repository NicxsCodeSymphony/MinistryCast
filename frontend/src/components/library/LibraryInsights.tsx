import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Skeleton } from "../Skeleton";
import {
  BarList,
  BentoCard,
  ColumnChart,
  Meter,
  SegmentedBar,
  Sparkline,
  Stat,
} from "../bento";
import { formatDuration } from "../../lib/helpers";
import { InsightsSkeleton, InsightsStrip, useInsights } from "./InsightsStrip";
import {
  countdown,
  loadSermonInsights,
  loadSetlistInsights,
  loadSongInsights,
  type SongInsights as SongData,
} from "./insightsData";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ── Songs ───────────────────────────────────────────────────────────── */

export function useSongInsights(version: unknown) {
  return useInsights(loadSongInsights, [version]);
}

/** Compact card for the Songs strip (the list keeps the page; see BentoCard for the full size). */
function MiniCard({ title, aside, children }: { title: string; aside?: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="bento-card min-w-0 rounded-[14px] border border-white/5 bg-surface-container px-4 py-3.5 flex flex-col"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[12px] font-medium text-on-surface-variant truncate">{title}</h2>
        {aside ? <span className="shrink-0 text-[11px] text-outline">{aside}</span> : null}
      </div>
      <div className="mt-2 flex-1 min-h-0 flex flex-col justify-center">{children}</div>
    </section>
  );
}

export function SongInsights({
  data,
  missingActive,
  onShowMissing,
}: {
  data: SongData | null;
  missingActive: boolean;
  onShowMissing: () => void;
}) {
  return (
    <InsightsStrip id="songs" label="Song library insights" className="mb-4" plain>
      <div className="@container">
        <div className="grid grid-cols-1 @md:grid-cols-3 gap-3">
          {!data ? (
            Array.from({ length: 3 }, (_, i) => (
              <div key={i} aria-hidden className="rounded-[14px] border border-white/5 bg-surface-container px-4 py-3.5 space-y-2.5">
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-6 w-12 rounded" />
                <Skeleton className="h-2 w-full rounded" />
              </div>
            ))
          ) : (
            <>
              <MiniCard title="Songs">
                <div className="flex items-end justify-between gap-3">
                  <p className="text-[24px] font-semibold tracking-[-0.02em] text-on-surface leading-none tabular-nums">
                    {data.total}
                  </p>
                  {data.addedWeekly.length > 1 ? (
                    <Sparkline
                      values={data.addedWeekly}
                      label="Songs added per week, last 8 weeks"
                      className="w-20 h-7 shrink-0"
                    />
                  ) : null}
                </div>
                <p className="mt-2 text-[12px] text-on-surface-variant truncate">
                  {data.addedThisWeek ? `+${data.addedThisWeek} this week · ` : "Added per week · "}
                  {data.missingLyrics === 0 ? (
                    "all have lyrics"
                  ) : (
                    <button
                      type="button"
                      onClick={onShowMissing}
                      aria-pressed={missingActive}
                      className="text-primary hover:underline"
                    >
                      {data.missingLyrics} missing lyrics
                    </button>
                  )}
                </p>
              </MiniCard>
              <MiniCard title="Library by category">
                {data.total ? (
                  <SegmentedBar parts={data.byCategory} label="Songs by category" />
                ) : (
                  <p className="text-[13px] text-on-surface-variant">No songs yet.</p>
                )}
              </MiniCard>
              <MiniCard title="Most scheduled" aside="times scheduled">
                <BarList
                  data={data.topScheduled}
                  label="Most scheduled songs (times scheduled)"
                  format={(v) => `${v}×`}
                  empty="No songs in a setlist yet."
                />
              </MiniCard>
            </>
          )}
        </div>
      </div>
    </InsightsStrip>
  );
}

/* ── Setlists ────────────────────────────────────────────────────────── */

export function SetlistInsights({
  viewChurchId,
  version,
}: {
  viewChurchId: string | null;
  version: unknown;
}) {
  const data = useInsights(() => loadSetlistInsights(viewChurchId), [viewChurchId, version]);
  return (
    <InsightsStrip id="setlists" label="Setlist insights" className="mb-4">
      {!data ? (
        <InsightsSkeleton />
      ) : (
        <>
          <BentoCard span={3}>
            <Stat
              label="Services this month"
              value={data.thisMonth}
              delta={{ value: data.thisMonth - data.lastMonth, period: "last month" }}
            />
          </BentoCard>
          <BentoCard span={3} title="Services per week">
            {data.weekly.some((week) => week.value) ? (
              <ColumnChart data={data.weekly} label="Services per week, last 8 weeks" height={72} />
            ) : (
              <p className="text-[13px] text-on-surface-variant">No services in the last 8 weeks.</p>
            )}
          </BentoCard>
          <BentoCard span={3}>
            <Stat
              label="Average length"
              value={data.averageSeconds ? formatDuration(data.averageSeconds) : "—"}
              hint={
                data.averageOf
                  ? `Across ${plural(data.averageOf, "setlist")}`
                  : "Add items or a length to a setlist"
              }
            />
          </BentoCard>
          <BentoCard span={3}>
            <p className="text-[12px] text-on-surface-variant">Next service</p>
            {data.next ? (
              <>
                <p className="mt-1 text-[28px] font-semibold tracking-[-0.02em] text-on-surface leading-none">
                  {countdown(data.next.at)}
                </p>
                <p className="mt-2 text-[12px] text-on-surface-variant truncate">
                  <Link
                    to={`/setlists?setlist=${data.next.id}`}
                    className="text-on-surface hover:underline"
                  >
                    {data.next.name}
                  </Link>
                  {" · "}
                  {data.next.at.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-[28px] font-semibold tracking-[-0.02em] text-on-surface leading-none">—</p>
                <p className="mt-2 text-[12px] text-on-surface-variant">Nothing scheduled</p>
              </>
            )}
          </BentoCard>
        </>
      )}
    </InsightsStrip>
  );
}

/* ── Sermons ─────────────────────────────────────────────────────────── */

export function SermonInsights({
  viewChurchId,
  version,
}: {
  viewChurchId: string | null;
  version: unknown;
}) {
  const data = useInsights(() => loadSermonInsights(viewChurchId), [viewChurchId, version]);
  const total = data ? data.ready + data.draft : 0;
  return (
    <InsightsStrip id="sermons" label="Sermon insights" className="mb-4">
      {!data ? (
        <InsightsSkeleton cards={3} />
      ) : (
        <>
          <BentoCard span={4}>
            <p className="text-[12px] text-on-surface-variant">Ready to present</p>
            <p className="mt-1 text-[28px] font-semibold tracking-[-0.02em] text-on-surface leading-none tabular-nums">
              {data.ready}
              <span className="text-[15px] font-normal text-on-surface-variant"> / {total}</span>
            </p>
            <div className="mt-3">
              <Meter value={data.ready} max={total} label="Sermons ready to present" tone="good" />
            </div>
            <p className="mt-2 text-[12px] text-on-surface-variant">
              {total ? `${plural(data.draft, "draft")} in progress` : "No active sermons"}
            </p>
          </BentoCard>
          <BentoCard span={4} title="Preached per month">
            {data.monthly.some((month) => month.value) ? (
              <ColumnChart data={data.monthly} label="Sermons per month by service date, last 6 months" height={72} />
            ) : (
              <p className="text-[13px] text-on-surface-variant">No sermons in the last 6 months.</p>
            )}
          </BentoCard>
          <BentoCard span={4} title="Top speakers">
            <BarList
              data={data.speakers}
              label="Top speakers by number of sermons"
              format={(v) => plural(v, "sermon")}
              empty="No speakers yet."
            />
          </BentoCard>
        </>
      )}
    </InsightsStrip>
  );
}
