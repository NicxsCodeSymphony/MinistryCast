import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ChordLyricPreview from "../../components/ChordLyricPreview";
import SongThumb from "../../components/SongThumb";
import ConfirmDialog from "../../components/modals/ConfirmDialog";
import SongFormModal, {
  type SongFormValues,
} from "../../components/modals/SongFormModal";
import { TableSkeleton, RowsSkeleton } from "../../components/Skeleton";
import {
  createSong,
  deleteSong,
  getSong,
  listCategories,
  listChurchNames,
  listLanguages,
  listSongs,
  readSetlistViewChurchId,
  updateSong,
  writeSetlistViewChurchId,
  type ChurchName,
} from "../../lib/api";
import {
  coerceLyricSections,
  formatDuration,
  formatRelative,
  lyricsToText,
  parseDurationSeconds,
  requireChurchId,
  textToLyricSections,
} from "../../lib/helpers";
import { categoryTone, categoryVisual } from "../../lib/categoryColor";
import { PAGE_SIZE, type Category, type Language, type Song } from "../../lib/types";
import { usePrefs } from "../../lib/PrefsContext";
import { useSearch } from "../../lib/SearchContext";
import { useToast } from "../../lib/ToastContext";
import { getSessionProfile, isSuperadmin } from "../../lib/auth";
import { subscribeContent } from "../../lib/offline/live";
import { reloadChurchCatalog } from "../../lib/offline/sync";
import Icon from "../../components/Icon";
import { SongInsights, useSongInsights } from "../../components/library/LibraryInsights";
import { hasLyrics } from "../../components/library/insightsData";

function canManageLibraryRole(role: string | undefined) {
  return role === "superadmin" || role === "admin" || role === "producer";
}

function toInput(song: Song): SongFormValues {
  return {
    title: song.title,
    artist: song.artist ?? "",
    key: song.musical_key ?? "C",
    bpm: song.bpm ? String(song.bpm) : "",
    signature: song.time_signature ?? "4/4",
    categoryId: song.category_id ?? "",
    lyrics: lyricsToText(song.lyric_sections),
    youtubeUrl: song.youtube_url ?? "",
    audioName: "",
    duration: song.duration_seconds ? formatDuration(song.duration_seconds) : "",
  };
}

export default function Songs() {
  const { t } = usePrefs();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [library, setLibrary] = useState<Song[]>([]);
  /** A song opened by link (?song=) that the current list/filter does not include. */
  const [linkedSong, setLinkedSong] = useState<Song | null>(null);
  const [total, setTotal] = useState(0);
  const loadedCount = useRef(0);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the song search (ignored while typing in a field).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!searchRef.current?.offsetParent) return; // page hidden by keep-alive
      event.preventDefault();
      searchRef.current.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [selectedId, setSelectedId] = useState("");
  const [languages, setLanguages] = useState<Language[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [languageId, setLanguageId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  /** "Missing lyrics" insight filter (client-side over the filtered library). */
  const [missingOnly, setMissingOnly] = useState(false);
  const { query, setQuery } = useSearch();
  const [debounced, setDebounced] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [youtubePlaying, setYoutubePlaying] = useState(false);
  const [canManageLibrary, setCanManageLibrary] = useState(false);
  const [superadmin, setSuperadmin] = useState(false);
  const [churches, setChurches] = useState<ChurchName[]>([]);
  const [viewChurchId, setViewChurchId] = useState(readSetlistViewChurchId);
  const loadRequestId = useRef(0);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(query);
    }, 250);
    return () => window.clearTimeout(id);
  }, [query]);

  /** reset: first page · refresh: re-read everything already shown · more: next page */
  const load = async (mode: "reset" | "refresh" | "more" = "reset") => {
    const append = mode === "more";
    if (append) setLoadingMore(true);
    else if (mode === "reset") setLoading(true);
    setError("");
    const requestId = ++loadRequestId.current;
    try {
      const shown = loadedCount.current;
      const page = missingOnly
        ? await listSongs({ query: debounced, categoryId, languageId, offset: 0, limit: 100_000 }).then(
            (all) => {
              const items = all.items.filter((song) => !hasLyrics(song.lyric_sections ?? []));
              return { ...all, items, total: items.length };
            },
          )
        : await listSongs({
            query: debounced,
            categoryId,
            languageId,
            offset: append ? shown : 0,
            limit: mode === "refresh" ? Math.max(PAGE_SIZE, shown) : PAGE_SIZE,
          });
      if (requestId !== loadRequestId.current) return;
      setTotal(page.total);
      setLibrary((prev) => {
        const next = append ? [...prev, ...page.items] : page.items;
        loadedCount.current = next.length;
        return next;
      });
      if (mode === "reset") {
        const want = params.get("song");
        const fromUrl = want
          ? page.items.find((row) => row.id === want)
          : undefined;
        setSelectedId(fromUrl?.id ?? "");
      }
    } catch (err) {
      if (requestId !== loadRequestId.current) return;
      setError(err instanceof Error ? err.message : t("songs.loadError"));
      toast.error(err instanceof Error ? err.message : t("songs.loadError"));
    } finally {
      if (requestId === loadRequestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const refreshWorkspace = async (churchId?: string) => {
    const id = churchId || (await requireChurchId());
    // Soft refresh: keep showing local songs while catalog updates in background.
    await load("reset");
    void reloadChurchCatalog(id)
      .then(async () => {
        const [cats, langs] = await Promise.all([
          listCategories(),
          listLanguages(),
        ]);
        setCategories(cats);
        setLanguages(langs);
        await load("refresh");
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    void (async () => {
      try {
        const profile = await getSessionProfile();
        setCanManageLibrary(canManageLibraryRole(profile.user?.role));
        const admin = isSuperadmin(profile);
        setSuperadmin(admin);
        if (admin) {
          const names = await listChurchNames();
          setChurches(names);
          const stored = readSetlistViewChurchId();
          const nextView =
            stored && names.some((row) => row.id === stored)
              ? stored
              : names[0]?.id ?? "";
          if (nextView) {
            writeSetlistViewChurchId(nextView);
            setViewChurchId(nextView);
            // Background hydrate — Songs list effect already paints from IDB.
            void reloadChurchCatalog(nextView).catch(() => undefined);
          }
        }
        const [cats, langs] = await Promise.all([listCategories(), listLanguages()]);
        setCategories(cats);
        setLanguages(langs);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("songs.filterError"));
      }
    })();
  }, []);

  useEffect(() => {
    loadedCount.current = 0;
    void load("reset");
    return subscribeContent(() => {
      void load("refresh");
    });
  }, [debounced, categoryId, languageId, missingOnly]);

  // KeepAlive preserves Songs when visiting Presentation — no refetch on return.

  useEffect(() => {
    const want = params.get("song");
    if (!want) return;
    if (library.some((row) => row.id === want)) {
      setSelectedId(want);
      return;
    }
    if (linkedSong?.id === want) return;
    // Show it in the details sheet only; injecting it into the list made it
    // appear in search results it does not match.
    void getSong(want)
      .then((song) => {
        setLinkedSong(song);
        setSelectedId(song.id);
      })
      .catch(() => undefined);
  }, [library, params, linkedSong?.id]);

  const selected = useMemo(
    () =>
      library.find((song) => song.id === selectedId) ??
      (linkedSong?.id === selectedId ? linkedSong : undefined),
    [library, selectedId, linkedSong],
  );
  const canManageSelected = Boolean(selected && canManageLibrary);
  const detailsRef = useRef<HTMLElement>(null);

  const closeDetails = () => {
    setSelectedId("");
    setLinkedSong(null);
    if (params.has("song")) {
      const next = new URLSearchParams(params);
      next.delete("song");
      setParams(next, { replace: true });
    }
  };
  const closeDetailsRef = useRef(closeDetails);
  closeDetailsRef.current = closeDetails;

  // Close the details sheet on a click outside it (song rows just switch the
  // song) or on Escape. Ignored while the edit / delete dialogs are open.
  useEffect(() => {
    if (!selected || formOpen || deleteOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || !target.isConnected) return;
      if (detailsRef.current?.contains(target)) return;
      if (target.closest("[data-song-row], [role='dialog'], [role='menu'], [role='listbox']")) return;
      if (!detailsRef.current?.offsetParent) return; // page hidden by keep-alive
      closeDetailsRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (!detailsRef.current?.offsetParent) return;
      closeDetailsRef.current();
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [selected?.id, formOpen, deleteOpen]);

  useEffect(() => {
    setYoutubePlaying(false);
  }, [selected?.id]);

  const saveSong = async (values: SongFormValues) => {
    const payload = {
      title: values.title,
      artist: values.artist,
      musical_key: values.key,
      bpm: Number(values.bpm) || null,
      time_signature: values.signature,
      category_id: values.categoryId || null,
      // The language chip is a list filter: only new songs inherit it. Edits keep the song's own language.
      language_id:
        formMode === "edit" && selected ? selected.language_id : languageId,
      youtube_url: values.youtubeUrl,
      duration_seconds: parseDurationSeconds(values.duration),
      lyrics: textToLyricSections(values.lyrics),
    };
    const next =
      formMode === "edit" && selected
        ? await updateSong(selected.id, payload)
        : await createSong(payload);
    setFormOpen(false);
    await load("refresh");
    if (linkedSong?.id === next.id) setLinkedSong(next);
    setSelectedId(next.id);
    toast.success(formMode === "edit" ? "Song updated." : "Song added.");
  };

  const hasMore = library.length < total;
  const insights = useSongInsights(`${viewChurchId}:${total}:${library.length}`);

  useEffect(() => {
    const root = listScrollRef.current;
    const target = loadMoreRef.current;
    if (!root || !target || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void load("more");
      },
      { root, rootMargin: "240px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, library.length]);

  return (
    <main className="h-full overflow-hidden flex flex-col lg:flex-row">
      <section className="flex-1 flex flex-col min-w-0 min-h-0 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start mb-5">
          <div>
            <h2 className="text-[26px] leading-8 font-semibold tracking-[-0.02em] text-on-surface">
              {t("songs.title")}
            </h2>
            <p className="text-on-surface-variant text-[13px] mt-1 tabular-nums">
              {debounced.trim()
                ? t("songs.matchCount", {
                    n: total,
                    q: debounced.trim(),
                  })
                : total === 1
                  ? t("songs.libraryCountOne")
                  : t("songs.libraryCount", { n: total })}
            </p>
            {superadmin ? (
              <label className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2 max-w-xl">
                <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  {t("songs.viewingChurch")}
                </span>
                <select
                  value={viewChurchId}
                  onChange={(event) => {
                    const next = event.target.value;
                    writeSetlistViewChurchId(next);
                    setViewChurchId(next);
                    void refreshWorkspace(next).catch((err) => {
                      const message =
                        err instanceof Error ? err.message : "Could not load songs.";
                      setError(message);
                      toast.error(message);
                    });
                  }}
                  className="bg-surface-container border border-white/10 rounded-lg px-3 py-2 text-sm min-w-[240px]"
                >
                  <option value="">{t("songs.selectChurch")}</option>
                  {churches.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              setFormMode("create");
              setFormOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-primary text-on-primary font-medium text-[13px] h-9 px-4 rounded-lg transition-colors self-start sm:self-auto"
          >
            <Icon name="add" className="text-[16px]" />
            {t("songs.add")}
          </button>
        </div>

        {error ? <p className="mb-4 text-sm text-error">{error}</p> : null}

        <SongInsights
          data={insights}
          missingActive={missingOnly}
          onShowMissing={() => setMissingOnly((prev) => !prev)}
        />

        <div className="relative mb-4">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline text-[16px]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
            ref={searchRef}
            className="w-full h-9 bg-surface-container border border-white/10 rounded-lg pl-9 pr-16 text-[13px] focus:outline-none focus:border-primary/50 [&::-webkit-search-cancel-button]:hidden"
            placeholder="Search by title, artist, key, category, or lyrics..."
            type="search"
            autoComplete="off"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
              aria-label="Clear search"
            >
              <Icon name="close" className="text-[16px]" />
            </button>
          ) : (
            <kbd
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 ui-kbd"
              title="Press / to search"
            >
              /
            </kbd>
          )}
        </div>

        <div className="flex flex-wrap gap-3 mb-4 items-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-on-surface-variant mr-1">
              {t("songs.language")}
            </span>
            <button
              type="button"
              onClick={() => setLanguageId(null)}
              className={`h-7 px-3 rounded-full border text-xs font-medium transition-colors ${
                !languageId
                  ? "border-primary/50 bg-primary/10 text-on-surface"
                  : "border-white/10 hover:border-white/20 text-on-surface-variant"
              }`}
            >
              {t("songs.all")}
            </button>
            {languages.map((lang) => (
              <button
                key={lang.id}
                type="button"
                onClick={() =>
                  setLanguageId((prev) => (prev === lang.id ? null : lang.id))
                }
                className={`h-7 px-3 rounded-full border text-xs font-medium transition-colors ${
                  languageId === lang.id
                    ? "border-primary/50 bg-primary/10 text-on-surface"
                    : "border-white/10 hover:border-white/20 text-on-surface-variant"
                }`}
              >
                {lang.name}
              </button>
            ))}
          </div>
          <div className="hidden sm:block h-4 w-px bg-white/10 mx-1 self-center" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-on-surface-variant mr-1">
              {t("songs.categories")}
            </span>
            {categories.map((cat) => {
              const visual = categoryVisual[categoryTone(cat.color)];
              return (
              <button
                key={cat.id}
                type="button"
                onClick={() =>
                  setCategoryId((prev) => (prev === cat.id ? null : cat.id))
                }
                className={`h-7 px-3 rounded-full border text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                  categoryId === cat.id
                    ? visual.chip
                    : "border-white/10 hover:border-white/20 text-on-surface-variant"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${visual.bar}`} />
                {cat.name}
              </button>
            );
            })}
          </div>
          {missingOnly ? (
            <button
              type="button"
              onClick={() => setMissingOnly(false)}
              aria-label="Remove missing lyrics filter"
              className="h-7 px-3 rounded-full border text-xs font-medium inline-flex items-center gap-1.5 border-primary/50 bg-primary/10 text-on-surface"
            >
              Missing lyrics
              <Icon name="close" className="text-[12px]" />
            </button>
          ) : null}
          {languageId || categoryId || query || missingOnly ? (
            <button
              type="button"
              onClick={() => {
                setLanguageId(null);
                setCategoryId(null);
                setMissingOnly(false);
                setQuery("");
              }}
              className="ml-auto h-7 px-2.5 rounded-md text-xs text-on-surface-variant hover:text-on-surface hover:bg-white/5 inline-flex items-center gap-1"
            >
              <Icon name="close" className="text-[14px]" />
              Clear filters
            </button>
          ) : null}
        </div>

        <div
          ref={listScrollRef}
          className="flex-1 min-h-0 overflow-auto card-surface rounded-xl border border-white/5 custom-scrollbar"
        >
          {loading ? (
            <TableSkeleton />
          ) : (
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead className="sticky top-0 bg-surface-container-high z-10">
                <tr className="border-b border-white/5">
                  {["Title", "Artist", "Key", "Last Used", "Category"].map((col) => (
                    <th
                      key={col}
                      className={`px-4 sm:px-5 h-9 text-[12px] font-medium text-on-surface-variant ${
                        col === "Key" ? "text-center" : ""
                      }`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {library.map((song) => {
                  const isSelected = song.id === selected?.id;
                  return (
                    <tr
                      key={song.id}
                      data-song-row
                      onClick={() => {
                        setSelectedId(song.id);
                        setParams({ song: song.id }, { replace: true });
                      }}
                      tabIndex={0}
                      aria-selected={isSelected}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        setSelectedId(song.id);
                        setParams({ song: song.id }, { replace: true });
                      }}
                      className={`group cursor-pointer transition-colors outline-none focus-visible:bg-white/5 ${
                        isSelected
                          ? "bg-primary/10 shadow-[inset_2px_0_0_var(--mc-primary)]"
                          : "hover:bg-white/[0.03]"
                      }`}
                    >
                      <td className="px-4 sm:px-5 py-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <SongThumb
                            youtubeUrl={song.youtube_url}
                            title={song.title}
                            size="sm"
                          />
                          <div className="font-medium text-[14px] text-on-surface truncate">
                            {song.title}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-5 py-2 text-sm text-on-surface-variant">
                        {song.artist || "—"}
                      </td>
                      <td className="px-4 sm:px-5 py-2 text-center">
                        <span className="inline-flex min-w-7 justify-center px-1.5 py-0.5 rounded-md border border-white/10 font-mono text-[11px] text-on-surface">
                          {song.musical_key || "—"}
                        </span>
                      </td>
                      <td className="px-4 sm:px-5 py-2 text-sm text-on-surface-variant">
                        {formatRelative(song.last_used_at)}
                      </td>
                      <td className="px-4 sm:px-5 py-2">
                        <span
                          className={`text-xs px-2 py-1 rounded-md border ${
                            song.category
                              ? categoryVisual[categoryTone(song.category.color)].chip
                              : "bg-surface-container-highest text-on-surface-variant border-transparent"
                          }`}
                        >
                          {song.category?.name || t("songs.uncategorized")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {library.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-16 text-center text-on-surface-variant text-sm"
                    >
                      <Icon name="music_note" className="text-[20px] text-outline" />
                      <p className="mt-3 text-on-surface font-medium">
                        {debounced.trim()
                          ? `No songs match “${debounced.trim()}”.`
                          : languageId || categoryId || missingOnly
                            ? "No songs match these filters."
                            : "No songs found. Add one to start your library."}
                      </p>
                      {debounced.trim() || languageId || categoryId || missingOnly ? (
                        <button
                          type="button"
                          onClick={() => {
                            setLanguageId(null);
                            setCategoryId(null);
                            setMissingOnly(false);
                            setQuery("");
                          }}
                          className="mt-3 text-[13px] text-primary hover:underline"
                        >
                          Clear search and filters
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
          {hasMore && !loading ? (
            <div ref={loadMoreRef} className="p-4 flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void load("more")}
                className="px-4 py-2 rounded-lg border border-white/10 text-sm hover:bg-white/5 disabled:opacity-50"
              >
                {loadingMore ? (
                  <RowsSkeleton rows={2} className="w-72" />
                ) : (
                  `Load more (${library.length} of ${total})`
                )}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {selected ? (
      <aside ref={detailsRef} aria-label="Song details" className="w-full lg:w-[380px] lg:max-w-[380px] h-auto lg:h-full shrink-0 bg-surface-container-low border-t lg:border-t-0 lg:border-l border-white/5 p-4 sm:p-6 overflow-y-auto custom-scrollbar flex flex-col gap-5 max-h-[45vh] lg:max-h-none">
          <>
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <h3 className="text-[20px] font-semibold tracking-[-0.015em] text-on-surface leading-tight">
                  {selected.title}
                </h3>
                <p className="text-on-surface-variant text-[13px] mt-1">
                  {selected.artist || "Unknown artist"}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {canManageSelected ? (
                  <>
                <button
                  type="button"
                  onClick={() => {
                    setFormMode("edit");
                    setFormOpen(true);
                  }}
                  className="h-8 px-3 rounded-lg border border-white/10 bg-surface-container hover:bg-surface-container-high text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors"
                  aria-label="Edit song"
                >
                  <Icon name="edit" className="text-[14px]" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-on-surface-variant hover:bg-error/10 hover:text-error transition-colors"
                  aria-label="Delete song"
                  title="Delete song"
                >
                  <Icon name="delete" className="text-[16px]" />
                </button>
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={closeDetails}
                  className="h-8 w-8 rounded-lg inline-flex items-center justify-center text-on-surface-variant hover:bg-white/5 hover:text-on-surface transition-colors"
                  aria-label="Close song details"
                  title="Close (Esc)"
                >
                  <Icon name="close" className="text-[16px]" />
                </button>
              </div>
            </div>

            {selected.youtube_url ? (
              <SongThumb
                youtubeUrl={selected.youtube_url}
                title={selected.title}
                size="lg"
                playing={youtubePlaying}
                onPlayingChange={setYoutubePlaying}
              />
            ) : null}

            <dl className="grid grid-cols-[110px_1fr] gap-y-2.5 text-[13px] pb-5 border-b border-white/5">
              {[
                ["Key", selected.musical_key || "—"],
                ["BPM", selected.bpm ?? "—"],
                ["Time signature", selected.time_signature ?? "—"],
                ["Length", formatDuration(selected.duration_seconds)],
                ["Category", selected.category?.name || t("songs.uncategorized")],
                ["Last used", formatRelative(selected.last_used_at)],
              ].map(([label, value]) => (
                <div key={String(label)} className="contents">
                  <dt className="text-on-surface-variant">{label}</dt>
                  <dd className="text-on-surface tabular-nums truncate">{value}</dd>
                </div>
              ))}
            </dl>

            <div>
              <div className="flex justify-between mb-3">
                <span className="text-[12px] font-medium text-on-surface-variant">
                  Lyrics
                </span>
              </div>
              <div className="space-y-4 text-[15px] text-on-surface">
                {selected.lyric_sections?.length ? (
                  coerceLyricSections(selected.lyric_sections).map((block, index) => (
                    <div key={`${block.section}-${index}`}>
                      <div className="text-[11px] font-medium text-primary mb-1">
                        {block.section}
                      </div>
                      <ChordLyricPreview content={block.content || ""} />
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-on-surface-variant">
                    No lyrics preview available for this song.
                  </p>
                )}
              </div>
            </div>
            {selected.youtube_url ? (
              <button
                type="button"
                onClick={() => setYoutubePlaying(true)}
                className="w-full h-9 rounded-lg border border-white/10 hover:bg-white/5 flex items-center justify-center gap-2 transition-colors"
              >
                <Icon name="play_circle" className="text-[16px] text-primary" />
                <span className="text-sm font-medium">
                  {youtubePlaying ? "Playing in app" : "Play in app"}
                </span>
              </button>
            ) : null}
          </>
      </aside>
      ) : null}

      <SongFormModal
        open={formOpen}
        mode={formMode}
        initialValues={formMode === "edit" && selected ? toInput(selected) : undefined}
        onClose={() => setFormOpen(false)}
        onSubmit={async (values) => {
          try {
            await saveSong(values);
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Could not save song.";
            setError(message);
            toast.error(message);
            throw err;
          }
        }}
      />

      <ConfirmDialog
        open={deleteOpen && Boolean(selected)}
        title="Delete Song?"
        description={`Are you sure you want to delete "${selected?.title ?? ""}"? This action cannot be undone.`}
        highlight={selected ? `"${selected.title}"` : undefined}
        onClose={() => setDeleteOpen(false)}
        onConfirm={async () => {
          if (!selected) return;
          try {
            await deleteSong(selected.id);
            setDeleteOpen(false);
            closeDetails();
            await load("refresh");
            toast.success("Song deleted.");
          } catch (err) {
            const message =
              err instanceof Error ? err.message : "Could not delete song.";
            setError(message);
            toast.error(message);
            throw err;
          }
        }}
      />
    </main>
  );
}
