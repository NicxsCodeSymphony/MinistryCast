import { useMemo, useState } from "react";
import { newServiceItem, type ServiceItem } from "./serviceItem";

type CatalogSong = {
  id: string;
  title: string;
  artist: string;
  key: string;
  bpm: number;
  meter: string;
  ccli?: string;
  length: string;
  favorite?: boolean;
  topCcli?: boolean;
  lyrics: { section: string; lines: string[]; chorus?: boolean }[];
};

const catalog: CatalogSong[] = [
  {
    id: "glorious-day",
    title: "Glorious Day",
    artist: "Passion, Kristian Stanfill",
    key: "D",
    bpm: 110,
    meter: "4/4",
    ccli: "7081388",
    length: "04:55",
    favorite: true,
    topCcli: true,
    lyrics: [
      {
        section: "Verse 1",
        lines: [
          "I was buried beneath my shame",
          "Who could carry that kind of weight?",
          "It was my tomb",
          "'Til I met You",
        ],
      },
      {
        section: "Verse 2",
        lines: [
          "I was breathing but not alive",
          "All my failures I tried to hide",
          "It was my tomb",
          "'Til I met You",
        ],
      },
      {
        section: "Chorus 1",
        chorus: true,
        lines: [
          "You called my name",
          "And I ran out of that grave",
          "Out of the darkness",
          "Into Your glorious day",
        ],
      },
      {
        section: "Verse 3",
        lines: [
          "Now Your mercy has saved my soul",
          "Now Your freedom is all that I know",
          "The old made new",
          "Jesus, when I met You",
        ],
      },
    ],
  },
  {
    id: "living-hope",
    title: "Living Hope",
    artist: "Phil Wickham",
    key: "Eb",
    bpm: 71,
    meter: "4/4",
    ccli: "7106807",
    length: "05:28",
    favorite: true,
    topCcli: true,
    lyrics: [
      {
        section: "Verse 1",
        lines: [
          "How great the chasm that lay between us",
          "How high the mountain I could not climb",
          "In desperation I turned to heaven",
          "And spoke Your name into the night",
        ],
      },
      {
        section: "Chorus",
        chorus: true,
        lines: [
          "Hallelujah, praise the One who set me free",
          "Hallelujah, death has lost its grip on me",
          "You have broken every chain",
          "There's salvation in Your name",
        ],
      },
    ],
  },
  {
    id: "graves",
    title: "Graves Into Gardens",
    artist: "Elevation Worship",
    key: "B",
    bpm: 70,
    meter: "4/4",
    ccli: "7138219",
    length: "06:02",
    topCcli: true,
    lyrics: [
      {
        section: "Verse 1",
        lines: [
          "I searched the world but it couldn't fill me",
          "Man's empty praise and treasures that fade",
          "Are never enough",
        ],
      },
      {
        section: "Chorus",
        chorus: true,
        lines: [
          "You turn mourning to dancing",
          "You give beauty for ashes",
          "You turn shame into glory",
          "You're the only one who can",
        ],
      },
    ],
  },
  {
    id: "build-my-life",
    title: "Build My Life",
    artist: "Housefires",
    key: "G",
    bpm: 68,
    meter: "4/4",
    ccli: "7070345",
    length: "05:10",
    favorite: true,
    lyrics: [
      {
        section: "Verse 1",
        lines: [
          "Worthy of every song we could ever sing",
          "Worthy of all the praise we could ever bring",
          "Worthy of every breath we could ever breathe",
          "We live for You",
        ],
      },
      {
        section: "Chorus",
        chorus: true,
        lines: [
          "Holy, there is no one like You",
          "There is none besides You",
          "Open up my eyes in wonder",
        ],
      },
    ],
  },
  {
    id: "way-maker",
    title: "Way Maker",
    artist: "Sinach",
    key: "Ab",
    bpm: 68,
    meter: "4/4",
    ccli: "7115744",
    length: "06:12",
    topCcli: true,
    lyrics: [
      {
        section: "Chorus",
        chorus: true,
        lines: [
          "Way maker, miracle worker",
          "Promise keeper, light in the darkness",
          "My God, that is who You are",
        ],
      },
    ],
  },
  {
    id: "goodness",
    title: "Goodness of God",
    artist: "Bethel Music",
    key: "G",
    bpm: 63,
    meter: "4/4",
    ccli: "7117726",
    length: "04:56",
    favorite: true,
    topCcli: true,
    lyrics: [
      {
        section: "Chorus",
        chorus: true,
        lines: [
          "All my life You have been faithful",
          "All my life You have been so, so good",
          "With every breath that I am able",
          "I will sing of the goodness of God",
        ],
      },
    ],
  },
];

type FilterId = "all" | "favorites" | "ccli";

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
  const [filter, setFilter] = useState<FilterId>("all");
  const [selectedId, setSelectedId] = useState(catalog[0].id);

  const filtered = useMemo(() => {
    return catalog
      .filter((song) => {
        if (filter === "favorites" && !song.favorite) return false;
        if (filter === "ccli" && !song.topCcli) return false;
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        const inLyrics = song.lyrics.some((block) =>
          block.lines.some((line) => line.toLowerCase().includes(q)),
        );
        return (
          song.title.toLowerCase().includes(q) ||
          song.artist.toLowerCase().includes(q) ||
          inLyrics
        );
      })
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [query, filter]);

  const selected =
    filtered.find((song) => song.id === selectedId) ?? filtered[0];

  const addSelected = () => {
    if (!selected) return;
    onAdd(
      newServiceItem({
        title: selected.title,
        subtitle: `${selected.artist} • Standard Arrangement`,
        duration: selected.length,
        label: "Song",
        icon: "music_note",
        accent: "primary",
        border: "primary",
        keyBadge: `Key: ${selected.key}`,
      }),
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-surface-container-high/50 flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-white/10 transition-colors border border-white/5"
        aria-label="Close"
      >
        <span className="material-symbols-outlined">close</span>
      </button>

      <header className="px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 bg-surface-container-lowest/30 shrink-0 pr-16">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              type="button"
              onClick={onBack}
              className="font-semibold tracking-[0.05em] text-[12px] leading-4 text-on-surface-variant uppercase hover:text-primary transition-colors"
            >
              {setlistName}
            </button>
            <span className="material-symbols-outlined text-on-surface-variant text-sm">
              chevron_right
            </span>
            <span className="font-semibold tracking-[0.05em] text-[12px] leading-4 text-primary uppercase">
              Add Song
            </span>
          </div>
          <h2 className="text-[28px] leading-9 md:text-[32px] md:leading-10 font-bold text-on-surface">
            Select Song
          </h2>
        </div>
        <div className="w-full md:w-96 glass-panel rounded-xl flex items-center px-4 py-2.5 soft-glow-focus transition-all duration-200 border-white/10 bg-surface-container-high/50">
          <span className="material-symbols-outlined text-on-surface-variant mr-3">
            search
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-transparent border-none outline-none text-base text-on-surface w-full placeholder:text-on-surface-variant/50 focus:ring-0 p-0"
            placeholder="Search by title, artist, or lyrics..."
            type="search"
          />
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
        <div className="flex-1 flex flex-col border-r border-white/10 min-w-0 min-h-0">
          <div className="px-6 py-3 border-b border-white/10 flex gap-2 overflow-x-auto hide-scrollbar bg-surface-container-lowest/20">
            {(
              [
                ["all", "All Songs"],
                ["favorites", "My Favorites"],
                ["ccli", "Top CCLI"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`px-4 py-1.5 rounded-full text-sm shrink-0 border transition-colors ${
                  filter === id
                    ? "glass-panel text-primary border-primary/50 bg-primary/10 font-medium"
                    : "glass-panel text-on-surface-variant hover:text-on-surface border-white/10 bg-surface-container/50"
                }`}
              >
                {label}
              </button>
            ))}
            <div className="flex-1" />
            <span className="text-on-surface-variant flex items-center gap-1 text-[12px] font-medium shrink-0">
              <span className="material-symbols-outlined text-sm">sort</span>
              Title
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-6 gap-2 flex flex-col custom-scrollbar">
            {filtered.map((song) => {
              const active = song.id === selected?.id;
              return (
                <div
                  key={song.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(song.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(song.id);
                    }
                  }}
                  className={`rounded-xl p-4 flex items-center justify-between cursor-pointer transition-all duration-200 ${
                    active
                      ? "glass-panel border-primary/30 bg-primary/10 relative overflow-hidden"
                      : "border border-transparent hover:border-white/10 hover:bg-white/5"
                  }`}
                >
                  {active ? (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                  ) : null}
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded bg-surface-container flex items-center justify-center border border-white/10 shrink-0">
                      <span
                        className={`material-symbols-outlined ${
                          active
                            ? "text-on-surface-variant"
                            : "text-on-surface-variant/50"
                        }`}
                      >
                        music_note
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h3
                        className={`text-base leading-tight truncate ${
                          active
                            ? "font-semibold text-on-surface"
                            : "font-medium text-on-surface"
                        }`}
                      >
                        {song.title}
                      </h3>
                      <p className="text-sm text-on-surface-variant truncate">
                        {song.artist}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-right hidden sm:block">
                      <span className="block text-[12px] font-medium text-on-surface-variant uppercase tracking-wider">
                        Key
                      </span>
                      <span className="text-base font-medium text-on-surface">
                        {song.key}
                      </span>
                    </div>
                    <div className="text-right hidden sm:block">
                      <span className="block text-[12px] font-medium text-on-surface-variant uppercase tracking-wider">
                        BPM
                      </span>
                      <span className="text-base font-medium text-on-surface">
                        {song.bpm}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedId(song.id);
                        onAdd(
                          newServiceItem({
                            title: song.title,
                            subtitle: `${song.artist} • Standard Arrangement`,
                            duration: song.length,
                            label: "Song",
                            icon: "music_note",
                            accent: "primary",
                            border: "primary",
                            keyBadge: `Key: ${song.key}`,
                          }),
                        );
                      }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                        active
                          ? "bg-primary/20 text-primary hover:bg-primary/30"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                      aria-label={`Add ${song.title}`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        add
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 ? (
              <p className="text-sm text-on-surface-variant text-center py-12">
                No songs match that search.
              </p>
            ) : null}
          </div>
        </div>

        <div className="hidden lg:flex w-[400px] flex-col bg-surface-container-lowest/30 relative z-20 shrink-0 min-h-0">
          {selected ? (
            <>
              <div className="p-6 border-b border-white/10 shrink-0">
                <h3 className="text-2xl font-bold text-on-surface mb-1">
                  {selected.title}
                </h3>
                <p className="text-sm text-on-surface-variant mb-4">
                  {selected.artist}
                  {selected.ccli ? ` • CCLI #${selected.ccli}` : ""}
                </p>
                <div className="flex gap-3">
                  <div className="flex-1 bg-surface-container/50 rounded-lg p-2 border border-white/5 text-center">
                    <span className="block text-[12px] font-semibold tracking-[0.05em] text-on-surface-variant mb-1 uppercase">
                      Default Key
                    </span>
                    <span className="text-base font-semibold text-primary">
                      {selected.key}
                    </span>
                  </div>
                  <div className="flex-1 bg-surface-container/50 rounded-lg p-2 border border-white/5 text-center">
                    <span className="block text-[12px] font-semibold tracking-[0.05em] text-on-surface-variant mb-1 uppercase">
                      Tempo
                    </span>
                    <span className="text-base font-semibold text-on-surface">
                      {selected.bpm} BPM
                    </span>
                  </div>
                  <div className="flex-1 bg-surface-container/50 rounded-lg p-2 border border-white/5 text-center">
                    <span className="block text-[12px] font-semibold tracking-[0.05em] text-on-surface-variant mb-1 uppercase">
                      Meter
                    </span>
                    <span className="text-base font-semibold text-on-surface">
                      {selected.meter}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar min-h-0">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-[12px] font-semibold tracking-[0.05em] text-on-surface-variant uppercase">
                    Lyrics Preview
                  </h4>
                  <span className="text-primary text-[12px] font-medium">
                    Edit Arrangement
                  </span>
                </div>
                <div className="space-y-6">
                  {selected.lyrics.map((block) => (
                    <div
                      key={block.section}
                      className={
                        block.chorus
                          ? "pl-4 border-l-2 border-primary/50 py-1"
                          : ""
                      }
                    >
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase mb-2 ${
                          block.chorus
                            ? "bg-primary/20 text-primary"
                            : "bg-white/10 text-on-surface-variant"
                        }`}
                      >
                        {block.section}
                      </span>
                      <p
                        className={`text-base leading-relaxed font-serif whitespace-pre-line ${
                          block.chorus
                            ? "text-on-surface font-medium"
                            : "text-on-surface"
                        }`}
                      >
                        {block.lines.join("\n")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4 border-t border-white/10 bg-surface-container-lowest/50 shrink-0">
                <button
                  type="button"
                  onClick={addSelected}
                  className="w-full py-3.5 bg-gradient-to-r from-primary to-primary-container text-on-primary text-lg font-bold rounded-xl hover:opacity-90 transition-opacity active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                >
                  <span className="material-symbols-outlined">add_circle</span>
                  Add to Setlist
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-on-surface-variant p-6 text-center">
              Select a song to preview lyrics.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
