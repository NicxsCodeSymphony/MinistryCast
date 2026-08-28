import { useMemo, useState } from "react";
import { newServiceItem, type ServiceItem } from "./serviceItem";

type CatalogSermon = {
  id: string;
  title: string;
  speaker: string;
  scripture: string;
  duration: string;
  date: string;
  series: string;
  slides: { content: string; verse: string }[];
};

const catalog: CatalogSermon[] = [
  {
    id: "heart-of-worship",
    title: "The Heart of Worship",
    speaker: "Pastor David",
    scripture: "John 4:23-24",
    duration: "35:00",
    date: "2023-10-22",
    series: "The Heart",
    slides: [
      {
        content:
          "God is seeking true worshippers who will worship Him in spirit and in truth.",
        verse: "John 4:23",
      },
      {
        content:
          "True worship is not about the mountain or Jerusalem, but about the posture of the heart.",
        verse: "",
      },
    ],
  },
  {
    id: "walking-in-faith",
    title: "Walking in Faith",
    speaker: "Pastor David",
    scripture: "Hebrews 11:1",
    duration: "28:00",
    date: "2023-10-15",
    series: "Unshaken",
    slides: [
      {
        content:
          "Faith is the assurance of things hoped for, the conviction of things not seen.",
        verse: "Hebrews 11:1",
      },
      {
        content: "We walk by faith, not by what is visible in the moment.",
        verse: "",
      },
    ],
  },
  {
    id: "light-of-the-world",
    title: "Light of the World",
    speaker: "Sarah Jenkins",
    scripture: "Matthew 5:14-16",
    duration: "22:00",
    date: "2023-10-08",
    series: "Kingdom Life",
    slides: [
      {
        content: "You are the light of the world. A city set on a hill cannot be hidden.",
        verse: "Matthew 5:14",
      },
      {
        content: "Let your light shine before others, that they may see your good works.",
        verse: "Matthew 5:16",
      },
    ],
  },
];

const CREATE_ID = "create-new";

type SermonSelectPanelProps = {
  setlistName: string;
  onBack: () => void;
  onClose: () => void;
  onAdd: (item: ServiceItem) => void;
};

export default function SermonSelectPanel({
  setlistName,
  onBack,
  onClose,
  onAdd,
}: SermonSelectPanelProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(catalog[0].id);
  const [draft, setDraft] = useState({
    title: "",
    scripture: "",
    speaker: "Pastor David",
    duration: "30:00",
  });

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return catalog;
    return catalog.filter(
      (sermon) =>
        sermon.title.toLowerCase().includes(q) ||
        sermon.speaker.toLowerCase().includes(q) ||
        sermon.scripture.toLowerCase().includes(q),
    );
  }, [query]);

  const selected =
    selectedId === CREATE_ID
      ? null
      : (filtered.find((sermon) => sermon.id === selectedId) ?? filtered[0]);

  const addExisting = (sermon: CatalogSermon) => {
    onAdd(
      newServiceItem({
        title: `Sermon: ${sermon.title}`,
        subtitle: `Speaker: ${sermon.speaker} • Scripture: ${sermon.scripture}`,
        duration: sermon.duration,
        label: "Sermon",
        icon: "record_voice_over",
        accent: "tertiary",
        border: "tertiary",
        durationTone: "tertiary",
      }),
    );
  };

  const addDraft = () => {
    if (!draft.title.trim()) return;
    onAdd(
      newServiceItem({
        title: `Sermon: ${draft.title.trim()}`,
        subtitle: `Speaker: ${draft.speaker.trim() || "TBD"} • Scripture: ${draft.scripture.trim() || "—"}`,
        duration: draft.duration.trim() || "30:00",
        label: "Sermon",
        icon: "record_voice_over",
        accent: "tertiary",
        border: "tertiary",
        durationTone: "tertiary",
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
              Add Sermon
            </span>
          </div>
          <h2 className="text-[28px] leading-9 md:text-[32px] md:leading-10 font-bold text-on-surface">
            Select Sermon
          </h2>
        </div>
        <div className="w-full md:w-96 glass-panel rounded-xl flex items-center px-4 py-2.5 soft-glow-focus border-white/10 bg-surface-container-high/50">
          <span className="material-symbols-outlined text-on-surface-variant mr-3">
            search
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="bg-transparent border-none outline-none text-base text-on-surface w-full placeholder:text-on-surface-variant/50 focus:ring-0 p-0"
            placeholder="Search by title, speaker, or scripture..."
            type="search"
          />
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0">
        <div className="flex-1 flex flex-col border-r border-white/10 min-w-0 min-h-0">
          <div className="px-6 py-3 border-b border-white/10 bg-surface-container-lowest/20">
            <p className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
              Library sermons
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-6 gap-2 flex flex-col custom-scrollbar">
            <button
              type="button"
              onClick={() => setSelectedId(CREATE_ID)}
              className={`rounded-xl p-4 flex items-center gap-4 text-left border transition-all ${
                selectedId === CREATE_ID
                  ? "glass-panel border-tertiary/30 bg-tertiary/10 relative overflow-hidden"
                  : "border-dashed border-white/20 hover:border-tertiary/40 hover:bg-tertiary/5"
              }`}
            >
              {selectedId === CREATE_ID ? (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-tertiary" />
              ) : null}
              <div className="w-10 h-10 rounded bg-tertiary/20 text-tertiary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined">add</span>
              </div>
              <div>
                <h3 className="text-base font-semibold text-on-surface">
                  Create New Sermon
                </h3>
                <p className="text-sm text-on-surface-variant">
                  Title, scripture, speaker, and slides — same as Sermon Prep.
                </p>
              </div>
            </button>

            {selectedId === CREATE_ID ? (
              <form
                className="lg:hidden rounded-xl p-4 space-y-3 border border-tertiary/20 bg-tertiary/5"
                onSubmit={(event) => {
                  event.preventDefault();
                  addDraft();
                }}
              >
                <input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, title: event.target.value }))
                  }
                  className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-3 text-on-surface focus:outline-none focus:border-tertiary"
                  placeholder="Sermon title"
                />
                <input
                  value={draft.scripture}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      scripture: event.target.value,
                    }))
                  }
                  className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-3 text-on-surface focus:outline-none focus:border-tertiary"
                  placeholder="Primary scripture"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={draft.speaker}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        speaker: event.target.value,
                      }))
                    }
                    className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-3 text-on-surface focus:outline-none focus:border-primary"
                    placeholder="Speaker"
                  />
                  <input
                    value={draft.duration}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        duration: event.target.value,
                      }))
                    }
                    className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-3 text-on-surface focus:outline-none focus:border-primary"
                    placeholder="Duration"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!draft.title.trim()}
                  className="w-full py-3 bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold rounded-xl disabled:opacity-40"
                >
                  Add to Setlist
                </button>
              </form>
            ) : null}

            {filtered.map((sermon) => {
              const active = sermon.id === selected?.id;
              return (
                <div
                  key={sermon.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(sermon.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(sermon.id);
                    }
                  }}
                  className={`rounded-xl p-4 flex items-center justify-between cursor-pointer transition-all duration-200 ${
                    active
                      ? "glass-panel border-tertiary/30 bg-tertiary/10 relative overflow-hidden"
                      : "border border-transparent hover:border-white/10 hover:bg-white/5"
                  }`}
                >
                  {active ? (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-tertiary" />
                  ) : null}
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded bg-tertiary/10 text-tertiary flex items-center justify-center border border-white/10 shrink-0">
                      <span className="material-symbols-outlined filled">
                        record_voice_over
                      </span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-semibold text-on-surface truncate">
                        {sermon.title}
                      </h3>
                      <p className="text-sm text-on-surface-variant truncate">
                        {sermon.speaker} • {sermon.scripture}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <div className="text-right hidden sm:block">
                      <span className="block text-[12px] font-medium text-on-surface-variant uppercase tracking-wider">
                        Length
                      </span>
                      <span className="text-base font-medium text-tertiary">
                        {sermon.duration}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        addExisting(sermon);
                      }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                        active
                          ? "bg-tertiary/20 text-tertiary hover:bg-tertiary/30"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                      aria-label={`Add ${sermon.title}`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        add
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="hidden lg:flex w-[400px] flex-col bg-surface-container-lowest/30 shrink-0 min-h-0">
          {selectedId === CREATE_ID ? (
            <>
              <div className="p-6 border-b border-white/10 shrink-0">
                <h3 className="text-2xl font-bold text-on-surface mb-1">
                  New Sermon
                </h3>
                <p className="text-sm text-on-surface-variant">
                  Same fields as Sermon Prep — attach it to this setlist.
                </p>
              </div>
              <form
                className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar"
                onSubmit={(event) => {
                  event.preventDefault();
                  addDraft();
                }}
              >
                <label className="block">
                  <span className="block text-[12px] font-semibold tracking-[0.05em] uppercase text-tertiary mb-2">
                    Sermon Title
                  </span>
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, title: event.target.value }))
                    }
                    className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-3 text-on-surface focus:outline-none focus:border-tertiary"
                    placeholder="Enter sermon title..."
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="block text-[12px] font-semibold tracking-[0.05em] uppercase text-tertiary mb-2">
                    Primary Scripture
                  </span>
                  <input
                    value={draft.scripture}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        scripture: event.target.value,
                      }))
                    }
                    className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-3 text-on-surface focus:outline-none focus:border-tertiary"
                    placeholder="e.g. John 4:23"
                  />
                </label>
                <label className="block">
                  <span className="block text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant mb-2">
                    Speaker
                  </span>
                  <input
                    value={draft.speaker}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        speaker: event.target.value,
                      }))
                    }
                    className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-3 text-on-surface focus:outline-none focus:border-primary"
                  />
                </label>
                <label className="block">
                  <span className="block text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant mb-2">
                    Duration
                  </span>
                  <input
                    value={draft.duration}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        duration: event.target.value,
                      }))
                    }
                    className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-3 text-on-surface focus:outline-none focus:border-primary"
                  />
                </label>
              </form>
              <div className="p-4 border-t border-white/10 bg-surface-container-lowest/50 shrink-0">
                <button
                  type="button"
                  onClick={addDraft}
                  disabled={!draft.title.trim()}
                  className="w-full py-3.5 bg-gradient-to-r from-primary to-primary-container text-on-primary text-lg font-bold rounded-xl hover:opacity-90 transition-opacity active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-primary/20 disabled:opacity-40"
                >
                  <span className="material-symbols-outlined">add_circle</span>
                  Add to Setlist
                </button>
              </div>
            </>
          ) : selected ? (
            <>
              <div className="p-6 border-b border-white/10 shrink-0">
                <h3 className="text-2xl font-bold text-on-surface mb-1">
                  {selected.title}
                </h3>
                <p className="text-sm text-on-surface-variant mb-4">
                  {selected.speaker} • {selected.scripture}
                </p>
                <div className="flex gap-3">
                  <div className="flex-1 bg-surface-container/50 rounded-lg p-2 border border-white/5 text-center">
                    <span className="block text-[12px] font-semibold tracking-[0.05em] text-on-surface-variant mb-1 uppercase">
                      Duration
                    </span>
                    <span className="text-base font-semibold text-tertiary">
                      {selected.duration}
                    </span>
                  </div>
                  <div className="flex-1 bg-surface-container/50 rounded-lg p-2 border border-white/5 text-center">
                    <span className="block text-[12px] font-semibold tracking-[0.05em] text-on-surface-variant mb-1 uppercase">
                      Slides
                    </span>
                    <span className="text-base font-semibold text-on-surface">
                      {selected.slides.length}
                    </span>
                  </div>
                  <div className="flex-1 bg-surface-container/50 rounded-lg p-2 border border-white/5 text-center">
                    <span className="block text-[12px] font-semibold tracking-[0.05em] text-on-surface-variant mb-1 uppercase">
                      Series
                    </span>
                    <span className="text-base font-semibold text-on-surface truncate block">
                      {selected.series}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar min-h-0">
                <h4 className="text-[12px] font-semibold tracking-[0.05em] text-on-surface-variant uppercase mb-4">
                  Slide Preview
                </h4>
                <div className="space-y-4">
                  {selected.slides.map((slide, index) => (
                    <div
                      key={`${selected.id}-${index}`}
                      className="rounded-lg p-4 border border-white/10 bg-surface-container/30"
                    >
                      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase bg-tertiary/20 text-tertiary mb-2">
                        Slide {String(index + 1).padStart(2, "0")}
                      </span>
                      <p className="text-sm text-on-surface leading-relaxed">
                        {slide.content}
                      </p>
                      {slide.verse ? (
                        <p className="text-xs text-primary mt-2">{slide.verse}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
              <div className="p-4 border-t border-white/10 bg-surface-container-lowest/50 shrink-0">
                <button
                  type="button"
                  onClick={() => addExisting(selected)}
                  className="w-full py-3.5 bg-gradient-to-r from-primary to-primary-container text-on-primary text-lg font-bold rounded-xl hover:opacity-90 transition-opacity active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                >
                  <span className="material-symbols-outlined">add_circle</span>
                  Add to Setlist
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-on-surface-variant p-6 text-center">
              Select a sermon to preview slides.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
