import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import SongThumb from "../../components/SongThumb";
import ConfirmDialog from "../../components/modals/ConfirmDialog";
import SongFormModal, {
  type SongFormValues,
} from "../../components/modals/SongFormModal";
import { TableSkeleton } from "../../components/Skeleton";
import {
  createSong,
  deleteSong,
  getSong,
  listCategories,
  listLanguages,
  listSongs,
  updateSong,
} from "../../lib/api";
import {
  formatDuration,
  formatRelative,
  lyricsToText,
  parseDurationSeconds,
  textToLyricSections,
} from "../../lib/helpers";
import { categoryTone, categoryVisual } from "../../lib/categoryColor";
import { PAGE_SIZE, type Category, type Language, type Song } from "../../lib/types";
import { usePrefs } from "../../lib/PrefsContext";
import { useSearch } from "../../lib/SearchContext";
import { useToast } from "../../lib/ToastContext";
import { getSessionProfile, isSuperadmin } from "../../lib/auth";
import { subscribeContent } from "../../lib/offline/live";

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
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [languages, setLanguages] = useState<Language[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [languageId, setLanguageId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const { query, setQuery } = useSearch();
  const [debounced, setDebounced] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [youtubePlaying, setYoutubePlaying] = useState(false);
  const [workspaceId, setWorkspaceId] = useState("");
  const [superadmin, setSuperadmin] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(query);
      setOffset(0);
    }, 250);
    return () => window.clearTimeout(id);
  }, [query]);

  const load = async (nextOffset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const page = await listSongs({
        query: debounced,
        categoryId,
        languageId,
        offset: nextOffset,
        limit: PAGE_SIZE,
      });
      setTotal(page.total);
      setOffset(nextOffset);
      setLibrary((prev) => (append ? [...prev, ...page.items] : page.items));
      if (!append) {
        const want = params.get("song");
        const fromUrl = want
          ? page.items.find((row) => row.id === want)
          : undefined;
        setSelectedId(fromUrl?.id ?? page.items[0]?.id ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load songs.");
      toast.error(err instanceof Error ? err.message : "Could not load songs.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const profile = await getSessionProfile();
        setWorkspaceId(profile.church?.id ?? "");
        setSuperadmin(isSuperadmin(profile));
        const [cats, langs] = await Promise.all([listCategories(), listLanguages()]);
        setCategories(cats);
        setLanguages(langs);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load filters.");
      }
    })();
  }, []);

  useEffect(() => {
    void load(0, false);
    return subscribeContent(() => {
      void load(0, false);
    });
  }, [debounced, categoryId, languageId]);

  useEffect(() => {
    const want = params.get("song");
    if (!want) return;
    if (library.some((row) => row.id === want)) {
      setSelectedId(want);
      return;
    }
    void getSong(want)
      .then((song) => {
        setLibrary((prev) =>
          prev.some((row) => row.id === song.id) ? prev : [song, ...prev],
        );
        setSelectedId(song.id);
      })
      .catch(() => undefined);
  }, [library, params]);

  const selected = useMemo(
    () => library.find((song) => song.id === selectedId) ?? library[0],
    [library, selectedId],
  );
  const canManageSelected = Boolean(
    selected && (superadmin || selected.church_id === workspaceId),
  );

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
      language_id: languageId,
      youtube_url: values.youtubeUrl,
      duration_seconds: parseDurationSeconds(values.duration),
      lyrics: textToLyricSections(values.lyrics),
    };
    const next =
      formMode === "edit" && selected
        ? await updateSong(selected.id, payload)
        : await createSong(payload);
    setFormOpen(false);
    await load(0, false);
    setSelectedId(next.id);
    toast.success(formMode === "edit" ? "Song updated." : "Song added.");
  };

  const hasMore = offset + library.length < total;

  return (
    <main className="h-full overflow-hidden flex flex-col lg:flex-row">
      <section className="flex-1 flex flex-col min-w-0 min-h-0 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end mb-6 sm:mb-8">
          <div>
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-[-0.01em] text-on-surface">
              Song Library
            </h2>
            <p className="text-on-surface-variant text-sm mt-1">
              {debounced.trim()
                ? `${total} song${total === 1 ? "" : "s"} match “${debounced.trim()}”`
                : `${total} songs in the shared library`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setFormMode("create");
              setFormOpen(true);
            }}
            className="flex items-center justify-center gap-2 bg-secondary text-on-secondary font-medium text-sm px-6 py-2.5 rounded-full shadow-lg shadow-secondary/20 hover:scale-105 active:scale-95 transition-all self-start sm:self-auto"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            Add Song
          </button>
        </div>

        {error ? <p className="mb-4 text-sm text-[#ffb4ab]">{error}</p> : null}

        <div className="relative mb-4">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
            search
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
            className="w-full bg-surface-container border border-white/10 rounded-lg pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:border-primary/50"
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
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-on-surface-variant opacity-50 mr-1">
              {t("songs.language")}
            </span>
            <button
              type="button"
              onClick={() => setLanguageId(null)}
              className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                !languageId
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-white/5 hover:border-white/20 text-on-surface-variant"
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
                className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                  languageId === lang.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-white/5 hover:border-white/20 text-on-surface-variant"
                }`}
              >
                {lang.name}
              </button>
            ))}
          </div>
          <div className="hidden sm:block h-4 w-px bg-white/10 mx-1 self-center" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-on-surface-variant opacity-50 mr-1">
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
                className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                  categoryId === cat.id
                    ? visual.chip
                    : "border-white/5 hover:border-white/20 text-on-surface-variant"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${visual.bar}`} />
                {cat.name}
              </button>
            );
            })}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto glass-card rounded-xl border border-white/5 custom-scrollbar">
          {loading ? (
            <TableSkeleton />
          ) : (
            <table className="w-full text-left border-collapse min-w-[640px]">
              <thead className="sticky top-0 bg-surface-container-high/90 backdrop-blur-md z-10">
                <tr className="border-b border-white/5">
                  {["Title", "Artist", "Key", "Last Used", "Category"].map((col) => (
                    <th
                      key={col}
                      className={`px-4 sm:px-6 py-4 text-[11px] uppercase tracking-wider text-on-surface-variant opacity-60 font-semibold ${
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
                      onClick={() => {
                        setSelectedId(song.id);
                        setParams({ song: song.id }, { replace: true });
                      }}
                      className={`group cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary/5 border-l-2 border-primary"
                          : "hover:bg-white/5 border-l-2 border-transparent"
                      }`}
                    >
                      <td className="px-4 sm:px-6 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <SongThumb
                            youtubeUrl={song.youtube_url}
                            title={song.title}
                            size="sm"
                          />
                          <div className="font-medium text-sm text-on-surface truncate">
                            {song.title}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-on-surface-variant">
                        {song.artist || "—"}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-center">
                        <span className="px-2 py-0.5 rounded bg-surface-container-highest font-mono text-xs text-on-surface-variant">
                          {song.musical_key || "—"}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-sm text-on-surface-variant">
                        {formatRelative(song.last_used_at)}
                      </td>
                      <td className="px-4 sm:px-6 py-4">
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
                      {debounced.trim()
                        ? `No songs match “${debounced.trim()}”.`
                        : "No songs found. Add one to start your library."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
          {hasMore ? (
            <div className="p-4 flex justify-center">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void load(offset + PAGE_SIZE, true)}
                className="px-4 py-2 rounded-lg border border-white/10 text-sm hover:bg-white/5 disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <aside className="w-full lg:w-[380px] lg:max-w-[380px] h-auto lg:h-full shrink-0 bg-surface-container-low/50 border-t lg:border-t-0 lg:border-l border-white/5 p-4 sm:p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6 max-h-[45vh] lg:max-h-none">
        {selected ? (
          <>
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0">
                <h3 className="text-[clamp(1.25rem,2vw,1.5rem)] font-semibold text-on-surface leading-tight">
                  {selected.title}
                </h3>
                <p className="text-primary text-sm mt-1">
                  {selected.artist || "Unknown"} | Key of {selected.musical_key || "—"}
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
                  className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                  aria-label="Edit song"
                >
                  <span className="material-symbols-outlined">edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="p-2 rounded-lg bg-white/5 hover:bg-error/10 hover:text-error transition-colors"
                  aria-label="Delete song"
                >
                  <span className="material-symbols-outlined">delete</span>
                </button>
                  </>
                ) : null}
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

            <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/5">
              <div className="flex-1 text-center border-r border-white/10">
                <p className="text-[10px] uppercase tracking-wider text-on-surface-variant opacity-50 mb-1">
                  BPM
                </p>
                <p className="text-xl font-semibold">{selected.bpm ?? "—"}</p>
              </div>
              <div className="flex-1 text-center border-r border-white/10">
                <p className="text-[10px] uppercase tracking-wider text-on-surface-variant opacity-50 mb-1">
                  SIG
                </p>
                <p className="text-xl font-semibold">{selected.time_signature ?? "—"}</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-[10px] uppercase tracking-wider text-on-surface-variant opacity-50 mb-1">
                  LENGTH
                </p>
                <p className="text-xl font-semibold">
                  {formatDuration(selected.duration_seconds)}
                </p>
              </div>
            </div>

            <div className="glass-card rounded-xl p-5 border border-white/10 shadow-2xl">
              <div className="flex justify-between mb-4 border-b border-white/5 pb-2">
                <span className="text-[11px] uppercase tracking-wider text-primary font-semibold">
                  Lyrics Preview
                </span>
              </div>
              <div className="space-y-4 text-[15px] text-on-surface">
                {selected.lyric_sections?.length ? (
                  selected.lyric_sections.map((block) => (
                    <div key={block.id}>
                      <div className="opacity-60 text-xs uppercase font-bold tracking-widest text-primary/80 mb-1">
                        {block.section}
                      </div>
                      <p className="leading-relaxed whitespace-pre-line text-on-surface-variant">
                        {block.content || "—"}
                      </p>
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
                className="w-full py-3 rounded-xl border border-white/10 hover:bg-white/5 flex items-center justify-center gap-2 transition-colors"
              >
                <span className="material-symbols-outlined text-primary">play_circle</span>
                <span className="text-sm font-medium">
                  {youtubePlaying ? "Playing in app" : "Play in app"}
                </span>
              </button>
            ) : null}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-on-surface-variant text-center px-4">
            Add a song to see details here.
          </div>
        )}
      </aside>

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
            await load(0, false);
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
