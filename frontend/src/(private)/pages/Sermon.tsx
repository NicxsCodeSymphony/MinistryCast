import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ConfirmDialog from "../../components/modals/ConfirmDialog";
import { useUnsavedDraft } from "../../lib/useUnsavedDraft";
import Modal from "../../components/modals/Modal";
import { PageSkeleton } from "../../components/Skeleton";
import SermonStagePreview from "../../components/SermonStagePreview";
import TextSizePicker from "../../components/TextSizePicker";
import ChurchSharePicker from "../../components/ChurchSharePicker";
import { LoadMoreBar } from "../../components/LoadMoreBar";
import {
  createSermon,
  deleteSermon,
  getSermon,
  listChurchNames,
  listSermons,
  lookupScripture,
  readSetlistViewChurchId,
  updateSermon,
  writeSetlistViewChurchId,
  type ChurchName,
} from "../../lib/api";
import { getSessionProfile, isSuperadmin } from "../../lib/auth";
import { parseBibleReference } from "../../lib/bible";
import { useHoldReorder } from "../../lib/holdDrag";
import {
  formatDuration,
  formatRelative,
  insertSermonGap,
  isSermonSpace,
  moveItem,
  parseDurationSeconds,
  sermonDisplayLines,
} from "../../lib/helpers";
import { useSearch } from "../../lib/SearchContext";
import { useToast } from "../../lib/ToastContext";
import { PAGE_SIZE, type LiveCue, type Sermon } from "../../lib/types";

type DraftSlide = {
  id: string;
  content: string;
  verse: string;
};

function sermonPointNumber(slides: DraftSlide[], id: string) {
  let point = 0;
  for (const row of slides) {
    if (isSermonSpace(row.content)) continue;
    point += 1;
    if (row.id === id) return point;
  }
  return Math.max(1, point);
}

function titleVerseOf(slides: DraftSlide[]) {
  return (
    slides.find((row) => !isSermonSpace(row.content))?.verse.trim() || ""
  );
}

const EMPTY_SLIDES: DraftSlide[] = [{ id: "new-1", content: "", verse: "" }];

function sermonDraftKey(input: {
  title: string;
  scripture: string;
  speaker: string;
  date: string;
  duration: string;
  series: string;
  slides: DraftSlide[];
  notes: string[];
  textSize: string;
}) {
  return JSON.stringify(input);
}

function cueForTitleSlide(
  title: string,
  verse: string,
  textSize: string,
): LiveCue {
  const heading = title.trim() || "Untitled sermon";
  return {
    id: "preview-title",
    itemId: "preview",
    kind: "sermon",
    label: "TITLE",
    tag: "TTL",
    title: heading,
    preview: heading,
    lines: [heading],
    heading: null,
    align: "center",
    textSize,
    verse: verse || null,
    versePlacement: verse ? "bottom" : undefined,
    titleSlide: true,
  };
}

function cueForPoint(
  slide: DraftSlide,
  point: number,
  title: string,
  textSize: string,
): LiveCue {
  const lines = sermonDisplayLines(slide.content);
  return {
    id: slide.id,
    itemId: "preview",
    kind: "sermon",
    label: `POINT ${point}`,
    tag: `P${point}`,
    title: title.trim() || "Untitled sermon",
    preview: slide.content.slice(0, 80),
    lines: lines.length ? lines : [slide.content.trim() || "This point is empty"],
    heading: null,
    slideId: slide.id,
    align: "start",
    textSize,
  };
}

export default function Sermon() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { query } = useSearch();
  const toast = useToast();
  const [sermonId, setSermonId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [scripture, setScripture] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState("");
  const [series, setSeries] = useState("");
  const [slides, setSlides] = useState<DraftSlide[]>([
    { id: "new-1", content: "", verse: "" },
  ]);
  const [notes, setNotes] = useState<string[]>([]);
  const [library, setLibrary] = useState<Sermon[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [superadmin, setSuperadmin] = useState(false);
  const [churches, setChurches] = useState<ChurchName[]>([]);
  const [viewChurchId, setViewChurchId] = useState(readSetlistViewChurchId);
  const [churchIds, setChurchIds] = useState<string[]>([]);
  const [deleteSlideId, setDeleteSlideId] = useState<string | null>(null);
  const [deletingSermon, setDeletingSermon] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [passageId, setPassageId] = useState<string | null>(null);
  const [scripturePreview, setScripturePreview] = useState("");
  const [scriptureBusy, setScriptureBusy] = useState(false);
  const [scriptureHint, setScriptureHint] = useState("");
  const [textSize, setTextSize] = useState("md");
  const [focusedSlideId, setFocusedSlideId] = useState<string | null>(null);
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [previewSlideId, setPreviewSlideId] = useState<string | null>(null);
  const [previewTitleSlide, setPreviewTitleSlide] = useState(false);
  const [baseline, setBaseline] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lastAutoSlide = useRef("");
  const persistBypass = useRef<(fn: () => void) => void>((fn) => fn());
  const persistSave = useRef<() => Promise<boolean>>(async () => false);
  const { bind: bindSlide, draggingId } = useHoldReorder(
    "sermon-slides",
    (fromId, toId) => {
      setSlides((prev) => {
        const from = prev.findIndex((row) => row.id === fromId);
        const to = prev.findIndex((row) => row.id === toId);
        return moveItem(prev, from, to);
      });
    },
  );

  const openSlideEditor = (id: string) => {
    setFocusedSlideId(id);
    setEditingSlideId(id);
  };

  useEffect(() => {
    if (!editingSlideId) return;
    const id = window.setTimeout(() => editorRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [editingSlideId]);

  const visibleLibrary = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library;
    return library.filter((row) =>
      [row.title, row.primary_scripture, row.speaker_name, row.series_name].some(
        (value) => (value ?? "").toLowerCase().includes(q),
      ),
    );
  }, [library, query]);

  const applySermon = (sermon: Sermon) => {
    const nextSlides =
      (sermon.slides ?? []).length
        ? (sermon.slides ?? []).map((slide) => ({
            id: slide.id,
            content: slide.content,
            verse: slide.scripture_reference ?? "",
          }))
        : EMPTY_SLIDES;
    const nextNotes = (sermon.notes ?? []).map((note) => note.content);
    const nextDuration = sermon.est_duration_seconds
      ? formatDuration(sermon.est_duration_seconds)
      : "";
    const nextSize = sermon.text_size || "md";
    setSermonId(sermon.id);
    setTitle(sermon.title);
    setScripture(sermon.primary_scripture ?? "");
    setPassageId(sermon.primary_passage_id);
    setScripturePreview("");
    setScriptureHint("");
    setSpeaker(sermon.speaker_name ?? "");
    setDate(sermon.service_date ?? "");
    setDuration(nextDuration);
    setSeries(sermon.series_name ?? "");
    setSlides(nextSlides);
    setNotes(nextNotes);
    setTextSize(nextSize);
    setChurchIds(
      sermon.share_church_ids?.length
        ? sermon.share_church_ids
        : [sermon.church_id],
    );
    lastAutoSlide.current = "";
    setEditingSlideId(null);
    setBaseline(
      sermonDraftKey({
        title: sermon.title,
        scripture: sermon.primary_scripture ?? "",
        speaker: sermon.speaker_name ?? "",
        date: sermon.service_date ?? "",
        duration: nextDuration,
        series: sermon.series_name ?? "",
        slides: nextSlides,
        notes: nextNotes,
        textSize: nextSize,
      }),
    );
  };

  const startNew = () => {
    setSermonId(null);
    setTitle("");
    setScripture("");
    setPassageId(null);
    setScripturePreview("");
    setScriptureHint("");
    setSpeaker("");
    setDate("");
    setDuration("");
    setSeries("");
    setSlides([{ id: "new-1", content: "", verse: "" }]);
    setNotes([]);
    setTextSize("md");
    setChurchIds(viewChurchId ? [viewChurchId] : []);
    lastAutoSlide.current = "";
    setEditingSlideId(null);
    setBaseline(
      sermonDraftKey({
        title: "",
        scripture: "",
        speaker: "",
        date: "",
        duration: "",
        series: "",
        slides: [{ id: "new-1", content: "", verse: "" }],
        notes: [],
        textSize: "md",
      }),
    );
    setSearchParams({ sermon: "new" }, { replace: true });
  };

  const openSermon = async (id: string) => {
    const row = await getSermon(id);
    applySermon(row);
    setSearchParams({ sermon: id });
  };

  const confirmDeleteSermon = async () => {
    if (!deletingSermon) return;
    const id = deletingSermon.id;
    try {
      await deleteSermon(id);
      setLibrary((prev) => prev.filter((row) => row.id !== id));
      setDeletingSermon(null);
      if (sermonId === id || searchParams.get("sermon") === id) {
        setSearchParams({});
      }
      toast.success("Sermon deleted.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not delete that sermon.";
      setError(message);
      toast.error(message);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const profile = await getSessionProfile();
        const admin = isSuperadmin(profile);
        setSuperadmin(admin);
        let view = readSetlistViewChurchId();
        if (admin) {
          const names = await listChurchNames();
          setChurches(names);
          if (!view || !names.some((row) => row.id === view)) {
            view = names[0]?.id ?? "";
            writeSetlistViewChurchId(view);
          }
          setViewChurchId(view);
        }
        const page = await listSermons({
          limit: PAGE_SIZE,
          offset: 0,
          viewChurchId: admin ? view : null,
        });
        setLibrary(page.items);
        setTotal(page.total);
        setOffset(0);
        const want = searchParams.get("sermon");
        if (want && want !== "new") {
          const found = page.items.find((row) => row.id === want);
          if (found) applySermon(await getSermon(want));
          else {
            try {
              applySermon(await getSermon(want));
            } catch {
              setSearchParams({}, { replace: true });
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load sermons.");
        toast.error(err instanceof Error ? err.message : "Could not load sermons.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    const parsed = parseBibleReference(scripture);
    if (!parsed) {
      setScripturePreview("");
      setScriptureHint(scripture.trim() ? "Use a reference like John 3:16." : "");
      setScriptureBusy(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setScriptureBusy(true);
      setScriptureHint("");
      void lookupScripture(scripture, "kjv", controller.signal)
        .then((result) => {
          setPassageId(result.passage.id);
          setScripturePreview(result.text);
          setScriptureHint(`Loaded ${result.reference} (KJV). Cached locally and queued to backup.`);
          setSlides((prev) => {
            const first = prev[0];
            if (!first) return prev;
            const canFill =
              !first.content.trim() || first.content === lastAutoSlide.current;
            lastAutoSlide.current = result.text;
            if (!canFill) return prev;
            return prev.map((row, index) =>
              index === 0
                ? { ...row, content: result.text, verse: result.reference }
                : row,
            );
          });
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setScripturePreview("");
          setScriptureHint(
            err instanceof Error ? err.message : "Could not load that passage.",
          );
        })
        .finally(() => setScriptureBusy(false));
    }, 700);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [scripture]);

  const save = async (): Promise<boolean> => {
    if (!title.trim()) {
      setError("Enter a sermon title.");
      toast.warning("Enter a sermon title.");
      return false;
    }
    if (superadmin && churchIds.length === 0) {
      setError("Choose at least one church for this sermon.");
      toast.warning("Choose at least one church for this sermon.");
      return false;
    }
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const payload = {
        title: title.trim(),
        speaker_name: speaker,
        primary_scripture: scripture,
        primary_passage_id: passageId,
        series_name: series || null,
        service_date: date || null,
        est_duration_seconds: parseDurationSeconds(duration),
        status: "ready",
        text_size: textSize,
        slides: slides.map((slide) => ({
          id: slide.id.startsWith("new-") ? undefined : slide.id,
          content: slide.content,
          scripture_reference: slide.verse,
        })),
        notes: notes.map((content) => ({ content })),
        share_church_ids: churchIds,
      };
      const next = sermonId
        ? await updateSermon(sermonId, payload)
        : await createSermon(payload);
      applySermon(next);
      setLibrary((prev) => [next, ...prev.filter((row) => row.id !== next.id)]);
      persistBypass.current(() =>
        setSearchParams({ sermon: next.id }, { replace: true }),
      );
      setSaved(true);
      toast.success(sermonId ? "Sermon updated." : "Sermon saved.");
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save sermon.";
      setError(message);
      toast.error(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const editorOpen = Boolean(searchParams.get("sermon"));
  persistSave.current = save;
  const dirty =
    editorOpen &&
    baseline !== null &&
    sermonDraftKey({
      title,
      scripture,
      speaker,
      date,
      duration,
      series,
      slides,
      notes,
      textSize,
    }) !== baseline;
  const draft = useUnsavedDraft(dirty, {
    enabled: editorOpen,
    title: "Unsaved sermon",
    description:
      "This sermon draft is not saved. Save it before you leave, or you’ll lose what you typed.",
    onSave: () => persistSave.current(),
  });
  persistBypass.current = draft.bypass;

  if (loading) return <PageSkeleton />;

  const selectedParam = searchParams.get("sermon");
  const showList = !selectedParam;

  if (showList) {
    return (
      <section className="h-full overflow-y-auto custom-scrollbar bg-surface-container-lowest p-4 sm:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
            <div>
              <nav className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant mb-2">
                <Link
                  to="/songs"
                  className="hover:text-primary hover:underline underline-offset-4"
                >
                  Library
                </Link>
                <span className="material-symbols-outlined text-sm">chevron_right</span>
                <span className="text-primary">Sermons</span>
              </nav>
              <h2 className="text-[clamp(1.75rem,3vw,2rem)] font-semibold tracking-[-0.01em] text-on-surface">
                Sermons
              </h2>
              <p className="text-on-surface-variant text-sm mt-1">
                {total} sermon{total === 1 ? "" : "s"}
              </p>
              {superadmin ? (
                <label className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2 max-w-xl">
                  <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                    Viewing church
                  </span>
                  <select
                    value={viewChurchId}
                    onChange={(event) => {
                      const next = event.target.value;
                      writeSetlistViewChurchId(next);
                      setViewChurchId(next);
                      setLoading(true);
                      void listSermons({
                        limit: PAGE_SIZE,
                        offset: 0,
                        viewChurchId: next,
                      })
                        .then((page) => {
                          setLibrary(page.items);
                          setTotal(page.total);
                          setOffset(0);
                        })
                        .catch((err) => {
                          const message =
                            err instanceof Error ? err.message : "Could not load sermons.";
                          setError(message);
                          toast.error(message);
                        })
                        .finally(() => setLoading(false));
                    }}
                    className="bg-surface-container border border-white/10 rounded-lg px-3 py-2 text-sm min-w-[240px]"
                  >
                    <option value="">Select a church</option>
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
              onClick={startNew}
              className="flex items-center gap-2 bg-gradient-to-r from-primary-container to-secondary-container text-white px-6 py-2.5 rounded-full text-xs font-semibold hover:opacity-90 active:scale-95 transition-transform self-start sm:self-auto"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              New Sermon
            </button>
          </div>

          {error ? <p className="mb-6 text-sm text-[#ffb4ab]">{error}</p> : null}

          {visibleLibrary.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              {query.trim()
                ? `No sermons match “${query.trim()}”.`
                : "No sermons yet. Create one to start your library."}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleLibrary.map((row) => (
                <div
                  key={row.id}
                  className="glass-panel rounded-xl p-5 text-left hover:border-primary/30 transition-colors border border-white/5 group relative"
                >
                  <button
                    type="button"
                    onClick={() => {
                      void openSermon(row.id).catch((err) =>
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Could not open sermon.",
                        ),
                      );
                    }}
                    className="w-full text-left pr-10"
                  >
                    <p className="text-lg font-semibold text-on-surface break-words whitespace-pre-wrap">
                      {row.title}
                    </p>
                    <p className="text-sm text-on-surface-variant truncate mt-1">
                      {[row.primary_scripture, row.speaker_name, row.series_name]
                        .filter(Boolean)
                        .join(" • ") || "Draft"}
                    </p>
                    <p className="text-[11px] text-on-surface-variant/70 mt-3">
                      Updated {formatRelative(row.updated_at)}
                      {row.est_duration_seconds
                        ? ` · ${formatDuration(row.est_duration_seconds)}`
                        : ""}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeletingSermon({ id: row.id, title: row.title })
                    }
                    className="absolute top-4 right-4 p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/10"
                    aria-label={`Delete ${row.title}`}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      delete
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
          <LoadMoreBar
            shown={library.length}
            total={total}
            hasMore={offset + library.length < total}
            loading={loadingMore}
            onMore={() => {
              setLoadingMore(true);
              void listSermons({
                limit: PAGE_SIZE,
                offset: offset + PAGE_SIZE,
                viewChurchId: superadmin ? viewChurchId : null,
                query: query.trim() || undefined,
              })
                .then((page) => {
                  setLibrary((prev) => [...prev, ...page.items]);
                  setTotal(page.total);
                  setOffset(offset + PAGE_SIZE);
                })
                .catch((err) => {
                  const message =
                    err instanceof Error ? err.message : "Could not load sermons.";
                  setError(message);
                  toast.error(message);
                })
                .finally(() => setLoadingMore(false));
            }}
          />
        </div>

        <ConfirmDialog
          open={Boolean(deletingSermon)}
          title="Delete Sermon?"
          description={`Are you sure you want to delete "${deletingSermon?.title ?? ""}"? This action cannot be undone.`}
          highlight={deletingSermon ? `"${deletingSermon.title}"` : undefined}
          onClose={() => setDeletingSermon(null)}
          onConfirm={() => confirmDeleteSermon()}
        />
        {draft.dialog}
      </section>
    );
  }

  const deletingSlide = slides.find((slide) => slide.id === deleteSlideId);
  const editingSlide = slides.find((slide) => slide.id === editingSlideId);
  const editingIndex = slides.findIndex((slide) => slide.id === editingSlideId);
  const titlePointId = slides.find((row) => !isSermonSpace(row.content))?.id;
  const titleVerse = titleVerseOf(slides);
  const focusedPoint = slides.find(
    (row) => row.id === focusedSlideId && !isSermonSpace(row.content),
  );
  const sidePreviewCue = focusedPoint
    ? cueForPoint(
        focusedPoint,
        sermonPointNumber(slides, focusedPoint.id),
        title,
        textSize,
      )
    : cueForTitleSlide(title, titleVerse, textSize);
  const previewSlide = slides.find((row) => row.id === previewSlideId);
  const modalPreviewCue = previewTitleSlide
    ? cueForTitleSlide(title, titleVerse, textSize)
    : previewSlide && !isSermonSpace(previewSlide.content)
      ? cueForPoint(
          previewSlide,
          sermonPointNumber(slides, previewSlide.id),
          title,
          textSize,
        )
      : null;

  return (
    <section className="h-full overflow-y-auto custom-scrollbar bg-surface-container-lowest p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <nav className="flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
            <Link
              to="/songs"
              className="hover:text-primary hover:underline underline-offset-4 cursor-pointer"
            >
              Library
            </Link>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <button
              type="button"
              onClick={() => draft.guard(() => setSearchParams({}))}
              className="hover:text-primary hover:underline underline-offset-4 cursor-pointer"
            >
              Sermons
            </button>
            <span className="material-symbols-outlined text-sm">chevron_right</span>
            <span className="text-primary">
              {sermonId ? title || "Edit" : "New sermon"}
            </span>
          </nav>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {sermonId ? (
              <button
                type="button"
                onClick={() =>
                  setDeletingSermon({
                    id: sermonId,
                    title: title.trim() || "Untitled sermon",
                  })
                }
                className="p-2.5 rounded-lg bg-white/5 hover:bg-error/10 hover:text-error transition-colors"
                aria-label="Delete sermon"
              >
                <span className="material-symbols-outlined">delete</span>
              </button>
            ) : null}
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="px-6 sm:px-8 py-2.5 rounded-lg text-sm font-bold bg-gradient-to-r from-primary-container to-secondary-container text-white shadow-lg hover:shadow-primary/20 transition-all active:scale-95 flex items-center gap-2 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-sm">save</span>
              {saving ? "Saving…" : saved && !dirty ? "Saved" : "Save Sermon"}
              {dirty && !saving ? (
                <span className="ml-0.5 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                  Unsaved
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {error ? <p className="mb-4 text-sm text-[#ffb4ab]">{error}</p> : null}

        <div className="glass-panel rounded-xl p-4 sm:p-6 border-l-4 border-primary mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8">
              <label className="block text-[12px] font-semibold tracking-[0.05em] uppercase text-primary mb-2">
                Sermon Title
              </label>
              <textarea
                className="w-full bg-transparent border-b border-outline-variant/30 py-3 sm:py-4 text-[clamp(1.5rem,3vw,2rem)] font-semibold text-on-surface focus:border-primary focus:outline-none transition-all placeholder:opacity-30 resize-none leading-tight"
                placeholder="Enter sermon title..."
                rows={2}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  setPreviewTitleSlide(true);
                  setPreviewSlideId(null);
                }}
                className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <span className="material-symbols-outlined text-[16px]">visibility</span>
                Preview title slide
              </button>
            </div>
            <div className="lg:col-span-4">
              <label className="block text-[12px] font-semibold tracking-[0.05em] uppercase text-primary mb-2">
                Primary Scripture
              </label>
              <input
                className="w-full bg-transparent border-b border-outline-variant/30 py-3 sm:py-4 text-[clamp(1.125rem,2vw,1.5rem)] font-semibold text-on-surface focus:border-primary focus:outline-none"
                placeholder="e.g. John 4:23"
                type="text"
                value={scripture}
                onChange={(event) => setScripture(event.target.value)}
              />
              <p className="mt-2 text-xs text-on-surface-variant min-h-[1.25rem]">
                {scriptureBusy
                  ? "Looking up KJV text…"
                  : scriptureHint || (scripturePreview ? "KJV • public domain" : "")}
              </p>
              {scripturePreview ? (
                <p className="mt-1 text-sm text-on-surface-variant leading-relaxed line-clamp-4">
                  {scripturePreview}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {superadmin ? (
          <div className="glass-panel rounded-xl p-4 sm:p-6 mb-6">
            <ChurchSharePicker
              churches={churches}
              value={churchIds}
              onChange={setChurchIds}
              label="Churches that can view this sermon"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-12 gap-4 sm:gap-6">
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-4 sm:gap-6">
            <section className="glass-panel rounded-xl flex flex-col min-h-[520px] overflow-hidden">
              <div className="p-4 border-b border-outline-variant/10 bg-surface-container-low/50 flex items-center justify-between gap-3">
                <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
                  Transcription Flow
                </h3>
                <TextSizePicker value={textSize} onChange={setTextSize} />
              </div>
              <div className="flex-grow p-4 sm:p-6 notepad-lines">
                <div className="space-y-6">
                  {slides.map((slide, index) => {
                    const hold = bindSlide(slide.id);
                    const dragging = draggingId === slide.id;
                    const showTitleVerse = slide.id === titlePointId;
                    if (isSermonSpace(slide.content)) {
                      return (
                        <div
                          key={slide.id}
                          {...hold}
                          className="relative group rounded-lg px-4 py-3 border border-dashed border-white/15 bg-white/5 flex items-center gap-3 ml-3 select-none touch-none cursor-grab active:cursor-grabbing"
                        >
                          <span className="text-on-surface-variant">
                            <span className="material-symbols-outlined text-lg">
                              drag_indicator
                            </span>
                          </span>
                          <span className="material-symbols-outlined text-primary">
                            space_bar
                          </span>
                          <span className="text-sm font-medium text-on-surface-variant">
                            Space
                          </span>
                          <button
                            type="button"
                            onClick={() => setDeleteSlideId(slide.id)}
                            className="ml-auto text-on-surface-variant hover:text-error"
                          >
                            <span className="material-symbols-outlined text-lg">
                              delete
                            </span>
                          </button>
                        </div>
                      );
                    }
                    return (
                    <div
                      key={slide.id}
                      {...hold}
                      className={`relative group bg-surface-container/20 rounded-lg p-4 sm:p-6 border border-outline-variant/10 hover:border-primary/30 transition-all ml-3 select-none ${
                        dragging ? "cursor-grabbing" : "cursor-grab"
                      }`}
                    >
                      <div className="absolute -left-3 top-6 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary ring-4 ring-surface-container-lowest">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <button
                        type="button"
                        data-hold-ignore
                        onClick={() => openSlideEditor(slide.id)}
                        className="w-full text-left min-h-[4.5rem]"
                      >
                        {slide.content.trim() ? (
                          <p className="text-base sm:text-lg font-medium text-on-surface leading-relaxed whitespace-pre-wrap line-clamp-4">
                            {slide.content}
                          </p>
                        ) : (
                          <p className="text-base sm:text-lg font-medium text-on-surface-variant/30">
                            Click to type this point…
                          </p>
                        )}
                      </button>
                      <div className="flex flex-wrap items-start gap-3 pt-2 border-t border-outline-variant/5">
                        <span
                          className="text-on-surface-variant hover:text-on-surface cursor-grab active:cursor-grabbing touch-none mt-1.5"
                          aria-label="Hold and drag to reorder"
                        >
                          <span className="material-symbols-outlined text-lg">
                            drag_indicator
                          </span>
                        </span>
                        {showTitleVerse ? (
                          <textarea
                            rows={2}
                            className="flex-1 min-w-[12rem] bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/20 text-xs leading-relaxed resize-none"
                            placeholder="Title verse..."
                            value={slide.verse}
                            onChange={(event) =>
                              setSlides((prev) =>
                                prev.map((row) =>
                                  row.id === slide.id
                                    ? { ...row, verse: event.target.value }
                                    : row,
                                ),
                              )
                            }
                          ></textarea>
                        ) : (
                          <span className="flex-1 min-w-0" />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setFocusedSlideId(slide.id);
                            setPreviewTitleSlide(false);
                            setPreviewSlideId(slide.id);
                          }}
                          className="text-on-surface-variant hover:text-primary text-xs font-medium flex items-center gap-1 mt-1"
                          title="Preview this point on stage"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            visibility
                          </span>
                          Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFocusedSlideId(slide.id);
                            setSlides((prev) =>
                              prev.map((row) =>
                                row.id === slide.id
                                  ? { ...row, content: insertSermonGap(row.content) }
                                  : row,
                              ),
                            );
                          }}
                          className="text-on-surface-variant hover:text-primary text-xs font-medium flex items-center gap-1 mt-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            space_bar
                          </span>
                          Space
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteSlideId(slide.id)}
                          className="text-on-surface-variant hover:text-error mt-1"
                        >
                          <span className="material-symbols-outlined text-lg">
                            delete
                          </span>
                        </button>
                      </div>
                    </div>
                    );
                  })}

                  <div className="flex flex-col sm:flex-row gap-4 mt-8">
                    <button
                      type="button"
                      onClick={() => {
                        const id = `new-${Date.now()}`;
                        setSlides((prev) => [
                          ...prev,
                          { id, content: "", verse: "" },
                        ]);
                        openSlideEditor(id);
                      }}
                      className="flex-1 border-2 border-dashed border-outline-variant/20 rounded-xl py-8 flex flex-col items-center justify-center text-on-surface-variant hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all"
                    >
                      <span className="material-symbols-outlined text-2xl mb-2">
                        add_circle
                      </span>
                      <span className="font-bold text-sm uppercase tracking-wider">
                        Add New Slide
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const targetId =
                          focusedSlideId &&
                          slides.some(
                            (row) =>
                              row.id === focusedSlideId &&
                              !isSermonSpace(row.content),
                          )
                            ? focusedSlideId
                            : [...slides]
                                .reverse()
                                .find((row) => !isSermonSpace(row.content))?.id;
                        if (!targetId) return;
                        setSlides((prev) =>
                          prev.map((row) =>
                            row.id === targetId
                              ? { ...row, content: insertSermonGap(row.content) }
                              : row,
                          ),
                        );
                      }}
                      className="flex-1 border-2 border-dashed border-outline-variant/20 rounded-xl py-8 flex flex-col items-center justify-center text-on-surface-variant hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all"
                    >
                      <span className="material-symbols-outlined text-2xl mb-2">
                        space_bar
                      </span>
                      <span className="font-bold text-sm uppercase tracking-wider">
                        Add Space
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNotes((prev) => [...prev, ""])}
                      className="flex-1 border-2 border-dashed border-outline-variant/20 rounded-xl py-8 flex flex-col items-center justify-center text-on-surface-variant hover:border-secondary/40 hover:bg-secondary/5 hover:text-secondary transition-all"
                    >
                      <span className="material-symbols-outlined text-2xl mb-2">
                        sticky_note_2
                      </span>
                      <span className="font-bold text-sm uppercase tracking-wider">
                        Add Private Note
                      </span>
                    </button>
                  </div>
                  {notes.map((note, index) => (
                    <textarea
                      key={index}
                      value={note}
                      onChange={(event) =>
                        setNotes((prev) =>
                          prev.map((row, i) =>
                            i === index ? event.target.value : row,
                          ),
                        )
                      }
                      className="w-full bg-surface-container/30 border border-white/10 rounded-lg p-4 text-sm"
                      placeholder="Private note — never projected"
                      rows={2}
                    />
                  ))}
                </div>
              </div>
            </section>

            <section className="glass-panel rounded-xl p-4 sm:p-6">
              <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary mb-4">
                Metadata
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <input
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg py-3 px-4 text-sm"
                  placeholder="Speaker"
                  value={speaker}
                  onChange={(event) => setSpeaker(event.target.value)}
                />
                <input
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg py-3 px-4 text-sm"
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
                <input
                  className="w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg py-3 px-4 text-sm"
                  placeholder="Duration (35:00)"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                />
              </div>
              <input
                className="mt-4 w-full bg-surface-container-lowest border border-outline-variant/30 rounded-lg py-3 px-4 text-sm"
                placeholder="Series name"
                value={series}
                onChange={(event) => setSeries(event.target.value)}
              />
            </section>
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-4 sm:space-y-6">
            <section className="glass-panel rounded-xl p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary">
                  Stage preview
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    if (focusedPoint) {
                      setPreviewTitleSlide(false);
                      setPreviewSlideId(focusedPoint.id);
                    } else {
                      setPreviewTitleSlide(true);
                      setPreviewSlideId(null);
                    }
                  }}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Enlarge
                </button>
              </div>
              <SermonStagePreview cue={sidePreviewCue} />
              <p className="mt-2 text-[11px] text-on-surface-variant">
                {focusedPoint
                  ? `Point ${String(sermonPointNumber(slides, focusedPoint.id)).padStart(2, "0")} · ${title.trim() || "Untitled"}`
                  : "Title slide"}
              </p>
            </section>
            <section className="glass-panel rounded-xl p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary">
                  Sermons
                </h3>
                <button
                  type="button"
                  onClick={() => draft.guard(startNew)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  New
                </button>
              </div>
              <div className="space-y-2 max-h-[420px] overflow-y-auto custom-scrollbar">
                {visibleLibrary.map((row) => {
                  const selected = sermonId === row.id;
                  return (
                    <div
                      key={row.id}
                      className={`relative group rounded-lg border transition-colors ${
                        selected
                          ? "bg-primary/15 border-primary/30 text-on-surface"
                          : "bg-surface-container-low border-white/5 text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (row.id === sermonId) return;
                          draft.guard(() => {
                            void openSermon(row.id).catch((err) =>
                              setError(
                                err instanceof Error
                                  ? err.message
                                  : "Could not open sermon.",
                              ),
                            );
                          });
                        }}
                        className="w-full text-left px-3 py-3 pr-10"
                      >
                        <p className="text-sm font-medium break-words whitespace-pre-wrap">
                          {row.title}
                        </p>
                        <p className="text-[11px] opacity-70 truncate mt-0.5">
                          {[row.primary_scripture, row.speaker_name]
                            .filter(Boolean)
                            .join(" • ") || "Draft"}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDeletingSermon({ id: row.id, title: row.title })
                        }
                        className="absolute top-2.5 right-2 p-1 rounded-md text-on-surface-variant hover:text-error hover:bg-error/10"
                        aria-label={`Delete ${row.title}`}
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          delete
                        </span>
                      </button>
                    </div>
                  );
                })}
                {library.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">
                    No sermons yet. Save this draft to start your library.
                  </p>
                ) : visibleLibrary.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">
                    No sermons match “{query.trim()}”.
                  </p>
                ) : null}
              </div>
            </section>
            <section className="glass-panel rounded-xl p-4 sm:p-6 border-l-4 border-primary">
              <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary mb-1">
                Production Status
              </h3>
              <p className="text-sm text-on-surface">
                {sermonId ? "Saved and ready for a setlist." : "Unsaved draft."}
              </p>
              <p className="text-[10px] text-on-surface-variant mt-3 leading-relaxed">
                {slides.filter((slide) => slide.content.trim()).length} slides will
                project. Private notes stay off the output window.
              </p>
            </section>
          </div>
        </div>
      </div>

      <Modal
        open={Boolean(editingSlideId && editingSlide)}
        onClose={() => setEditingSlideId(null)}
        labelledBy="slide-editor-title"
        panelClassName="w-[min(960px,94vw)] h-[min(88vh,860px)] flex flex-col rounded-2xl"
        backdropClassName="bg-black/75 backdrop-blur-md"
        bare
      >
        {editingSlide ? (
          <div className="flex flex-col h-full min-h-0 bg-surface-container-lowest rounded-2xl border border-white/10 overflow-hidden">
            <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
              <div>
                <p
                  id="slide-editor-title"
                  className="text-[12px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant"
                >
                  Point {String((editingIndex >= 0 ? editingIndex : 0) + 1).padStart(2, "0")}
                </p>
                <p className="text-sm text-on-surface-variant/80">
                  Type here, then Done or Esc.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFocusedSlideId(editingSlide.id);
                    setPreviewTitleSlide(false);
                    setPreviewSlideId(editingSlide.id);
                  }}
                  className="px-3 py-2 rounded-lg text-xs font-medium text-on-surface-variant hover:text-primary hover:bg-white/5 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    visibility
                  </span>
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setSlides((prev) =>
                      prev.map((row) =>
                        row.id === editingSlide.id
                          ? { ...row, content: insertSermonGap(row.content) }
                          : row,
                      ),
                    )
                  }
                  className="px-3 py-2 rounded-lg text-xs font-medium text-on-surface-variant hover:text-primary hover:bg-white/5"
                >
                  Space
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSlideId(null)}
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold"
                >
                  Done
                </button>
              </div>
            </div>
            <textarea
              ref={editorRef}
              value={editingSlide.content}
              onChange={(event) => {
                const value = event.target.value;
                setSlides((prev) =>
                  prev.map((row) =>
                    row.id === editingSlide.id ? { ...row, content: value } : row,
                  ),
                );
              }}
              className="flex-1 min-h-0 w-full bg-transparent px-5 py-5 text-xl sm:text-2xl font-medium leading-relaxed text-on-surface resize-none focus:outline-none placeholder:text-on-surface-variant/30"
              placeholder="Main slide content or talking point…"
            />
            {editingSlide.id ===
            slides.find((row) => !isSermonSpace(row.content))?.id ? (
              <div className="shrink-0 px-5 py-4 border-t border-white/10">
                <textarea
                  rows={3}
                  className="w-full bg-surface-container-low px-4 py-3 rounded-xl border border-white/10 text-sm leading-relaxed resize-none"
                  placeholder="Title verse…"
                  value={editingSlide.verse}
                  onChange={(event) =>
                    setSlides((prev) =>
                      prev.map((row) =>
                        row.id === editingSlide.id
                          ? { ...row, verse: event.target.value }
                          : row,
                      ),
                    )
                  }
                ></textarea>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(modalPreviewCue)}
        onClose={() => {
          setPreviewSlideId(null);
          setPreviewTitleSlide(false);
        }}
        labelledBy="sermon-preview-title"
        panelClassName="w-[min(1100px,96vw)] rounded-2xl"
        backdropClassName="bg-black/80 backdrop-blur-md"
        bare
      >
        {modalPreviewCue ? (
          <div className="bg-surface-container-lowest rounded-2xl border border-white/10 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/10">
              <p
                id="sermon-preview-title"
                className="text-[12px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant"
              >
                {previewTitleSlide ? "Title slide" : modalPreviewCue.label} preview
              </p>
              <button
                type="button"
                onClick={() => {
                  setPreviewSlideId(null);
                  setPreviewTitleSlide(false);
                }}
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                aria-label="Close preview"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-4">
              <SermonStagePreview cue={modalPreviewCue} />
              {title.trim() ? (
                <p className="mt-3 text-sm text-on-surface leading-relaxed break-words whitespace-pre-wrap">
                  {title}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deletingSlide)}
        title="Delete Slide?"
        description="Are you sure you want to delete this slide? This action cannot be undone."
        onClose={() => setDeleteSlideId(null)}
        onConfirm={() => {
          if (deleteSlideId === editingSlideId) setEditingSlideId(null);
          setSlides((prev) => prev.filter((slide) => slide.id !== deleteSlideId));
          setDeleteSlideId(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deletingSermon)}
        title="Delete Sermon?"
        description={`Are you sure you want to delete "${deletingSermon?.title ?? ""}"? This action cannot be undone.`}
        highlight={deletingSermon ? `"${deletingSermon.title}"` : undefined}
        onClose={() => setDeletingSermon(null)}
        onConfirm={() => confirmDeleteSermon()}
      />
      {draft.dialog}
    </section>
  );
}
