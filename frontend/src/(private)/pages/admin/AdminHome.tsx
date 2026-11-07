import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import Icon from "../../../components/Icon";
import { OverviewSkeleton } from "../../../components/admin/AdminSkeletons";
import {
  Avatar,
  PlatformHeader,
  StatusBadge,
  relativeTime,
} from "../../../components/admin/PlatformHeader";
import {
  AreaChart,
  BarList,
  BentoCard,
  BentoGrid,
  CardLink,
  SegmentedBar,
  Sparkline,
} from "../../../components/bento";
import { Badge } from "../../../components/ui";
import {
  adminListAccounts,
  adminListChurches,
  adminListDevices,
  adminListEvents,
  adminOverview,
  type AdminAccount,
  type AdminChurch,
  type AdminDevice,
  type AdminEvent,
  type AdminOverview,
} from "../../../lib/admin";
import { useSearch } from "../../../lib/SearchContext";
import { useToast } from "../../../lib/ToastContext";
import { formatWhen } from "./adminUi";

type Attention = {
  id: string;
  kind: "approval" | "suspended" | "account";
  title: string;
  subtitle: string;
  badge: ReactNode;
  action: string;
  to: string;
};

/** Activity window for the chart. */
const WINDOW_DAYS = 30;
/** admin_list_events caps a page at 200 rows; page through a few at most. */
const EVENT_PAGE = 200;
const MAX_EVENT_PAGES = 5;
const RECENT_ROWS = 6;
const DAY = 86_400_000;

type Activity = {
  items: AdminEvent[];
  /** True when every event inside the window was fetched. */
  complete: boolean;
};

function startOfDay(ms: number) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function time(iso?: string | null) {
  const ms = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(ms) ? ms : null;
}

/** Page newest-first through admin_list_events until the window is covered. */
async function loadActivity(): Promise<Activity> {
  const since = startOfDay(Date.now()) - (WINDOW_DAYS - 1) * DAY;
  const items: AdminEvent[] = [];
  let total = 0;
  let reachedWindowStart = false;
  for (let page = 0; page < MAX_EVENT_PAGES; page += 1) {
    const result = await adminListEvents({ limit: EVENT_PAGE, offset: page * EVENT_PAGE });
    items.push(...result.items);
    total = result.total;
    const oldest = time(result.items[result.items.length - 1]?.created_at);
    if (oldest !== null && oldest < since) reachedWindowStart = true;
    if (reachedWindowStart || result.items.length < EVENT_PAGE || items.length >= total) break;
  }
  return { items, complete: reachedWindowStart || items.length >= total };
}

/** Counts per 7-day bucket, oldest first; the last bucket is the past 7 days. */
function weekly(stamps: Array<string | null | undefined>, weeks = 8) {
  const now = Date.now();
  const out = Array.from({ length: weeks }, () => 0);
  for (const stamp of stamps) {
    const ms = time(stamp);
    if (ms === null || ms > now) continue;
    const back = Math.floor((now - ms) / (7 * DAY));
    if (back < weeks) out[weeks - 1 - back] += 1;
  }
  return out;
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function shortDay(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const ROLE_ORDER = ["superadmin", "admin", "producer", "operator"];
const ROLE_LABEL: Record<string, string> = {
  superadmin: "Superadmins",
  admin: "Admins",
  producer: "Producers",
  operator: "Operators",
};
/** Roles are ordered by privilege, so they get a sequential ramp of the accent. */
const ROLE_SHADE = [100, 70, 45, 25];

export default function AdminHome() {
  const toast = useToast();
  const { query } = useSearch();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [churches, setChurches] = useState<AdminChurch[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [activity, setActivity] = useState<Activity>({ items: [], complete: true });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setError("");
      try {
        const [stats, churchRows, accountRows, deviceRows, eventRows] = await Promise.all([
          adminOverview(),
          adminListChurches(),
          adminListAccounts(),
          // Devices only feed a sparkline; never block the overview on them.
          adminListDevices().catch(() => [] as AdminDevice[]),
          loadActivity(),
        ]);
        setOverview(stats);
        setChurches(churchRows);
        setAccounts(accountRows);
        setDevices(deviceRows);
        setActivity(eventRows);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not load admin overview.";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const q = query.trim().toLowerCase();
  const matches = (...values: Array<string | null | undefined>) =>
    !q || values.some((value) => (value ?? "").toLowerCase().includes(q));

  const pendingChurches = useMemo(
    () => churches.filter((row) => row.status === "pending"),
    [churches],
  );

  const attention = useMemo<Attention[]>(() => {
    const items: Attention[] = [
      ...pendingChurches.map((row) => ({
        id: `approval-${row.id}`,
        kind: "approval" as const,
        title: row.name,
        subtitle: `Church signup awaiting approval · ${row.email}`,
        badge: (
          <Badge tone="warning">
            <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />
            Signup
          </Badge>
        ),
        action: "Review",
        to: "/settings?tab=approvals",
      })),
      ...churches
        .filter((row) => row.status === "suspended")
        .map((row) => ({
          id: `suspended-${row.id}`,
          kind: "suspended" as const,
          title: row.name,
          subtitle: `Church suspended · ${row.account_count} accounts`,
          badge: <StatusBadge status="suspended" />,
          action: "Open",
          to: `/admin/churches?open=${row.id}`,
        })),
      ...accounts
        .filter((row) => row.status === "pending")
        .map((row) => ({
          id: `account-${row.id}`,
          kind: "account" as const,
          title: row.name || row.email,
          subtitle: `Account pending activation · ${row.church_name || row.email}`,
          badge: <StatusBadge status="pending" />,
          action: "Review",
          to: `/admin/accounts?open=${row.id}`,
        })),
    ];
    return items.filter((item) => matches(item.title, item.subtitle));
  }, [accounts, churches, pendingChurches, q]);

  const topChurches = useMemo(
    () =>
      [...churches]
        .sort((a, b) => b.action_count - a.action_count)
        .filter((row) => matches(row.name, row.email))
        .slice(0, 5),
    [churches, q],
  );

  const recent = useMemo(
    () =>
      activity.items
        .filter((row) =>
          matches(row.summary, row.actor_name, row.actor_email, row.church_name, row.action),
        )
        .slice(0, RECENT_ROWS),
    [activity, q],
  );

  /** Audit events per day. A partial fetch only charts the days it covers. */
  const daily = useMemo(() => {
    const today = startOfDay(Date.now());
    let first = today - (WINDOW_DAYS - 1) * DAY;
    if (!activity.complete) {
      const oldest = time(activity.items[activity.items.length - 1]?.created_at);
      if (oldest !== null) first = Math.max(first, Math.min(startOfDay(oldest), today - 6 * DAY));
    }
    const days = Math.round((today - first) / DAY) + 1;
    const counts = Array.from({ length: days }, () => 0);
    let inWindow = 0;
    for (const row of activity.items) {
      const ms = time(row.created_at);
      if (ms === null) continue;
      const index = Math.round((startOfDay(ms) - first) / DAY);
      if (index >= 0 && index < days) {
        counts[index] += 1;
        inWindow += 1;
      }
    }
    return {
      data: counts.map((value, index) => ({
        label: shortDay(first + index * DAY),
        value,
        current: index === days - 1,
      })),
      inWindow,
    };
  }, [activity]);

  const churchWeeks = useMemo(() => weekly(churches.map((row) => row.created_at)), [churches]);
  const accountWeeks = useMemo(() => weekly(accounts.map((row) => row.created_at)), [accounts]);
  const deviceWeeks = useMemo(() => weekly(devices.map((row) => row.first_seen_at)), [devices]);
  const devicesActive = useMemo(() => {
    const since = Date.now() - 7 * DAY;
    return devices.filter((row) => (time(row.last_seen_at) ?? 0) >= since).length;
  }, [devices]);
  const dayTrend = daily.data.slice(-14).map((d) => d.value);
  const yesterday = daily.data.length > 1 ? daily.data[daily.data.length - 2].value : null;

  const oldestPending = useMemo(() => {
    const stamps = pendingChurches
      .map((row) => time(row.created_at))
      .filter((ms): ms is number => ms !== null);
    return stamps.length ? new Date(Math.min(...stamps)).toISOString() : null;
  }, [pendingChurches]);

  const roles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of accounts) counts.set(row.role, (counts.get(row.role) ?? 0) + 1);
    const order = [
      ...ROLE_ORDER,
      ...[...counts.keys()].filter((role) => !ROLE_ORDER.includes(role)).sort(),
    ];
    return order
      .filter((role) => counts.get(role))
      .map((role) => {
        const rank = ROLE_ORDER.indexOf(role);
        const shade = ROLE_SHADE[rank < 0 ? ROLE_SHADE.length - 1 : rank];
        return {
          label: ROLE_LABEL[role] ?? role,
          value: counts.get(role) ?? 0,
          color: `color-mix(in oklab, var(--mc-primary) ${shade}%, var(--mc-surface-container-highest))`,
        };
      });
  }, [accounts]);

  const header = (
    <PlatformHeader
      meta="Churches, accounts and activity across MinistryCast"
      approvals={pendingChurches.length}
    />
  );

  const windowLabel = activity.complete
    ? `Audit events per day · last ${WINDOW_DAYS} days`
    : `Audit events per day · last ${activity.items.length} events`;

  return (
    <section className="h-full flex flex-col overflow-hidden">
      {header}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        <div className="px-4 sm:px-6 py-6">
          {loading ? (
            <OverviewSkeleton />
          ) : (
            <>
              {error ? (
                <p
                  role="alert"
                  className="mb-4 px-4 py-2.5 rounded-lg border border-error/30 text-[13px] text-error"
                >
                  {error}
                </p>
              ) : null}
              <BentoGrid>
                <BentoCard
                  title="Needs attention"
                  subtitle={
                    attention.length
                      ? "Signups, suspensions and accounts waiting on a superadmin"
                      : undefined
                  }
                  action={
                    <span className="text-[12px] text-on-surface-variant tabular-nums">
                      {attention.length}
                    </span>
                  }
                  span={6}
                  rows={2}
                  accent
                  flush
                >
                  {attention.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 px-5 pb-6 text-center">
                      <span className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center">
                        <Icon name="check_circle" className="text-[20px]" />
                      </span>
                      <p className="text-[14px] text-on-surface">
                        {q ? "Nothing here matches this search." : "All clear"}
                      </p>
                      {q ? null : (
                        <p className="text-[12px] text-on-surface-variant">
                          Nothing is waiting on you.
                        </p>
                      )}
                    </div>
                  ) : (
                    <ul
                      role="list"
                      className="flex-1 lg:max-h-[236px] overflow-y-auto custom-scrollbar px-2 pb-2"
                    >
                      {attention.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03]"
                        >
                          <span
                            aria-hidden
                            className="w-8 h-8 rounded-lg bg-surface-container-high border border-white/10 flex items-center justify-center text-on-surface-variant shrink-0"
                          >
                            <Icon
                              name={
                                item.kind === "approval"
                                  ? "verified_user"
                                  : item.kind === "suspended"
                                    ? "block"
                                    : "person"
                              }
                              className="text-[15px]"
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[14px] text-on-surface truncate">
                              {item.title}
                            </span>
                            <span className="block text-[12px] text-on-surface-variant truncate">
                              {item.subtitle}
                            </span>
                          </span>
                          <span className="shrink-0 hidden sm:inline-flex">{item.badge}</span>
                          <Link
                            to={item.to}
                            aria-label={`${item.action} ${item.title}`}
                            className="ui-btn ui-btn-secondary ui-btn-sm shrink-0 w-[76px]"
                          >
                            {item.action}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </BentoCard>

                <PlatformStat
                  label="Churches"
                  value={overview?.churches_total ?? 0}
                  hint={`${overview?.churches_active ?? 0} active · ${overview?.churches_suspended ?? 0} suspended`}
                  trend={churchWeeks}
                  trendLabel="Churches created per week"
                  delta={`+${churchWeeks[churchWeeks.length - 1]} this week`}
                  to="/admin/churches"
                />
                <PlatformStat
                  label="Accounts"
                  value={overview?.accounts_total ?? 0}
                  hint={`${overview?.accounts_active ?? 0} active`}
                  trend={accountWeeks}
                  trendLabel="Accounts created per week"
                  delta={`+${accountWeeks[accountWeeks.length - 1]} this week`}
                  to="/admin/accounts"
                />
                <PlatformStat
                  label="Approvals"
                  value={pendingChurches.length}
                  hint="Signup requests"
                  delta={
                    oldestPending ? `Oldest · ${relativeTime(oldestPending)}` : "Queue is empty"
                  }
                  to="/settings?tab=approvals"
                  highlight={pendingChurches.length > 0}
                />
                <PlatformStat
                  label="Devices"
                  value={overview?.devices_total ?? 0}
                  hint="App and browser installs"
                  trend={deviceWeeks}
                  trendLabel="Devices first seen per week"
                  delta={`${devicesActive} active this week`}
                  to="/admin/accounts?view=devices"
                />

                <BentoCard
                  title="Activity"
                  subtitle={windowLabel}
                  action={
                    <>
                      <span className="text-[12px] text-on-surface-variant tabular-nums">
                        {daily.inWindow.toLocaleString()} {daily.inWindow === 1 ? "event" : "events"}
                      </span>
                      <CardLink to="/admin/audit">Audit log</CardLink>
                    </>
                  }
                  span={8}
                  rows={2}
                >
                  {daily.inWindow === 0 ? (
                    <div className="flex-1 min-h-[200px] flex items-center justify-center text-[13px] text-on-surface-variant">
                      No audit events in this period.
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col justify-end pt-2">
                      <AreaChart data={daily.data} label={windowLabel} height={220} />
                    </div>
                  )}
                </BentoCard>

                <PlatformStat
                  label="Actions today"
                  value={overview?.actions_today ?? 0}
                  hint={`${overview?.actions_total ?? 0} all time`}
                  trend={dayTrend}
                  trendLabel="Audit events per day, last 14 days"
                  delta={
                    yesterday === null
                      ? undefined
                      : `${yesterday.toLocaleString()} yesterday`
                  }
                  to="/admin/audit"
                  span={4}
                />

                <BentoCard
                  title="Accounts by role"
                  action={<CardLink to="/admin/accounts">Manage</CardLink>}
                  span={4}
                >
                  {roles.length ? (
                    <div className="flex-1 flex flex-col justify-end">
                      <SegmentedBar parts={roles} label="Accounts by role" />
                    </div>
                  ) : (
                    <p className="text-[13px] text-on-surface-variant">No accounts yet.</p>
                  )}
                </BentoCard>

                <BentoCard
                  title="Most active churches"
                  subtitle="Audit actions, all time"
                  action={<CardLink to="/admin/churches">View all</CardLink>}
                  span={5}
                >
                  <BarList
                    label="Most active churches by audit actions"
                    empty="No churches yet."
                    data={topChurches.map((row) => ({
                      label: row.name,
                      value: row.action_count,
                      to: `/admin/churches?open=${row.id}`,
                      hint: `${plural(row.account_count, "account")} · ${plural(row.device_count, "device")}`,
                    }))}
                  />
                </BentoCard>

                <BentoCard
                  title="Recent activity"
                  action={<CardLink to="/admin/audit">Full audit log</CardLink>}
                  span={7}
                  flush
                >
                  {recent.length === 0 ? (
                    <p className="px-5 pb-5 text-[13px] text-on-surface-variant">
                      {q ? "No activity matches this search." : "No audit events yet."}
                    </p>
                  ) : (
                    <ul role="list" className="pb-2">
                      {recent.map((row) => {
                        const actor = row.actor_name || row.actor_email || "System";
                        return (
                          <li
                            key={row.id}
                            className="flex items-center gap-3 h-11 px-5 border-t border-white/5"
                          >
                            <Avatar name={actor} size={24} />
                            <span className="min-w-0 flex-1 flex items-baseline gap-2">
                              <span className="text-[13px] text-on-surface truncate">
                                {row.summary}
                              </span>
                              <span className="hidden sm:inline text-[12px] text-on-surface-variant truncate">
                                {[row.church_name, row.action].filter(Boolean).join(" · ")}
                              </span>
                            </span>
                            <time
                              dateTime={row.created_at}
                              title={formatWhen(row.created_at)}
                              className="shrink-0 text-[12px] text-on-surface-variant tabular-nums"
                            >
                              {relativeTime(row.created_at)}
                            </time>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </BentoCard>
              </BentoGrid>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Stat tile: label, value, sparkline from real timestamps, a short change
 * line and a hint. The whole tile links to the matching roster.
 */
function PlatformStat({
  label,
  value,
  hint,
  to,
  trend,
  trendLabel,
  delta,
  highlight,
  span = 3,
}: {
  label: string;
  value: number;
  hint: string;
  to: string;
  trend?: number[];
  trendLabel?: string;
  delta?: string;
  highlight?: boolean;
  span?: 3 | 4;
}) {
  return (
    <BentoCard span={span} aria-label={label} className="relative">
      <Link
        to={to}
        data-metric={label}
        className="flex-1 flex flex-col pt-1 outline-none focus-visible:underline after:absolute after:inset-0 after:rounded-[14px]"
      >
        <span className="flex items-center justify-between gap-3 text-[12px]">
          <span data-part="label" className="text-on-surface-variant flex items-center gap-1.5 min-w-0">
            {highlight ? (
              <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-tertiary shrink-0" />
            ) : null}
            <span className="truncate">{label}</span>
          </span>
          {delta ? (
            <span data-part="delta" className="text-outline tabular-nums truncate">
              {delta}
            </span>
          ) : null}
        </span>
        <span className="mt-2 flex items-end justify-between gap-3">
          <span
            data-part="value"
            className="text-[28px] leading-none font-semibold tracking-[-0.02em] text-on-surface tabular-nums"
          >
            {value.toLocaleString()}
          </span>
          {trend && trend.length > 1 ? (
            <Sparkline
              values={trend}
              label={trendLabel ?? `${label} trend`}
              className="w-24 h-8 shrink-0"
            />
          ) : null}
        </span>
        <span data-part="hint" className="mt-auto pt-3 block text-[12px] text-on-surface-variant truncate">
          {hint}
        </span>
      </Link>
    </BentoCard>
  );
}
