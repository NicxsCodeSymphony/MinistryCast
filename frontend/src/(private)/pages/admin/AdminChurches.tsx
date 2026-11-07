import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ConfirmDialog from "../../../components/modals/ConfirmDialog";
import { LoadMoreBar } from "../../../components/LoadMoreBar";
import { AdminRowsSkeleton } from "../../../components/admin/AdminSkeletons";
import { EditorPane, Field } from "../../../components/admin/EditorPane";
import LibraryTable, { type LibraryColumn } from "../../../components/LibraryTable";
import {
  InitialsTile,
  PlatformHeader,
  StatusBadge,
  relativeTime,
} from "../../../components/admin/PlatformHeader";
import {
  Button,
  EmptyState,
  Properties,
  RowMenu,
  ViewTabs,
} from "../../../components/ui";
import { PAGE_SIZE } from "../../../lib/types";
import {
  adminDeleteChurch,
  adminListChurches,
  adminUpdateChurch,
  type AdminChurch,
} from "../../../lib/admin";
import { useSearch } from "../../../lib/SearchContext";
import { uploadChurchPhoto } from "../../../lib/auth";
import Icon from "../../../components/Icon";
import { useToast } from "../../../lib/ToastContext";
import { formatWhen } from "./adminUi";

const PLATFORM = "00000000-0000-0000-0000-000000000001";

type StatusFilter = "all" | "active" | "pending" | "suspended";

export default function AdminChurches() {
  const toast = useToast();
  const { query } = useSearch();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<AdminChurch[]>([]);
  const [selected, setSelected] = useState<AdminChurch | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("active");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"delete" | "suspend" | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [savedFlash, setSavedFlash] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>("all");

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
  }, [query, filter]);

  // Deep link from the overview: /admin/churches?open=<id>
  const openId = params.get("open");
  useEffect(() => {
    if (!openId || !rows.length) return;
    const row = rows.find((r) => r.id === openId);
    if (row) open(row);
    const next = new URLSearchParams(params);
    next.delete("open");
    setParams(next, { replace: true });
  }, [openId, rows]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => r.status === "active").length,
      pending: rows.filter((r) => r.status === "pending").length,
      suspended: rows.filter((r) => r.status === "suspended").length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (row) =>
        (filter === "all" || row.status === filter) &&
        (!q ||
          [row.name, row.email, row.status].some((value) =>
            value.toLowerCase().includes(q),
          )),
    );
  }, [query, rows, filter]);
  const paged = visible.slice(0, visibleCount);

  const locked = selected?.id === PLATFORM;

  const syncForm = (row: AdminChurch) => {
    setName(row.name);
    setEmail(row.email);
    setStatus(row.status);
    setAddress(row.address ?? "");
    setPhone(row.phone ?? "");
  };

  /** Re-read the list and refresh the selected church from it. */
  const reloadSelected = async (id: string) => {
    const next = await load(true);
    const fresh = next?.find((row) => row.id === id) ?? null;
    setSelected(fresh);
    return fresh;
  };

  /** Upload a new logo (or clear it with `null`) and save it immediately. */
  const changePhoto = async (file: File | null) => {
    if (!selected || locked) return;
    setPhotoBusy(true);
    setError("");
    try {
      const url = file
        ? await uploadChurchPhoto(file, selected.id, selected.photo_url)
        : "";
      await adminUpdateChurch(selected.id, { photo_url: url });
      await reloadSelected(selected.id);
      toast.success(file ? "Logo updated." : "Logo removed.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update logo.";
      setError(message);
      toast.error(message);
    } finally {
      setPhotoBusy(false);
    }
  };

  /** Make a row the subject of the editor / confirm dialogs. */
  const pick = (row: AdminChurch) => {
    setSelected(row);
    syncForm(row);
    setSavedFlash(false);
  };

  const open = (row: AdminChurch) => {
    pick(row);
    setConfirm(null);
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
      if (!name.trim()) throw new Error("Church name is required.");
      await adminUpdateChurch(selected.id, { name, email, status, address, phone });
      const next = await load(true);
      const fresh = next?.find((row) => row.id === selected.id) ?? null;
      setSelected(fresh);
      if (fresh) syncForm(fresh);
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
      if (fresh) syncForm(fresh);
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

  const showing = `Showing ${paged.length} of ${visible.length}${
    visible.length !== rows.length ? ` (filtered from ${rows.length})` : ""
  }`;

  return (
    <section className="h-full overflow-hidden flex flex-col">
      <PlatformHeader
        title="Churches"
        meta={loading ? undefined : `${rows.length} ${rows.length === 1 ? "church" : "churches"}`}
        approvals={counts.pending}
        actions={
          <Button
            variant="ghost"
            size="sm"
            icon="refresh"
            disabled={refreshing || loading}
            onClick={() => void load(true).catch(() => undefined)}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        }
      />

      <div className="shrink-0 flex items-center gap-3 h-12 px-6 border-b border-white/5">
        <ViewTabs
          label="Filter churches by status"
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: "all", label: "All", count: counts.all },
            { id: "active", label: "Active", count: counts.active },
            { id: "pending", label: "Pending", count: counts.pending },
            { id: "suspended", label: "Suspended", count: counts.suspended },
          ]}
        />
        {!loading ? (
          <span className="ml-auto text-[12px] text-on-surface-variant tabular-nums">{showing}</span>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="shrink-0 flex items-center justify-between gap-3 px-6 py-2.5 border-b border-white/5 text-[13px] text-error"
        >
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void load(true).catch(() => undefined)}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col px-4 sm:px-6 pt-4 pb-6">
          {loading ? (
            <AdminRowsSkeleton rows={8} />
          ) : !visible.length ? (
            <EmptyState
              icon="church"
              title={
                query.trim()
                  ? "No churches match this search."
                  : filter !== "all"
                    ? "No churches with this status."
                    : "No churches yet."
              }
            />
          ) : (
            <LibraryTable
              ariaLabel="Churches"
              className="[&>table]:min-w-0"
              columns={[
                { key: "church", header: "Church" },
                ...(panelOpen
                  ? []
                  : ([
                      { key: "accounts", header: "Accounts", align: "right", hideBelow: "md", className: "w-24" },
                      { key: "devices", header: "Devices", align: "right", hideBelow: "md", className: "w-24" },
                      { key: "actions", header: "Actions", align: "right", hideBelow: "lg", className: "w-24" },
                      { key: "created", header: "Created", align: "right", hideBelow: "lg", className: "w-32" },
                    ] as LibraryColumn[])),
                { key: "status", header: "Status", align: "right", className: "w-32" },
              ]}
              groups={[
                {
                  id: "churches",
                  rows: paged.map((row) => {
                    const rowLocked = row.id === PLATFORM;
                    return {
                      id: row.id,
                      label: row.name,
                      selected: panelOpen && selected?.id === row.id,
                      onOpen: () => open(row),
                      leading: <InitialsTile name={row.name} photoUrl={row.photo_url} />,
                      cells: {
                        church: (
                          <>
                            <span className="block truncate">{row.name}</span>
                            <span className="block truncate text-[12px] font-normal text-on-surface-variant">
                              {row.email}
                              {panelOpen ? ` · ${row.account_count} accounts` : ""}
                            </span>
                          </>
                        ),
                        accounts: <span className="tabular-nums">{row.account_count}</span>,
                        devices: <span className="tabular-nums">{row.device_count}</span>,
                        actions: <span className="tabular-nums">{row.action_count}</span>,
                        created: (
                          <span className="whitespace-nowrap" title={formatWhen(row.created_at)}>
                            {relativeTime(row.created_at)}
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
                              label: row.status === "suspended" ? "Restore" : "Suspend",
                              icon: row.status === "suspended" ? "undo" : "block",
                              disabled: rowLocked,
                              onSelect: () => {
                                pick(row);
                                setConfirm("suspend");
                              },
                            },
                            {
                              label: "Delete",
                              icon: "delete",
                              danger: true,
                              disabled: rowLocked,
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
          open={panelOpen}
          onClose={closePanel}
          title={selected?.name}
          subtitle={selected ? <StatusBadge status={selected.status} /> : null}
          leading={selected ? <InitialsTile name={selected.name} photoUrl={selected.photo_url} /> : null}
          footer={
            selected ? (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy || photoBusy || locked}
                  onClick={() => void save()}
                >
                  {busy ? "Saving…" : "Save"}
                </Button>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy || locked}
                    onClick={() => setConfirm("suspend")}
                  >
                    {selected.status === "suspended" ? "Restore" : "Suspend"}
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busy || locked}
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
                  { label: "Accounts", value: <span className="tabular-nums">{selected.account_count}</span> },
                  { label: "Devices", value: <span className="tabular-nums">{selected.device_count}</span> },
                  { label: "Actions", value: <span className="tabular-nums">{selected.action_count}</span> },
                  { label: "Created", value: formatWhen(selected.created_at) },
                  {
                    label: "Onboarded",
                    value: selected.onboarded_at ? formatWhen(selected.onboarded_at) : "Not yet",
                  },
                ]}
              />

              <div className="border-t border-white/5 pt-5 space-y-4">
                <div className="space-y-1.5">
                  <span className="block text-[12px] font-medium text-on-surface-variant">Logo</span>
                  <div className="flex items-center gap-3">
                    <span className="w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-surface-container-highest border border-white/10 flex items-center justify-center">
                      {selected.photo_url ? (
                        <img src={selected.photo_url} alt={`${selected.name} logo`} className="w-full h-full object-cover" />
                      ) : (
                        <Icon name="church" className="text-[22px] text-on-surface-variant" />
                      )}
                    </span>
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(event) => {
                        void changePhoto(event.target.files?.[0] ?? null);
                        event.target.value = "";
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={locked || photoBusy || busy}
                        onClick={() => photoInputRef.current?.click()}
                      >
                        {photoBusy ? "Uploading…" : selected.photo_url ? "Replace" : "Upload"}
                      </Button>
                      {selected.photo_url ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={locked || photoBusy || busy}
                          onClick={() => void changePhoto(null)}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[12px] text-on-surface-variant">
                    Shown on the church sidebar and projector logo. JPG, PNG, WebP or GIF, up to 5 MB.
                  </p>
                </div>
                <Field label="Name">
                  <input
                    value={name}
                    disabled={locked}
                    onChange={(event) => setName(event.target.value)}
                    className="ui-input disabled:opacity-50"
                  />
                </Field>
                <Field label="Email">
                  <input
                    value={email}
                    disabled={locked}
                    onChange={(event) => setEmail(event.target.value)}
                    className="ui-input disabled:opacity-50"
                  />
                </Field>
                <Field label="Address">
                  <input
                    value={address}
                    disabled={locked}
                    onChange={(event) => setAddress(event.target.value)}
                    className="ui-input disabled:opacity-50"
                  />
                </Field>
                <Field label="Phone">
                  <input
                    value={phone}
                    type="tel"
                    disabled={locked}
                    onChange={(event) => setPhone(event.target.value)}
                    className="ui-input disabled:opacity-50"
                  />
                </Field>
                <Field label="Status">
                  <select
                    value={status}
                    disabled={locked}
                    onChange={(event) => setStatus(event.target.value)}
                    className="ui-input disabled:opacity-50"
                  >
                    <option value="pending">Pending</option>
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="offline">Offline</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </Field>
              </div>

              {locked ? (
                <p className="text-[12px] text-on-surface-variant">
                  The platform church is protected.
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
