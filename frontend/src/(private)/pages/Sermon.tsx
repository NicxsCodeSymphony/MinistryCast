import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ConfirmDialog from "../../components/modals/ConfirmDialog";
import { useUnsavedDraft } from "../../lib/useUnsavedDraft";
import { PageSkeleton } from "../../components/Skeleton";
import TextSizePicker from "../../components/TextSizePicker";
import ChurchSharePicker from "../../components/ChurchSharePicker";
import { LoadMoreBar } from "../../components/LoadMoreBar";
import {
  ScaledStage,
  SlideRow,
  StagePointEditor,
  StageTitleEditor,
  ToolButton,
} from "../../components/StageEditor";
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
  formatRelative,
  insertSermonGap,
  isSermonSpace,
  isTypingTarget,
  moveItem,
  parseDurationSeconds,
  requireChurchId,
} from "../../lib/helpers";
import { sermonPlainText } from "../../lib/sermonMarkup";
import {
  asStageBackground,
  stageUsesDarkText,
  type StageBackgroundId,
} from "../../lib/stageBackgrounds";
import { useSearch } from "../../lib/SearchContext";
import { usePageActive } from "../../lib/PageActiveContext";
import { usePrefs } from "../../lib/PrefsContext";
import { useToast } from "../../lib/ToastContext";
import { reloadChurchCatalog } from "../../lib/offline/sync";
import { PAGE_SIZE, type Sermon } from "../../lib/types";

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

const TITLE_KEY = "title";

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
  const [detailsOpen, setDetailsOpen] = useState(false);
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

  const visibleLibrary = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return library;
    return library.filter((row) =>
      [row.title, row.primary_scripture, row.speaker_name, row.series_name].some(
        (value) => (value ?? "").toLowerCase().includes(q),
      ),
    );
  }, [library, query]);

  const applySermon = (sermon: Sermon, keepSelection = false) => {
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
    const nextSize = sermon.text_size || DEFAULT_SERMON_TEXT_SIZE;
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
    setChurchIds(viewChurchId ? [viewChurchId] : []);
    lastAutoSlide.current = "";
    selectSlide(TITLE_KEY);
    setDetailsOpen(false);
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
      }),
    );
    setSearchParams({ sermon: "new" }, { replace: true });
  };

  const openSermon = async (id: string) => {
    const row = await getSermon(id, { fresh: true });
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
    return <PageSkeleton />;
  }

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
                  {t("sermons.library")}
                </Link>
                <span className="material-symbols-outlined text-sm">chevron_right</span>
                <span className="text-primary">{t("sermons.title")}</span>
              </nav>
              <h2 className="text-[clamp(1.75rem,3vw,2rem)] font-semibold tracking-[-0.01em] text-on-surface">
                {t("sermons.title")}
              </h2>
              <p className="text-on-surface-variant text-sm mt-2">
                {total === 1
                  ? t("sermons.count", { n: total })
                  : t("sermons.countMany", { n: total })}
              </p>
              <div className="mt-4 flex p-1 bg-surface-container-high rounded-full border border-white/5 w-fit">
                <button
                  type="button"
                  onClick={() => {
                    if (!showArchive) return;
                    setShowArchive(false);
                    void loadSermonPage(
                      viewChurchId,
                      superadmin,
                      0,
                      false,
                      false,
                    ).catch((err) => {
                      const message =
                        err instanceof Error
                          ? err.message
                          : t("sermons.loadError");
                      setError(message);
                      toast.error(message);
                    });
                  }}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                    !showArchive
                      ? "bg-primary text-on-primary shadow-lg"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {t("common.active")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (showArchive) return;
                    setShowArchive(true);
                    void loadSermonPage(
                      viewChurchId,
                      superadmin,
                      0,
                      false,
                      true,
                    ).catch((err) => {
                      const message =
                        err instanceof Error
                          ? err.message
                          : t("sermons.loadError");
                      setError(message);
                      toast.error(message);
                    });
                  }}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                    showArchive
                      ? "bg-primary text-on-primary shadow-lg"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {t("common.archive")}
                </button>
              </div>
              {superadmin ? (
                <label className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2 max-w-xl">
                  <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                    {t("sermons.viewingChurch")}
                  </span>
                  <select
                    value={viewChurchId}
                    onChange={(event) => {
                      const next = event.target.value;
                      void switchViewChurch(next).catch((err) => {
                        const message =
                          err instanceof Error ? err.message : t("sermons.loadError");
                        setError(message);
                        toast.error(message);
                      });
                    }}
                    className="bg-surface-container border border-white/10 rounded-lg px-3 py-2 text-sm min-w-[240px]"
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
            </div>
            <button
              type="button"
              onClick={startNew}
              className="flex items-center gap-2 bg-gradient-to-r from-primary-container to-secondary-container text-white px-6 py-2.5 rounded-full text-xs font-semibold hover:opacity-90 active:scale-95 transition-transform self-start sm:self-auto"
            >
              <span className="material-symbols-outlined text-[20px]">add</span>
              {t("sermons.new")}
            </button>
          </div>

          {error ? <p className="mb-6 text-sm text-[#ffb4ab]">{error}</p> : null}

          {visibleLibrary.length === 0 ? (
            <p className="text-sm text-on-surface-variant">
              {query.trim()
                ? t("sermons.emptyQuery", { q: query.trim() })
                : showArchive
                  ? t("sermons.emptyArchive")
                  : t("sermons.empty")}
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
                      void openSermon(row.id).catch((err) => {
                        const message =
                          err instanceof Error
                            ? err.message
                            : "Could not open sermon.";
                        setError(message);
                        toast.error(message);
                      });
                    }}
                    className="w-full text-left pr-10"
                  >
                    <p className="text-lg font-semibold text-on-surface break-words whitespace-pre-wrap">
                      {row.title}
                    </p>
                    <p className="text-sm text-on-surface-variant truncate mt-1">
                      {[row.primary_scripture, row.speaker_name, row.series_name]
                        .filter(Boolean)
                        .join(" • ") || t("sermons.draft")}
                    </p>
                    <p className="text-[11px] text-on-surface-variant/70 mt-3">
                      {t("sermons.updatedAgo", {
                        when: formatRelative(row.updated_at),
                      })}
                      {row.est_duration_seconds
                        ? ` · ${formatDuration(row.est_duration_seconds)}`
                        : ""}
                    </p>
                  </button>
                  {showArchive ? (
                    <button
                      type="button"
                      title={t("common.restore")}
                      onClick={() => {
                        void setSermonArchived(row.id, false)
                          .then(() =>
                            loadSermonPage(
                              viewChurchId,
                              superadmin,
                              0,
                              false,
                              true,
                            ),
                          )
                          .then(() => toast.success(t("sermons.restored")))
                          .catch((err) => {
                            toast.error(
                              err instanceof Error
                                ? err.message
                                : t("sermons.loadError"),
                            );
                          });
                      }}
                      className="absolute top-4 right-4 p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/10"
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        unarchive
                      </span>
                    </button>
                  ) : (
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
                  )}
                </div>
              ))}
            </div>
          )}
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
                query: query.trim() || undefined,
                archived: showArchive,
              })
                .then((page) => {
                  setLibrary((prev) => [...prev, ...page.items]);
                  setTotal(page.total);
                })
                .catch((err) => {
                  const message =
                    err instanceof Error ? err.message : t("sermons.loadError");
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
  const selectedSlide =
    selectedKey === TITLE_KEY
      ? undefined
      : slides.find((row) => row.id === selectedKey);
  const selectedIndex = selectedSlide ? slides.indexOf(selectedSlide) : -1;
  const titleHolder = slides.find((row) => !isSermonSpace(row.content));
  const editingPoint = Boolean(selectedSlide && !isSermonSpace(selectedSlide.content));
  const projectedCount =
    1 +
    slides.filter(
      (row) => isSermonSpace(row.content) || sermonPlainText(row.content).trim(),
    ).length;

  const patchSlide = (id: string, patch: Partial<DraftSlide>) =>
    setSlides((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );

  const insertSlide = (content: string) => {
    const id = `new-${Date.now()}`;
    setSlides((prev) => {
      const index = prev.findIndex((row) => row.id === selectedKey);
      const at =
        selectedKey === TITLE_KEY ? 0 : index >= 0 ? index + 1 : prev.length;
      const next = [
        ...prev.slice(0, at),
        { id, content, verse: "" },
        ...prev.slice(at),
      ];
      return carryTitleVerse(prev, next);
    });
    selectSlide(id, !isSermonSpace(content));
  };

  const moveSlide = (delta: number) => {
    const to = selectedIndex + delta;
    if (selectedIndex < 0 || to < 0 || to >= slides.length) return;
    setSlides((prev) =>
      carryTitleVerse(prev, moveItem(prev, selectedIndex, to)),
    );
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

  const requestDelete = (slide: DraftSlide) => {
    if (isSermonSpace(slide.content) || !sermonPlainText(slide.content).trim()) {
      removeSlide(slide.id);
    } else {
      setDeleteSlideId(slide.id);
    }
  };

  const fieldClass =
    "w-full bg-surface-container-lowest border border-white/10 rounded-lg py-2.5 px-3 text-sm focus:border-primary focus:outline-none";
  const fieldLabel =
    "block text-[11px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant mb-1.5";

  return (
    <section className="h-full flex flex-col bg-surface-container-lowest text-on-surface">
      <header className="shrink-0 flex items-center justify-between gap-3 px-3 sm:px-5 py-3 border-b border-white/10 bg-surface-container-low">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => draft.guard(() => setSearchParams({}))}
            className="p-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5"
            aria-label={t("sermons.title")}
            title={t("sermons.title")}
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-primary">
              {sermonId ? "Edit sermon" : "New sermon"}
            </p>
            <p className="text-sm font-medium truncate">
              {title.trim() || "Untitled sermon"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden lg:inline text-[11px] text-on-surface-variant">
            {dirty ? "Unsaved changes · ⌘S" : sermonId ? "All changes saved" : ""}
          </span>
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold ${
              detailsOpen
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-white/10 text-on-surface-variant hover:bg-white/5"
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">tune</span>
            <span className="hidden sm:inline">Details</span>
          </button>
          {sermonId ? (
            <button
              type="button"
              onClick={() =>
                setDeletingSermon({
                  id: sermonId,
                  title: title.trim() || "Untitled sermon",
                })
              }
              className="p-2 rounded-lg text-on-surface-variant hover:bg-error/10 hover:text-error"
              aria-label="Delete sermon"
            >
              <span className="material-symbols-outlined text-[20px]">delete</span>
            </button>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="flex items-center gap-1.5 px-4 sm:px-5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-primary-container to-secondary-container text-white shadow-lg hover:shadow-primary/20 active:scale-95 transition-all disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[16px]">
              {saving ? "progress_activity" : "save"}
            </span>
            {saving ? "Saving…" : saved && !dirty ? "Saved" : "Save"}
          </button>
        </div>
      </header>

      {error ? (
        <p className="shrink-0 px-5 pt-3 text-sm text-[#ffb4ab]">{error}</p>
      ) : null}

      <div className="flex-1 min-h-0 flex flex-col md:flex-row">
        <aside className="shrink-0 md:w-60 max-h-52 md:max-h-none border-b md:border-b-0 md:border-r border-white/10 flex flex-col min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-1">
            <SlideRow
              label="Title"
              text={title.trim() || "Untitled sermon"}
              selected={selectedKey === TITLE_KEY}
              onClick={() => selectSlide(TITLE_KEY)}
            />
            {slides.map((slide) => {
              const blank = isSermonSpace(slide.content);
              return (
                <SlideRow
                  key={slide.id}
                  label={blank ? "Blank" : `Point ${sermonPointNumber(slides, slide.id)}`}
                  text={
                    blank
                      ? "Blank screen"
                      : sermonPlainText(slide.content).trim() || "Empty point"
                  }
                  selected={selectedKey === slide.id}
                  onClick={() => selectSlide(slide.id)}
                />
              );
            })}
          </div>
          <div className="shrink-0 p-2 border-t border-white/10 grid grid-cols-5 gap-1">
            <ToolButton icon="add" label="Add point" onClick={() => insertSlide("")} />
            <ToolButton
              icon="crop_landscape"
              label="Add blank slide"
              onClick={() => insertSlide(SERMON_SPACE)}
            />
            <ToolButton
              icon="arrow_upward"
              label="Move up"
              disabled={selectedIndex <= 0}
              onClick={() => moveSlide(-1)}
            />
            <ToolButton
              icon="arrow_downward"
              label="Move down"
              disabled={selectedIndex < 0 || selectedIndex >= slides.length - 1}
              onClick={() => moveSlide(1)}
            />
            <ToolButton
              icon="delete"
              label="Delete slide"
              danger
              disabled={!selectedSlide}
              onClick={() => selectedSlide && requestDelete(selectedSlide)}
            />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-4 sm:p-6">
          <div className="max-w-4xl mx-auto space-y-4">
            <p className="text-[11px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
              {selectedKey === TITLE_KEY
                ? "Title slide · type the title and verse on the slide"
                : editingPoint && selectedSlide
                  ? `Point ${sermonPointNumber(slides, selectedSlide.id)} · click the slide to type`
                  : "Blank slide · the screen stays empty here"}
            </p>

            {selectedKey === TITLE_KEY ? (
              <StageTitleEditor
                title={title}
                verse={titleHolder?.verse ?? ""}
                stageBg={stageBg}
                onTitleChange={setTitle}
                onVerseChange={
                  titleHolder
                    ? (next) => patchSlide(titleHolder.id, { verse: next })
                    : undefined
                }
                versePlaceholder="Verse (optional) · Fil 3:14"
              />
            ) : editingPoint && selectedSlide ? (
              <StagePointEditor
                value={selectedSlide.content}
                syncNonce={syncNonce}
                size={textSize}
                stageBg={stageBg}
                focusKey={focusKey}
                placeholder="Type this point…"
                onChange={(next) => patchSlide(selectedSlide.id, { content: next })}
              />
            ) : (
              <ScaledStage stageBg={stageBg} highlight>
                <div className="h-full w-full flex items-center justify-center">
                  <span
                    className={`text-[44px] uppercase tracking-[0.3em] ${
                      stageUsesDarkText(stageBg) ? "text-black/30" : "text-white/30"
                    }`}
                  >
                    Blank screen
                  </span>
                </div>
              </ScaledStage>
            )}

            <div className="rounded-xl border border-white/10 bg-surface-container-low/60 p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
                  Text size
                </span>
                <TextSizePicker value={textSize} onChange={setTextSize} />
              </div>
              {editingPoint && selectedSlide ? (
                <button
                  type="button"
                  onClick={() => {
                    patchSlide(selectedSlide.id, {
                      content: insertSermonGap(selectedSlide.content),
                    });
                    setSyncNonce((n) => n + 1);
                  }}
                  className="inline-flex items-center gap-1 px-3 h-8 rounded-lg border border-white/10 hover:bg-white/5 text-[11px] font-semibold"
                >
                  <span className="material-symbols-outlined text-[16px]">space_bar</span>
                  Add space
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => insertSlide("")}
                className="inline-flex items-center gap-1 px-3 h-8 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 text-[11px] font-semibold"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                {selectedKey === TITLE_KEY ? "Add first point" : "Add next point"}
              </button>
              <span className="ml-auto text-[11px] text-on-surface-variant">
                {projectedCount} slide{projectedCount === 1 ? "" : "s"} will project · ↑ ↓ to move
                between slides
              </span>
            </div>
          </div>
        </main>

        {detailsOpen ? (
          <aside className="fixed inset-x-0 bottom-0 top-16 z-[60] md:static md:z-auto shrink-0 md:w-80 border-t md:border-t-0 md:border-l border-white/10 overflow-y-auto custom-scrollbar p-4 space-y-5 bg-surface-container-low">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary">
                Details
              </h3>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-white/5"
                aria-label="Close details"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <p className="text-[11px] text-on-surface-variant -mt-3">
              All optional. Only the slides are shown on screen.
            </p>

            <label className="block">
              <span className={fieldLabel}>Main scripture</span>
              <input
                className={fieldClass}
                placeholder="e.g. John 4:23"
                value={scripture}
                onChange={(event) => setScripture(event.target.value)}
              />
              <span className="mt-1.5 block text-[11px] text-on-surface-variant min-h-[1rem]">
                {scriptureBusy
                  ? "Looking up KJV text…"
                  : scriptureHint || (scripturePreview ? "KJV • public domain" : "")}
              </span>
              {scripturePreview ? (
                <span className="mt-1 block text-xs text-on-surface-variant leading-relaxed line-clamp-4">
                  {scripturePreview}
                </span>
              ) : null}
            </label>

            <label className="block">
              <span className={fieldLabel}>Speaker</span>
              <input
                className={fieldClass}
                placeholder="Who is preaching"
                value={speaker}
                onChange={(event) => setSpeaker(event.target.value)}
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className={fieldLabel}>Date</span>
                <input
                  className={fieldClass}
                  type="date"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label className="block">
                <span className={fieldLabel}>Length</span>
                <input
                  className={fieldClass}
                  placeholder="35:00"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                />
              </label>
            </div>

            <label className="block">
              <span className={fieldLabel}>Series</span>
              <input
                className={fieldClass}
                placeholder="Series name"
                value={series}
                onChange={(event) => setSeries(event.target.value)}
              />
            </label>

            {superadmin ? (
              <ChurchSharePicker
                churches={churches}
                value={churchIds}
                onChange={setChurchIds}
                label="Churches that can view this sermon"
              />
            ) : null}

            <div className="space-y-2">
              <span className={fieldLabel}>Private notes</span>
              {notes.map((note, index) => (
                <div key={index} className="relative">
                  <textarea
                    value={note}
                    onChange={(event) =>
                      setNotes((prev) =>
                        prev.map((row, i) => (i === index ? event.target.value : row)),
                      )
                    }
                    className={`${fieldClass} pr-9 resize-none`}
                    placeholder="Never shown on screen"
                    rows={2}
                  />
                  <button
                    type="button"
                    onClick={() => setNotes((prev) => prev.filter((_, i) => i !== index))}
                    className="absolute top-2 right-2 p-1 rounded text-on-surface-variant hover:text-error"
                    aria-label="Remove note"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setNotes((prev) => [...prev, ""])}
                className="w-full flex items-center justify-center gap-1 py-2 rounded-lg border border-dashed border-white/15 text-xs text-on-surface-variant hover:text-secondary hover:border-secondary/40"
              >
                <span className="material-symbols-outlined text-[16px]">sticky_note_2</span>
                Add private note
              </button>
            </div>
          </aside>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(deletingSlide)}
        title="Delete this slide?"
        description="It is removed when you save the sermon."
        highlight={
          deletingSlide ? sermonPlainText(deletingSlide.content).slice(0, 80) : undefined
        }
        onClose={() => setDeleteSlideId(null)}
        onConfirm={() => {
          if (deleteSlideId) removeSlide(deleteSlideId);
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
