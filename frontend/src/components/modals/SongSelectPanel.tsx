import { useEffect, useMemo, useState } from "react";
import { listSongs } from "../../lib/api";
import { formatDuration, splitLyricLines } from "../../lib/helpers";
import { PAGE_SIZE, type Song } from "../../lib/types";
import SongThumb from "../SongThumb";
import { TableSkeleton } from "../Skeleton";
import { newServiceItem, type ServiceItem } from "./serviceItem";

type SongSelectPanelProps = {
  setlistName: string;
  onBack: () => void;
  onClose: () => void;
  onAdd: (item: ServiceItem) => void;
};

export default function SongSelectPanel({
  setlistName,
  onBack,
  onClose,
  onAdd,
}: SongSelectPanelProps) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [songs, setSongs] = useState<Song[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

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
      if (!append) setSelectedId(page.items[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load songs.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    void load(0, false);
  }, [debounced]);

  const selected = useMemo(
    () => songs.find((song) => song.id === selectedId) ?? songs[0],
    [songs, selectedId],
  );

  const addSong = (song: Song) => {
    onAdd(
      newServiceItem({
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
      }),
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <button
        type="button"
        onClick={onClose}
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
              onClick={onBack}
              className="font-semibold tracking-[0.05em] text-[12px] text-on-surface-variant uppercase"
            >
              {setlistName}
            </button>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="font-semibold tracking-[0.05em] text-[12px] text-primary uppercase">
              Add Song
            </span>
          </div>
          <h2 className="text-[28px] font-bold text-on-surface">Select Song</h2>
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
                const active = song.id === selected?.id;
                return (
                  <div
                    key={song.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(song.id)}
                    className={`rounded-xl p-4 flex items-center justify-between cursor-pointer gap-3 ${
                      active
                        ? "glass-panel border-primary/30 bg-primary/10 relative overflow-hidden"
                        : "border border-transparent hover:bg-white/5"
                    }`}
                  >
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
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-sm hidden sm:block">
                        {song.musical_key || "—"}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          addSong(song);
                        }}
                        className="w-8 h-8 rounded-full text-primary hover:bg-primary/20"
                      >
                        <span className="material-symbols-outlined text-sm">add</span>
                      </button>
                    </div>
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
                      {splitLyricLines(block.content).join("\n")}
                    </p>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => addSong(selected)}
                  className="w-full py-3.5 bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold rounded-xl"
                >
                  Add to Setlist
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
