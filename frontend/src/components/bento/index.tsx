/**
 * Bento layout + chart primitives (single-series, token-colored, accessible).
 *
 * Chart rules (dataviz): series color = the theme accent (--mc-primary) so it
 * follows every palette; bars <= 24px with 4px rounded data-ends and a square
 * baseline; 2px lines; 1px recessive gridlines; text never wears the series
 * color; every chart has a hover tooltip and an sr-only data table.
 */
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/* ── Layout ──────────────────────────────────────────────────────────── */

/** 12-column bento grid. Children use `BentoCard` with `span` / `rows`. */
export function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "grid grid-cols-1 sm:grid-cols-6 lg:grid-cols-12 auto-rows-[minmax(120px,auto)] gap-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

const SPAN: Record<number, string> = {
  3: "sm:col-span-3 lg:col-span-3",
  4: "sm:col-span-3 lg:col-span-4",
  5: "sm:col-span-6 lg:col-span-5",
  6: "sm:col-span-6 lg:col-span-6",
  7: "sm:col-span-6 lg:col-span-7",
  8: "sm:col-span-6 lg:col-span-8",
  9: "sm:col-span-6 lg:col-span-9",
  12: "sm:col-span-6 lg:col-span-12",
};
const ROWS: Record<number, string> = { 1: "", 2: "lg:row-span-2", 3: "lg:row-span-3" };

type BentoCardProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Right side of the card header (link, menu, badge). */
  action?: ReactNode;
  span?: 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
  rows?: 1 | 2 | 3;
  /** Emphasized card (accent wash). Use for one hero card per view at most. */
  accent?: boolean;
  /** Remove inner padding (for edge-to-edge lists). */
  flush?: boolean;
  className?: string;
  children?: ReactNode;
  "aria-label"?: string;
};

export function BentoCard({
  title,
  subtitle,
  action,
  span = 4,
  rows = 1,
  accent,
  flush,
  className,
  children,
  ...rest
}: BentoCardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      aria-label={title ? undefined : rest["aria-label"]}
      className={cx(
        "bento-card col-span-1 flex flex-col min-w-0 rounded-[14px] border border-white/5",
        accent ? "bento-card-accent" : "bg-surface-container",
        SPAN[span],
        ROWS[rows],
        className,
      )}
    >
      {title || action ? (
        <header className={cx("flex items-start justify-between gap-3", flush ? "px-5 pt-4 pb-3" : "px-5 pt-4")}>
          <div className="min-w-0">
            {title ? (
              <h2 id={headingId} className="text-[13px] font-medium text-on-surface-variant">
                {title}
              </h2>
            ) : null}
            {subtitle ? <p className="text-[12px] text-outline mt-0.5">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0 flex items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={cx("flex-1 min-h-0 flex flex-col", flush ? "" : "px-5 pb-5 pt-3")}>{children}</div>
    </section>
  );
}

/** Small header link used in card actions. */
export function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="text-[12px] text-on-surface-variant hover:text-on-surface">
      {children}
    </Link>
  );
}

/* ── Figures ─────────────────────────────────────────────────────────── */

export function formatCompact(value: number) {
  if (Math.abs(value) < 10_000) return value.toLocaleString();
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

type StatProps = {
  label: string;
  value: number | string;
  /** Signed change vs a named period, e.g. { value: 3, period: "last week" }. */
  delta?: { value: number; period: string; upIsGood?: boolean };
  /** Optional trend (up to ~12 points). */
  trend?: number[];
  hint?: ReactNode;
  to?: string;
  hero?: boolean;
};

/** Stat tile: label · value · optional delta · optional sparkline. */
export function Stat({ label, value, delta, trend, hint, to, hero }: StatProps) {
  const good = delta ? (delta.value === 0 ? null : (delta.value > 0) === (delta.upIsGood ?? true)) : null;
  const body = (
    <>
      <p className="text-[12px] text-on-surface-variant">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-3">
        <p
          className={cx(
            "font-semibold tracking-[-0.02em] text-on-surface leading-none",
            hero ? "text-[48px]" : "text-[28px]",
          )}
        >
          {typeof value === "number" ? formatCompact(value) : value}
        </p>
        {trend && trend.length > 1 ? (
          <Sparkline values={trend} label={`${label} trend`} className="w-24 h-8 shrink-0" />
        ) : null}
      </div>
      {delta || hint ? (
        <p className="mt-2 text-[12px] text-on-surface-variant flex items-center gap-1.5">
          {delta ? (
            <span
              className={cx(
                "inline-flex items-center gap-0.5 font-medium tabular-nums",
                good === null ? "" : good ? "text-[#3ecf8e]" : "text-error",
              )}
            >
              {delta.value > 0 ? "▲" : delta.value < 0 ? "▼" : "•"} {Math.abs(delta.value)}
            </span>
          ) : null}
          {delta ? <span>vs {delta.period}</span> : null}
          {hint ? <span className="truncate">{hint}</span> : null}
        </p>
      ) : null}
    </>
  );
  return to ? (
    <Link to={to} className="block group rounded-lg -m-1 p-1 hover:bg-white/[0.02]" aria-label={`${label}: ${value}`}>
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

/** Progress meter (one value of a whole). */
export function Meter({
  value,
  max,
  label,
  tone = "accent",
}: {
  value: number;
  max: number;
  label: string;
  tone?: "accent" | "good" | "warning" | "danger";
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const fill =
    tone === "good" ? "#3ecf8e" : tone === "warning" ? "#ffc53d" : tone === "danger" ? "var(--mc-error)" : "var(--mc-primary)";
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-2 w-full rounded-full overflow-hidden"
      style={{ background: `color-mix(in oklab, ${fill} 18%, transparent)` }}
    >
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct * 100}%`, background: fill }} />
    </div>
  );
}

/** Thin segmented bar (parts of a whole) with a legend. Colors come from the data (e.g. category colors). */
export function SegmentedBar({
  parts,
  label,
}: {
  parts: Array<{ label: string; value: number; color: string }>;
  label: string;
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  const visible = parts.filter((part) => part.value > 0);
  return (
    <div>
      <div role="img" aria-label={`${label}: ${visible.map((p) => `${p.label} ${p.value}`).join(", ")}`} className="flex h-2 w-full gap-[2px] rounded-full overflow-hidden">
        {total === 0 ? (
          <div className="flex-1 bg-white/5" />
        ) : (
          visible.map((part) => (
            <div
              key={part.label}
              title={`${part.label}: ${part.value} (${Math.round((part.value / total) * 100)}%)`}
              style={{ flexGrow: part.value, background: part.color }}
            />
          ))
        )}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-on-surface-variant">
        {visible.map((part) => (
          <li key={part.label} className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: part.color }} />
            {part.label}
            <span className="text-outline tabular-nums">{part.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Charts ──────────────────────────────────────────────────────────── */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

function niceMax(value: number) {
  if (value <= 4) return Math.max(1, Math.ceil(value));
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) if (value <= step * pow) return step * pow;
  return 10 * pow;
}

function SrTable({ caption, rows }: { caption: string; rows: Array<[string, number | string]> }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <th scope="row">{key}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Tiny trend line for stat tiles (no axes, no hover). */
export function Sparkline({
  values,
  label,
  className,
}: {
  values: number[];
  label: string;
  className?: string;
}) {
  const w = 96;
  const h = 32;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  const d = values.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} role="img" aria-label={`${label}: latest ${last}`} preserveAspectRatio="none">
      <path d={d} fill="none" stroke="var(--mc-outline)" strokeOpacity={0.6} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={(values.length - 1) * step} cy={y(last)} r={3} fill="var(--mc-primary)" stroke="var(--mc-surface-container)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type Datum = { label: string; value: number; /** Optional emphasis (e.g. the current period). */ current?: boolean };

/** Vertical columns over time or categories, with hover tooltip. */
export function ColumnChart({
  data,
  label,
  height = 160,
  format = (v: number) => v.toLocaleString(),
}: {
  data: Datum[];
  label: string;
  height?: number;
  format?: (value: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const padL = 28;
  const padB = 22;
  const padT = 8;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const plotW = Math.max(0, width - padL);
  const plotH = height - padB - padT;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.min(24, Math.max(4, band * 0.6));
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 44))));

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
          {ticks.map((tick) => {
            const y = padT + plotH - (tick / max) * plotH;
            return (
              <g key={tick}>
                <line x1={padL} x2={width} y1={y} y2={y} stroke="var(--mc-hairline)" strokeWidth={1} />
                <text x={padL - 6} y={y} textAnchor="end" dominantBaseline="middle" className="fill-[var(--mc-outline)] text-[10px] tabular-nums">
                  {format(tick)}
                </text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const x = padL + band * i + (band - barW) / 2;
            const h = max ? (d.value / max) * plotH : 0;
            const y = padT + plotH - h;
            const r = Math.min(4, h, barW / 2);
            const path = h
              ? `M${x},${padT + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${padT + plotH} Z`
              : "";
            const active = hover === i;
            return (
              <g key={d.label} onMouseEnter={() => setHover(i)}>
                {/* Generous hit target: the whole band. */}
                <rect x={padL + band * i} y={padT} width={band} height={plotH} fill="transparent" />
                {path ? (
                  <path
                    d={path}
                    fill="var(--mc-primary)"
                    fillOpacity={d.current || active ? 1 : hover === null ? 0.75 : 0.45}
                  />
                ) : null}
                {i % labelEvery === 0 ? (
                  <text x={padL + band * i + band / 2} y={height - 6} textAnchor="middle" className="fill-[var(--mc-outline)] text-[10px]">
                    {d.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
      {hover !== null && data[hover] ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md bg-surface-container-highest px-2 py-1 text-[11px] text-on-surface elevated whitespace-nowrap"
          style={{
            left: padL + (plotW / data.length) * hover + plotW / data.length / 2,
            top: padT + plotH - (max ? (data[hover].value / max) * plotH : 0) - 6,
          }}
        >
          <span className="text-on-surface-variant">{data[hover].label}</span>{" "}
          <span className="font-medium tabular-nums">{format(data[hover].value)}</span>
        </div>
      ) : null}
      <SrTable caption={label} rows={data.map((d) => [d.label, format(d.value)])} />
    </div>
  );
}

/** Single-series area/line over time, with crosshair + tooltip. */
export function AreaChart({
  data,
  label,
  height = 160,
  format = (v: number) => v.toLocaleString(),
}: {
  data: Datum[];
  label: string;
  height?: number;
  format?: (value: number) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();
  const padL = 28;
  const padB = 22;
  const padT = 10;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const plotW = Math.max(0, width - padL - 6);
  const plotH = height - padB - padT;
  const step = data.length > 1 ? plotW / (data.length - 1) : plotW;
  const px = (i: number) => padL + i * step;
  const py = (v: number) => padT + plotH - (max ? (v / max) * plotH : 0);
  const line = data.map((d, i) => `${i ? "L" : "M"}${px(i).toFixed(1)},${py(d.value).toFixed(1)}`).join(" ");
  const area = data.length
    ? `${line} L${px(data.length - 1)},${padT + plotH} L${px(0)},${padT + plotH} Z`
    : "";
  const ticks = [0, max / 2, max];
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(plotW / 48))));

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && data.length ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={label}
          onMouseMove={(event) => {
            const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
            const x = event.clientX - rect.left - padL;
            setHover(Math.max(0, Math.min(data.length - 1, Math.round(x / (step || 1)))));
          }}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--mc-primary)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--mc-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={padL} x2={width} y1={py(tick)} y2={py(tick)} stroke="var(--mc-hairline)" strokeWidth={1} />
              <text x={padL - 6} y={py(tick)} textAnchor="end" dominantBaseline="middle" className="fill-[var(--mc-outline)] text-[10px] tabular-nums">
                {format(tick)}
              </text>
            </g>
          ))}
          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke="var(--mc-primary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {data.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d.label} x={px(i)} y={height - 6} textAnchor="middle" className="fill-[var(--mc-outline)] text-[10px]">
                {d.label}
              </text>
            ) : null,
          )}
          {hover !== null ? (
            <g>
              <line x1={px(hover)} x2={px(hover)} y1={padT} y2={padT + plotH} stroke="var(--mc-outline)" strokeOpacity={0.5} strokeWidth={1} />
              <circle cx={px(hover)} cy={py(data[hover].value)} r={4} fill="var(--mc-primary)" stroke="var(--mc-surface-container)" strokeWidth={2} />
            </g>
          ) : (
            <circle
              cx={px(data.length - 1)}
              cy={py(data[data.length - 1].value)}
              r={4}
              fill="var(--mc-primary)"
              stroke="var(--mc-surface-container)"
              strokeWidth={2}
            />
          )}
        </svg>
      ) : null}
      {hover !== null && data[hover] ? (
        <div
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md bg-surface-container-highest px-2 py-1 text-[11px] text-on-surface elevated whitespace-nowrap"
          style={{ left: px(hover), top: py(data[hover].value) - 8 }}
        >
          <span className="text-on-surface-variant">{data[hover].label}</span>{" "}
          <span className="font-medium tabular-nums">{format(data[hover].value)}</span>
        </div>
      ) : null}
      <SrTable caption={label} rows={data.map((d) => [d.label, format(d.value)])} />
    </div>
  );
}

/** Ranked horizontal bars with direct value labels (top N lists). */
export function BarList({
  data,
  label,
  format = (v: number) => v.toLocaleString(),
  empty = "No data yet.",
}: {
  data: Array<{ label: string; value: number; to?: string; hint?: string }>;
  label: string;
  format?: (value: number) => string;
  empty?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  if (!data.length) return <p className="text-[13px] text-on-surface-variant">{empty}</p>;
  return (
    <ul aria-label={label} className="space-y-2.5">
      {data.map((d) => {
        const pct = max ? (d.value / max) * 100 : 0;
        const row = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="truncate text-on-surface">{d.label}</span>
              <span className="shrink-0 tabular-nums text-on-surface-variant">{format(d.value)}</span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--mc-primary)" }} />
            </div>
            {d.hint ? <p className="mt-1 text-[11px] text-outline truncate">{d.hint}</p> : null}
          </>
        );
        return (
          <li key={d.label}>
            {d.to ? (
              <Link to={d.to} className="block rounded-md hover:bg-white/[0.02]">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Animated count-up for hero numbers (respects reduced motion). */
export function useCountUp(target: number, ms = 600) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !Number.isFinite(target)) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const from = 0;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      setValue(Math.round(from + (target - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return value;
}
