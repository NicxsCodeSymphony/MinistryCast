import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ConfirmDialog from "../../components/modals/ConfirmDialog";
import { useUnsavedDraft } from "../../lib/useUnsavedDraft";
import { Skeleton } from "../../components/Skeleton";
import TextSizePicker from "../../components/TextSizePicker";
import ChurchSharePicker from "../../components/ChurchSharePicker";
import { LoadMoreBar } from "../../components/LoadMoreBar";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Kbd,
  PageHeader,
  RowMenu,
  SearchField,
  SectionLabel,
  ViewTabs,
} from "../../components/ui";
import {
  PointList,
  PropField,
  StagePreview,
  propInputClass,
  sermonPointNumber,
  type DraftSlide,
} from "../../components/sermon/SermonEditorParts";
import { newBoxElement, newTextElement } from "../../components/sermon/SlideCanvas";
import {
  composeSlideContent,
  layoutPlainText,
  readSlideLayout,
  stripSlideLayout,
  type SlideLayout,
} from "../../components/sermon/slideLayout";
import {
  createSermon,
  deleteSermon,
  getChurchSettings,
  getSermon,
  listChurchNames,
  listSermons,
  lookupScripture,
  readSetlistViewChurchId,
  setSermonArchived,
  updateSermon,
  writeSetlistViewChurchId,
  type ChurchName,
} from "../../lib/api";
import { getSessionProfile, isSuperadmin } from "../../lib/auth";
import { parseBibleReference } from "../../lib/bible";
import {
  DEFAULT_SERMON_TEXT_SIZE,
  SERMON_SPACE,
  formatDuration,
  insertSermonGap,
  isSermonSpace,
  isTypingTarget,
  moveItem,
  parseDurationSeconds,
  requireChurchId,
  sermonDisplayLines,
  sermonSizePx,
} from "../../lib/helpers";
import { parseSermonRuns, sermonPlainText } from "../../lib/sermonMarkup";
import {
  asStageBackground,
  type StageBackgroundId,
} from "../../lib/stageBackgrounds";
import { useSearch } from "../../lib/SearchContext";
import { usePageActive } from "../../lib/PageActiveContext";
import { usePrefs } from "../../lib/PrefsContext";
import { useToast } from "../../lib/ToastContext";
import { reloadChurchCatalog } from "../../lib/offline/sync";
import { PAGE_SIZE, type LiveCue, type Sermon } from "../../lib/types";
import { AutoGrowText } from "../../components/StageEditor";
import LibraryTable, { LibraryTile } from "../../components/LibraryTable";
import { SermonInsights } from "../../components/library/LibraryInsights";
import { InsightsStripSkeleton } from "../../components/library/InsightsStrip";
import Icon from "../../components/Icon";

const TITLE_KEY = "title";

function escapeMarkup(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function SermonRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-4 h-11 pl-6 pr-4 border-b border-[color:var(--mc-hairline)]">
          <span className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-3 w-56 max-w-full rounded" />
            <Skeleton className="h-2.5 w-36 max-w-full rounded" />
          </span>
          <Skeleton className="hidden lg:block h-2.5 w-24 rounded" />
          <Skeleton className="h-2.5 w-20 rounded" />
          <Skeleton className="h-2.5 w-10 rounded" />
          <Skeleton className="h-4 w-12 rounded-md" />
        </li>
      ))}
    </ul>
  );
}

function SermonListSkeleton() {
  return (
    <section className="h-full flex flex-col bg-surface" aria-busy="true">
      <div className="shrink-0 border-b border-[color:var(--mc-hairline)]">
        <div className="flex items-center gap-3 px-6 h-14">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="ml-auto h-8 w-32 rounded-lg" />
        </div>
        <div className="flex items-center gap-2 px-6 pb-3">
          <Skeleton className="h-8 w-36 rounded-lg" />
          <Skeleton className="ml-auto h-8 w-64 rounded-lg" />
        </div>
      </div>
      <div className="px-4 sm:px-6 pt-4">
        <InsightsStripSkeleton id="sermons" cards={3} className="mb-4" />
        <div className="rounded-xl border border-white/5 overflow-hidden">
          <div className="h-9 bg-surface-container-high border-b border-white/5" />
          <SermonRowsSkeleton />
        </div>
      </div>
    </section>
  );
}

function SermonEditorSkeleton() {
  return (
    <section className="h-full flex flex-col bg-surface" aria-busy="true">
      <div className="shrink-0 flex items-center gap-3 px-6 h-14 border-b border-[color:var(--mc-hairline)]">
        <Skeleton className="h-3.5 w-16 rounded" />
        <Skeleton className="h-4 w-48 rounded" />
        <Skeleton className="ml-auto h-8 w-20 rounded-lg" />
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          <div className="max-w-[760px] mx-auto px-6 pt-8 space-y-4">
            <Skeleton className="h-2.5 w-20 rounded" />
            <Skeleton className="h-8 w-80 max-w-full rounded" />
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 pt-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-6 rounded" />
              ))}
            </div>
            <div className="pt-8 space-y-3">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-10 rounded" />
              ))}
            </div>
          </div>
        </div>
        <div className="hidden lg:block w-[340px] xl:w-[360px] border-l border-[color:var(--mc-hairline)] p-5 space-y-3">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="aspect-video rounded-lg" />
          <Skeleton className="h-3 w-48 rounded" />
        </div>
      </div>
    </section>
  );
}

/** The title-slide verse lives on the first point, so it follows whichever point ends up first. */
function carryTitleVerse(prev: DraftSlide[], next: DraftSlide[]) {
  const before = prev.find((row) => !isSermonSpace(row.content));
  const after = next.find((row) => !isSermonSpace(row.content));
  if (!before || !after || before.id === after.id || !before.verse.trim()) return next;
  return next.map((row) =>
    row.id === after.id
      ? { ...row, verse: before.verse }
      : row.id === before.id
        ? { ...row, verse: "" }
        : row,
  );
}

const EMPTY_SLIDES: DraftSlide[] = [{ id: "new-1", content: "", verse: "" }];

/** Local `YYYY-MM-DD` for today, to split sermons into upcoming and past. */
function todayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function formatServiceDate(value: string | null | undefined) {
  if (!value) return "";
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return value;
  const date = new Date(y, m - 1, d);
  const sameYear = y === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function statusLabel(status: string | null | undefined) {
  return status === "ready" ? "Ready" : "Draft";
}

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
  status: string;
}) {
  return JSON.stringify(input);
}

export default function Sermon() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageActive = usePageActive();
  const { query } = useSearch();
  const toast = useToast();
  const { t } = usePrefs();
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
  const [status, setStatus] = useState("ready");
  const [filter, setFilter] = useState("");
  const [library, setLibrary] = useState<Sermon[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [total, setTotal] = useState(0);
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
  const [textSize, setTextSize] = useState<string>(DEFAULT_SERMON_TEXT_SIZE);
  const [selectedKey, setSelectedKey] = useState(TITLE_KEY);
  const [syncNonce, setSyncNonce] = useState(0);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [opening, setOpening] = useState(false);
  const [canvasStart, setCanvasStart] = useState<{
    slideId: string;
    id: string;
    edit: boolean;
  } | null>(null);
  const [stageBg, setStageBg] = useState<StageBackgroundId>("sanctuary");
  const [baseline, setBaseline] = useState<string | null>(null);
  const lastAutoSlide = useRef("");
  const persistBypass = useRef<(fn: () => void) => void>((fn) => fn());
  const persistSave = useRef<() => Promise<boolean>>(async () => false);

  const selectSlide = (key: string, focus = false) => {
    setSelectedKey(key);
    setSyncNonce((n) => n + 1);
    setFocusKey(focus ? `${key}:${Date.now()}` : null);
  };

  useEffect(() => {
    void getChurchSettings()
      .then((settings) => setStageBg(asStageBackground(settings?.stage_background)))
      .catch(() => undefined);
  }, []);

  const searchText = (filter.trim() || query.trim());
  const visibleLibrary = useMemo(() => {
    const q = searchText.toLowerCase();
    if (!q) return library;
    return library.filter((row) =>
      [row.title, row.primary_scripture, row.speaker_name, row.series_name].some(
        (value) => (value ?? "").toLowerCase().includes(q),
      ),
    );
  }, [library, searchText]);

  const applySermon = (sermon: Sermon, keepSelection = false) => {
    const nextSlides =
      (sermon.slides ?? []).length
        ? (sermon.slides ?? []).map((slide) => ({
            id: slide.id,
            content: stripSlideLayout(slide.content),
            verse: slide.scripture_reference ?? "",
            layout: readSlideLayout(slide.content),
          }))
        : EMPTY_SLIDES;
    const nextNotes = (sermon.notes ?? []).map((note) => note.content);
    const nextDuration = sermon.est_duration_seconds
      ? formatDuration(sermon.est_duration_seconds)
      : "";
    const nextSize = sermon.text_size || DEFAULT_SERMON_TEXT_SIZE;
    const nextStatus = sermon.status || "draft";
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
    setStatus(nextStatus);
    setChurchIds(
      sermon.share_church_ids?.length
        ? sermon.share_church_ids
        : [sermon.church_id],
    );
    lastAutoSlide.current = "";
    const keepIndex = slides.findIndex((row) => row.id === selectedKey);
    selectSlide(
      keepSelection && keepIndex >= 0 && nextSlides[keepIndex]
        ? nextSlides[keepIndex].id
        : TITLE_KEY,
    );
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
        status: nextStatus,
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
    setTextSize(DEFAULT_SERMON_TEXT_SIZE);
    setStatus("ready");
    setChurchIds(viewChurchId ? [viewChurchId] : []);
    lastAutoSlide.current = "";
    selectSlide(TITLE_KEY);
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
        textSize: DEFAULT_SERMON_TEXT_SIZE,
        status: "ready",
      }),
    );
    setSearchParams({ sermon: "new" }, { replace: true });
  };

  const openSermon = async (id: string) => {
    setOpening(true);
    try {
      const row = await getSermon(id, { fresh: true });
      applySermon(row);
      setSearchParams({ sermon: id });
    } finally {
      setOpening(false);
    }
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
      toast.success(t("sermons.deleted"));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("sermons.deleteError");
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
        // Local-first: show IndexedDB sermons immediately.
        const page = await listSermons({
          limit: PAGE_SIZE,
          offset: 0,
          viewChurchId: admin ? view : null,
        });
        setLibrary(page.items);
        setTotal(page.total);
        setLoading(false);

        const churchId = admin
          ? view
          : await requireChurchId().catch(() => "");
        if (churchId) {
          void reloadChurchCatalog(churchId)
            .then(() =>
              loadSermonPage(admin ? view : "", admin, 0, false),
            )
            .catch(() => undefined);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("sermons.loadError"));
        toast.error(err instanceof Error ? err.message : t("sermons.loadError"));
        setLoading(false);
      }
    })();
  }, []);

  // KeepAlive: /sermon?sermon=id must hydrate the editor when this page stays mounted.
  useEffect(() => {
    if (!pageActive || loading) return;
    const want = searchParams.get("sermon");
    if (!want || want === "new") return;
    if (want === sermonId) return;

    let cancelled = false;
    void getSermon(want, { fresh: true })
      .then((row) => {
        if (cancelled) return;
        applySermon(row);
        setLibrary((prev) =>
          prev.some((item) => item.id === row.id) ? prev : [row, ...prev],
        );
      })
      .catch((err) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Could not open sermon.";
        setError(message);
        toast.error(message);
        setSearchParams({}, { replace: true });
      });
    return () => {
      cancelled = true;
    };
  }, [pageActive, loading, searchParams, sermonId, setSearchParams, toast]);

  const loadSermonPage = async (
    view: string,
    asAdmin: boolean,
    nextOffset = 0,
    append = false,
    archived = showArchive,
  ) => {
    if (append) setLoadingMore(true);
    else if (library.length === 0) setLoading(true);
    try {
      const page = await listSermons({
        limit: PAGE_SIZE,
        offset: nextOffset,
        viewChurchId: asAdmin ? view : null,
        archived,
      });
      setLibrary((prev) => (append ? [...prev, ...page.items] : page.items));
      setTotal(page.total);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const switchViewChurch = async (next: string) => {
    writeSetlistViewChurchId(next);
    setViewChurchId(next);
    await loadSermonPage(next, true, 0, false);
    if (next) {
      void reloadChurchCatalog(next, { force: true })
        .then(() => loadSermonPage(next, true, 0, false))
        .catch(() => undefined);
    }
  };

  // KeepAlive preserves sermon state when visiting Presentation — no refetch on return.

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
          setSyncNonce((n) => n + 1);
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
      toast.warning("Type the sermon title on the title slide.");
      selectSlide(TITLE_KEY);
      return false;
    }
    if (superadmin && churchIds.length === 0) {
      setDetailsOpen(true);
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
        status,
        text_size: textSize,
        slides: slides.map((slide) => ({
          id: slide.id.startsWith("new-") ? undefined : slide.id,
          content: slide.layout ? composeSlideContent(slide.layout) : slide.content,
          scripture_reference: slide.verse,
        })),
        notes: notes.map((content) => ({ content })),
        share_church_ids: churchIds,
      };
      const next = sermonId
        ? await updateSermon(sermonId, payload)
        : await createSermon(payload);
      applySermon(next, true);
      setLibrary((prev) => [next, ...prev.filter((row) => row.id !== next.id)]);
      persistBypass.current(() =>
        setSearchParams({ sermon: next.id }, { replace: true }),
      );
      setSaved(true);
      toast.success(sermonId ? t("sermons.updated") : t("sermons.saved"));
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("sermons.saveError");
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
      status,
    }) !== baseline;
  const draft = useUnsavedDraft(dirty, {
    enabled: editorOpen,
    title: "Unsaved sermon",
    description:
      "This sermon draft is not saved. Save it before you leave, or you’ll lose what you typed.",
    onSave: () => persistSave.current(),
  });
  persistBypass.current = draft.bypass;

  useEffect(() => {
    if (!editorOpen || !pageActive) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persistSave.current();
        return;
      }
      if (isTypingTarget(event.target)) return;
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      const keys = [TITLE_KEY, ...slides.map((row) => row.id)];
      const at = keys.indexOf(selectedKey);
      const next = keys[at + (event.key === "ArrowDown" ? 1 : -1)];
      if (!next) return;
      event.preventDefault();
      selectSlide(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (loading && !searchParams.get("sermon") && library.length === 0) {
    return <SermonListSkeleton />;
  }

  const selectedParam = searchParams.get("sermon");
  const showList = !selectedParam;

  const reportError = (fallback: string) => (err: unknown) => {
    const message = err instanceof Error ? err.message : fallback;
    setError(message);
    toast.error(message);
  };

  const switchArchive = (archived: boolean) => {
    if (archived === showArchive) return;
    setShowArchive(archived);
    void loadSermonPage(viewChurchId, superadmin, 0, false, archived).catch(
      reportError(t("sermons.loadError")),
    );
  };

  const openFromList = (id: string) => {
    void openSermon(id).catch(reportError("Could not open sermon."));
  };

  const setArchived = (id: string, archived: boolean) => {
    void setSermonArchived(id, archived)
      .then(() => loadSermonPage(viewChurchId, superadmin, 0, false, showArchive))
      .then(() => toast.success(archived ? "Sermon archived." : t("sermons.restored")))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : t("sermons.loadError"));
      });
  };

  const deleteDialog = (
    <ConfirmDialog
      open={Boolean(deletingSermon)}
      title="Delete Sermon?"
      description={`Are you sure you want to delete "${deletingSermon?.title ?? ""}"? This action cannot be undone.`}
      highlight={deletingSermon ? `"${deletingSermon.title}"` : undefined}
      onClose={() => setDeletingSermon(null)}
      onConfirm={() => confirmDeleteSermon()}
    />
  );

  if (showList) {
    const today = todayKey();
    const upcoming = visibleLibrary
      .filter((row) => row.service_date && row.service_date.slice(0, 10) >= today)
      .sort((a, b) => (a.service_date ?? "").localeCompare(b.service_date ?? ""));
    const past = visibleLibrary
      .filter((row) => row.service_date && row.service_date.slice(0, 10) < today)
      .sort((a, b) => (b.service_date ?? "").localeCompare(a.service_date ?? ""));
    const undated = visibleLibrary.filter((row) => !row.service_date);
    const groups = [
      { label: "Upcoming", rows: upcoming },
      { label: "Past", rows: past },
      { label: "Undated", rows: undated },
    ].filter((group) => group.rows.length);

    return (
      <section className="h-full flex flex-col bg-surface text-on-surface">
        <PageHeader
          title={t("sermons.title")}
          meta={
            total === 1
              ? t("sermons.count", { n: total })
              : t("sermons.countMany", { n: total })
          }
          actions={
            <Button variant="primary" icon="add" onClick={startNew}>
              {t("sermons.new")}
            </Button>
          }
          toolbar={
            <>
              <ViewTabs
                label="Sermon list"
                value={showArchive ? "archive" : "active"}
                onChange={(next) => switchArchive(next === "archive")}
                tabs={[
                  { id: "active", label: t("common.active") },
                  { id: "archive", label: t("common.archive") },
                ]}
              />
              {superadmin ? (
                <label className="flex items-center gap-2">
                  <span className="sr-only">{t("sermons.viewingChurch")}</span>
                  <select
                    aria-label={t("sermons.viewingChurch")}
                    value={viewChurchId}
                    onChange={(event) => {
                      void switchViewChurch(event.target.value).catch(
                        reportError(t("sermons.loadError")),
                      );
                    }}
                    className="ui-input !h-8 !w-auto min-w-[200px]"
                  >
                    <option value="">{t("common.selectChurch")}</option>
                    {churches.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <SearchField
                value={filter}
                onChange={setFilter}
                placeholder="Search sermons"
                className="ml-auto w-64"
              />
            </>
          }
        />

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {error ? <p className="px-6 pt-3 text-[13px] text-error">{error}</p> : null}

          <div className="px-4 sm:px-6 pt-4">
            <SermonInsights
              viewChurchId={superadmin ? viewChurchId : null}
              version={library}
            />
          </div>

          {visibleLibrary.length === 0 ? (
            <EmptyState
              icon={searchText ? "search" : "menu_book"}
              title={
                searchText
                  ? t("sermons.emptyQuery", { q: searchText })
                  : showArchive
                    ? t("sermons.emptyArchive")
                    : t("sermons.empty")
              }
              action={
                !searchText && !showArchive ? (
                  <Button variant="secondary" icon="add" onClick={startNew}>
                    {t("sermons.new")}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="pb-6">
              <div className="px-4 sm:px-6 flex flex-col">
                <LibraryTable
                  ariaLabel="Sermons"
                  columns={[
                    { key: "title", header: "Title" },
                    { key: "speaker", header: "Speaker", hideBelow: "md" },
                    { key: "scripture", header: "Scripture", hideBelow: "lg" },
                    { key: "date", header: "Date", align: "right" },
                    { key: "length", header: "Length", align: "right", hideBelow: "sm" },
                    { key: "status", header: "Status", align: "right" },
                  ]}
                  groups={groups.map((group) => ({
                    id: group.label,
                    label: group.label,
                    rows: group.rows.map((row) => {
                      const subtitle =
                        [row.primary_scripture, row.speaker_name].filter(Boolean).join(" · ") ||
                        t("sermons.draft");
                      return {
                        id: row.id,
                        label: `${row.title} ${subtitle}`,
                        onOpen: () => openFromList(row.id),
                        leading: (
                          <LibraryTile>
                            <Icon name="menu_book" className="text-[18px]" />
                          </LibraryTile>
                        ),
                        cells: {
                          title: (
                            <span className="block truncate">
                              {row.title}
                              {row.series_name ? (
                                <span className="ml-2 font-normal text-[12px] text-on-surface-variant">
                                  {row.series_name}
                                </span>
                              ) : null}
                            </span>
                          ),
                          speaker: row.speaker_name || "—",
                          scripture: row.primary_scripture || "—",
                          date: (
                            <span className="tabular-nums whitespace-nowrap">
                              {formatServiceDate(row.service_date) || "—"}
                            </span>
                          ),
                          length: (
                            <span className="tabular-nums">
                              {row.est_duration_seconds
                                ? formatDuration(row.est_duration_seconds)
                                : "—"}
                            </span>
                          ),
                          status: (
                            <Badge tone={row.status === "ready" ? "success" : "neutral"}>
                              {statusLabel(row.status)}
                            </Badge>
                          ),
                        },
                        actions: (
                          <RowMenu
                            label={`More actions for ${row.title}`}
                            items={[
                              {
                                label: "Open",
                                icon: "open_in_new",
                                onSelect: () => openFromList(row.id),
                              },
                              showArchive
                                ? {
                                    label: t("common.restore"),
                                    icon: "unarchive",
                                    onSelect: () => setArchived(row.id, false),
                                  }
                                : {
                                    label: t("common.archive"),
                                    icon: "archive",
                                    onSelect: () => setArchived(row.id, true),
                                  },
                              {
                                label: "Delete",
                                icon: "delete",
                                danger: true,
                                onSelect: () =>
                                  setDeletingSermon({ id: row.id, title: row.title }),
                              },
                            ]}
                          />
                        ),
                      };
                    }),
                  }))}
                />
              </div>
              {loadingMore ? <SermonRowsSkeleton rows={3} /> : null}
              <div className={`px-6 ${loadingMore ? "hidden" : ""}`}>
                <LoadMoreBar
                  shown={library.length}
                  total={total}
                  hasMore={library.length < total}
                  loading={loadingMore}
                  onMore={() => {
                    setLoadingMore(true);
                    void listSermons({
                      limit: PAGE_SIZE,
                      offset: library.length,
                      viewChurchId: superadmin ? viewChurchId : null,
                      query: searchText || undefined,
                      archived: showArchive,
                    })
                      .then((page) => {
                        setLibrary((prev) => [...prev, ...page.items]);
                        setTotal(page.total);
                      })
                      .catch(reportError(t("sermons.loadError")))
                      .finally(() => setLoadingMore(false));
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {deleteDialog}
        {draft.dialog}
      </section>
    );
  }

  if (
    opening ||
    (selectedParam && selectedParam !== "new" && selectedParam !== sermonId)
  ) {
    return <SermonEditorSkeleton />;
  }

  const deletingSlide = slides.find((slide) => slide.id === deleteSlideId);
  const selectedSlide =
    selectedKey === TITLE_KEY
      ? undefined
      : slides.find((row) => row.id === selectedKey);
  const titleHolder = slides.find((row) => !isSermonSpace(row.content));
  const projectedCount =
    1 +
    slides.filter(
      (row) =>
        isSermonSpace(row.content) ||
        Boolean(row.layout?.els.length) ||
        sermonPlainText(row.content).trim(),
    ).length;

  const patchSlide = (id: string, patch: Partial<DraftSlide>) =>
    setSlides((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );

  /** Inserts after `afterKey` (title = at the top), or at the end when omitted. */
  const insertSlide = (content: string, afterKey?: string) => {
    const id = `new-${Date.now()}`;
    setSlides((prev) => {
      const index = afterKey ? prev.findIndex((row) => row.id === afterKey) : -1;
      const at =
        afterKey === TITLE_KEY ? 0 : index >= 0 ? index + 1 : prev.length;
      const next = [
        ...prev.slice(0, at),
        { id, content, verse: "" },
        ...prev.slice(at),
      ];
      return carryTitleVerse(prev, next);
    });
    selectSlide(id, !isSermonSpace(content));
  };

  const moveSlide = (id: string, delta: number) => {
    const from = slides.findIndex((row) => row.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= slides.length) return;
    setSlides((prev) => carryTitleVerse(prev, moveItem(prev, from, to)));
    selectSlide(id);
  };

  const removeSlide = (id: string) => {
    const index = slides.findIndex((row) => row.id === id);
    const remaining = slides.filter((row) => row.id !== id);
    const next = remaining.length
      ? remaining
      : [{ id: `new-${Date.now()}`, content: "", verse: "" }];
    setSlides((prev) => carryTitleVerse(prev, next));
    selectSlide(index > 0 ? next[index - 1].id : TITLE_KEY);
  };

  /** Turns a plain point into a canvas slide: its text becomes a box, then a new text box or shape is added. */
  const designSlide = (id: string, kind: "text" | "box") => {
    const row = slides.find((slide) => slide.id === id);
    if (!row) return;
    const els: SlideLayout["els"] = row.layout ? [...row.layout.els] : [];
    if (!row.layout) {
      const existing = parseSermonRuns(row.content)
        .map((run) => run.text)
        .join("")
        .trim();
      if (existing) {
        els.push({
          ...newTextElement(existing, sermonSizePx(textSize)),
          x: 5,
          y: 6,
          w: 90,
          h: 40,
          align: "left",
        });
      }
    }
    const added = kind === "text" ? newTextElement() : newBoxElement();
    const nextEls = kind === "box" ? [added, ...els] : [...els, added];
    patchSlide(id, { layout: { v: 1, els: nextEls } });
    setCanvasStart({ slideId: id, id: added.id, edit: kind === "text" });
    if (selectedKey !== id) selectSlide(id);
  };

  const requestDelete = (slide: DraftSlide) => {
    const empty = slide.layout
      ? !slide.layout.els.length
      : !sermonPlainText(slide.content).trim();
    if (isSermonSpace(slide.content) || empty) {
      removeSlide(slide.id);
    } else {
      setDeleteSlideId(slide.id);
    }
  };

  const titleVerse = titleHolder?.verse.trim() || scripture.trim();
  const previewCue: LiveCue = !selectedSlide
    ? {
        id: "preview-title",
        itemId: "preview",
        kind: "sermon",
        label: "TITLE",
        tag: "TTL",
        title: title.trim(),
        preview: title.trim(),
        lines: [title.trim() || "Untitled sermon"],
        heading: null,
        align: "center",
        textSize,
        verse: titleVerse || null,
        versePlacement: titleVerse ? "bottom" : undefined,
        titleSlide: true,
      }
    : isSermonSpace(selectedSlide.content)
      ? {
          id: selectedSlide.id,
          itemId: "preview",
          kind: "sermon",
          label: "BLANK",
          tag: "BLK",
          title: title.trim(),
          preview: "",
          lines: [],
          heading: null,
          blank: true,
        }
      : (() => {
          const lines = selectedSlide.layout
            ? [composeSlideContent(selectedSlide.layout)]
            : sermonDisplayLines(selectedSlide.content);
          return {
            id: selectedSlide.id,
            itemId: "preview",
            kind: "sermon" as const,
            label: "POINT",
            tag: "P",
            title: title.trim(),
            preview: sermonPlainText(selectedSlide.content).slice(0, 80),
            lines: lines.length ? lines : [""],
            heading: null,
            slideId: selectedSlide.id,
            align: "start" as const,
            textSize,
          };
        })();
  const previewLabel = !selectedSlide
    ? "Title slide"
    : isSermonSpace(selectedSlide.content)
      ? "Blank slide"
      : `Point ${sermonPointNumber(slides, selectedSlide.id)}`;
  const sermonName = title.trim() || "Untitled sermon";
  const saveState = dirty ? "Unsaved changes" : sermonId ? "All changes saved" : "Not saved yet";

  return (
    <section className="h-full flex flex-col bg-surface text-on-surface">
      <PageHeader
        crumbs={[
          {
            label: t("sermons.title"),
            onClick: () => draft.guard(() => setSearchParams({})),
          },
        ]}
        title={sermonName}
        meta={
          <span className={`flex items-center gap-1.5 ${dirty ? "text-on-surface" : ""}`}>
            {dirty ? <span className="w-1.5 h-1.5 rounded-full bg-primary" aria-hidden /> : null}
            {saveState}
          </span>
        }
        actions={
          <>
            <IconButton
              icon={detailsOpen ? "right_panel_close" : "right_panel_open"}
              label={detailsOpen ? "Hide side panel" : "Show side panel"}
              onClick={() => setDetailsOpen((open) => !open)}
            />
            {sermonId ? (
              <RowMenu
                label="More actions"
                items={[
                  {
                    label: "Delete",
                    icon: "delete",
                    danger: true,
                    onSelect: () => setDeletingSermon({ id: sermonId, title: sermonName }),
                  },
                ]}
              />
            ) : null}
            <Button
              variant="primary"
              disabled={saving}
              icon={saved && !dirty && !saving ? "check" : "save"}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : saved && !dirty ? "Saved" : "Save"}
            </Button>
          </>
        }
      />

      {error ? (
        <p className="shrink-0 px-6 py-2 text-[13px] text-error border-b border-[color:var(--mc-hairline)]">
          {error}
        </p>
      ) : null}

      <div className="flex-1 min-h-0 flex">
        <main className="flex-1 min-w-0 overflow-y-auto custom-scrollbar">
          <div className="max-w-[760px] mx-auto px-6 pt-8 pb-24">
            <p className="text-[12px] text-on-surface-variant">
              {sermonId ? "Edit sermon" : "New sermon"}
            </p>
            <div
              className="mt-1"
              onFocusCapture={() => {
                if (selectedKey !== TITLE_KEY) selectSlide(TITLE_KEY);
              }}
            >
              <AutoGrowText
                value={title}
                onChange={setTitle}
                placeholder="Sermon title"
                autoFocus={!sermonId && !title}
                className="w-full text-[28px] leading-[1.25] font-semibold tracking-[-0.01em] text-on-surface placeholder:text-outline"
                style={{}}
              />
            </div>
            {titleHolder ? (
              <input
                value={titleHolder.verse}
                onFocus={() => {
                  if (selectedKey !== TITLE_KEY) selectSlide(TITLE_KEY);
                }}
                onChange={(event) => patchSlide(titleHolder.id, { verse: event.target.value })}
                placeholder="Verse on the title slide (optional) · Fil 3:14"
                aria-label="Title slide verse"
                className="mt-2 block w-full bg-transparent border-0 outline-none p-0 text-[14px] text-on-surface-variant placeholder:text-outline"
              />
            ) : null}

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
              <PropField label="Speaker">
                <input
                  className={propInputClass}
                  placeholder="Who is preaching"
                  value={speaker}
                  onChange={(event) => setSpeaker(event.target.value)}
                />
              </PropField>
              <PropField
                label="Scripture"
                hint={
                  scriptureBusy
                    ? <Skeleton className="h-2.5 w-40 mt-1 mb-0.5 rounded" />
                    : scriptureHint && !scripturePreview
                      ? scriptureHint
                      : undefined
                }
              >
                <input
                  className={propInputClass}
                  placeholder="e.g. John 4:23"
                  value={scripture}
                  onChange={(event) => setScripture(event.target.value)}
                />
              </PropField>
              <PropField label="Series">
                <input
                  className={propInputClass}
                  placeholder="Series name"
                  value={series}
                  onChange={(event) => setSeries(event.target.value)}
                />
              </PropField>
              <PropField label="Service date">
                <input
                  className={propInputClass}
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </PropField>
              <PropField label="Duration">
                <input
                  className={`${propInputClass} tabular-nums`}
                  placeholder="35:00"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                />
              </PropField>
              <PropField label="Status">
                <select
                  className={propInputClass}
                  value={status === "ready" ? "ready" : "draft"}
                  onChange={(event) => setStatus(event.target.value)}
                  aria-label="Status"
                >
                  <option value="draft">Draft</option>
                  <option value="ready">Ready</option>
                </select>
              </PropField>
              <PropField
                label="Point text size"
                wide
                hint="For text-only points. Text boxes on a canvas slide are sized in the slide toolbar."
              >
                <div className="py-0.5">
                  <TextSizePicker value={textSize} onChange={setTextSize} />
                </div>
              </PropField>
            </div>

            <div className="mt-10 flex items-baseline justify-between gap-3 mb-2">
              <h2 className="text-[13px] font-medium text-on-surface">Slides</h2>
              <span className="text-[12px] text-on-surface-variant tabular-nums">
                {projectedCount} slide{projectedCount === 1 ? "" : "s"} will project
              </span>
            </div>
            <PointList
              slides={slides}
              selectedKey={selectedKey}
              syncNonce={syncNonce}
              focusKey={focusKey}
              onSelect={(id, focus) => {
                setCanvasStart(null);
                selectSlide(id, focus);
              }}
              onChange={(id, content) => patchSlide(id, { content })}
              onMove={moveSlide}
              onAddSpace={(id) => {
                const row = slides.find((slide) => slide.id === id);
                if (!row) return;
                patchSlide(id, { content: insertSermonGap(row.content) });
                selectSlide(id);
              }}
              onInsertAfter={(id, content) => insertSlide(content, id)}
              onDelete={requestDelete}
              stageBg={stageBg}
              canvasStart={canvasStart}
              onLayoutChange={(id, layout) => patchSlide(id, { layout })}
              onDesign={designSlide}
              onPlainText={(id) => {
                const row = slides.find((slide) => slide.id === id);
                if (!row?.layout) return;
                patchSlide(id, {
                  content: escapeMarkup(layoutPlainText(row.layout)),
                  layout: null,
                });
                selectSlide(id);
              }}
            />
            <div className="mt-3 flex items-center gap-2">
              <Button variant="ghost" size="sm" icon="add" onClick={() => insertSlide("")}>
                Add point
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="crop_landscape"
                onClick={() => insertSlide(SERMON_SPACE)}
              >
                Add blank slide
              </Button>
              <span className="ml-auto hidden sm:flex items-center gap-1 text-[12px] text-on-surface-variant">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                <span className="ml-1">move between slides</span>
                <span className="mx-2 text-outline">·</span>
                <Kbd>⌘S</Kbd>
                <span className="ml-1">save</span>
              </span>
            </div>
          </div>
        </main>

        {detailsOpen ? (
          <aside
            aria-label="Sermon side panel"
            className="shrink-0 w-[340px] xl:w-[360px] border-l border-[color:var(--mc-hairline)] overflow-y-auto custom-scrollbar"
          >
            <div className="p-5 space-y-7">
              <div>
                <div className="flex items-baseline justify-between">
                  <SectionLabel>Preview</SectionLabel>
                  <span className="text-[12px] text-on-surface-variant">{previewLabel}</span>
                </div>
                <StagePreview cue={previewCue} stageBg={stageBg} />
                <p className="mt-2 text-[12px] text-on-surface-variant">
                  This is what the screen shows. Only the slides are projected.
                </p>
              </div>

              {scripturePreview ? (
                <div>
                  <div className="flex items-baseline justify-between">
                    <SectionLabel>Scripture</SectionLabel>
                    <span className="text-[12px] text-on-surface-variant">KJV • public domain</span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-on-surface line-clamp-6">
                    {scripturePreview}
                  </p>
                  {scriptureHint ? (
                    <p className="mt-1.5 text-[11px] text-on-surface-variant">{scriptureHint}</p>
                  ) : null}
                </div>
              ) : null}

              <div>
                <SectionLabel>Private notes</SectionLabel>
                <div className="space-y-2">
                  {notes.map((note, index) => (
                    <div key={index} className="group relative">
                      <textarea
                        value={note}
                        onChange={(event) =>
                          setNotes((prev) =>
                            prev.map((row, i) => (i === index ? event.target.value : row)),
                          )
                        }
                        className="ui-input !h-auto py-2 pr-9 resize-none leading-relaxed"
                        placeholder="Never shown on screen"
                        rows={3}
                      />
                      <span className="absolute top-1 right-1">
                        <IconButton
                          icon="close"
                          label="Remove note"
                          onClick={() => setNotes((prev) => prev.filter((_, i) => i !== index))}
                        />
                      </span>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="sticky_note_2"
                    onClick={() => setNotes((prev) => [...prev, ""])}
                  >
                    Add private note
                  </Button>
                </div>
              </div>

              {superadmin ? (
                <div>
                  <ChurchSharePicker
                    churches={churches}
                    value={churchIds}
                    onChange={setChurchIds}
                    label="Churches that can view this sermon"
                  />
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(deletingSlide)}
        title="Delete this slide?"
        description="It is removed when you save the sermon."
        highlight={
          deletingSlide
            ? (deletingSlide.layout
                ? layoutPlainText(deletingSlide.layout) || "Designed slide"
                : sermonPlainText(deletingSlide.content)
              ).slice(0, 80)
            : undefined
        }
        onClose={() => setDeleteSlideId(null)}
        onConfirm={() => {
          if (deleteSlideId) removeSlide(deleteSlideId);
          setDeleteSlideId(null);
        }}
      />

      {deleteDialog}
      {draft.dialog}
    </section>
  );
}
