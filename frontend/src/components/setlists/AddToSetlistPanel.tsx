import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../Icon";
import SongThumb from "../SongThumb";
import { SearchField, SectionLabel } from "../ui";
import { listSongs } from "../../lib/api";
import { formatDuration } from "../../lib/helpers";
import type { Song } from "../../lib/types";
import type { ServiceItemKind } from "../modals/serviceItem";
import { ITEM_TYPES } from "./RunOfShow";
import { SongResultsSkeleton } from "./Skeletons";

const OTHER_KINDS: ServiceItemKind[] = ["song", "sermon", "scripture", "media", "roster"];

type Props = {
  /** Songs shown before the operator types a search. */
  suggestions: Song[];
  /** Song id -> position (1-based) already in this setlist. */
  inSetlist: Record<string, number>;
  onAddSong: (song: Song) => void;
  onOpenFlow: (kind: ServiceItemKind) => void;
};

export default function AddToSetlistPanel({
  suggestions,
  inSetlist,
  onAddSong,
  onOpenFlow,
}: Props) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Song[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      void listSongs({ query: q, limit: 8 })
        .then((page) => {
          if (!cancelled) setResults(page.items);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);

  const songs = results ?? suggestions;

  return (
    <aside
      aria-label="Add to setlist"
      className="flex-1 flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l border-white/5 bg-surface-container-lowest"
    >
      <div className="px-5 pt-4 pb-3">
        <h2 className="text-[13px] font-semibold text-on-surface">Add to setlist</h2>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search songs"
          className="mt-3 w-full min-w-0"
        />
      </div>
      <div className="px-2">
        <p className="px-3 pb-1 text-[12px] text-on-surface-variant">
          {results ? "Results" : "From the library"}
        </p>
        {searching ? <SongResultsSkeleton /> : null}
        <ul role="list" hidden={searching}>
          {songs.map((song) => {
            const number = inSetlist[song.id];
            return (
              <li
                key={song.id}
                className="group flex items-center gap-3 h-12 px-3 rounded-lg hover:bg-surface-container"
              >
                <SongThumb youtubeUrl={song.youtube_url} title={song.title} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-on-surface truncate">{song.title}</p>
                  <p className="text-[11px] text-on-surface-variant truncate">
                    {song.artist || "Unknown"}
                    {song.duration_seconds ? ` · ${formatDuration(song.duration_seconds)}` : ""}
                  </p>
                </div>
                {number ? (
                  <span
                    className="text-[11px] text-outline tabular-nums"
                    title={`Already #${number} in this setlist`}
                  >
                    #{number}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onAddSong(song)}
                  aria-label={`Add ${song.title} to setlist`}
                  title={`Add ${song.title} to setlist`}
                  className="ui-icon-btn text-primary"
                >
                  <Icon name="add" className="text-[16px]" />
                </button>
              </li>
            );
          })}
        </ul>
        {songs.length === 0 && !searching ? (
          <p className="px-3 py-3 text-[12px] text-on-surface-variant">
            {results ? `No songs match “${search.trim()}”.` : "Add songs in the library, then pick them here."}
          </p>
        ) : null}
        <Link
          to="/songs"
          className="flex items-center gap-1 px-3 py-2 text-[12px] text-on-surface-variant hover:text-primary"
        >
          Open song library
          <Icon name="chevron_right" className="text-[13px]" />
        </Link>
      </div>
      <div className="mx-5 my-3 border-t border-white/5" />
      <div className="px-5 pb-5">
        <SectionLabel>Other items</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          {OTHER_KINDS.map((kind) => {
            const type = ITEM_TYPES[kind];
            const label = kind === "song" ? "Pick songs" : type.label;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => onOpenFlow(kind)}
                className="ui-btn ui-btn-secondary justify-start"
              >
                <span className={`w-5 h-5 rounded flex items-center justify-center ${type.tint}`}>
                  <Icon name={type.icon} className="text-[12px]" />
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
