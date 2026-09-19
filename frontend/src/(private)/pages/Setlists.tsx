import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AddServiceItemModal from "../../components/modals/AddServiceItemModal";
import ConfirmDialog from "../../components/modals/ConfirmDialog";
import SetlistFormModal, {
  type SetlistFormValues,
} from "../../components/modals/SetlistFormModal";
import type { ServiceItem } from "../../components/modals/serviceItem";
import { PageSkeleton } from "../../components/Skeleton";
import SongThumb from "../../components/SongThumb";
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
import { formatDuration, moveItem, parseDurationSeconds, requireChurchId } from "../../lib/helpers";
import { useHoldReorder } from "../../lib/holdDrag";
import { useSearch } from "../../lib/SearchContext";
import { usePrefs } from "../../lib/PrefsContext";
import { useToast } from "../../lib/ToastContext";
import { LoadMoreBar } from "../../components/LoadMoreBar";
import { reloadChurchCatalog } from "../../lib/offline/sync";
import { PAGE_SIZE, type Setlist, type Song } from "../../lib/types";
import {
  readSetlistViewChurchId,
  writeSetlistViewChurchId,
} from "../../lib/viewChurch";
import {
  readPreferredSetlistId,
  writePreferredSetlistId,
} from "../../lib/preferredSetlist";

const accentIcon: Record<string, string> = {
  song: "bg-primary/10 text-primary",
  sermon: "bg-tertiary/10 text-tertiary",
  scripture: "bg-secondary/10 text-secondary",
  media: "bg-tertiary/10 text-tertiary",
  roster: "bg-secondary/10 text-secondary",
};

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
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState("");
  const [superadmin, setSuperadmin] = useState(false);
  const [churches, setChurches] = useState<ChurchName[]>([]);
  const [viewChurchId, setViewChurchId] = useState(readSetlistViewChurchId);
  const [showArchive, setShowArchive] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [preferredId, setPreferredId] = useState(readPreferredSetlistId);
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

  const loadList = async (
    preferId?: string,
    viewId = viewChurchId,
    asAdmin = superadmin,
    nextOffset = 0,
    append = false,
    archived = showArchive,
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
      setOffset(nextOffset);
      setSetlists((prev) => (append ? [...prev, ...page.items] : page.items));
      if (!autoOpen) {
        setActive(null);
        return;
      }
      const fromUrl = searchParams.get("setlist");
      const preferred = readPreferredSetlistId();
      const id =
        preferId ||
        (fromUrl && page.items.some((row) => row.id === fromUrl)
          ? fromUrl
          : null) ||
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

  const switchSetlistTab = (archived: boolean) => {
    if (archived === showArchive) return;
    setShowArchive(archived);
    setActive(null);
    setSearchParams({}, { replace: true });
    setLoading(true);
    void loadList(undefined, viewChurchId, superadmin, 0, false, archived, {
      autoOpen: false,
    })
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : t("setlists.loadError");
        setError(message);
        toast.error(message);
      })
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
    if (!setlists.some((row) => row.id === id)) return;
    void getSetlist(id)
      .then(setActive)
      .catch((err) =>
        setError(err instanceof Error ? err.message : t("setlists.openError")),
      );
  }, [searchParams, loading, active?.id, setlists]);

  const applyForm = async (values: SetlistFormValues, isCreate: boolean) => {
    if (!canManage) {
      throw new Error("Operators can view setlists and go live, but cannot edit them.");
    }
    const payload = {
      name: values.name.trim(),
      service_type: values.serviceType,
      service_at: values.date ? `${values.date}T09:00:00` : null,
      est_duration_seconds: parseDurationSeconds(values.duration),
    };
    const next = isCreate
      ? await createSetlist({ ...payload, share_church_ids: values.churchIds })
      : active
        ? await updateSetlist(active.id, {
            ...payload,
            share_church_ids: values.churchIds,
          })
        : await createSetlist({ ...payload, share_church_ids: values.churchIds });
    setFormOpen(false);
    await loadList(next.id);
    toast.success(isCreate ? "Setlist created." : "Setlist updated.");
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
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : "Could not reorder items.";
        setError(message);
        toast.error(message);
      });
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

  if (loading) return <PageSkeleton />;

  const selectedId = searchParams.get("setlist");
  if (!selectedId) {
    return (
      <section className="h-full overflow-y-auto custom-scrollbar bg-surface-container-lowest p-4 sm:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
            <div>
              <h2 className="text-[clamp(1.75rem,3vw,2rem)] font-semibold tracking-[-0.01em] text-on-surface">
                {t("setlists.title")}
              </h2>
              <p className="text-on-surface-variant text-sm mt-2">
                {total === 1
                  ? t("setlists.count", { n: total })
                  : t("setlists.countMany", { n: total })}
              </p>
              <div className="mt-4 flex p-1 bg-surface-container-high rounded-full border border-white/5 w-fit">
                <button
                  type="button"
                  onClick={() => switchSetlistTab(false)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                    !showArchive
                      ? "bg-primary text-on-primary shadow-lg"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {t("common.active")}
                </button>
                <button
                  type="button"
                  onClick={() => switchSetlistTab(true)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                    showArchive
                      ? "bg-primary text-on-primary shadow-lg"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {t("common.archive")}
                </button>
              </div>
              {superadmin ? (
                <label className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2 max-w-xl">
                  <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                    {t("setlists.viewingChurch")}
                  </span>
                  <select
                    value={viewChurchId}
                    onChange={(event) => {
                      const next = event.target.value;
                      void switchViewChurch(next).catch((err) => {
                        const message =
                          err instanceof Error ? err.message : t("setlists.loadError");
                        setError(message);
                        toast.error(message);
                      });
                    }}
                    className="bg-surface-container border border-white/10 rounded-lg px-3 py-2 text-sm min-w-[240px]"
                  >
                    <option value="">{t("common.selectChurch")}</option>
                    {churches.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {canManage ? (
            <button
              type="button"
              onClick={() => {
                setFormMode("create");
                setFormOpen(true);
              }}
              className="flex items-center gap-2 glow-button text-white px-4 py-2 rounded-lg text-sm font-medium self-start sm:self-auto"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              {t("setlists.new")}
            </button>
            ) : null}
          </div>
          {error ? <p className="mb-6 text-sm text-[#ffb4ab]">{error}</p> : null}
          {visibleSetlists.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              {query.trim()
                ? t("setlists.emptyQuery", { q: query.trim() })
                : superadmin && !viewChurchId
                  ? t("setlists.chooseChurch")
                  : showArchive
                    ? t("setlists.emptyArchive")
                    : t("setlists.empty")}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleSetlists.map((row) => (
                <div
                  key={row.id}
                  className="glass-panel rounded-xl p-5 text-left hover:border-primary/30 transition-colors border border-white/5 relative group"
                >
                  <button
                    type="button"
                    onClick={() => {
                      void openSetlist(row.id).catch((err) => {
                        const message =
                          err instanceof Error
                            ? err.message
                            : t("setlists.openError");
                        setError(message);
                        toast.error(message);
                      });
                    }}
                    className="w-full text-left pr-10"
                  >
                  <p className="text-lg font-semibold text-on-surface break-words">
                    {row.name}
                  </p>
                  <p className="text-sm text-on-surface-variant mt-1">
                    {row.service_type || "Unscheduled"}
                    {row.service_at
                      ? ` · ${new Date(row.service_at).toLocaleDateString()}`
                      : ""}
                  </p>
                  <p className="text-[11px] text-on-surface-variant/70 mt-3">
                    Est. {formatDuration(row.est_duration_seconds)}
                  </p>
                  </button>
                  {showArchive && canManage ? (
                    <button
                      type="button"
                      title={t("common.restore")}
                      onClick={() => {
                        void setSetlistArchived(row.id, false)
                          .then(() =>
                            loadList(
                              undefined,
                              viewChurchId,
                              superadmin,
                              0,
                              false,
                              true,
                              { autoOpen: false },
                            ),
                          )
                          .then(() => toast.success(t("setlists.restored")))
                          .catch((err) => {
                            const message =
                              err instanceof Error
                                ? err.message
                                : t("setlists.loadError");
                            toast.error(message);
                          });
                      }}
                      className="absolute top-4 right-4 p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        unarchive
                      </span>
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          <LoadMoreBar
            shown={setlists.length}
            total={total}
            hasMore={offset + setlists.length < total}
            loading={loadingMore}
            onMore={() => {
              void loadList(
                undefined,
                viewChurchId,
                superadmin,
                offset + PAGE_SIZE,
                true,
              ).catch((err) => {
                const message =
                  err instanceof Error ? err.message : t("setlists.loadError");
                setError(message);
                toast.error(message);
              });
            }}
          />
        </div>
        <SetlistFormModal
          open={formOpen}
          mode={formMode}
          churches={superadmin ? churches : undefined}
          initialValues={
            superadmin && viewChurchId ? { churchIds: [viewChurchId] } : undefined
          }
          onClose={() => setFormOpen(false)}
          onSubmit={async (values) => {
            try {
              await applyForm(values, true);
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Could not save setlist.";
              setError(message);
              toast.error(message);
              throw err;
            }
          }}
        />
      </section>
    );
  }

  if (!active) return <PageSkeleton />;

  return (
    <section className="h-full overflow-y-auto custom-scrollbar relative pb-20">
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-end">
          <div className="min-w-0">
            <nav className="flex flex-wrap gap-2 text-xs text-on-surface-variant mb-2">
              <button
                type="button"
                onClick={() => {
                  setActive(null);
                  setSearchParams({}, { replace: true });
                }}
                className="hover:text-primary"
              >
                {t("setlists.title")}
              </button>
              {active ? (
                <>
                  <span>/</span>
                  <span className="text-on-surface">{active.name}</span>
                </>
              ) : null}
            </nav>
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] leading-10 font-semibold tracking-[-0.01em] text-on-surface">
              {active?.name ?? "No active setlist"}
            </h2>
            {superadmin ? (
              <label className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2 max-w-xl">
                <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  {t("setlists.viewingChurch")}
                </span>
                <select
                  value={viewChurchId}
                  onChange={(event) => {
                    const next = event.target.value;
                    setActive(null);
                    setSearchParams({}, { replace: true });
                    void switchViewChurch(next).catch((err) => {
                      const message =
                        err instanceof Error ? err.message : t("setlists.loadError");
                      setError(message);
                      toast.error(message);
                    });
                  }}
                  className="bg-surface-container border border-white/10 rounded-lg px-3 py-2 text-sm min-w-[240px]"
                >
                  <option value="">{t("common.selectChurch")}</option>
                  {churches.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {setlists.length ? (
              <div
                className="mt-4 flex gap-2 overflow-x-auto custom-scrollbar pb-1"
                role="tablist"
                aria-label={t("setlists.title")}
              >
                {visibleSetlists.map((row) => {
                  const selected = active?.id === row.id;
                  const preferred = preferredId === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => {
                        void openSetlist(row.id).catch((err) =>
                          setError(
                            err instanceof Error
                              ? err.message
                              : t("setlists.openError"),
                          ),
                        );
                      }}
                      className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm transition-colors ${
                        selected
                          ? "bg-primary/15 text-primary border border-primary/30 font-semibold"
                          : "bg-surface-container border border-white/10 text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {preferred ? (
                          <span
                            className="material-symbols-outlined text-[14px] text-primary"
                            title={t("setlists.preferredBadge")}
                          >
                            star
                          </span>
                        ) : null}
                        {row.name}
                      </span>
                    </button>
                  );
                })}
                {visibleSetlists.length === 0 ? (
                  <p className="text-sm text-on-surface-variant py-2">
                    No setlists match “{query.trim()}”.
                  </p>
                ) : null}
              </div>
            ) : null}
            {active ? (
              <div className="flex flex-wrap items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-primary/10 text-primary text-xs font-medium">
                  <span className="material-symbols-outlined text-[14px]">
                    calendar_today
                  </span>
                  {active.service_at
                    ? new Date(active.service_at).toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })
                    : active.service_type || "Unscheduled"}
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-high text-on-surface-variant text-xs font-medium">
                  <span className="material-symbols-outlined text-[14px]">timer</span>
                  Est. {formatDuration(active.est_duration_seconds)}
                </div>
              </div>
            ) : (
              <p className="text-on-surface-variant text-sm mt-2">
                {superadmin && !viewChurchId
                  ? "Choose a church to see its setlists, or create one and assign it to one or more churches."
                  : canManage
                    ? "Create a new setlist to start building your service flow."
                    : "Open a setlist to review the service, then go live."}
              </p>
            )}
          </div>

          <div className="flex gap-2 shrink-0">
            {canManage ? (
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setFormMode("create");
                setFormOpen(true);
              }}
              className="flex items-center gap-2 glow-button text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              {t("setlists.new")}
            </button>
            ) : null}
            {canManage ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 bg-surface-container border border-white/10 px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-container-high transition-colors"
                aria-label="More setlist actions"
              >
                <span className="material-symbols-outlined text-[18px]">
                  more_horiz
                </span>
              </button>
              {menuOpen ? (
                <div className="absolute right-0 mt-2 w-44 glass-modal rounded-xl py-1 z-20 shadow-xl">
                  <button
                    type="button"
                    disabled={!active}
                    onClick={() => {
                      setMenuOpen(false);
                      setFormMode("edit");
                      setFormOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-on-surface hover:bg-white/5 disabled:opacity-40"
                  >
                    Edit Setlist
                  </button>
                  <button
                    type="button"
                    disabled={!active}
                    onClick={() => {
                      setMenuOpen(false);
                      setDeleteOpen(true);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-error hover:bg-white/5 disabled:opacity-40"
                  >
                    Delete Setlist
                  </button>
                </div>
              ) : null}
            </div>
            ) : null}
          </div>
        </div>

        {error ? <p className="mb-6 text-sm text-[#ffb4ab]">{error}</p> : null}

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8">
          <div className="xl:col-span-8">
            {visibleItems.map((item, index) => {
              const hold = canManage ? bindItem(item.id) : {};
              return (
              <div key={item.id} className="group relative">
                <div
                  {...hold}
                  className={`glass-panel rounded-xl p-4 flex items-center gap-3 sm:gap-4 transition-all mb-1 hover:border-primary/30 select-none touch-none ${
                    canManage
                      ? "cursor-grab active:cursor-grabbing"
                      : ""
                  }`}
                >
                  {canManage ? (
                  <span
                    className="text-on-surface-variant hover:text-on-surface shrink-0"
                    aria-hidden
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      drag_indicator
                    </span>
                  </span>
                  ) : null}
                  <div
                    className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${
                      accentIcon[item.item_type]
                    }`}
                  >
                    <span className="material-symbols-outlined">
                      {item.item_type === "song"
                        ? "music_note"
                        : item.item_type === "sermon"
                          ? "record_voice_over"
                          : item.item_type === "scripture"
                            ? "menu_book"
                            : item.item_type === "roster"
                              ? "assignment_ind"
                              : "movie"}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {item.item_type === "song" && item.song_id ? (
                      <Link
                        to={`/songs?song=${item.song_id}`}
                        data-hold-ignore
                        className="block min-w-0"
                      >
                        <h4 className="font-semibold text-on-surface truncate hover:text-primary">
                          {item.title}
                        </h4>
                      </Link>
                    ) : item.item_type === "sermon" && item.sermon_id ? (
                      <Link
                        to={`/sermon?sermon=${item.sermon_id}`}
                        data-hold-ignore
                        className="block min-w-0"
                      >
                        <h4 className="font-semibold text-on-surface truncate hover:text-primary">
                          {item.title}
                        </h4>
                      </Link>
                    ) : (
                      <h4 className="font-semibold text-on-surface truncate">
                        {item.title}
                      </h4>
                    )}
                    <p className="text-xs text-on-surface-variant truncate">
                      {itemMeta(item) || item.subtitle}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-mono text-primary">
                      {formatDuration(item.duration_seconds)}
                    </div>
                    <div className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                      {item.item_type === "roster" ? "assignments" : item.item_type}
                    </div>
                  </div>
                  {canManage ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!active) return;
                      void deleteSetlistItem(active.id, item.id)
                        .then((next) => {
                          setActive(next);
                          toast.success("Item removed.");
                        })
                        .catch((err) => {
                          const message =
                            err instanceof Error
                              ? err.message
                              : "Could not remove item.";
                          setError(message);
                          toast.error(message);
                        });
                    }}
                    className="opacity-0 group-hover:opacity-100 text-on-surface-variant hover:text-error"
                    aria-label="Remove item"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                  ) : null}
                </div>
                {index < visibleItems.length - 1 ? (
                  <div className="transition-line" />
                ) : null}
              </div>
              );
            })}

            {visibleItems.length === 0 && (active?.items?.length ?? 0) > 0 ? (
              <p className="text-sm text-on-surface-variant py-8 text-center">
                No items match “{query.trim()}”.
              </p>
            ) : null}

            {canManage ? (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                disabled={!active}
                onClick={() => setAddItemOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-surface-container-high border border-dashed border-white/20 rounded-xl hover:border-primary/50 hover:bg-surface-container-highest transition-all group disabled:opacity-40"
              >
                <span className="material-symbols-outlined text-primary group-hover:scale-110 transition-transform">
                  add_circle
                </span>
                <span className="text-sm font-medium">Add Service Item</span>
              </button>
            </div>
            ) : null}
          </div>

          <div className="xl:col-span-4 space-y-6">
            {canManage ? (
            <div className="glass-panel rounded-2xl p-6 ambient-shadow">
              <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant mb-4">
                Library Quick-Add
              </h3>
              <div className="space-y-3">
                {quickSongs.map((song) => (
                  <div
                    key={song.id}
                    className="p-3 bg-surface-container-low rounded-lg border border-white/5 flex items-center justify-between group gap-3"
                  >
                    <SongThumb
                      youtubeUrl={song.youtube_url}
                      title={song.title}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{song.title}</p>
                      <p className="text-[10px] text-on-surface-variant">
                        {song.artist || "Unknown"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!active}
                      onClick={() => {
                        if (!active) return;
                        void addSetlistItem(active.id, {
                          itemType: "song",
                          title: song.title,
                          subtitle: song.artist ?? undefined,
                          durationSeconds: song.duration_seconds,
                          songId: song.id,
                        }).then(setActive);
                      }}
                      className="material-symbols-outlined text-primary shrink-0 disabled:opacity-40"
                    >
                      add
                    </button>
                  </div>
                ))}
                {quickSongs.length === 0 ? (
                  <p className="text-xs text-on-surface-variant">
                    Add songs in the library, then drop them here.
                  </p>
                ) : null}
              </div>
              <Link
                to="/songs"
                className="w-full mt-4 text-xs text-primary font-semibold py-2 hover:underline block text-center"
              >
                View Full Music Library
              </Link>
            </div>
            ) : null}
          </div>
        </div>
      </div>

      {active ? (
        <div className="fixed bottom-4 sm:bottom-6 left-[calc(260px+16px)] right-4 sm:left-[calc(260px+24px)] sm:right-6 h-12 glass-panel rounded-full flex items-center px-4 sm:px-6 gap-2 sm:gap-4 z-30">
          <div className="flex items-center gap-3 shrink-0 min-w-0">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse shrink-0" />
            <span className="text-xs font-mono font-bold truncate">
              {active.name}
            </span>
            {preferredId === active.id ? (
              <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-primary font-semibold">
                {t("setlists.preferredBadge")}
              </span>
            ) : null}
          </div>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => markPreferredForPresentation(active.id)}
            className={`flex items-center gap-1.5 text-sm font-semibold shrink-0 ${
              preferredId === active.id
                ? "text-primary"
                : "text-on-surface-variant hover:text-primary"
            }`}
            title={t("setlists.useForPresentation")}
          >
            <span className="material-symbols-outlined text-[18px]">
              {preferredId === active.id ? "star" : "star_outline"}
            </span>
            <span className="hidden md:inline">
              {preferredId === active.id
                ? t("setlists.preferredBadge")
                : t("setlists.useForPresentation")}
            </span>
          </button>
          <Link
            to={`/live?setlist=${active.id}`}
            onClick={() => markPreferredForPresentation(active.id)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary text-on-primary text-sm font-semibold shrink-0 hover:brightness-110"
          >
            <span className="material-symbols-outlined text-[18px]">
              play_arrow
            </span>
            {t("setlists.startPresentation")}
          </Link>
        </div>
      ) : null}

      <AddServiceItemModal
        open={addItemOpen}
        setlistName={active?.name ?? "Setlist"}
        serviceAt={active?.service_at}
        existingSongNumbers={existingSongNumbers}
        onClose={() => setAddItemOpen(false)}
        onAdd={(item) => {
          void addFromServiceItem(item).catch((err) => {
            const message =
              err instanceof Error ? err.message : "Could not add item.";
            setError(message);
            toast.error(message);
          });
        }}
        onAddSongs={async (items) => {
          try {
            await addSongsToSetlist(items);
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Could not add songs.";
            setError(message);
            toast.error(message);
            throw err;
          }
        }}
        onRemoveSongs={async (songIds) => {
          try {
            await removeSongsFromSetlist(songIds);
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Could not remove songs.";
            setError(message);
            toast.error(message);
            throw err;
          }
        }}
      />

      <SetlistFormModal
        open={formOpen}
        mode={formMode}
        churches={superadmin ? churches : undefined}
        initialValues={
          formMode === "edit" && active
            ? {
                name: active.name,
                date: active.service_at?.slice(0, 10) ?? "",
                duration: active.est_duration_seconds
                  ? formatDuration(active.est_duration_seconds)
                  : "",
                serviceType: active.service_type ?? "Sunday Morning Service",
                churchIds: active.share_church_ids?.length
                  ? active.share_church_ids
                  : [active.church_id],
              }
            : superadmin && viewChurchId
              ? { churchIds: [viewChurchId] }
              : undefined
        }
        onClose={() => setFormOpen(false)}
        onSubmit={async (values) => {
          try {
            await applyForm(values, formMode === "create");
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Could not save setlist.";
            setError(message);
            toast.error(message);
            throw err;
          }
        }}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete Setlist?"
        description={`Are you sure you want to delete "${active?.name ?? ""}"? This action cannot be undone.`}
        highlight={active ? `"${active.name}"` : undefined}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          if (!active) return;
          const deletedId = active.id;
          try {
            await deleteSetlist(deletedId);
            if (readPreferredSetlistId() === deletedId) {
              writePreferredSetlistId("");
              setPreferredId("");
            }
            setDeleteOpen(false);
            setActive(null);
            setError("");
            setSearchParams({}, { replace: true });
            // PreferId undefined + cleared URL; skip reopening the deleted setlist.
            await loadList(undefined, viewChurchId, superadmin, 0, false, showArchive);
            toast.success("Setlist deleted.");
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Could not delete setlist.";
            setError(message);
            toast.error(message);
            throw err;
          }
        }}
      />
    </section>
  );
}
