import { useEffect, useState } from "react";
import { LoadMoreBar } from "../../../components/LoadMoreBar";
import { PageSkeleton } from "../../../components/Skeleton";
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


  return (
    <section className="h-full overflow-y-auto custom-scrollbar px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <header className="mb-6">
        <h2 className="text-[clamp(1.75rem,3vw,2rem)] font-semibold tracking-[-0.01em] text-on-surface mb-1">
          Audit log
        </h2>
        <p className="text-on-surface-variant">
          General trail for the whole platform, or filter to one church or one account.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        {(["general", "church", "account"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setScope(id)}
            className={`px-4 py-2 rounded-full text-xs font-semibold uppercase tracking-wide ${
              scope === id
                ? "bg-primary text-on-primary"
                : "bg-white/5 text-on-surface-variant hover:bg-white/10"
            }`}
          >
            {id === "general" ? "General" : id === "church" ? "By church" : "By account"}
          </button>
        ))}
        {scope === "church" ? (
          <select
            value={churchId}
            onChange={(event) => setChurchId(event.target.value)}
            className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm min-w-[220px]"
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
            value={actorId}
            onChange={(event) => setActorId(event.target.value)}
            className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm min-w-[220px]"
          >
            <option value="">Select an account</option>
            {accounts.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name} · {row.church_name} ({row.action_count})
              </option>
            ))}
          </select>
        ) : null}
        <span className="text-xs text-on-surface-variant ml-auto">
          {total} {total === 1 ? "event" : "events"}
        </span>
      </div>

      {error ? <p className="mb-4 text-sm text-[#ffb4ab]">{error}</p> : null}

      <div className="glass-card rounded-xl p-4 sm:p-6">
        {loading ? (
          <PageSkeleton />
        ) : events.length === 0 ? (
          <p className="text-sm text-on-surface-variant py-8 text-center">
            {scope === "church" && !churchId
              ? "Choose a church to see its trail."
              : scope === "account" && !actorId
                ? "Choose an account to see that person’s trail."
                : "No audit events yet."}
          </p>
        ) : (
          <ol className="space-y-3">
            {events.map((row) => (
              <li
                key={row.id}
                className="rounded-xl border border-white/5 bg-white/5 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-on-surface">{row.summary}</p>
                    <p className="text-xs text-on-surface-variant mt-1">
                      {row.actor_name || row.actor_email || "System"}
                      {row.church_name ? ` · ${row.church_name}` : ""}
                      {" · "}
                      {row.action}
                    </p>
                    {Array.isArray(row.metadata?.changes) &&
                    (row.metadata.changes as { field?: string; from?: string; to?: string }[])
                      .length ? (
                      <ul className="mt-2 space-y-1 text-xs text-on-surface-variant">
                        {(
                          row.metadata.changes as {
                            field: string;
                            from: string;
                            to: string;
                          }[]
                        ).map((change, index) => (
                          <li key={`${row.id}-${index}`}>
                            <span className="text-on-surface/80">{change.field}:</span>{" "}
                            {change.from} → {change.to}
                          </li>
                        ))}
                      </ul>
                    ) : Array.isArray(row.metadata?.sections) ? (
                      <ul className="mt-2 space-y-1 text-xs text-on-surface-variant">
                        {(
                          row.metadata.sections as {
                            section?: string | null;
                            preview?: string;
                          }[]
                        )
                          .filter((block) => block.preview)
                          .slice(0, 6)
                          .map((block, index) => (
                            <li key={`${row.id}-s-${index}`}>
                              {block.section ? (
                                <span className="text-on-surface/80">{block.section}: </span>
                              ) : null}
                              {block.preview}
                            </li>
                          ))}
                      </ul>
                    ) : null}
                  </div>
                  <span className="text-[11px] text-on-surface-variant whitespace-nowrap">
                    {formatWhen(row.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
        <LoadMoreBar
          shown={events.length}
          total={total}
          hasMore={events.length < total}
          loading={loadingMore}
          onMore={() => {
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
          }}
        />
      </div>
    </section>
  );
}
