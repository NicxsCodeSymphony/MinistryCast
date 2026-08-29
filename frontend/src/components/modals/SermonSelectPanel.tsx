import { useEffect, useMemo, useState } from "react";
import { createSermon, listSermons } from "../../lib/api";
import { formatDuration, parseDurationSeconds } from "../../lib/helpers";
import { LoadMoreBar } from "../LoadMoreBar";
import { PAGE_SIZE, type Sermon } from "../../lib/types";
import { TableSkeleton } from "../Skeleton";
import { newServiceItem, type ServiceItem } from "./serviceItem";

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
  const [debounced, setDebounced] = useState("");
  const [sermons, setSermons] = useState<Sermon[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    scripture: "",
    speaker: "",
    duration: "30:00",
  });

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), 250);
    return () => window.clearTimeout(id);
  }, [query]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const page = await listSermons({ query: debounced, limit: PAGE_SIZE, offset: 0 });
        setSermons(page.items);
        setTotal(page.total);
        setOffset(0);
        setSelectedId((prev) =>
          prev === CREATE_ID ? prev : page.items[0]?.id ?? CREATE_ID,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load sermons.");
      } finally {
        setLoading(false);
      }
    })();
  }, [debounced]);

  const selected = useMemo(
    () => sermons.find((row) => row.id === selectedId),
    [sermons, selectedId],
  );

  const addExisting = (sermon: Sermon) => {
    onAdd(
      newServiceItem({
        itemType: "sermon",
        sermonId: sermon.id,
        title: `Sermon: ${sermon.title}`,
        subtitle: `Speaker: ${sermon.speaker_name || "TBD"} • Scripture: ${sermon.primary_scripture || "—"}`,
        duration: formatDuration(sermon.est_duration_seconds),
        label: "Sermon",
        icon: "record_voice_over",
        accent: "tertiary",
        border: "tertiary",
        durationTone: "tertiary",
      }),
    );
  };

  const addDraft = async () => {
    if (!draft.title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const sermon = await createSermon({
        title: draft.title.trim(),
        speaker_name: draft.speaker,
        primary_scripture: draft.scripture,
        est_duration_seconds: parseDurationSeconds(draft.duration),
        status: "draft",
        slides: draft.scripture
          ? [{ content: draft.scripture, scripture_reference: draft.scripture }]
          : [{ content: draft.title.trim() }],
      });
      addExisting(sermon);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create sermon.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-surface-container-high/50 flex items-center justify-center border border-white/5"
        aria-label="Close"
      >
        <span className="material-symbols-outlined">close</span>
      </button>
      <header className="px-6 py-4 border-b border-white/10 pr-16">
        <button
          type="button"
          onClick={onBack}
          className="text-[12px] uppercase text-on-surface-variant"
        >
          {setlistName}
        </button>
        <h2 className="text-[28px] font-bold text-on-surface mt-1">Select Sermon</h2>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mt-4 w-full md:w-96 bg-surface-container-high/50 rounded-xl px-4 py-2.5 outline-none"
          placeholder="Search sermons..."
        />
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar">
        {error ? <p className="text-sm text-[#ffb4ab]">{error}</p> : null}
        <button
          type="button"
          onClick={() => setSelectedId(CREATE_ID)}
          className={`w-full rounded-xl p-4 text-left border ${
            selectedId === CREATE_ID
              ? "border-tertiary/30 bg-tertiary/10"
              : "border-dashed border-white/20"
          }`}
        >
          Create New Sermon
        </button>
        {selectedId === CREATE_ID ? (
          <form
            className="rounded-xl p-4 space-y-3 border border-tertiary/20"
            onSubmit={(event) => {
              event.preventDefault();
              void addDraft();
            }}
          >
            <input
              value={draft.title}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, title: event.target.value }))
              }
              className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-3"
              placeholder="Sermon title"
            />
            <input
              value={draft.scripture}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, scripture: event.target.value }))
              }
              className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-3"
              placeholder="Primary scripture"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={draft.speaker}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, speaker: event.target.value }))
                }
                className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-3"
                placeholder="Speaker"
              />
              <input
                value={draft.duration}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, duration: event.target.value }))
                }
                className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-3"
                placeholder="Duration"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !draft.title.trim()}
              className="w-full py-3 bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold rounded-xl disabled:opacity-40"
            >
              {saving ? "Saving…" : "Add to Setlist"}
            </button>
          </form>
        ) : null}
        {loading ? <TableSkeleton rows={4} /> : null}
        {sermons.map((sermon) => (
          <button
            key={sermon.id}
            type="button"
            onClick={() => addExisting(sermon)}
            className="w-full rounded-xl p-4 text-left hover:bg-white/5 border border-transparent"
          >
            <p className="font-semibold">{sermon.title}</p>
            <p className="text-sm text-on-surface-variant">
              {sermon.speaker_name} • {sermon.primary_scripture || "No scripture"}
            </p>
          </button>
        ))}
        <LoadMoreBar
          shown={sermons.length}
          total={total}
          hasMore={offset + sermons.length < total}
          loading={loadingMore}
          onMore={() => {
            setLoadingMore(true);
            void listSermons({
              query: debounced,
              limit: PAGE_SIZE,
              offset: offset + PAGE_SIZE,
            })
              .then((page) => {
                setSermons((prev) => [...prev, ...page.items]);
                setTotal(page.total);
                setOffset(offset + PAGE_SIZE);
              })
              .finally(() => setLoadingMore(false));
          }}
        />
        {selected && selectedId !== CREATE_ID ? (
          <button
            type="button"
            onClick={() => addExisting(selected)}
            className="w-full py-3.5 bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold rounded-xl"
          >
            Add {selected.title}
          </button>
        ) : null}
      </div>
    </div>
  );
}
