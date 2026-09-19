import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../../../components/modals/ConfirmDialog";
import { LoadMoreBar } from "../../../components/LoadMoreBar";
import { Skeleton, TableSkeleton } from "../../../components/Skeleton";
import { PAGE_SIZE } from "../../../lib/types";
import {
  adminDeleteAccount,
  adminListAccounts,
  adminUpdateAccount,
  type AdminAccount,
} from "../../../lib/admin";
import { getSessionProfile } from "../../../lib/auth";
import { useSearch } from "../../../lib/SearchContext";
import { useToast } from "../../../lib/ToastContext";
import { formatWhen, StatusChip, AdminBackLink } from "./adminUi";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function roleLabel(role: string) {
  if (role === "superadmin") return "Superadmin";
  if (role === "admin") return "Admin";
  if (role === "producer") return "Producer";
  if (role === "operator") return "Operator";
  return role;
}

export default function AdminAccounts() {
  const toast = useToast();
  const { query } = useSearch();
  const [rows, setRows] = useState<AdminAccount[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminAccount | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("admin");
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
      const next = await adminListAccounts();
      setRows(next);
      return next;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not load accounts.";
      setError(message);
      if (!rows.length) toast.error(message);
      throw err;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const profile = await getSessionProfile();
        setSelfId(profile.user?.id ?? null);
        await load(false);
      } catch {
        /* toast handled in load */
      }
    })();
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.name, row.email, row.role, row.status, row.church_name].some((value) =>
        value.toLowerCase().includes(q),
      ),
    );
  }, [query, rows]);
  const paged = visible.slice(0, visibleCount);

  const isSelf = selected?.id === selfId;

  const open = (row: AdminAccount) => {
    setSelected(row);
    setName(row.name);
    setRole(row.role);
    setStatus(row.status);
    setConfirm(null);
    setSavedFlash(false);
    setPanelOpen(true);
  };

  const closePanel = () => {
    if (busy) return;
    setPanelOpen(false);
    setConfirm(null);
    window.setTimeout(() => {
      setSelected(null);
    }, 320);
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    setSavedFlash(false);
    try {
      await adminUpdateAccount(selected.id, { name, role, status });
      const next = await load(true);
      const fresh = next?.find((row) => row.id === selected.id) ?? null;
      setSelected(fresh);
      if (fresh) {
        setName(fresh.name);
        setRole(fresh.role);
        setStatus(fresh.status);
      }
      setSavedFlash(true);
      toast.success("Account updated.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not update account.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const suspend = async () => {
    if (!selected || isSelf) return;
    setBusy(true);
    try {
      const nextStatus = selected.status === "disabled" ? "active" : "disabled";
      await adminUpdateAccount(selected.id, { status: nextStatus });
      const next = await load(true);
      const fresh = next?.find((row) => row.id === selected.id) ?? null;
      setSelected(fresh);
      if (fresh) {
        setName(fresh.name);
        setRole(fresh.role);
        setStatus(fresh.status);
      }
      toast.success(
        nextStatus === "disabled" ? "Account suspended." : "Account restored.",
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not update account.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const remove = async () => {
    if (!selected || isSelf) return;
    setBusy(true);
    try {
      await adminDeleteAccount(selected.id);
      await load(true);
      setPanelOpen(false);
      setSelected(null);
      toast.success("Account deleted.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not delete account.";
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
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
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
            Accounts
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
                ? "No accounts match this search."
                : "No accounts yet."}
            </p>
          ) : (
            <div className="rounded-xl border border-white/5 overflow-hidden flex-1 min-h-0 flex flex-col bg-surface-container-low/40">
              <div className="overflow-auto custom-scrollbar flex-1 min-h-0">
                <table className="w-full text-left text-sm min-w-[640px]">
                  <thead className="sticky top-0 bg-surface-container-lowest/95 backdrop-blur text-[11px] uppercase tracking-wider text-on-surface-variant z-[1]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Account</th>
                      {!panelOpen ? (
                        <th className="px-4 py-3 font-medium hidden md:table-cell">
                          Church
                        </th>
                      ) : null}
                      <th className="px-4 py-3 font-medium">Role</th>
                      {!panelOpen ? (
                        <th className="px-4 py-3 font-medium hidden lg:table-cell">
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
                            active
                              ? "bg-primary/10"
                              : "hover:bg-white/[0.03]"
                          }`}
                          onClick={() => open(row)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-9 h-9 rounded-full bg-surface-container-highest shrink-0 flex items-center justify-center text-xs font-semibold">
                                {initials(row.name || "?")}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-on-surface truncate">
                                  {row.name}
                                  {row.id === selfId ? (
                                    <span className="ml-1.5 text-[10px] font-medium text-primary">
                                      You
                                    </span>
                                  ) : null}
                                </p>
                                <p className="text-xs text-on-surface-variant truncate">
                                  {row.email}
                                  {panelOpen && row.church_name
                                    ? ` · ${row.church_name}`
                                    : ""}
                                </p>
                              </div>
                            </div>
                          </td>
                          {!panelOpen ? (
                            <td className="px-4 py-3 text-on-surface-variant max-w-[180px] truncate hidden md:table-cell">
                              {row.church_name || "—"}
                            </td>
                          ) : null}
                          <td className="px-4 py-3">{roleLabel(row.role)}</td>
                          {!panelOpen ? (
                            <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap hidden lg:table-cell">
                              <span>
                                {row.action_count} actions · {row.device_count}{" "}
                                devices
                              </span>
                              {row.last_seen_at ? (
                                <span className="block text-[11px] opacity-80">
                                  Last seen {formatWhen(row.last_seen_at)}
                                </span>
                              ) : null}
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
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-surface-container-highest shrink-0 flex items-center justify-center text-base font-semibold">
                      {initials(selected.name || "?")}
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-on-surface truncate">
                        {selected.name}
                      </h2>
                      <p className="text-xs text-on-surface-variant truncate">
                        {selected.email}
                      </p>
                      <p className="text-xs text-on-surface-variant truncate mt-0.5">
                        {selected.church_name || "No church"}
                      </p>
                    </div>
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

                  <div className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2.5 text-xs text-on-surface-variant space-y-1">
                    <p>
                      {selected.action_count} actions · {selected.device_count}{" "}
                      devices
                    </p>
                    <p>
                      Last seen{" "}
                      {selected.last_seen_at
                        ? formatWhen(selected.last_seen_at)
                        : "never"}
                    </p>
                  </div>

                  <label className="block space-y-1.5">
                    <span className="text-[11px] uppercase tracking-widest text-on-surface-variant">
                      Name
                    </span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[11px] uppercase tracking-widest text-on-surface-variant">
                      Email
                    </span>
                    <input
                      value={selected.email}
                      disabled
                      className="w-full bg-surface/50 border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface-variant opacity-80 cursor-not-allowed"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[11px] uppercase tracking-widest text-on-surface-variant">
                      Role
                    </span>
                    <select
                      value={role}
                      onChange={(event) => setRole(event.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    >
                      <option value="superadmin">Superadmin</option>
                      <option value="admin">Admin</option>
                      <option value="producer">Producer</option>
                      <option value="operator">Operator</option>
                    </select>
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-[11px] uppercase tracking-widest text-on-surface-variant">
                      Status
                    </span>
                    <select
                      value={status}
                      onChange={(event) => setStatus(event.target.value)}
                      className="w-full bg-surface border border-outline-variant rounded-lg px-4 py-2.5 text-on-surface focus:ring-2 focus:ring-primary focus:outline-none"
                    >
                      <option value="pending">Pending</option>
                      <option value="active">Active</option>
                      <option value="disabled">Suspended</option>
                    </select>
                  </label>

                  {isSelf ? (
                    <p className="text-xs text-on-surface-variant">
                      You cannot suspend or delete your own account.
                    </p>
                  ) : null}
                </div>

                <div className="p-5 border-t border-white/5 flex flex-wrap gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save()}
                    className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold disabled:opacity-50"
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || isSelf}
                    onClick={() => setConfirm("suspend")}
                    className="px-4 py-2 rounded-lg border border-white/10 text-sm disabled:opacity-50"
                  >
                    {selected.status === "disabled" ? "Restore" : "Suspend"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || isSelf}
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
        title="Delete this account?"
        description={`This removes ${selected?.name ?? "the account"} from MinistryCast.`}
        highlight={selected?.name}
        confirmLabel="Delete account"
      />
      <ConfirmDialog
        open={confirm === "suspend"}
        onClose={() => setConfirm(null)}
        onConfirm={() => suspend()}
        title={
          selected?.status === "disabled"
            ? "Restore this account?"
            : "Suspend this account?"
        }
        description={
          selected?.status === "disabled"
            ? `${selected?.name ?? "This account"} will be able to sign in again.`
            : `${selected?.name ?? "This account"} will be locked out until you restore it.`
        }
        highlight={selected?.name}
        confirmLabel={selected?.status === "disabled" ? "Restore" : "Suspend"}
      />
    </section>
  );
}
