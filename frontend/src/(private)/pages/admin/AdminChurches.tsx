import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../../../components/modals/ConfirmDialog";
import { LoadMoreBar } from "../../../components/LoadMoreBar";
import { Skeleton, TableSkeleton } from "../../../components/Skeleton";
import { PAGE_SIZE } from "../../../lib/types";
import {
  adminDeleteChurch,
  adminListChurches,
  adminUpdateChurch,
  type AdminChurch,
} from "../../../lib/admin";
import { useSearch } from "../../../lib/SearchContext";
import { useToast } from "../../../lib/ToastContext";
import { AdminBackLink, formatWhen, StatusChip } from "./adminUi";

const PLATFORM = "00000000-0000-0000-0000-000000000001";

export default function AdminChurches() {
  const toast = useToast();
  const { query } = useSearch();
  const [rows, setRows] = useState<AdminChurch[]>([]);
  const [selected, setSelected] = useState<AdminChurch | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"delete" | "suspend" | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [savedFlash, setSavedFlash] = useState(false);

  const load = async (fresh = false) => {
    setError("");
    if (fresh) setRefreshing(true);
    else if (!rows.length) setLoading(true);
    try {
      const next = await adminListChurches();
      setRows(next);
      return next;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load churches.";
      setError(message);
      if (!rows.length) toast.error(message);
      throw err;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(false).catch(() => undefined);
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query]);

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

  const locked = selected?.id === PLATFORM;

  const open = (row: AdminChurch) => {
    setSelected(row);
    setName(row.name);
    setEmail(row.email);
    setStatus(row.status);
    setConfirm(null);
    setSavedFlash(false);
    setPanelOpen(true);
  };

  const closePanel = () => {
    if (busy) return;
    setPanelOpen(false);
    setConfirm(null);
    window.setTimeout(() => setSelected(null), 320);
  };

  const save = async () => {
    if (!selected || locked) return;
    setBusy(true);
    setError("");
    setSavedFlash(false);
    try {
      await adminUpdateChurch(selected.id, { name, email, status });
      const next = await load(true);
      const fresh = next?.find((row) => row.id === selected.id) ?? null;
      setSelected(fresh);
      if (fresh) {
        setName(fresh.name);
        setEmail(fresh.email);
        setStatus(fresh.status);
      }
      setSavedFlash(true);
      toast.success("Church updated.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not update church.";
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
      const next = await load(true);
      const fresh = next?.find((row) => row.id === selected.id) ?? null;
      setSelected(fresh);
      if (fresh) {
        setName(fresh.name);
        setEmail(fresh.email);
        setStatus(fresh.status);
      }
      toast.success(
        nextStatus === "suspended" ? "Church suspended." : "Church restored.",
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not update church.";
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
      await load(true);
      setPanelOpen(false);
      setSelected(null);
      toast.success("Church deleted.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not delete church.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (loading) {
    return (
      <section className="h-full overflow-y-auto custom-scrollbar px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <TableSkeleton rows={8} />
        </div>
      </section>
    );
  }

  return (
    <section className="h-full overflow-hidden flex flex-col px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="shrink-0 mb-2">
        <AdminBackLink />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 shrink-0 mb-6">
        <header>
          <h2 className="text-[clamp(1.75rem,3vw,2rem)] font-semibold tracking-[-0.01em] text-on-surface mb-1">
            Churches
          </h2>
          <p className="text-on-surface-variant text-sm">
            Search the roster, then open a row — the list shrinks and the editor
            slides in beside it.
          </p>
        </header>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => void load(true)}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-white/5 disabled:opacity-60 self-start"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mb-4 shrink-0 rounded-xl border border-[#ffb4ab]/30 bg-[#ffb4ab]/10 px-4 py-3 text-sm text-[#ffb4ab] flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            className="underline shrink-0"
            onClick={() => void load(true)}
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 flex gap-0">
        <div
          className={`min-w-0 flex flex-col transition-[flex-basis,max-width,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            panelOpen
              ? "flex-[1_1_58%] max-w-[58%] xl:max-w-none"
              : "flex-[1_1_100%] max-w-full"
          }`}
        >
          <p className="text-xs text-on-surface-variant mb-3 shrink-0">
            Showing {paged.length} of {visible.length}
            {visible.length !== rows.length
              ? ` (filtered from ${rows.length})`
              : ""}
          </p>

          {!visible.length ? (
            <p className="text-sm text-on-surface-variant py-12 text-center">
              {query.trim()
                ? "No churches match this search."
                : "No churches yet."}
            </p>
          ) : (
            <div className="rounded-xl border border-white/5 overflow-hidden flex-1 min-h-0 flex flex-col bg-surface-container-low/40">
              <div className="overflow-auto custom-scrollbar flex-1 min-h-0">
                <table className="w-full text-left text-sm min-w-[640px]">
                  <thead className="sticky top-0 bg-surface-container-lowest/95 backdrop-blur text-[11px] uppercase tracking-wider text-on-surface-variant z-[1]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Church</th>
                      {!panelOpen ? (
                        <th className="px-4 py-3 font-medium hidden md:table-cell">
                          Activity
                        </th>
                      ) : null}
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((row) => {
                      const active = panelOpen && selected?.id === row.id;
                      return (
                        <tr
                          key={row.id}
                          className={`border-t border-white/5 cursor-pointer transition-colors ${
                            active ? "bg-primary/10" : "hover:bg-white/[0.03]"
                          }`}
                          onClick={() => open(row)}
                        >
                          <td className="px-4 py-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-on-surface truncate">
                                {row.name}
                              </p>
                              <p className="text-xs text-on-surface-variant truncate">
                                {row.email}
                                {panelOpen
                                  ? ` · ${row.account_count} accounts`
                                  : ""}
                              </p>
                            </div>
                          </td>
                          {!panelOpen ? (
                            <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap hidden md:table-cell">
                              {row.account_count} accounts · {row.action_count}{" "}
                              actions · {row.device_count} devices
                            </td>
                          ) : null}
                          <td className="px-4 py-3">
                            <StatusChip status={row.status} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                              chevron_right
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t border-white/5 shrink-0">
                <LoadMoreBar
                  shown={paged.length}
                  total={visible.length}
                  hasMore={paged.length < visible.length}
                  onMore={() => setVisibleCount((n) => n + PAGE_SIZE)}
                />
              </div>
            </div>
          )}
        </div>

        <aside
          aria-hidden={!panelOpen}
          className={`overflow-hidden transition-[flex-basis,max-width,opacity,transform,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            panelOpen
              ? "flex-[0_0_min(420px,42%)] max-w-[420px] ml-4 opacity-100 translate-x-0"
              : "flex-[0_0_0] max-w-0 ml-0 opacity-0 translate-x-6 pointer-events-none"
          }`}
        >
          <div className="w-[min(420px,100%)] h-full min-h-[420px] rounded-xl border border-white/10 bg-surface-container-low flex flex-col overflow-hidden">
            {selected ? (
              <>
                <div className="flex items-start justify-between gap-3 p-5 border-b border-white/5 shrink-0">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-on-surface truncate">
                      {selected.name}
                    </h2>
                    <p className="text-xs text-on-surface-variant mt-1">
                      Created {formatWhen(selected.created_at)}
                      {selected.onboarded_at
                        ? ` · onboarded ${formatWhen(selected.onboarded_at)}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closePanel}
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-white/5"
                    aria-label="Close"
                  >
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
                  {savedFlash ? (
                    <p className="text-sm text-primary">Changes saved.</p>
                  ) : null}

                  <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2.5 text-xs text-on-surface-variant">
                    {selected.account_count} accounts · {selected.action_count}{" "}
                    actions · {selected.device_count} devices
                  </div>

                  <label className="block space-y-1.5">
                    <span className="text-[11px] uppercase tracking-widest text-on-surface-variant">
                      Name
                    </span>
                    <input
                      value={name}
                      disabled={locked}
                      onChange={(event) => setName(event.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none disabled:opacity-50"
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
                      className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none disabled:opacity-50"
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
                      className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none disabled:opacity-50"
                    >
                      <option value="pending">Pending</option>
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                      <option value="offline">Offline</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </label>

                  {locked ? (
                    <p className="text-xs text-on-surface-variant">
                      The platform church is protected.
                    </p>
                  ) : null}
                </div>

                <div className="p-5 border-t border-white/5 flex flex-wrap gap-2 shrink-0">
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
              </>
            ) : null}
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        onConfirm={() => remove()}
        title="Delete this church?"
        description={`This permanently removes ${selected?.name ?? "the church"} and all of its songs, sermons, and accounts.`}
        highlight={selected?.name}
        confirmLabel="Delete church"
      />
      <ConfirmDialog
        open={confirm === "suspend"}
        onClose={() => setConfirm(null)}
        onConfirm={() => suspend()}
        title={
          selected?.status === "suspended"
            ? "Restore this church?"
            : "Suspend this church?"
        }
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
