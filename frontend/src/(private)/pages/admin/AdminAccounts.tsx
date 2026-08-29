import { useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../../../components/modals/ConfirmDialog";
import { LoadMoreBar } from "../../../components/LoadMoreBar";
import { PageSkeleton } from "../../../components/Skeleton";
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
import { formatWhen, StatusChip } from "./adminUi";

export default function AdminAccounts() {
  const toast = useToast();
  const { query } = useSearch();
  const [rows, setRows] = useState<AdminAccount[]>([]);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [role, setRole] = useState("admin");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"delete" | "suspend" | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = async () => {
    const next = await adminListAccounts();
    setRows(next);
    return next;
  };

  useEffect(() => {
    void (async () => {
      try {
        const profile = await getSessionProfile();
        setSelfId(profile.user?.id ?? null);
        await load();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not load accounts.";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const isSelf = selected?.id === selfId;

  const open = (row: AdminAccount) => {
    setSelectedId(row.id);
    setName(row.name);
    setRole(row.role);
    setStatus(row.status);
    setConfirm(null);
  };

  const save = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await adminUpdateAccount(selected.id, { name, role, status });
      const next = await load();
      const fresh = next.find((row) => row.id === selected.id);
      if (fresh) open(fresh);
      toast.success("Account updated.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update account.";
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
      const next = await load();
      const fresh = next.find((row) => row.id === selected.id);
      if (fresh) open(fresh);
      toast.success(nextStatus === "disabled" ? "Account suspended." : "Account restored.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update account.";
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
      await load();
      setSelectedId(null);
      toast.success("Account deleted.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete account.";
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
          Accounts
        </h2>
        <p className="text-on-surface-variant">
          Edit, suspend, or delete an account. Action counts show how much that person has done.
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
                      <p className="text-xs text-on-surface-variant truncate">
                        {row.email} · {row.church_name}
                      </p>
                    </div>
                    <StatusChip status={row.status} />
                  </div>
                  <p className="text-xs text-on-surface-variant mt-2">
                    {row.role} · {row.action_count} actions · {row.device_count} devices
                    {row.last_seen_at ? ` · last seen ${formatWhen(row.last_seen_at)}` : ""}
                  </p>
                </button>
              </li>
            ))}
            {visible.length === 0 ? (
              <p className="text-sm text-on-surface-variant py-8 text-center">
                No accounts match this search.
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
              <p className="text-xs text-on-surface-variant">{selected.email}</p>
              <label className="block space-y-1.5">
                <span className="text-[11px] uppercase tracking-widest text-on-surface-variant">
                  Name
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-[11px] uppercase tracking-widest text-on-surface-variant">
                  Role
                </span>
                <select
                  value={role}
                  onChange={(event) => setRole(event.target.value)}
                  className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm"
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
                  className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="pending">Pending</option>
                  <option value="active">Active</option>
                  <option value="disabled">Suspended</option>
                </select>
              </label>
              <div className="flex flex-wrap gap-2 pt-2">
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
              {isSelf ? (
                <p className="text-xs text-on-surface-variant">
                  You cannot suspend or delete your own account.
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">
              Select an account to edit, suspend, or delete it.
            </p>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        onConfirm={() => void remove()}
        title="Delete this account?"
        description={`This removes ${selected?.name ?? "the account"} from MinistryCast.`}
        highlight={selected?.name}
        confirmLabel="Delete account"
      />
      <ConfirmDialog
        open={confirm === "suspend"}
        onClose={() => setConfirm(null)}
        onConfirm={() => void suspend()}
        title={selected?.status === "disabled" ? "Restore this account?" : "Suspend this account?"}
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
