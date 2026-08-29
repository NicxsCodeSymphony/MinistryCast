import { useEffect, useMemo, useRef, useState } from "react";
import { listSongs } from "../../lib/api";
import { subscribeContent } from "../../lib/offline/live";
import { formatDuration, splitLyricLines } from "../../lib/helpers";
import { useUnsavedDraft } from "../../lib/useUnsavedDraft";
import { PAGE_SIZE, type Song } from "../../lib/types";
import SongThumb from "../SongThumb";
import { TableSkeleton } from "../Skeleton";
import { newServiceItem, type ServiceItem } from "./serviceItem";

type SongSelectPanelProps = {
  setlistName: string;
  onBack: () => void;
  onClose: () => void;
  onAdd: (item: ServiceItem) => void | Promise<void>;
  onAddMany?: (items: ServiceItem[]) => void | Promise<void>;
  existingSongNumbers?: Record<string, number>;
  onRemoveSongs?: (songIds: string[]) => void | Promise<void>;
  registerRequestClose?: (fn: () => void) => void;
};

function toServiceItem(song: Song): ServiceItem {
  return newServiceItem({
    itemType: "song",
    songId: song.id,
    title: song.title,
    subtitle: `${song.artist || "Unknown"} • Standard Arrangement`,
    duration: formatDuration(song.duration_seconds),
    label: "Song",
    icon: "music_note",
    accent: "primary",
    border: "primary",
    keyBadge: song.musical_key ? `Key: ${song.musical_key}` : undefined,
  });
}

export default function SongSelectPanel({
  setlistName,
  onBack,
  onClose,
  onAdd,
  onAddMany,
  existingSongNumbers = {},
  onRemoveSongs,
  registerRequestClose,
}: SongSelectPanelProps) {
  const originIds = useMemo(
    () =>
      Object.keys(existingSongNumbers).sort(
        (a, b) => existingSongNumbers[a] - existingSongNumbers[b],
      ),
    [existingSongNumbers],
  );
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [previewId, setPreviewId] = useState("");
  const [pickedIds, setPickedIds] = useState<string[]>([]);
  const [keptIds, setKeptIds] = useState<string[]>(originIds);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const persistSave = useRef<() => Promise<boolean>>(async () => true);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  const load = async (nextOffset: number, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const page = await listSongs({
        query: debounced,
        offset: nextOffset,
        limit: PAGE_SIZE,
      });
      setTotal(page.total);
      setOffset(nextOffset);
      setSongs((prev) => (append ? [...prev, ...page.items] : page.items));
      if (!append) setPreviewId(page.items[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load songs.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void load(0, false);
    return subscribeContent(() => {
      void load(0, false);
    });
  }, [debounced]);

  const selected = useMemo(
    () => songs.find((song) => song.id === previewId) ?? songs[0],
    [songs, previewId],
  );

  const orderedIds = useMemo(() => {
    const kept = originIds.filter((id) => keptIds.includes(id));
    return [...kept, ...pickedIds.filter((id) => !kept.includes(id))];
  }, [keptIds, originIds, pickedIds]);

  const numberById = useMemo(() => {
    const next: Record<string, number> = {};
    orderedIds.forEach((id, index) => {
      next[id] = index + 1;
    });
    return next;
  }, [orderedIds]);

  const removedIds = originIds.filter((id) => !keptIds.includes(id));
  const dirty = pickedIds.length > 0 || removedIds.length > 0;

  const commit = async () => {
    if (saving) return false;
    const toRemove = originIds.filter((id) => !keptIds.includes(id));
    const toKeep = originIds.filter((id) => keptIds.includes(id));
    const toAddIds = [...pickedIds];
    setSaving(true);
    try {
      if (toRemove.length) await onRemoveSongs?.(toRemove);
      const byId = new Map(songs.map((song) => [song.id, song]));
      const toAdd = toAddIds
        .map((id) => byId.get(id))
        .filter((song): song is Song => Boolean(song));
      if (toAdd.length) {
        const items = toAdd.map(toServiceItem);
        if (onAddMany) await onAddMany(items);
        else for (const item of items) await onAdd(item);
      }
      setPickedIds([]);
      setKeptIds([...toKeep, ...toAddIds]);
      return true;
    } finally {
      setSaving(false);
    }
  };
  persistSave.current = commit;

  const draft = useUnsavedDraft(dirty, {
    enabled: true,
    title: "Unsaved setlist songs",
    description:
      "You changed which songs are on this setlist. Save before you leave, or those changes will be lost.",
    onSave: () => persistSave.current(),
  });

  const requestClose = () => draft.guard(onClose);
  const requestBack = () => draft.guard(onBack);

  useEffect(() => {
    registerRequestClose?.(requestClose);
    return () => registerRequestClose?.(onClose);
  }, [dirty, onClose, registerRequestClose]);

  const togglePick = (song: Song) => {
    setPreviewId(song.id);
    if (originIds.includes(song.id)) {
      setKeptIds((prev) =>
        prev.includes(song.id)
          ? prev.filter((id) => id !== song.id)
          : [...prev, song.id],
      );
      return;
    }
    setPickedIds((prev) =>
      prev.includes(song.id)
        ? prev.filter((id) => id !== song.id)
        : [...prev, song.id],
    );
  };

  const finish = async () => {
    if (!dirty) {
      onClose();
      return;
    }
    const ok = await commit();
    if (ok) draft.bypass(onClose);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {draft.dialog}
      <button
        type="button"
        onClick={requestClose}
        className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-surface-container-high/50 flex items-center justify-center text-on-surface-variant hover:text-on-surface border border-white/5"
        aria-label="Close"
      >
        <span className="material-symbols-outlined">close</span>
      </button>

      <header className="px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 shrink-0 pr-16">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={requestBack}
              className="font-semibold tracking-[0.05em] text-[12px] text-on-surface-variant uppercase"
            >
              {setlistName}
            </button>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="font-semibold tracking-[0.05em] text-[12px] text-primary uppercase">
              Add Song
            </span>
          </div>
          <h2 className="text-[28px] font-bold text-on-surface">Select songs</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            Tap in order. Numbers continue from songs already on the setlist.
            Done saves. Closing without Done asks to save your draft.
          </p>
        </div>
        <div className="w-full md:w-96 glass-panel rounded-xl flex items-center px-4 py-2.5">
          <span className="material-symbols-outlined text-on-surface-variant mr-3">
            search
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-transparent border-none outline-none text-base text-on-surface w-full"
            placeholder="Search by title or artist..."
            type="search"
          />
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
        <div className="flex-1 flex flex-col border-r border-white/10 min-h-0">
          <div className="flex-1 overflow-y-auto p-6 gap-2 flex flex-col custom-scrollbar">
            {error ? <p className="text-sm text-[#ffb4ab]">{error}</p> : null}
            {loading ? <TableSkeleton rows={5} /> : null}
            {!loading &&
              songs.map((song) => {
                const previewing = song.id === selected?.id;
                const badge = numberById[song.id];
                const checked = Boolean(badge);
                return (
                  <div
                    key={song.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => togglePick(song)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        togglePick(song);
                      }
                    }}
                    className={`rounded-xl p-4 flex items-center justify-between cursor-pointer gap-3 ${
                      checked
                        ? "glass-panel border-primary/30 bg-primary/10 relative overflow-hidden"
                        : previewing
                          ? "border border-white/10 bg-white/5"
                          : "border border-transparent hover:bg-white/5"
                    }`}
                  >
                    <span
                      className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 text-[12px] font-bold tabular-nums ${
                        checked
                          ? "bg-primary border-primary text-on-primary"
                          : "border-white/20 text-on-surface-variant/40"
                      }`}
                      title={
                        checked
                          ? originIds.includes(song.id)
                            ? `On setlist · tap to remove`
                            : `Pick ${badge}`
                          : "Not selected"
                      }
                    >
                      {badge ?? ""}
                    </span>
                    <SongThumb
                      youtubeUrl={song.youtube_url}
                      title={song.title}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold truncate">{song.title}</h3>
                      <p className="text-sm text-on-surface-variant truncate">
                        {song.artist || "Unknown"}
                      </p>
                    </div>
                    <span className="text-sm hidden sm:block shrink-0">
                      {song.musical_key || "—"}
                    </span>
                  </div>
                );
              })}
            {!loading && songs.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-12">
                No songs in the library yet.
              </p>
            ) : null}
            {offset + songs.length < total ? (
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void load(offset + PAGE_SIZE, true)}
                className="py-2 text-sm text-primary"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            ) : null}
          </div>
          <div className="lg:hidden p-4 border-t border-white/10">
            <button
              type="button"
              disabled={saving}
              onClick={() => void finish()}
              className="w-full py-3.5 bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold rounded-xl disabled:opacity-50"
            >
              {saving ? "Saving…" : "Done"}
            </button>
          </div>
        </div>

        <div className="hidden lg:flex w-[400px] flex-col shrink-0 min-h-0">
          {selected ? (
            <>
              <div className="p-6 border-b border-white/10 space-y-4">
                <SongThumb
                  youtubeUrl={selected.youtube_url}
                  title={selected.title}
                  size="lg"
                />
                <div>
                  <h3 className="text-2xl font-bold mb-1">{selected.title}</h3>
                  <p className="text-sm text-on-surface-variant">{selected.artist}</p>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar space-y-4">
                {(selected.lyric_sections ?? []).map((block) => (
                  <div key={block.id}>
                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-white/10 mb-2">
                      {block.section}
                    </span>
                    <p className="text-base leading-relaxed whitespace-pre-line">
                      {splitLyricLines(block.content).join("\n") || "—"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-white/10 flex flex-col gap-2">
                {orderedIds.length ? (
                  <p className="text-xs text-on-surface-variant text-center">
                    {orderedIds.length} on setlist
                    {dirty ? " · unsaved" : ""}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void finish()}
                  className="w-full py-3.5 bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold rounded-xl disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Done"}
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-on-surface-variant p-6">
              Select a song to preview lyrics.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
