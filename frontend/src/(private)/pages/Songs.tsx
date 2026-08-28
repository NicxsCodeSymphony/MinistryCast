import { useMemo, useState } from "react";
import ConfirmDialog from "../../components/modals/ConfirmDialog";
import SongFormModal, {
  type SongFormValues,
} from "../../components/modals/SongFormModal";

type Song = {
  id: string;
  title: string;
  artist: string;
  key: string;
  lastUsed: string;
  category: string;
  bpm?: number;
  signature?: string;
  length?: string;
  lyrics?: { section: string; lines: string[] }[];
};

const songs: Song[] = [
  {
    id: "1",
    title: "Way Maker",
    artist: "Sinach",
    key: "Ab",
    lastUsed: "2 days ago",
    category: "Worship",
    bpm: 68,
    signature: "4/4",
    length: "6:12",
    lyrics: [
      {
        section: "[Chorus]",
        lines: [
          "Way maker, miracle worker",
          "Promise keeper, light in the darkness",
          "My God, that is who You are",
          "",
          "Way maker, miracle worker",
          "Promise keeper, light in the darkness",
          "My God, that is who You are",
        ],
      },
      {
        section: "[Verse 1]",
        lines: [
          "You are here, moving in our midst",
          "I worship You, I worship You",
        ],
      },
    ],
  },
  {
    id: "2",
    title: "Gratitude",
    artist: "Brandon Lake",
    key: "B",
    lastUsed: "1 week ago",
    category: "Worship",
    bpm: 72,
    signature: "4/4",
    length: "5:44",
  },
  {
    id: "3",
    title: "Goodness of God",
    artist: "Bethel Music",
    key: "G",
    lastUsed: "Yesterday",
    category: "Worship",
    bpm: 63,
    signature: "4/4",
    length: "4:56",
  },
  {
    id: "4",
    title: "Build My Life",
    artist: "Housefires",
    key: "G",
    lastUsed: "3 weeks ago",
    category: "Praise",
    bpm: 70,
    signature: "4/4",
    length: "5:10",
  },
  {
    id: "5",
    title: "10,000 Reasons",
    artist: "Matt Redman",
    key: "E",
    lastUsed: "1 month ago",
    category: "Hymns",
    bpm: 72,
    signature: "4/4",
    length: "5:20",
  },
  {
    id: "6",
    title: "Lion and the Lamb",
    artist: "Bethel Music",
    key: "B",
    lastUsed: "2 months ago",
    category: "Praise",
    bpm: 90,
    signature: "4/4",
    length: "4:40",
  },
];

const languages = ["English", "Tagalog", "Visayan"] as const;
const defaultCategories = ["Worship", "Praise", "Hymns"] as const;

function lyricsToText(lyrics?: Song["lyrics"]) {
  if (!lyrics?.length) return "";
  return lyrics
    .map((block) => `${block.section}\n${block.lines.join("\n")}`)
    .join("\n\n");
}

function textToLyrics(text: string): Song["lyrics"] {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const chunks = trimmed.split(/\n(?=\[)/);
  return chunks.map((chunk, index) => {
    const lines = chunk.split("\n");
    const hasHeading = lines[0].startsWith("[");
    return {
      section: hasHeading ? lines[0] : `[Section ${index + 1}]`,
      lines: hasHeading ? lines.slice(1) : lines,
    };
  });
}

function valuesToSong(values: SongFormValues, existing?: Song): Song {
  const category =
    values.tags.split(",")[0]?.trim() || existing?.category || "Worship";
  const bpm = Number(values.bpm);
  return {
    id: existing?.id ?? String(Date.now()),
    title: values.title.trim(),
    artist: values.artist.trim() || "Unknown",
    key: values.key,
    lastUsed: existing?.lastUsed ?? "Just now",
    category,
    bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : existing?.bpm,
    signature: values.signature,
    length: existing?.length,
    lyrics: textToLyrics(values.lyrics),
  };
}

export default function Songs() {
  const [library, setLibrary] = useState(songs);
  const [selectedId, setSelectedId] = useState(songs[0].id);
  const [activeLanguage, setActiveLanguage] =
    useState<(typeof languages)[number]>("English");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const selected = useMemo(
    () => library.find((s) => s.id === selectedId) ?? library[0],
    [library, selectedId],
  );

  const categories = useMemo(() => {
    const fromLibrary = library.map((song) => song.category);
    return Array.from(new Set([...defaultCategories, ...fromLibrary]));
  }, [library]);

  const filtered = useMemo(() => {
    return library.filter((song) => {
      const matchesQuery =
        !query ||
        song.title.toLowerCase().includes(query.toLowerCase()) ||
        song.artist.toLowerCase().includes(query.toLowerCase());
      const matchesCategory =
        !activeCategory || song.category === activeCategory;
      return matchesQuery && matchesCategory;
    });
  }, [library, query, activeCategory]);

  return (
    <main className="h-full overflow-hidden flex flex-col lg:flex-row">
      <section className="flex-1 flex flex-col min-w-0 min-h-0 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end mb-6 sm:mb-8">
          <div>
            <h2 className="text-[clamp(1.5rem,3vw,2rem)] font-semibold tracking-[-0.01em] text-on-surface">
              Song Library
            </h2>
            <p className="text-on-surface-variant text-sm mt-1">
              {filtered.length} songs total
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

        <div className="relative mb-4 lg:hidden">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
            search
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-surface-container border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-primary/50"
            placeholder="Filter songs..."
            type="text"
          />
        </div>

        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-on-surface-variant opacity-50 mr-1">
              Language:
            </span>
            {languages.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setActiveLanguage(lang)}
                className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                  activeLanguage === lang
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-white/5 hover:border-white/20 text-on-surface-variant"
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
          <div className="hidden sm:block h-4 w-px bg-white/10 mx-1 self-center" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-on-surface-variant opacity-50 mr-1">
              Categories:
            </span>
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() =>
                  setActiveCategory((prev) => (prev === cat ? null : cat))
                }
                className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                  activeCategory === cat
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-white/5 hover:border-white/20 text-on-surface-variant"
                }`}
              >
                {cat}
              </button>
            ))}
            <button
              type="button"
              className="material-symbols-outlined text-on-surface-variant hover:text-on-surface text-[20px]"
            >
              tune
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto glass-card rounded-xl border border-white/5 custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[640px]">
            <thead className="sticky top-0 bg-surface-container-high/90 backdrop-blur-md z-10">
              <tr className="border-b border-white/5">
                {["Title", "Artist", "Key", "Last Used", "Category"].map(
                  (col) => (
                    <th
                      key={col}
                      className={`px-4 sm:px-6 py-4 text-[11px] uppercase tracking-wider text-on-surface-variant opacity-60 font-semibold ${
                        col === "Key" ? "text-center" : ""
                      }`}
                    >
                      {col}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((song, index) => {
                const isSelected = song.id === selectedId;
                const isFaded =
                  index === filtered.length - 1 && filtered.length > 5;
                return (
                  <tr
                    key={song.id}
                    onClick={() => setSelectedId(song.id)}
                    className={`group cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-primary/5 border-l-2 border-primary"
                        : "hover:bg-white/5 border-l-2 border-transparent"
                    } ${isFaded && !isSelected ? "opacity-30" : ""}`}
                  >
                    <td className="px-4 sm:px-6 py-4">
                      <div className="font-medium text-sm text-on-surface">
                        {song.title}
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm text-on-surface-variant">
                      {song.artist}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded bg-surface-container-highest font-mono text-xs ${
                          isSelected
                            ? "text-primary"
                            : "text-on-surface-variant"
                        }`}
                      >
                        {song.key}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm text-on-surface-variant">
                      {song.lastUsed}
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <span
                        className={`text-xs px-2 py-1 rounded-md border ${
                          isSelected
                            ? "bg-secondary/10 text-secondary border-secondary/20"
                            : "bg-surface-container-highest text-on-surface-variant border-transparent"
                        }`}
                      >
                        {song.category}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-16 text-center text-on-surface-variant text-sm"
                  >
                    No songs found matching your filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
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
              {selected.artist} | Key of {selected.key}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
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
          </div>
        </div>

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
            <p className="text-xl font-semibold">
              {selected.signature ?? "—"}
            </p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant opacity-50 mb-1">
              LENGTH
            </p>
            <p className="text-xl font-semibold">{selected.length ?? "—"}</p>
          </div>
        </div>

        <div className="glass-card rounded-xl p-5 border border-white/10 shadow-2xl">
          <div className="flex justify-between mb-4 border-b border-white/5 pb-2">
            <span className="text-[11px] uppercase tracking-wider text-primary font-semibold">
              Lyrics Preview
            </span>
            <span className="material-symbols-outlined text-sm opacity-50">
              open_in_full
            </span>
          </div>
          <div className="space-y-4 text-[15px] text-on-surface">
            {selected.lyrics?.length ? (
              selected.lyrics.map((block) => (
                <div key={block.section}>
                  <div className="opacity-60 text-xs uppercase font-bold tracking-widest text-primary/80 mb-1">
                    {block.section}
                  </div>
                  <p className="leading-relaxed whitespace-pre-line text-on-surface-variant">
                    {block.lines.join("\n")}
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

        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="w-full py-3 rounded-xl border border-white/10 hover:bg-white/5 flex items-center justify-center gap-2 transition-colors"
          >
            <span className="material-symbols-outlined text-tertiary">
              music_video
            </span>
            <span className="text-sm font-medium">View Chords & Tabs</span>
          </button>
          <button
            type="button"
            className="w-full py-3 rounded-xl border border-white/10 hover:bg-white/5 flex items-center justify-center gap-2 transition-colors"
          >
            <span className="material-symbols-outlined text-primary">
              play_circle
            </span>
            <span className="text-sm font-medium">Listen to Original</span>
          </button>
        </div>
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
        initialValues={
          formMode === "edit" && selected
            ? {
                title: selected.title,
                artist: selected.artist,
                key: selected.key,
                bpm: selected.bpm ? String(selected.bpm) : "",
                signature: selected.signature ?? "4/4",
                tags: selected.category,
                lyrics: lyricsToText(selected.lyrics),
              }
            : undefined
        }
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => {
          const next = valuesToSong(
            values,
            formMode === "edit" ? selected : undefined,
          );
          setLibrary((prev) =>
            formMode === "edit"
              ? prev.map((song) => (song.id === next.id ? next : song))
              : [next, ...prev],
          );
          setSelectedId(next.id);
          setFormOpen(false);
        }}
      />

      <ConfirmDialog
        open={deleteOpen && Boolean(selected)}
        title="Delete Song?"
        description={`Are you sure you want to delete "${selected?.title ?? ""}"? This action cannot be undone.`}
        highlight={selected ? `"${selected.title}"` : undefined}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (!selected) return;
          const remaining = library.filter((song) => song.id !== selected.id);
          setLibrary(remaining);
          setSelectedId(remaining[0]?.id ?? "");
          setDeleteOpen(false);
        }}
      />
    </main>
  );
}
