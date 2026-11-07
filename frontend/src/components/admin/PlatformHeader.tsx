import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LibraryTile } from "../LibraryTable";
import { Badge, PageHeader } from "../ui";

/** One sub-navigation shared by every Platform page, so the section reads as one place. */
const TABS: Array<{ to: string; label: string; end?: boolean }> = [
  { to: "/admin", label: "Overview", end: true },
  { to: "/admin/churches", label: "Churches" },
  { to: "/admin/accounts", label: "Accounts" },
  { to: "/admin/audit", label: "Audit log" },
  // Approvals live in Settings; the tab links straight to that route.
  { to: "/settings?tab=approvals", label: "Approvals" },
];

export function PlatformHeader({
  title,
  meta,
  actions,
  approvals,
}: {
  /** Omit on the overview, where the page title is "Platform" itself. */
  title?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  /** Pending approval count, shown on the Approvals tab when > 0. */
  approvals?: number;
}) {
  const navigate = useNavigate();
  return (
    <PageHeader
      title={title ?? "Platform"}
      crumbs={title ? [{ label: "Platform", onClick: () => navigate("/admin") }] : undefined}
      meta={meta}
      actions={actions}
      toolbar={
        <nav aria-label="Platform sections" className="-mb-3 flex items-stretch gap-5 h-9 overflow-x-auto">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `relative inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  isActive
                    ? "text-on-surface font-medium border-primary"
                    : "text-on-surface-variant hover:text-on-surface border-transparent"
                }`
              }
            >
              {tab.label}
              {tab.label === "Approvals" && approvals ? (
                <Badge tone="warning">{approvals}</Badge>
              ) : null}
            </NavLink>
          ))}
        </nav>
      }
    />
  );
}

export type StatusTone = "neutral" | "accent" | "success" | "warning" | "danger";

export function statusTone(status: string): StatusTone {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  if (status === "suspended" || status === "disabled" || status === "rejected") return "danger";
  return "neutral";
}

export function statusLabel(status: string) {
  const value = status === "disabled" ? "suspended" : status;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={statusTone(status)}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />
      {statusLabel(status)}
    </Badge>
  );
}

/** "3m ago", "2h ago", "Yesterday", or a short date. */
export function relativeTime(iso?: string | null) {
  if (!iso) return "Never";
  const date = new Date(iso);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return "Never";
  const diff = Date.now() - ms;
  const min = Math.round(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className="rounded-full bg-surface-container-highest text-on-surface-variant font-medium flex items-center justify-center shrink-0"
    >
      {initials(name || "?")}
    </span>
  );
}

/** Small uppercase-free section heading used across the Platform pages. */
export function SectionHead({
  id,
  title,
  count,
  action,
}: {
  id?: string;
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 h-10 px-6 border-b border-white/5">
      <h2 id={id} className="text-[13px] font-medium text-on-surface">
        {title}
      </h2>
      {count != null ? (
        <span className="text-[12px] text-on-surface-variant tabular-nums">{count}</span>
      ) : null}
      {action ? <div className="ml-auto flex items-center">{action}</div> : null}
    </div>
  );
}

/** Initials inside the 44px LibraryTable leading tile. */
export function InitialsTile({ name, photoUrl }: { name: string; photoUrl?: string | null }) {
  if (photoUrl) {
    return (
      <span className="w-11 h-11 rounded-lg overflow-hidden bg-surface-container-high border border-white/10 flex items-center justify-center">
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      </span>
    );
  }
  return (
    <LibraryTile>
      <span aria-hidden className="text-[13px] font-semibold tracking-[0.02em]">
        {initials(name || "?")}
      </span>
    </LibraryTile>
  );
}
