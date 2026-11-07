import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import Icon from "../Icon";
import { RowsSkeleton, Skeleton } from "../Skeleton";
import type { ReadinessCheck } from "./readiness";

/** Pre-service checklist rows. */
export function ReadinessList({
  checks,
  onSync,
  syncing,
}: {
  checks: ReadinessCheck[];
  onSync: () => void;
  syncing: boolean;
}) {
  return (
    <ul role="list" aria-label="Readiness" className="space-y-0.5">
      {checks.map((check) => (
        <li key={check.id} className="flex items-center gap-2.5 h-8 text-[13px] min-w-0">
          <span
            className={`w-4 h-4 shrink-0 flex items-center justify-center ${
              check.ok ? "text-primary" : "text-tertiary"
            }`}
          >
            <Icon name={check.ok ? "check_circle" : "warning"} className="text-[15px]" />
          </span>
          <span
            className={`flex-1 min-w-0 truncate ${
              check.ok ? "text-on-surface-variant" : "text-on-surface"
            }`}
          >
            {check.label}
          </span>
          {!check.ok && check.fixTo ? (
            <Link
              to={check.fixTo}
              className="shrink-0 text-[12px] font-medium text-primary hover:underline"
            >
              {check.fixLabel}
            </Link>
          ) : null}
          {!check.ok && check.fixAction === "sync" ? (
            <button
              type="button"
              disabled={syncing}
              onClick={onSync}
              className="shrink-0 text-[12px] font-medium text-primary hover:underline disabled:opacity-50"
            >
              {check.fixLabel}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export type CreateItem = { label: string; icon: string; onSelect: () => void };

/** "Create" dropdown replacing the old quick-action tiles. */
export function CreateMenu({ label, items }: { label: string; items: CreateItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="ui-btn ui-btn-ghost"
      >
        <Icon name="add" className="text-[16px]" />
        {label}
        <Icon name="expand_more" className="text-[14px]" />
      </button>
      {open ? (
        <div id={menuId} role="menu" className="ui-menu right-0 top-full mt-1">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="ui-menu-item"
            >
              <Icon name={item.icon} className="text-[15px]" />
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Row that navigates (a link, not a button) so it never shadows page buttons in tests or AT. */
export function LinkRow({
  to,
  leading,
  title,
  subtitle,
  meta,
}: {
  to: string;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <li className="border-t border-white/5 first:border-t-0">
      <Link
        to={to}
        className="flex items-center gap-3 min-w-0 min-h-[48px] px-5 py-1.5 text-left transition-colors hover:bg-surface-container-high focus-visible:bg-surface-container-high outline-none"
      >
        {leading ? <span className="shrink-0 flex items-center">{leading}</span> : null}
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-on-surface truncate">{title}</span>
          {subtitle ? (
            <span className="block text-[12px] text-on-surface-variant truncate">{subtitle}</span>
          ) : null}
        </span>
        {meta ? (
          <span className="shrink-0 flex items-center gap-4 text-[12px] text-on-surface-variant tabular-nums">
            {meta}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/** Loading state shaped like the bento layout. */
export function DashboardBentoSkeleton() {
  const card = "rounded-[14px] border border-white/5 bg-surface-container p-5";
  return (
    <div className="h-full flex flex-col" aria-busy="true" aria-label="Loading dashboard">
      <div className="h-14 px-6 flex items-center gap-3 border-b border-white/5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-28" />
        <div className="flex-1" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <div className="px-6 py-6 max-w-[1440px] w-full">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-6 lg:grid-cols-12 gap-4">
          <div className={`${card} sm:col-span-6 lg:col-span-8 lg:row-span-2 space-y-5`}>
            <Skeleton className="h-3 w-24" />
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-7 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-10 w-28" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] gap-6">
              <RowsSkeleton rows={4} />
              <div className="space-y-3">
                <Skeleton className="h-2 w-full rounded-full" />
                <RowsSkeleton rows={3} />
              </div>
            </div>
          </div>
          <div className={`${card} sm:col-span-6 lg:col-span-4 lg:row-span-2`}>
            <Skeleton className="h-3 w-20" />
            <RowsSkeleton rows={4} className="mt-4" />
          </div>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={`${card} sm:col-span-3 lg:col-span-3 space-y-3`}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-12" />
            </div>
          ))}
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className={`${card} sm:col-span-6 lg:col-span-6 space-y-4`}>
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Calm empty state for a chart card (no broken axes). */
export function ChartEmpty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex-1 min-h-[120px] flex flex-col items-center justify-center gap-2 text-center">
      <span className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-on-surface-variant">
        <Icon name={icon} className="text-[15px]" />
      </span>
      <p className="text-[12px] text-on-surface-variant max-w-[260px]">{text}</p>
    </div>
  );
}
