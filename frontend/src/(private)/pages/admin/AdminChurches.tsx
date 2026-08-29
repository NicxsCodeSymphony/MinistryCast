import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../../../components/modals/ConfirmDialog";
import { LoadMoreBar } from "../../../components/LoadMoreBar";
import { PageSkeleton } from "../../../components/Skeleton";
import { PAGE_SIZE } from "../../../lib/types";
import {
  adminDeleteChurch,
  adminListChurches,
  adminUpdateChurch,
  type AdminChurch,
} from "../../../lib/admin";
import { useSearch } from "../../../lib/SearchContext";
import { useToast } from "../../../lib/ToastContext";
import { formatWhen, StatusChip } from "./adminUi";

const PLATFORM = "00000000-0000-0000-0000-000000000001";

export default function AdminChurches() {
  const toast = useToast();
  const { query } = useSearch();
  const [rows, setRows] = useState<AdminChurch[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"delete" | "suspend" | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = async () => {
    setError("");
    const next = await adminListChurches();
    setRows(next);
    return next;
  };

  useEffect(() => {
    void load()
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Could not load churches.";
        setError(message);
        toast.error(message);
      })
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.name, row.email, row.status].some((value) =>
        value.toLowerCase().includes(q),
      ),
    );
  }, [query, rows]);
  const paged = visible.slice(0, visibleCount);

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const locked = selected?.id === PLATFORM;

  const open = (row: AdminChurch) => {
    setSelectedId(row.id);
    setName(row.name);
    setEmail(row.email);
    setStatus(row.status);
    setConfirm(null);
  };

  const save = async () => {
    if (!selected || locked) return;
    setBusy(true);
    try {
      await adminUpdateChurch(selected.id, { name, email, status });
      const next = await load();
      const fresh = next.find((row) => row.id === selected.id);
      if (fresh) open(fresh);
      toast.success("Church updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update church.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const suspend = async () => {
    if (!selected || locked) return;
    setBusy(true);
    try {
      const nextStatus = selected.status === "suspended" ? "active" : "suspended";
      await adminUpdateChurch(selected.id, { status: nextStatus });
      const next = await load();
      const fresh = next.find((row) => row.id === selected.id);
      if (fresh) open(fresh);
      toast.success(nextStatus === "suspended" ? "Church suspended." : "Church restored.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update church.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const remove = async () => {
    if (!selected || locked) return;
    setBusy(true);
    try {
      await adminDeleteChurch(selected.id);
      await load();
      setSelectedId(null);
      toast.success("Church deleted.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete church.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (loading) return <PageSkeleton />;

  return (
    <section className="h-full overflow-y-auto custom-scrollbar px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <header className="mb-6">
        <h2 className="text-[clamp(1.75rem,3vw,2rem)] font-semibold tracking-[-0.01em] text-on-surface mb-1">
          Church management
        </h2>
        <p className="text-on-surface-variant">
          Edit, suspend, or delete a church. Suspended churches cannot open the app.
        </p>
      </header>
      {error ? <p className="mb-4 text-sm text-[#ffb4ab]">{error}</p> : null}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-7 glass-card rounded-xl p-4 sm:p-6">
          <ul className="space-y-2">
            {paged.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => open(row)}
                  className={`w-full text-left rounded-xl p-4 border transition-colors ${
                    selectedId === row.id
                      ? "border-primary/40 bg-primary/10"
                      : "border-white/5 bg-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{row.name}</p>
                      <p className="text-xs text-on-surface-variant truncate">{row.email}</p>
                    </div>
                    <StatusChip status={row.status} />
                  </div>
                  <p className="text-xs text-on-surface-variant mt-2">
                    {row.account_count} accounts · {row.action_count} actions · {row.device_count} devices
                  </p>
                </button>
              </li>
            ))}
            {visible.length === 0 ? (
              <p className="text-sm text-on-surface-variant py-8 text-center">
                No churches match this search.
              </p>
            ) : null}
          </ul>
          <LoadMoreBar
            shown={paged.length}
            total={visible.length}
            hasMore={paged.length < visible.length}
            onMore={() => setVisibleCount((n) => n + PAGE_SIZE)}
          />
        </div>

        <div className="xl:col-span-5 glass-card rounded-xl p-6">
          {selected ? (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">{selected.name}</h3>
              <p className="text-xs text-on-surface-variant">
                Created {formatWhen(selected.created_at)}
                {selected.onboarded_at ? ` · onboarded ${formatWhen(selected.onboarded_at)}` : ""}
              </p>
              <label className="block space-y-1.5">
                <span className="text-[11px] uppercase tracking-widest text-on-surface-variant">
                  Name
                </span>
                <input
                  value={name}
                  disabled={locked}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] uppercase tracking-widest text-on-surface-variant">
                  Email
                </span>
                <input
                  value={email}
                  disabled={locked}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] uppercase tracking-widest text-on-surface-variant">
                  Status
                </span>
                <select
                  value={status}
                  disabled={locked}
                  onChange={(event) => setStatus(event.target.value)}
                  className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                >
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="offline">Offline</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={busy || locked}
                  onClick={() => void save()}
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold disabled:opacity-50"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  disabled={busy || locked}
                  onClick={() => setConfirm("suspend")}
                  className="px-4 py-2 rounded-lg border border-white/10 text-sm disabled:opacity-50"
                >
                  {selected.status === "suspended" ? "Restore" : "Suspend"}
                </button>
                <button
                  type="button"
                  disabled={busy || locked}
                  onClick={() => setConfirm("delete")}
                  className="px-4 py-2 rounded-lg border border-error/30 text-error text-sm disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
              {locked ? (
                <p className="text-xs text-on-surface-variant">
                  The platform church is protected.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">
              Select a church to edit, suspend, or delete it.
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        onConfirm={() => void remove()}
        title="Delete this church?"
        description={`This permanently removes ${selected?.name ?? "the church"} and all of its songs, sermons, and accounts.`}
        highlight={selected?.name}
        confirmLabel="Delete church"
      />
      <ConfirmDialog
        open={confirm === "suspend"}
        onClose={() => setConfirm(null)}
        onConfirm={() => void suspend()}
        title={selected?.status === "suspended" ? "Restore this church?" : "Suspend this church?"}
        description={
          selected?.status === "suspended"
            ? `${selected?.name ?? "This church"} will be able to sign in again.`
            : `${selected?.name ?? "This church"} will be locked out of MinistryCast until you restore it.`
        }
        highlight={selected?.name}
        confirmLabel={selected?.status === "suspended" ? "Restore" : "Suspend"}
      />
    </section>
  );
}
