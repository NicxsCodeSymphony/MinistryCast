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
        className="absolute top-4 right-4 z-50 w-9 h-9 rounded-full bg-surface-container-high/50 flex items-center justify-center border border-white/5 text-on-surface-variant hover:text-on-surface"
        aria-label="Close"
      >
        <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
      <header className="px-5 pt-4 pb-3 border-b border-white/10 pr-14 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-on-surface-variant hover:text-primary"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
          {setlistName}
        </button>
        <h2 className="text-xl font-bold text-on-surface mt-1">Select Sermon</h2>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="mt-3 w-full bg-surface-container-high/50 rounded-lg px-3 py-2 text-sm outline-none"
          placeholder="Search sermons..."
        />
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2 custom-scrollbar">
        {error ? <p className="text-sm text-[#ffb4ab]">{error}</p> : null}
        <button
          type="button"
          onClick={() => setSelectedId(CREATE_ID)}
          className={`w-full rounded-xl px-4 py-2.5 text-left text-sm font-semibold border flex items-center gap-2 ${
            selectedId === CREATE_ID
              ? "border-tertiary/30 bg-tertiary/10"
              : "border-dashed border-white/20 hover:bg-white/5"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Create New Sermon
        </button>
        {selectedId === CREATE_ID ? (
          <form
            className="rounded-xl p-3 space-y-2.5 border border-tertiary/20"
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
              className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-2 text-sm"
              placeholder="Sermon title"
            />
            <input
              value={draft.scripture}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, scripture: event.target.value }))
              }
              className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-2 text-sm"
              placeholder="Primary scripture"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={draft.speaker}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, speaker: event.target.value }))
                }
                className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-2 text-sm"
                placeholder="Speaker"
              />
              <input
                value={draft.duration}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, duration: event.target.value }))
                }
                className="w-full bg-surface-container/50 border border-white/10 rounded-lg px-3 py-2 text-sm"
                placeholder="Duration"
              />
            </div>
            <button
              type="submit"
              disabled={saving || !draft.title.trim()}
              className="w-full py-2.5 text-sm bg-gradient-to-r from-primary to-primary-container text-on-primary font-bold rounded-xl disabled:opacity-40"
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
            className="w-full rounded-xl px-4 py-3 text-left hover:bg-white/5 border border-transparent"
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
          hasMore={sermons.length < total}
          loading={loadingMore}
          onMore={() => {
            setLoadingMore(true);
            void listSermons({
              query: debounced,
              limit: PAGE_SIZE,
              offset: sermons.length,
            })
              .then((page) => {
                setSermons((prev) => [...prev, ...page.items]);
                setTotal(page.total);
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
