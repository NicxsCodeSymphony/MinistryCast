import { useEffect, useMemo, useState } from "react";
import { LoadMoreBar } from "../../../components/LoadMoreBar";
import LibraryTable, { type LibraryColumn } from "../../../components/LibraryTable";
import { AdminRowsSkeleton } from "../../../components/admin/AdminSkeletons";
import { EditorPane } from "../../../components/admin/EditorPane";
import { InitialsTile, PlatformHeader } from "../../../components/admin/PlatformHeader";
import { Chip, EmptyState, Properties, RowMenu, SectionLabel } from "../../../components/ui";
import { PAGE_SIZE } from "../../../lib/types";
import {
  adminListAccounts,
  adminListChurches,
  adminListEvents,
  type AdminAccount,
  type AdminChurch,
  type AdminEvent,
} from "../../../lib/admin";
import { useSearch } from "../../../lib/SearchContext";
import { useToast } from "../../../lib/ToastContext";
import { formatWhen } from "./adminUi";

type Scope = "general" | "church" | "account";

function dayKey(iso: string) {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toDateString() : "Unknown date";
}

function dayLabel(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "Unknown date";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}),
  });
}

function timeLabel(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function AdminAudit() {
  const toast = useToast();
  const { query } = useSearch();
  const [scope, setScope] = useState<Scope>("general");
  const [churchId, setChurchId] = useState("");
  const [actorId, setActorId] = useState("");
  const [churches, setChurches] = useState<AdminChurch[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<AdminEvent | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [churchRows, accountRows] = await Promise.all([
          adminListChurches(),
          adminListAccounts(),
        ]);
        setChurches(churchRows);
        setAccounts(accountRows);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not load filters.";
        setError(message);
        toast.error(message);
      }
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    if (scope === "church" && !churchId) {
      setEvents([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    if (scope === "account" && !actorId) {
      setEvents([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    void (async () => {
      setLoading(true);
      try {
        const page = await adminListEvents({
          churchId: scope === "church" ? churchId || null : null,
          actorId: scope === "account" ? actorId || null : null,
          query,
          limit: PAGE_SIZE,
          offset: 0,
        });
        if (cancelled) return;
        setEvents(page.items);
        setTotal(page.total);
        setOffset(0);
        setError("");
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Could not load audit logs.";
        setError(message);
        toast.error(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actorId, churchId, query, scope]);


  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; items: AdminEvent[] }> = [];
    for (const row of events) {
      const key = dayKey(row.created_at);
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(row);
      else out.push({ key, label: dayLabel(row.created_at), items: [row] });
    }
    return out;
  }, [events]);

  const loadMore = () => {
    setLoadingMore(true);
    void adminListEvents({
      churchId: scope === "church" ? churchId || null : null,
      actorId: scope === "account" ? actorId || null : null,
      query,
      limit: PAGE_SIZE,
      offset: offset + PAGE_SIZE,
    })
      .then((page) => {
        setEvents((prev) => [...prev, ...page.items]);
        setTotal(page.total);
        setOffset(offset + PAGE_SIZE);
      })
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : "Could not load audit logs.";
        setError(message);
        toast.error(message);
      })
      .finally(() => setLoadingMore(false));
  };

  const needsPick = (scope === "church" && !churchId) || (scope === "account" && !actorId);

  return (
    <section className="h-full overflow-hidden flex flex-col">
      <PlatformHeader
        title="Audit log"
        meta={needsPick ? undefined : `${total} ${total === 1 ? "event" : "events"}`}
      />

      <div className="shrink-0 flex flex-wrap items-center gap-2 min-h-12 py-2 px-6 border-b border-white/5">
        {(["general", "church", "account"] as const).map((id) => (
          <Chip key={id} active={scope === id} onClick={() => setScope(id)}>
            {id === "general" ? "All activity" : id === "church" ? "By church" : "By account"}
          </Chip>
        ))}
        {scope === "church" ? (
          <select
            aria-label="Church"
            value={churchId}
            onChange={(event) => setChurchId(event.target.value)}
            className="ui-input h-[26px] w-auto min-w-[220px] text-[12px] py-0"
          >
            <option value="">Select a church</option>
            {churches.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} ({row.action_count})
              </option>
            ))}
          </select>
        ) : null}
        {scope === "account" ? (
          <select
            aria-label="Account"
            value={actorId}
            onChange={(event) => setActorId(event.target.value)}
            className="ui-input h-[26px] w-auto min-w-[220px] text-[12px] py-0"
          >
            <option value="">Select an account</option>
            {accounts.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {row.church_name} ({row.action_count})
              </option>
            ))}
          </select>
        ) : null}
        {query.trim() ? (
          <span className="ml-auto text-[12px] text-on-surface-variant truncate">
            Matching “{query.trim()}”
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="shrink-0 px-6 py-2.5 border-b border-white/5 text-[13px] text-error">
          {error}
        </p>
      ) : null}

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col px-4 sm:px-6 pt-4 pb-6">
          {loading ? (
            <AdminRowsSkeleton rows={10} group />
          ) : events.length === 0 ? (
            <EmptyState
              icon="policy"
              title={
                scope === "church" && !churchId
                  ? "Choose a church to see its trail."
                  : scope === "account" && !actorId
                    ? "Choose an account to see that person’s trail."
                    : "No audit events yet."
              }
            />
          ) : (
            <LibraryTable
              ariaLabel="Audit events"
              className="[&>table]:min-w-0"
              columns={[
                { key: "event", header: "Event" },
                ...(detail
                  ? []
                  : ([
                      { key: "church", header: "Church", hideBelow: "md", className: "w-[180px]" },
                      { key: "action", header: "Action", hideBelow: "lg", className: "w-[160px]" },
                    ] as LibraryColumn[])),
                { key: "time", header: "Time", align: "right", className: "w-24" },
              ]}
              groups={groups.map((group) => ({
                id: group.key,
                label: group.label,
                rows: group.items.map((row) => {
                  const actor = row.actor_name || row.actor_email || "System";
                  return {
                    id: row.id,
                    label: row.summary,
                    selected: detail?.id === row.id,
                    onOpen: () => setDetail(row),
                    leading: <InitialsTile name={actor} />,
                    cells: {
                      event: <AuditSummary row={row} actor={actor} compact={Boolean(detail)} />,
                      church: <span className="block truncate">{row.church_name || "—"}</span>,
                      action: (
                        <span className="block truncate font-mono text-[12px]">{row.action}</span>
                      ),
                      time: (
                        <time
                          dateTime={row.created_at}
                          title={formatWhen(row.created_at)}
                          className="whitespace-nowrap tabular-nums"
                        >
                          {timeLabel(row.created_at)}
                        </time>
                      ),
                    },
                    actions: (
                      <RowMenu
                        label={`Actions for event ${row.summary}`}
                        items={[
                          { label: "View details", icon: "info", onSelect: () => setDetail(row) },
                          {
                            label: "Show this church’s trail",
                            icon: "church",
                            disabled: !row.church_id,
                            onSelect: () => {
                              if (!row.church_id) return;
                              setScope("church");
                              setChurchId(row.church_id);
                            },
                          },
                          {
                            label: `Show ${actor}’s trail`,
                            icon: "person",
                            disabled: !row.actor_id,
                            onSelect: () => {
                              if (!row.actor_id) return;
                              setScope("account");
                              setActorId(row.actor_id);
                            },
                          },
                        ]}
                      />
                    ),
                  };
                }),
              }))}
              footer={
                <div className="px-6 pb-6">
                  <LoadMoreBar
                    shown={events.length}
                    total={total}
                    hasMore={events.length < total}
                    loading={loadingMore}
                    onMore={loadMore}
                  />
                </div>
              }
            />
          )}
        </div>

        <EditorPane
          open={Boolean(detail)}
          onClose={() => setDetail(null)}
          title={detail?.summary}
          subtitle={detail ? formatWhen(detail.created_at) : null}
          leading={
            detail ? (
              <InitialsTile name={detail.actor_name || detail.actor_email || "System"} />
            ) : null
          }
        >
          {detail ? <EventDetail row={detail} /> : null}
        </EditorPane>
      </div>
    </section>
  );
}

type Change = { field?: string; from?: string; to?: string };
type SectionPreview = { section?: string | null; preview?: string };

function readMeta(row: AdminEvent) {
  const changes = Array.isArray(row.metadata?.changes)
    ? (row.metadata.changes as Change[])
    : [];
  const sections =
    !changes.length && Array.isArray(row.metadata?.sections)
      ? (row.metadata.sections as SectionPreview[]).filter((block) => block.preview).slice(0, 6)
      : [];
  return { changes, sections };
}

/** Event cell: summary, who/where, and inline change details. */
function AuditSummary({
  row,
  actor,
  compact,
}: {
  row: AdminEvent;
  actor: string;
  compact: boolean;
}) {
  const { changes, sections } = readMeta(row);
  return (
    <>
      <span className="block truncate">{row.summary}</span>
      <span className="block truncate text-[12px] font-normal text-on-surface-variant">
        {actor}
        {compact && row.church_name ? ` · ${row.church_name}` : ""}
        <span className="lg:hidden">
          {" · "}
          <span className="font-mono text-[11px]">{row.action}</span>
        </span>
      </span>
      {changes.length ? (
        <span className="mt-1 block space-y-0.5 text-[12px] font-normal text-on-surface-variant border-l border-white/10 pl-3">
          {changes.map((change, index) => (
            <span key={`${row.id}-${index}`} className="block truncate">
              <span className="text-on-surface/80">{change.field}:</span> {change.from} → {change.to}
            </span>
          ))}
        </span>
      ) : sections.length ? (
        <span className="mt-1 block space-y-0.5 text-[12px] font-normal text-on-surface-variant border-l border-white/10 pl-3">
          {sections.map((block, index) => (
            <span key={`${row.id}-s-${index}`} className="block truncate">
              {block.section ? <span className="text-on-surface/80">{block.section}: </span> : null}
              {block.preview}
            </span>
          ))}
        </span>
      ) : null}
    </>
  );
}

/** Side pane: every field the audit row carries. */
function EventDetail({ row }: { row: AdminEvent }) {
  const { changes, sections } = readMeta(row);
  return (
    <>
      <Properties
        items={[
          { label: "Actor", value: row.actor_name || "System" },
          { label: "Email", value: row.actor_email || "—" },
          { label: "Church", value: row.church_name || "—" },
          { label: "Action", value: <span className="font-mono text-[12px]">{row.action}</span> },
          { label: "Entity", value: row.entity_type || "—" },
          { label: "When", value: formatWhen(row.created_at) },
        ]}
      />
      {changes.length ? (
        <div className="border-t border-white/5 pt-5 space-y-2">
          <SectionLabel>Changes</SectionLabel>
          <ul className="space-y-1.5 text-[13px] text-on-surface-variant">
            {changes.map((change, index) => (
              <li key={`${row.id}-d-${index}`}>
                <span className="text-on-surface">{change.field}</span>
                <span className="block">
                  {change.from} → {change.to}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : sections.length ? (
        <div className="border-t border-white/5 pt-5 space-y-2">
          <SectionLabel>Content</SectionLabel>
          <ul className="space-y-1.5 text-[13px] text-on-surface-variant">
            {sections.map((block, index) => (
              <li key={`${row.id}-ds-${index}`}>
                {block.section ? <span className="text-on-surface">{block.section}: </span> : null}
                {block.preview}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
