import { useEffect, useMemo, useState, type ReactNode } from "react";
import Icon from "../../../components/Icon";
import LibraryTable, { LibraryTile, type LibraryColumn } from "../../../components/LibraryTable";
import { useSearchParams } from "react-router-dom";
import ConfirmDialog from "../../../components/modals/ConfirmDialog";
import { LoadMoreBar } from "../../../components/LoadMoreBar";
import { AdminRowsSkeleton } from "../../../components/admin/AdminSkeletons";
import { EditorPane, Field } from "../../../components/admin/EditorPane";
import {
  InitialsTile,
  PlatformHeader,
  StatusBadge,
  relativeTime,
} from "../../../components/admin/PlatformHeader";
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  Properties,
  RowMenu,
  ViewTabs,
} from "../../../components/ui";
import { PAGE_SIZE } from "../../../lib/types";
import {
  adminDeleteAccount,
  adminListAccounts,
  adminListDevices,
  adminUpdateAccount,
  type AdminAccount,
  type AdminDevice,
} from "../../../lib/admin";
import { getSessionProfile } from "../../../lib/auth";
import { useSearch } from "../../../lib/SearchContext";
import { useToast } from "../../../lib/ToastContext";
import { formatWhen } from "./adminUi";

function roleLabel(role: string) {
  if (role === "superadmin") return "Superadmin";
  if (role === "admin") return "Admin";
  if (role === "producer") return "Producer";
  if (role === "operator") return "Operator";
  return role;
}

type View = "accounts" | "devices";
type StatusFilter = "all" | "active" | "pending" | "disabled";

export default function AdminAccounts() {
  const toast = useToast();
  const { query } = useSearch();
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "devices" ? "devices" : "accounts";
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
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [devices, setDevices] = useState<AdminDevice[] | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);

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

  const loadDevices = async () => {
    setDevicesLoading(true);
    try {
      setDevices(await adminListDevices());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load devices.";
      setError(message);
      toast.error(message);
      setDevices((prev) => prev ?? []);
    } finally {
      setDevicesLoading(false);
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

  // Devices load the first time their view is opened.
  useEffect(() => {
    if (view === "devices" && devices === null && !devicesLoading) void loadDevices();
  }, [view]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, filter, view]);

  // Deep link from the overview: /admin/accounts?open=<id>
  const openId = params.get("open");
  useEffect(() => {
    if (!openId || !rows.length) return;
    const row = rows.find((r) => r.id === openId);
    if (row) open(row);
    const next = new URLSearchParams(params);
    next.delete("open");
    setParams(next, { replace: true });
  }, [openId, rows]);

  const setView = (next: View) => {
    const nextParams = new URLSearchParams(params);
    if (next === "devices") nextParams.set("view", "devices");
    else nextParams.delete("view");
    setParams(nextParams, { replace: true });
    if (next === "devices") {
      setPanelOpen(false);
      setConfirm(null);
    }
  };

  /** Devices view: jump to the device owner's account editor. */
  const openAccount = (userId: string) => {
    const nextParams = new URLSearchParams(params);
    nextParams.delete("view");
    nextParams.set("open", userId);
    setParams(nextParams, { replace: true });
  };

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => r.status === "active").length,
      pending: rows.filter((r) => r.status === "pending").length,
      disabled: rows.filter((r) => r.status === "disabled").length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (filter === "all" || row.status === filter) &&
        (!q ||
          [row.name, row.email, row.role, row.status, row.church_name].some((value) =>
            value.toLowerCase().includes(q),
          )),
    );
  }, [query, rows, filter]);
  const paged = visible.slice(0, visibleCount);

  const visibleDevices = useMemo(() => {
    const list = devices ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((row) =>
      [row.user_name, row.user_email, row.church_name, row.os_label, row.platform, row.app_version]
        .some((value) => (value ?? "").toLowerCase().includes(q)),
    );
  }, [devices, query]);
  const pagedDevices = visibleDevices.slice(0, visibleCount);

  const isSelf = selected?.id === selfId;

  /** Make a row the subject of the editor / confirm dialogs. */
  const pick = (row: AdminAccount) => {
    setSelected(row);
    setName(row.name);
    setRole(row.role);
    setStatus(row.status);
    setSavedFlash(false);
  };

  const open = (row: AdminAccount) => {
    pick(row);
    setConfirm(null);
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

  const refresh = () => {
    void load(true).catch(() => undefined);
    if (view === "devices") void loadDevices();
  };

  const showing =
    view === "devices"
      ? `Showing ${pagedDevices.length} of ${visibleDevices.length}${
          visibleDevices.length !== (devices?.length ?? 0)
            ? ` (filtered from ${devices?.length ?? 0})`
            : ""
        }`
      : `Showing ${paged.length} of ${visible.length}${
          visible.length !== rows.length ? ` (filtered from ${rows.length})` : ""
        }`;
  const listLoading = view === "devices" ? devices === null || (devicesLoading && !devices.length) : loading;

  return (
    <section className="h-full overflow-hidden flex flex-col">
      <PlatformHeader
        title="Accounts"
        meta={loading ? undefined : `${rows.length} ${rows.length === 1 ? "account" : "accounts"}`}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon="refresh"
            disabled={refreshing || loading || devicesLoading}
            onClick={refresh}
          >
            {refreshing || devicesLoading ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="shrink-0 flex items-center gap-3 h-12 px-6 border-b border-white/5">
        <ViewTabs
          label="Accounts view"
          value={view}
          onChange={setView}
          tabs={[
            { id: "accounts", label: "Accounts", count: loading ? undefined : rows.length },
            { id: "devices", label: "Devices", count: devices?.length },
          ]}
        />
        {view === "accounts" ? (
          <div className="flex items-center gap-1.5" role="group" aria-label="Filter by status">
            <span aria-hidden className="w-px h-4 bg-white/10 mx-1.5" />
            {(
              [
                ["all", "All"],
                ["active", "Active"],
                ["pending", "Pending"],
                ["disabled", "Suspended"],
              ] as const
            ).map(([id, label]) => (
              <Chip key={id} active={filter === id} onClick={() => setFilter(id)}>
                {label}
                <span className="tabular-nums text-outline">{counts[id]}</span>
              </Chip>
            ))}
          </div>
        ) : null}
        {!listLoading ? (
          <span className="ml-auto text-[12px] text-on-surface-variant tabular-nums whitespace-nowrap">
            {showing}
          </span>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="shrink-0 flex items-center justify-between gap-3 px-6 py-2.5 border-b border-white/5 text-[13px] text-error"
        >
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col px-4 sm:px-6 pt-4 pb-6">
          {view === "devices" ? (
            listLoading ? (
              <AdminRowsSkeleton rows={6} />
            ) : !visibleDevices.length ? (
              <EmptyState
                icon="devices"
                title={query.trim() ? "No devices match this search." : "No device installs recorded yet."}
                body={
                  query.trim()
                    ? undefined
                    : "They appear when someone opens the app while signed in."
                }
              />
            ) : (
              <DevicesTable
                rows={pagedDevices}
                onOpenAccount={openAccount}
                footer={
                  pagedDevices.length < visibleDevices.length ? (
                    <div className="px-6 pb-6">
                      <LoadMoreBar
                        shown={pagedDevices.length}
                        total={visibleDevices.length}
                        hasMore
                        onMore={() => setVisibleCount((n) => n + PAGE_SIZE)}
                      />
                    </div>
                  ) : null
                }
              />
            )
          ) : loading ? (
            <AdminRowsSkeleton rows={8} />
          ) : !visible.length ? (
            <EmptyState
              icon="group"
              title={
                query.trim()
                  ? "No accounts match this search."
                  : filter !== "all"
                    ? "No accounts with this status."
                    : "No accounts yet."
              }
            />
          ) : (
            <LibraryTable
              ariaLabel="Accounts"
              className="[&>table]:min-w-0"
              columns={[
                { key: "account", header: "Account" },
                ...(panelOpen
                  ? []
                  : ([{ key: "church", header: "Church", hideBelow: "md", className: "w-[200px]" }] as LibraryColumn[])),
                { key: "role", header: "Role", className: "w-28" },
                ...(panelOpen
                  ? []
                  : ([
                      { key: "seen", header: "Last seen", align: "right", hideBelow: "lg", className: "w-32" },
                    ] as LibraryColumn[])),
                { key: "status", header: "Status", align: "right", className: "w-32" },
              ]}
              groups={[
                {
                  id: "accounts",
                  rows: paged.map((row) => {
                    const self = row.id === selfId;
                    return {
                      id: row.id,
                      label: row.name,
                      selected: panelOpen && selected?.id === row.id,
                      onOpen: () => open(row),
                      leading: <InitialsTile name={row.name} />,
                      cells: {
                        account: (
                          <>
                            <span className="flex items-center gap-2 min-w-0">
                              <span className="truncate">{row.name}</span>
                              {self ? <Badge tone="accent">You</Badge> : null}
                            </span>
                            <span className="block truncate text-[12px] font-normal text-on-surface-variant">
                              {row.email}
                              {panelOpen && row.church_name ? ` · ${row.church_name}` : ""}
                            </span>
                          </>
                        ),
                        church: <span className="block truncate">{row.church_name || "—"}</span>,
                        role: <span className="text-on-surface">{roleLabel(row.role)}</span>,
                        seen: (
                          <span
                            className="whitespace-nowrap"
                            title={row.last_seen_at ? formatWhen(row.last_seen_at) : undefined}
                          >
                            {row.last_seen_at ? relativeTime(row.last_seen_at) : "Never"}
                          </span>
                        ),
                        status: <StatusBadge status={row.status} />,
                      },
                      actions: (
                        <RowMenu
                          label={`Actions for ${row.name}`}
                          items={[
                            { label: "Edit", icon: "edit", onSelect: () => open(row) },
                            {
                              label: row.status === "disabled" ? "Restore" : "Suspend",
                              icon: row.status === "disabled" ? "undo" : "block",
                              disabled: self,
                              onSelect: () => {
                                pick(row);
                                setConfirm("suspend");
                              },
                            },
                            {
                              label: "Delete",
                              icon: "delete",
                              danger: true,
                              disabled: self,
                              onSelect: () => {
                                pick(row);
                                setConfirm("delete");
                              },
                            },
                          ]}
                        />
                      ),
                    };
                  }),
                },
              ]}
              footer={
                paged.length < visible.length ? (
                  <div className="px-6 pb-6">
                    <LoadMoreBar
                      shown={paged.length}
                      total={visible.length}
                      hasMore
                      onMore={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    />
                  </div>
                ) : null
              }
            />
          )}
        </div>

        <EditorPane
          open={panelOpen && view === "accounts"}
          onClose={closePanel}
          title={selected?.name}
          subtitle={selected ? `${selected.email} · ${selected.church_name || "No church"}` : null}
          leading={selected ? <InitialsTile name={selected.name} /> : null}
          footer={
            selected ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {busy ? "Saving…" : "Save"}
                </Button>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy || isSelf}
                    onClick={() => setConfirm("suspend")}
                  >
                    {selected.status === "disabled" ? "Restore" : "Suspend"}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy || isSelf}
                    onClick={() => setConfirm("delete")}
                  >
                    Delete
                  </Button>
                </div>
              </>
            ) : null
          }
        >
          {selected ? (
            <>
              {savedFlash ? (
                <p className="text-[13px] text-primary">Changes saved.</p>
              ) : null}

              <Properties
                items={[
                  { label: "Current", value: <StatusBadge status={selected.status} /> },
                  { label: "Actions", value: <span className="tabular-nums">{selected.action_count}</span> },
                  { label: "Devices", value: <span className="tabular-nums">{selected.device_count}</span> },
                  {
                    label: "Last seen",
                    value: selected.last_seen_at ? formatWhen(selected.last_seen_at) : "never",
                  },
                ]}
              />

              <div className="border-t border-white/5 pt-5 space-y-4">
                <Field label="Name">
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="ui-input"
                  />
                </Field>
                <Field label="Email">
                  <input
                    value={selected.email}
                    disabled
                    className="ui-input opacity-60 cursor-not-allowed"
                  />
                </Field>
                <Field label="Role">
                  <select
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    className="ui-input"
                  >
                    <option value="superadmin">Superadmin</option>
                    <option value="admin">Admin</option>
                    <option value="producer">Producer</option>
                    <option value="operator">Operator</option>
                  </select>
                </Field>
                <Field label="Status">
                  <select
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                    className="ui-input"
                  >
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="disabled">Suspended</option>
                  </select>
                </Field>
              </div>

              {isSelf ? (
                <p className="text-[12px] text-on-surface-variant">
                  You cannot suspend or delete your own account.
                </p>
              ) : null}
            </>
          ) : null}
        </EditorPane>
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

function DevicesTable({
  rows,
  onOpenAccount,
  footer,
}: {
  rows: AdminDevice[];
  onOpenAccount: (userId: string) => void;
  footer?: ReactNode;
}) {
  return (
    <LibraryTable
      ariaLabel="Devices"
      className="[&>table]:min-w-0"
      columns={[
        { key: "account", header: "Account" },
        { key: "church", header: "Church", hideBelow: "md", className: "w-[200px]" },
        { key: "device", header: "Device", className: "w-[180px]" },
        { key: "version", header: "Version", hideBelow: "sm", className: "w-24" },
        { key: "seen", header: "Last seen", align: "right", className: "w-32" },
      ]}
      groups={[
        {
          id: "devices",
          rows: rows.map((row) => {
            const name = row.user_name || "Unknown";
            const userId = row.user_id;
            return {
              id: row.id,
              label: `${name}, ${row.os_label || row.platform}`,
              onOpen: () => {
                if (userId) onOpenAccount(userId);
              },
              leading: (
                <LibraryTile>
                  <Icon
                    name={/app$/.test(row.os_label ?? "") ? "desktop_windows" : "devices"}
                    className="text-[18px]"
                  />
                </LibraryTile>
              ),
              cells: {
                account: (
                  <>
                    <span className="block truncate">{name}</span>
                    <span className="block truncate text-[12px] font-normal text-on-surface-variant">
                      {row.user_email}
                    </span>
                  </>
                ),
                church: <span className="block truncate">{row.church_name || "—"}</span>,
                device: <span className="block truncate text-on-surface">{row.os_label || row.platform}</span>,
                version: <span className="tabular-nums">{row.app_version || "—"}</span>,
                seen: (
                  <span className="whitespace-nowrap" title={formatWhen(row.last_seen_at)}>
                    {relativeTime(row.last_seen_at)}
                  </span>
                ),
              },
              actions: userId ? (
                <RowMenu
                  label={`Actions for ${name}'s device`}
                  items={[
                    { label: "Open account", icon: "person", onSelect: () => onOpenAccount(userId) },
                  ]}
                />
              ) : undefined,
            };
          }),
        },
      ]}
      footer={footer}
    />
  );
}
