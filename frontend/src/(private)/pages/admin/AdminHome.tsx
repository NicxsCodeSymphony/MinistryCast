import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageSkeleton } from "../../../components/Skeleton";
import {
  adminListChurches,
  adminListDevices,
  adminListEvents,
  adminOverview,
  type AdminChurch,
  type AdminDevice,
  type AdminEvent,
  type AdminOverview,
} from "../../../lib/admin";
import { useSearch } from "../../../lib/SearchContext";
import { useToast } from "../../../lib/ToastContext";
import { formatWhen } from "./adminUi";

export default function AdminHome() {
  const toast = useToast();
  const { query } = useSearch();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [churches, setChurches] = useState<AdminChurch[]>([]);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setError("");
      try {
        const [stats, churchRows, deviceRows, eventPage] = await Promise.all([
          adminOverview(),
          adminListChurches(),
          adminListDevices(),
          adminListEvents({ limit: 12, offset: 0 }),
        ]);
        setOverview(stats);
        setChurches(churchRows);
        setDevices(deviceRows);
        setEvents(eventPage.items);
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

  const visibleDevices = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((row) =>
      [row.user_name, row.user_email, row.church_name, row.os_label, row.platform, row.app_version]
        .some((value) => (value ?? "").toLowerCase().includes(q)),
    );
  }, [devices, query]);

  const topChurches = useMemo(
    () => [...churches].sort((a, b) => b.action_count - a.action_count).slice(0, 6),
    [churches],
  );

  if (loading) return <PageSkeleton />;

  return (
    <section className="h-full overflow-y-auto custom-scrollbar px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      <header>
        <h2 className="text-[clamp(1.75rem,3vw,2rem)] font-semibold tracking-[-0.01em] text-on-surface mb-1">
          Platform overview
        </h2>
        <p className="text-on-surface-variant">
          Live snapshot of churches, accounts, installs, and recent activity.
        </p>
      </header>

      {error ? <p className="text-sm text-[#ffb4ab]">{error}</p> : null}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Churches"
          value={overview?.churches_total ?? 0}
          hint={`${overview?.churches_active ?? 0} active · ${overview?.churches_suspended ?? 0} suspended`}
          to="/admin/churches"
          icon="church"
        />
        <StatCard
          label="Accounts"
          value={overview?.accounts_total ?? 0}
          hint={`${overview?.accounts_active ?? 0} active`}
          to="/admin/accounts"
          icon="group"
        />
        <StatCard
          label="Approvals"
          value={churches.filter((c) => c.status === "pending").length}
          hint="Signup requests"
          to="/settings?tab=approvals"
          icon="verified_user"
        />
        <StatCard
          label="Devices"
          value={overview?.devices_total ?? 0}
          hint="App and browser installs"
          icon="devices"
        />
        <StatCard
          label="Audit actions"
          value={overview?.actions_total ?? 0}
          hint={`${overview?.actions_today ?? 0} today`}
          to="/admin/audit"
          icon="policy"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <HubLink to="/admin/churches" icon="church" label="Manage churches" />
        <HubLink to="/admin/accounts" icon="group" label="Manage accounts" />
        <HubLink to="/settings?tab=approvals" icon="verified_user" label="Review approvals" />
        <HubLink to="/admin/audit" icon="policy" label="Audit log" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 glass-card rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
              Most active churches
            </h3>
            <Link to="/admin/churches" className="text-xs text-primary font-semibold">
              Manage
            </Link>
          </div>
          <ul className="space-y-3">
            {topChurches.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 bg-white/5 rounded-xl p-3 border border-white/5"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{row.name}</p>
                  <p className="text-xs text-on-surface-variant truncate">
                    {row.account_count} accounts · {row.device_count} devices
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-sm text-primary">{row.action_count}</p>
                  <p className="text-[10px] text-on-surface-variant uppercase">actions</p>
                </div>
              </li>
            ))}
            {topChurches.length === 0 ? (
              <p className="text-sm text-on-surface-variant">No churches yet.</p>
            ) : null}
          </ul>
        </div>

        <div className="xl:col-span-7 glass-card rounded-xl p-6">
          <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant mb-4">
            Devices that downloaded the app
          </h3>
          <div className="overflow-auto max-h-[480px] custom-scrollbar">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-on-surface-variant">
                <tr className="text-left">
                  <th className="pb-3 font-semibold">Account</th>
                  <th className="pb-3 font-semibold">Church</th>
                  <th className="pb-3 font-semibold">Device</th>
                  <th className="pb-3 font-semibold">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visibleDevices.map((row) => (
                  <tr key={row.id}>
                    <td className="py-3 pr-3 min-w-0">
                      <p className="truncate font-medium">{row.user_name || "Unknown"}</p>
                      <p className="truncate text-xs text-on-surface-variant">
                        {row.user_email}
                      </p>
                    </td>
                    <td className="py-3 pr-3 text-on-surface-variant truncate">
                      {row.church_name || "—"}
                    </td>
                    <td className="py-3 pr-3">
                      <p className="truncate">{row.os_label || row.platform}</p>
                      <p className="text-xs text-on-surface-variant">
                        {row.app_version || "—"}
                      </p>
                    </td>
                    <td className="py-3 text-xs text-on-surface-variant whitespace-nowrap">
                      {formatWhen(row.last_seen_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleDevices.length === 0 ? (
              <p className="text-sm text-on-surface-variant py-6">
                No device installs recorded yet. They appear when someone opens the app while signed in.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="glass-card rounded-xl p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
            Recent audit activity
          </h3>
          <Link
            to="/admin/audit"
            className="text-xs text-primary font-semibold hover:underline"
          >
            Full audit log
          </Link>
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-4">
            No audit events yet.
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {events.map((row) => (
              <li
                key={row.id}
                className="py-3 flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4"
              >
                <p className="text-xs text-on-surface-variant whitespace-nowrap sm:w-40 shrink-0">
                  {formatWhen(row.created_at)}
                </p>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-on-surface">{row.summary}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5 truncate">
                    {[row.actor_name || row.actor_email, row.church_name, row.action]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function HubLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: string;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-on-surface hover:border-primary/40 hover:bg-primary/10 transition-colors"
    >
      <span className="material-symbols-outlined text-[18px] text-primary">
        {icon}
      </span>
      {label}
    </Link>
  );
}

function StatCard({
  label,
  value,
  hint,
  to,
  icon,
}: {
  label: string;
  value: number;
  hint: string;
  to?: string;
  icon: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
          {label}
        </span>
        <span className="material-symbols-outlined text-primary text-[20px]">{icon}</span>
      </div>
      <p className="text-3xl font-semibold font-mono text-on-surface">{value}</p>
      <p className="text-xs text-on-surface-variant mt-1">{hint}</p>
    </>
  );
  const className =
    "glass-card rounded-xl p-5 block hover:border-primary/30 transition-colors";
  if (to) {
    return (
      <Link to={to} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}
