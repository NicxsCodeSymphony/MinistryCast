import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AddServiceItemModal from "../../components/modals/AddServiceItemModal";
import ConfirmDialog from "../../components/modals/ConfirmDialog";
import SetlistFormModal, {
  type SetlistFormValues,
} from "../../components/modals/SetlistFormModal";
import type { ServiceItem, ServiceItemKind } from "../../components/modals/serviceItem";
import { Skeleton } from "../../components/Skeleton";
import {
  addSetlistItem,
  createSetlist,
  deleteSetlist,
  deleteSetlistItem,
  getSetlist,
  itemMeta,
  listChurchNames,
  listSetlists,
  listSongs,
  reorderSetlistItems,
  setSetlistArchived,
  updateSetlist,
  type ChurchName,
} from "../../lib/api";
import { getSessionProfile, isSuperadmin, canManageSetlists } from "../../lib/auth";
import { formatDuration, localDateInput, moveItem, parseDurationSeconds, requireChurchId } from "../../lib/helpers";
import { useHoldReorder } from "../../lib/holdDrag";
import { useSearch } from "../../lib/SearchContext";
import { usePrefs } from "../../lib/PrefsContext";
import { useToast } from "../../lib/ToastContext";
import { LoadMoreBar } from "../../components/LoadMoreBar";
import { reloadChurchCatalog } from "../../lib/offline/sync";
import { PAGE_SIZE, type Setlist, type SetlistItem, type Song } from "../../lib/types";
import {
  readSetlistViewChurchId,
  writeSetlistViewChurchId,
} from "../../lib/viewChurch";
import {
  readPreferredSetlistId,
  writePreferredSetlistId,
} from "../../lib/preferredSetlist";
import Icon from "../../components/Icon";
import SetlistBackgroundControl from "../../components/SetlistBackgroundControl";
import {
  Button,
  EmptyState,
  IconButton,
  PageHeader,
  RowMenu,
  ViewTabs,
  type MenuItem,
} from "../../components/ui";
import DateBlock from "../../components/setlists/DateBlock";
import LibraryTable from "../../components/LibraryTable";
import RunOfShow from "../../components/setlists/RunOfShow";
import {
  SetlistDetailSkeleton,
  SetlistIndexSkeleton,
  SetlistRowsSkeleton,
  RunOfShowSkeleton,
} from "../../components/setlists/Skeletons";
import AddToSetlistPanel from "../../components/setlists/AddToSetlistPanel";
import { SetlistInsights } from "../../components/library/LibraryInsights";
import {
  groupSetlists,
  itemsDuration,
  serviceDate,
  serviceTime,
} from "../../components/setlists/grouping";

type RowStats = { count: number; seconds: number };

function statsOf(setlist: Setlist): RowStats {
  return { count: setlist.items?.length ?? 0, seconds: itemsDuration(setlist.items) };
}

export default function Setlists() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { query } = useSearch();
  const toast = useToast();
  const { t } = usePrefs();
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [active, setActive] = useState<Setlist | null>(null);
  const [quickSongs, setQuickSongs] = useState<Song[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  /** Setlist being edited (from the index row menu or the open setlist). */
  const [formTarget, setFormTarget] = useState<Setlist | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemStep, setAddItemStep] = useState<ServiceItemKind | undefined>();
  /** Setlist pending deletion; non-null opens the confirm dialog. */
  const [deleteTarget, setDeleteTarget] = useState<Setlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [superadmin, setSuperadmin] = useState(false);
  const [churches, setChurches] = useState<ChurchName[]>([]);
  const [viewChurchId, setViewChurchId] = useState(readSetlistViewChurchId);
  const [showArchive, setShowArchive] = useState(false);
  const showArchiveRef = useRef(false);
  showArchiveRef.current = showArchive;
  const [canManage, setCanManage] = useState(false);
  const [preferredId, setPreferredId] = useState(readPreferredSetlistId);
  const [rowStats, setRowStats] = useState<Record<string, RowStats>>({});

  const openSetlist = async (id: string, replace = false) => {
    const next = await getSetlist(id);
    setActive(next);
    setSearchParams({ setlist: id }, { replace });
  };

  const markPreferredForPresentation = (id: string) => {
    writePreferredSetlistId(id);
    setPreferredId(id);
    toast.success(t("setlists.preferredSet"));
  };

  const reportError = (err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message : fallback;
    setError(message);
    toast.error(message);
  };

  const loadList = async (
    preferId?: string,
    viewId = viewChurchId,
    asAdmin = superadmin,
    nextOffset = 0,
    append = false,
    archived = showArchiveRef.current,
    options?: { autoOpen?: boolean },
  ) => {
    if (append) setLoadingMore(true);
    const autoOpen = options?.autoOpen !== false;
    try {
      const page = await listSetlists({
        limit: PAGE_SIZE,
        offset: nextOffset,
        viewChurchId: asAdmin ? viewId : null,
        archived,
      });
      setTotal(page.total);
      setSetlists((prev) => (append ? [...prev, ...page.items] : page.items));
      if (!autoOpen) {
        setActive(null);
        return;
      }
      const fromUrl = searchParams.get("setlist");
      const preferred = readPreferredSetlistId();
      // A URL setlist may live in the other tab (e.g. archived), so open it even if it isn't listed.
      const id =
        preferId ||
        fromUrl ||
        (preferred && page.items.some((row) => row.id === preferred)
          ? preferred
          : null);
      if (id) {
        try {
          await openSetlist(id, true);
        } catch {
          // Deleted / missing setlist should not blank the whole page.
          setActive(null);
          if (fromUrl === id) setSearchParams({}, { replace: true });
          if (preferred === id) {
            writePreferredSetlistId("");
            setPreferredId("");
          }
        }
      } else if (!fromUrl) setActive(null);
    } finally {
      setLoadingMore(false);
    }
  };

  /** Refresh the index in place (no auto-open of a setlist). */
  const reloadIndex = (archived = showArchiveRef.current) =>
    loadList(undefined, viewChurchId, superadmin, 0, false, archived, {
      autoOpen: false,
    });

  const backToIndex = () => {
    setActive(null);
    setSearchParams({}, { replace: true });
  };

  const switchSetlistTab = (archived: boolean) => {
    if (archived === showArchive) return;
    setShowArchive(archived);
    showArchiveRef.current = archived;
    setActive(null);
    setSearchParams({}, { replace: true });
    setLoading(true);
    void loadList(undefined, viewChurchId, superadmin, 0, false, archived, {
      autoOpen: false,
    })
      .catch((err) => reportError(err, t("setlists.loadError")))
      .finally(() => setLoading(false));
  };

  const switchViewChurch = async (next: string) => {
    writeSetlistViewChurchId(next);
    setViewChurchId(next);
    setLoading(true);
    try {
      // Paint whatever is already in IndexedDB for this church, then refresh.
      await loadList(undefined, next, true, 0, false);
      if (next) {
        void reloadChurchCatalog(next, { force: true })
          .then(() => loadList(undefined, next, true, 0, false))
          .catch(() => undefined);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const profile = await getSessionProfile();
        const admin = isSuperadmin(profile);
        setSuperadmin(admin);
        setCanManage(canManageSetlists(profile));
        let nextView = "";
        if (admin) {
          const names = await listChurchNames();
          setChurches(names);
          const stored = readSetlistViewChurchId();
          nextView =
            stored && names.some((row) => row.id === stored)
              ? stored
              : names[0]?.id ?? "";
          if (nextView !== stored) writeSetlistViewChurchId(nextView);
          setViewChurchId(nextView);
        }
        // Local-first: read IndexedDB immediately (no waiting on Supabase pull).
        await loadList(undefined, nextView, admin);
        setLoading(false);
        const songs = await listSongs({ limit: 6 });
        setQuickSongs(songs.items);

        const churchId = admin
          ? nextView
          : await requireChurchId().catch(() => "");
        if (churchId) {
          void reloadChurchCatalog(churchId)
            .then(async () => {
              await loadList(undefined, nextView, admin);
              const refreshed = await listSongs({ limit: 6 });
              setQuickSongs(refreshed.items);
            })
            .catch(() => undefined);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("setlists.loadError"));
        toast.error(err instanceof Error ? err.message : t("setlists.loadError"));
        setLoading(false);
      }
    })();
  }, []);

  // KeepAlive already preserves list state when leaving for Presentation.
  // Do not refetch/pull catalog just because the page became visible again.

  useEffect(() => {
    const id = searchParams.get("setlist");
    if (!id || loading || id === active?.id) return;
    let cancelled = false;
    void getSetlist(id)
      .then((next) => {
        if (!cancelled) setActive(next);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t("setlists.openError"));
        setSearchParams({}, { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, loading, active?.id]);

  // Item count + running time for each index row (local reads, cached).
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      setlists.map((row) =>
        getSetlist(row.id)
          .then((full) => [row.id, statsOf(full)] as const)
          .catch(() => null),
      ),
    ).then((entries) => {
      if (cancelled) return;
      setRowStats((prev) => {
        const next = { ...prev };
        for (const entry of entries) if (entry) next[entry[0]] = entry[1];
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [setlists]);

  useEffect(() => {
    if (!active?.items) return;
    setRowStats((prev) => ({ ...prev, [active.id]: statsOf(active) }));
  }, [active]);

  const applyForm = async (values: SetlistFormValues, isCreate: boolean) => {
    if (!canManage) {
      throw new Error("Your role can view setlists and go live, but cannot edit them.");
    }
    const payload = {
      name: values.name.trim(),
      service_type: values.serviceType,
      service_at: values.date ? `${values.date}T09:00:00` : null,
      est_duration_seconds: parseDurationSeconds(values.duration),
    };
    const target = formTarget ?? active;
    const next = isCreate
      ? await createSetlist({ ...payload, share_church_ids: values.churchIds })
      : target
        ? await updateSetlist(target.id, {
            ...payload,
            share_church_ids: values.churchIds,
          })
        : await createSetlist({ ...payload, share_church_ids: values.churchIds });
    setFormOpen(false);
    // Editing from the index row menu keeps the index; otherwise open the result.
    if (!isCreate && !searchParams.get("setlist")) await reloadIndex();
    else await loadList(next.id);
    setFormTarget(null);
    toast.success(isCreate ? "Setlist created." : "Setlist updated.");
  };

  const openCreate = () => {
    setFormTarget(null);
    setFormMode("create");
    setFormOpen(true);
  };

  const openEdit = (target: Setlist) => {
    setFormTarget(target);
    setFormMode("edit");
    setFormOpen(true);
  };

  const editFromIndex = (id: string) => {
    void getSetlist(id)
      .then(openEdit)
      .catch((err) => reportError(err, t("setlists.openError")));
  };

  const setArchived = (target: Setlist, archived: boolean) => {
    const wasOpen = active?.id === target.id;
    void setSetlistArchived(target.id, archived)
      .then(async () => {
        if (wasOpen) backToIndex();
        await reloadIndex();
      })
      .then(() => toast.success(archived ? "Setlist archived." : t("setlists.restored")))
      .catch((err) => {
        const message = err instanceof Error ? err.message : t("setlists.loadError");
        toast.error(message);
      });
  };

  const addFromServiceItem = async (item: ServiceItem) => {
    if (!active) return;
    const next = await addSetlistItem(active.id, {
      itemType: item.itemType,
      title: item.title,
      subtitle: item.subtitle,
      durationSeconds: parseDurationSeconds(item.duration),
      songId: item.songId,
      sermonId: item.sermonId,
      passageId: item.passageId,
      mediaAssetId: item.mediaAssetId,
      payload: item.payload,
    });
    setActive(next);
    if (item.itemType !== "song") setAddItemOpen(false);
    toast.success(
      item.itemType === "song"
        ? "Song added. Keep picking or tap Done."
        : "Item added to setlist.",
    );
  };

  const addSongsToSetlist = async (items: ServiceItem[]) => {
    if (!active || !items.length) return;
    let next = active;
    for (const item of items) {
      next = await addSetlistItem(next.id, {
        itemType: item.itemType,
        title: item.title,
        subtitle: item.subtitle,
        durationSeconds: parseDurationSeconds(item.duration),
        songId: item.songId,
        sermonId: item.sermonId,
        passageId: item.passageId,
        mediaAssetId: item.mediaAssetId,
        payload: item.payload,
      });
    }
    setActive(next);
    toast.success(
      items.length === 1
        ? "Song added. Keep picking or tap Done."
        : `${items.length} songs added. Keep picking or tap Done.`,
    );
  };

  const removeSongsFromSetlist = async (songIds: string[]) => {
    if (!active || !songIds.length) return;
    let next = active;
    for (const songId of songIds) {
      const item = (next.items ?? []).find(
        (row) => row.item_type === "song" && row.song_id === songId,
      );
      if (!item) continue;
      next = await deleteSetlistItem(next.id, item.id);
    }
    setActive(next);
    toast.success(
      songIds.length === 1
        ? "Song removed from setlist."
        : `${songIds.length} songs removed from setlist.`,
    );
  };

  const quickAddSong = (song: Song) => {
    if (!active) return;
    void addSetlistItem(active.id, {
      itemType: "song",
      title: song.title,
      subtitle: song.artist ?? undefined,
      durationSeconds: song.duration_seconds,
      songId: song.id,
    })
      .then(setActive)
      .catch((err) => reportError(err, "Could not add item."));
  };

  const removeItem = (item: SetlistItem) => {
    if (!active) return;
    void deleteSetlistItem(active.id, item.id)
      .then((next) => {
        setActive(next);
        toast.success("Item removed.");
      })
      .catch((err) => reportError(err, "Could not remove item."));
  };

  const moveSetlistItem = (fromId: string, toId: string) => {
    if (!canManage || !active?.items || fromId === toId) return;
    const from = active.items.findIndex((row) => row.id === fromId);
    const to = active.items.findIndex((row) => row.id === toId);
    const nextItems = moveItem(active.items, from, to);
    setActive({ ...active, items: nextItems });
    void reorderSetlistItems(
      active.id,
      nextItems.map((row) => row.id),
    )
      .then(setActive)
      .catch((err) => reportError(err, "Could not reorder items."));
  };

  const { bind: bindItem } = useHoldReorder(
    "setlist-items",
    (fromId, toId) => moveSetlistItem(fromId, toId),
  );

  const visibleSetlists = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return setlists;
    return setlists.filter((row) => row.name.toLowerCase().includes(q));
  }, [setlists, query]);

  const groups = useMemo(() => groupSetlists(visibleSetlists), [visibleSetlists]);

  const visibleItems = useMemo(() => {
    const items = active?.items ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    if (active?.name.toLowerCase().includes(q)) return items;
    return items.filter((item) =>
      [item.title, item.subtitle ?? "", itemMeta(item)].some((value) =>
        value.toLowerCase().includes(q),
      ),
    );
  }, [active, query]);

  const existingSongNumbers = useMemo(() => {
    const numbers: Record<string, number> = {};
    (active?.items ?? []).forEach((item, index) => {
      if (item.item_type === "song" && item.song_id && numbers[item.song_id] == null) {
        numbers[item.song_id] = index + 1;
      }
    });
    return numbers;
  }, [active?.items]);

  const selectedId = searchParams.get("setlist");
  if (loading) return selectedId ? <SetlistDetailSkeleton /> : <SetlistIndexSkeleton />;
  if (selectedId && !active) return <SetlistDetailSkeleton />;

  const churchPicker = superadmin ? (
    <label className="flex items-center gap-2 text-[12px] text-on-surface-variant">
      <Icon name="church" className="text-[14px]" />
      <span className="hidden sm:inline">{t("setlists.viewingChurch")}</span>
      <select
        aria-label={t("setlists.viewingChurch")}
        value={viewChurchId}
        onChange={(event) => {
          const next = event.target.value;
          if (selectedId) backToIndex();
          void switchViewChurch(next).catch((err) =>
            reportError(err, t("setlists.loadError")),
          );
        }}
        className="ui-input !h-8 !w-auto min-w-[180px] max-w-[240px] pr-7"
      >
        <option value="">{t("common.selectChurch")}</option>
        {churches.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
    </label>
  ) : null;

  const errorLine = error ? (
    <p role="alert" className="px-6 py-2 text-[13px] text-error border-b border-white/5">
      {error}
    </p>
  ) : null;

  const modals = (
    <>
      <AddServiceItemModal
        open={addItemOpen}
        initialStep={addItemStep}
        setlistName={active?.name ?? "Setlist"}
        serviceAt={active?.service_at}
        existingSongNumbers={existingSongNumbers}
        onClose={() => setAddItemOpen(false)}
        onAdd={(item) => {
          void addFromServiceItem(item).catch((err) => reportError(err, "Could not add item."));
        }}
        onAddSongs={async (items) => {
          try {
            await addSongsToSetlist(items);
          } catch (err) {
            reportError(err, "Could not add songs.");
            throw err;
          }
        }}
        onRemoveSongs={async (songIds) => {
          try {
            await removeSongsFromSetlist(songIds);
          } catch (err) {
            reportError(err, "Could not remove songs.");
            throw err;
          }
        }}
      />

      <SetlistFormModal
        open={formOpen}
        mode={formMode}
        churches={superadmin ? churches : undefined}
        initialValues={
          formMode === "edit" && (formTarget ?? active)
            ? (() => {
                const target = (formTarget ?? active) as Setlist;
                return {
                  name: target.name,
                  date: localDateInput(target.service_at),
                  duration: target.est_duration_seconds
                    ? formatDuration(target.est_duration_seconds)
                    : "",
                  serviceType: target.service_type ?? "Sunday Morning Service",
                  churchIds: target.share_church_ids?.length
                    ? target.share_church_ids
                    : [target.church_id],
                };
              })()
            : superadmin && viewChurchId
              ? { churchIds: [viewChurchId] }
              : undefined
        }
        onClose={() => {
          setFormOpen(false);
          setFormTarget(null);
        }}
        onSubmit={async (values) => {
          try {
            await applyForm(values, formMode === "create");
          } catch (err) {
            reportError(err, "Could not save setlist.");
            throw err;
          }
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Setlist?"
        description={`Are you sure you want to delete "${deleteTarget?.name ?? ""}"? This action cannot be undone.`}
        highlight={deleteTarget ? `"${deleteTarget.name}"` : undefined}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          const deletedId = deleteTarget.id;
          const fromDetail = active?.id === deletedId;
          try {
            await deleteSetlist(deletedId);
            if (readPreferredSetlistId() === deletedId) {
              writePreferredSetlistId("");
              setPreferredId("");
            }
            setDeleteTarget(null);
            setError("");
            if (fromDetail) {
              setActive(null);
              setSearchParams({}, { replace: true });
              // PreferId undefined + cleared URL; skip reopening the deleted setlist.
              await loadList(undefined, viewChurchId, superadmin, 0, false, showArchive);
            } else {
              await reloadIndex(showArchive);
            }
            toast.success("Setlist deleted.");
          } catch (err) {
            reportError(err, "Could not delete setlist.");
            throw err;
          }
        }}
      />
    </>
  );

  /* ── Index ───────────────────────────────────────────────────────────── */

  if (!selectedId || !active) {
    const emptyText = query.trim()
      ? t("setlists.emptyQuery", { q: query.trim() })
      : superadmin && !viewChurchId
        ? t("setlists.chooseChurch")
        : showArchive
          ? t("setlists.emptyArchive")
          : t("setlists.empty");

    return (
      <section className="h-full flex flex-col bg-surface-container-lowest">
        <PageHeader
          title={t("setlists.title")}
          meta={
            total === 1
              ? t("setlists.count", { n: total })
              : t("setlists.countMany", { n: total })
          }
          actions={
            canManage ? (
              <Button variant="primary" icon="add" onClick={openCreate}>
                {t("setlists.new")}
              </Button>
            ) : null
          }
          toolbar={
            <>
              <ViewTabs
                label={t("setlists.title")}
                value={showArchive ? "archive" : "active"}
                onChange={(value) => switchSetlistTab(value === "archive")}
                tabs={[
                  { id: "active", label: t("common.active") },
                  { id: "archive", label: t("common.archive") },
                ]}
              />
              <div className="flex-1" />
              {churchPicker}
            </>
          }
        />
        {errorLine}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <div className="min-h-full lg:h-full flex flex-col px-4 sm:px-6 py-4">
          <SetlistInsights
            viewChurchId={superadmin ? viewChurchId : null}
            version={setlists}
          />
          {visibleSetlists.length === 0 ? (
            <EmptyState
              icon={showArchive ? "unarchive" : "queue_music"}
              title={emptyText}
              action={
                canManage && !query.trim() && !showArchive && !(superadmin && !viewChurchId) ? (
                  <Button variant="secondary" icon="add" onClick={openCreate}>
                    {t("setlists.new")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
              <LibraryTable
                ariaLabel="Setlists"
                className="min-h-[240px]"
                columns={[
                  { key: "name", header: "Title" },
                  { key: "type", header: "Service", hideBelow: "md" },
                  { key: "items", header: "Items", align: "right", hideBelow: "md" },
                  { key: "duration", header: "Length", align: "right", hideBelow: "sm" },
                  { key: "date", header: "Date", align: "right" },
                ]}
                groups={groups.map((group) => ({
                  id: group.id,
                  label: group.label,
                  rows: group.items.map((row) => {
                    const stats = rowStats[row.id];
                    const seconds = row.est_duration_seconds || stats?.seconds || 0;
                    const preferred = preferredId === row.id;
                    const menu: MenuItem[] = [
                      {
                        label: preferred
                          ? t("setlists.preferredBadge")
                          : t("setlists.useForPresentation"),
                        icon: "star",
                        disabled: preferred,
                        onSelect: () => markPreferredForPresentation(row.id),
                      },
                    ];
                    if (canManage) {
                      menu.push(
                        { label: "Edit setlist", icon: "edit", onSelect: () => editFromIndex(row.id) },
                        showArchive
                          ? {
                              label: t("common.restore"),
                              icon: "unarchive",
                              onSelect: () => setArchived(row, false),
                            }
                          : {
                              label: "Archive",
                              icon: "archive",
                              onSelect: () => setArchived(row, true),
                            },
                        {
                          label: "Delete setlist",
                          icon: "delete",
                          danger: true,
                          onSelect: () => setDeleteTarget(row),
                        },
                      );
                    }
                    return {
                      id: row.id,
                      label: row.name,
                      onOpen: () => {
                        void openSetlist(row.id).catch((err) =>
                          reportError(err, t("setlists.openError")),
                        );
                      },
                      leading: <DateBlock value={row.service_at} highlight={group.id === "today"} />,
                      cells: {
                        name: (
                          <span className="inline-flex items-center gap-1.5 max-w-full">
                            <span className="truncate">{row.name}</span>
                            {preferred ? (
                              <Icon
                                name="star"
                                className="text-[13px] text-primary shrink-0"
                                title={t("setlists.preferredBadge")}
                              />
                            ) : null}
                          </span>
                        ),
                        type: row.service_type || "—",
                        items: stats ? (
                          <span className="tabular-nums">{stats.count}</span>
                        ) : (
                          <Skeleton className="inline-block h-3 w-6 align-middle" />
                        ),
                        duration: seconds ? (
                          <span className="tabular-nums">{formatDuration(seconds)}</span>
                        ) : stats ? (
                          "—"
                        ) : (
                          <Skeleton className="inline-block h-3 w-8 align-middle" />
                        ),
                        date: (
                          <span className="tabular-nums whitespace-nowrap">
                            {row.service_at
                              ? `${serviceDate(row.service_at)} · ${serviceTime(row.service_at)}`
                              : "No date"}
                          </span>
                        ),
                      },
                      actions: <RowMenu label="More setlist actions" items={menu} />,
                    };
                  }),
                }))}
              />
          )}
          </div>
          {loadingMore ? <SetlistRowsSkeleton rows={3} /> : null}
          <div className={loadingMore ? "hidden" : "px-6"}>
            <LoadMoreBar
              shown={setlists.length}
              total={total}
              hasMore={setlists.length < total}
              loading={loadingMore}
              onMore={() => {
                void loadList(
                  undefined,
                  viewChurchId,
                  superadmin,
                  setlists.length,
                  true,
                ).catch((err) => reportError(err, t("setlists.loadError")));
              }}
            />
          </div>
        </div>
        {modals}
      </section>
    );
  }

  /* ── Detail ──────────────────────────────────────────────────────────── */

  const items = active.items ?? [];
  const totalSeconds = itemsDuration(items);
  const preferred = preferredId === active.id;
  const archived = Boolean(active.archived_at);
  const detailMenu: MenuItem[] = canManage
    ? [
        archived
          ? { label: t("common.restore"), icon: "unarchive", onSelect: () => setArchived(active, false) }
          : { label: "Archive", icon: "archive", onSelect: () => setArchived(active, true) },
        {
          label: "Delete setlist",
          icon: "delete",
          danger: true,
          onSelect: () => setDeleteTarget(active),
        },
      ]
    : [];

  return (
    <section className="h-full flex flex-col bg-surface-container-lowest">
      <PageHeader
        crumbs={[{ label: t("setlists.title"), onClick: backToIndex }]}
        title={active.name}
        meta={[
          active.service_at ? serviceDate(active.service_at, true) : active.service_type || "Unscheduled",
          `${items.length} ${items.length === 1 ? "item" : "items"}`,
          formatDuration(totalSeconds || active.est_duration_seconds),
        ].join(" · ")}
        actions={
          <>
            {churchPicker}
            {archived ? <span className="ui-badge">{t("common.archive")}</span> : null}
            <IconButton
              icon={preferred ? "star" : "star_outline"}
              label={preferred ? t("setlists.preferredBadge") : t("setlists.useForPresentation")}
              aria-pressed={preferred}
              onClick={() => markPreferredForPresentation(active.id)}
              className={preferred ? "!text-primary" : undefined}
            />
            {canManage ? (
              <Button
                variant="secondary"
                icon="edit"
                aria-label="Edit setlist"
                onClick={() => openEdit(active)}
              >
                Edit
              </Button>
            ) : null}
            {detailMenu.length ? (
              <RowMenu label="More setlist actions" items={detailMenu} />
            ) : null}
            <Link
              to={`/live?setlist=${active.id}`}
              onClick={() => markPreferredForPresentation(active.id)}
              className="ui-btn ui-btn-primary"
            >
              <Icon name="play_arrow" className="text-[16px]" />
              {t("live.goLive")}
            </Link>
          </>
        }
      />
      {errorLine}
      <div
        className={`flex-1 min-h-0 grid grid-cols-1 overflow-y-auto lg:overflow-hidden custom-scrollbar ${
          canManage ? "lg:grid-cols-[minmax(0,1fr)_340px]" : ""
        }`}
      >
        <div className="min-h-0 lg:overflow-y-auto custom-scrollbar px-4 sm:px-6 py-6">
          {/* ── Setlist default stage background ── */}
          <div className="mb-5">
            <SetlistBackgroundControl
              setlist={active}
              canEdit={canManage}
              onChange={(next) =>
                setActive((prev) =>
                  prev && prev.id === next.id
                    ? { ...prev, ...next, items: next.items ?? prev.items }
                    : prev,
                )
              }
            />
          </div>
          {active.items ? (
            <RunOfShow
              items={items}
              visible={visibleItems}
              canManage={canManage}
              bind={bindItem}
              onRemove={removeItem}
              onAddItem={() => {
                setAddItemStep(undefined);
                setAddItemOpen(true);
              }}
              noMatch={
                <p className="py-8 text-[13px] text-on-surface-variant text-center">
                  No items match “{query.trim()}”.
                </p>
              }
            />
          ) : (
            <RunOfShowSkeleton />
          )}
        </div>
        {canManage ? (
          <div className="min-h-0 lg:overflow-y-auto custom-scrollbar flex flex-col">
            <AddToSetlistPanel
              suggestions={quickSongs}
              inSetlist={existingSongNumbers}
              onAddSong={quickAddSong}
              onOpenFlow={(kind) => {
                setAddItemStep(kind);
                setAddItemOpen(true);
              }}
            />
          </div>
        ) : null}
      </div>
      {modals}
    </section>
  );
}
