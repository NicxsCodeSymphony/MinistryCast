import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import CueStage from "../../components/CueStage";
import PointEditor from "../../components/PointEditor";
import StageBackdrop from "../../components/StageBackdrop";
import StageBackgroundPicker from "../../components/StageBackgroundPicker";
import VerseOverlay from "../../components/VerseOverlay";
import { PageSkeleton } from "../../components/Skeleton";
import TextSizePicker from "../../components/TextSizePicker";
import TextStylePicker from "../../components/TextStylePicker";
import {
  buildCues,
  cueIndexFor,
  deleteSermonSlide,
  endPresentation,
  getActivePresentation,
  getChurchSettings,
  getPresentation,
  getSetlist,
  insertSermonSlide,
  listSetlists,
  patchChurchSettings,
  patchFromCue,
  reorderSermonSlides,
  reorderSetlistItems,
  startPresentation,
  subscribePresentation,
  updatePresentation,
  updateSermonSlide,
  updateSermonTextSize,
  updateSetlistItem,
} from "../../lib/api";
import { insertSermonGap, isSermonSpace, isTypingTarget, moveItem } from "../../lib/helpers";
import {
  formatBibleReference,
  FREE_BIBLE_TRANSLATIONS,
  isFreeBibleTranslation,
  type FreeBibleTranslation,
  type ParsedBibleRef,
} from "../../lib/bible";
import { useHoldReorder } from "../../lib/holdDrag";
import { subscribeContent, setlistFingerprint, publishStageSnapshot } from "../../lib/offline/live";
import { closeProjectorWindow, openProjectorWindow } from "../../lib/projector";
import {
  formatRosterDate,
  normalizeRoster,
  type RosterPayload,
} from "../../lib/roster";
import { asStageFont, DEFAULT_STAGE_FONT, STAGE_FONTS } from "../../lib/stageFonts";
import {
  asStageBackground,
  DEFAULT_STAGE_BACKGROUND,
  stageUsesDarkText,
  type StageBackgroundId,
} from "../../lib/stageBackgrounds";
import {
  parseLyricTextStyle,
  serializeLyricTextStyle,
  type LyricTextStyle,
} from "../../lib/lyricTextStyle";
import { asStageTransition, lyricTransitionClass, type StageTransition } from "../../lib/stageTransition";
import { useToast } from "../../lib/ToastContext";
import type { LiveCue, Presentation, Setlist } from "../../lib/types";

export default function Live() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const requestedId = params.get("presentation");
  const requestedSetlist = params.get("setlist");
  const [setlists, setSetlists] = useState<Setlist[]>([]);
  const [setlistId, setSetlistId] = useState(requestedSetlist ?? "");
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [hint, setHint] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pointDraft, setPointDraft] = useState("");
  const [verseDraft, setVerseDraft] = useState("");
  const [pointEditorActive, setPointEditorActive] = useState(false);
  const [pointSync, setPointSync] = useState(0);
  const [font, setFont] = useState(DEFAULT_STAGE_FONT);
  const [lyricSize, setLyricSize] = useState("48");
  const [lyricStyle, setLyricStyle] = useState<LyricTextStyle>({
    bold: false,
    italic: false,
    underline: false,
  });
  const [stageBg, setStageBg] = useState<StageBackgroundId>(DEFAULT_STAGE_BACKGROUND);
  const [transitionStyle, setTransitionStyle] = useState<StageTransition>("dissolve");
  const [rosterDraft, setRosterDraft] = useState<RosterPayload | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const slideSaveTimer = useRef(0);
  const rosterSaveTimer = useRef(0);
  const setlistFp = useRef("");

  const applySetlist = useCallback((next: Setlist) => {
    const fp = setlistFingerprint(next);
    if (fp === setlistFp.current) return;
    setlistFp.current = fp;
    setSetlist(next);
  }, []);

  const loadBundle = useCallback(async () => {
    setError("");
    const listed = await listSetlists({ limit: 50 });
    setSetlists(listed.items);
    let live: Presentation | null = null;
    if (requestedId) {
      try {
        const row = await getPresentation(requestedId);
        if (row.status === "live") live = row;
      } catch {
        live = null;
      }
    }
    if (!live) live = await getActivePresentation();
    const nextSetlistId =
      live?.setlist_id || requestedSetlist || listed.items[0]?.id || "";
    setSetlistId(nextSetlistId);
    if (nextSetlistId) {
      const next = await getSetlist(nextSetlistId);
      setlistFp.current = setlistFingerprint(next);
      setSetlist(next);
    }
    setPresentation(live);
    if (live) {
      setParams({ presentation: live.id }, { replace: true });
    }
    try {
      const settings = await getChurchSettings();
      setFont(asStageFont(settings?.default_font));
      setLyricSize(settings?.lyrics_text_size || "48");
      setLyricStyle(parseLyricTextStyle(settings?.lyrics_text_style));
      setStageBg(asStageBackground(settings?.stage_background));
      setTransitionStyle(asStageTransition(settings?.default_transition));
    } catch {
      setFont(DEFAULT_STAGE_FONT);
    }
  }, [requestedId, requestedSetlist, setParams]);

  useEffect(() => {
    void (async () => {
      try {
        await loadBundle();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load live.");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadBundle]);

  useEffect(() => {
    if (!setlistId || presentation?.setlist_id === setlistId) return;
    void getSetlist(setlistId)
      .then(applySetlist)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load setlist."),
      );
  }, [setlistId, presentation?.setlist_id, applySetlist]);

  useEffect(() => {
    if (!presentation?.id) return;
    return subscribePresentation(presentation.id, setPresentation);
  }, [presentation?.id]);

  useEffect(() => {
    if (!setlistId) return;
    const reload = () => {
      void getSetlist(setlistId, { fresh: true }).then(applySetlist).catch(() => undefined);
      void getChurchSettings({ fresh: true })
        .then((settings) => {
          setFont(asStageFont(settings?.default_font));
          setLyricSize(settings?.lyrics_text_size || "48");
          setLyricStyle(parseLyricTextStyle(settings?.lyrics_text_style));
          setStageBg(asStageBackground(settings?.stage_background));
          setTransitionStyle(asStageTransition(settings?.default_transition));
        })
        .catch(() => undefined);
    };
    const unsub = subscribeContent(reload);
    const timer = window.setInterval(reload, 800);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [setlistId, applySetlist]);

  useEffect(() => {
    if (!setlist || presentation?.status !== "live") return;
    publishStageSnapshot({
      setlistId: setlist.id,
      setlist,
      font,
      lyricSize,
      lyricStyle,
      stageBg,
      transitionStyle,
      at: Date.now(),
    });
  }, [
    presentation?.status,
    setlist,
    font,
    lyricSize,
    lyricStyle,
    stageBg,
    transitionStyle,
  ]);

  useEffect(() => {
    if (!presentation?.started_at || presentation.status !== "live") {
      setElapsed(0);
      return;
    }
    const started = new Date(presentation.started_at).getTime();
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [presentation?.started_at, presentation?.status]);

  const cues = useMemo(() => (setlist ? buildCues(setlist) : []), [setlist]);
  const live = presentation?.status === "live";
  const liveIndex = presentation ? cueIndexFor(presentation, cues) : 0;
  const index = live ? liveIndex : previewIndex;
  const active: LiveCue | undefined = cues[index];
  const nextCue = cues[index + 1];
  const darkText = stageUsesDarkText(stageBg);
  const transitionSec = ((presentation?.transition_ms ?? 400) / 1000).toFixed(1);
  const currentItem = setlist?.items?.find((row) => row.id === active?.itemId);
  const currentSlide = currentItem?.sermon?.slides?.find(
    (row) => row.id === active?.slideId,
  );
  const titleSlide = Boolean(active?.titleSlide);
  const firstSlide = currentItem?.sermon?.slides?.find(
    (row) => !isSermonSpace(row.content),
  );
  const sermonActive = active?.kind === "sermon" && Boolean(currentItem?.sermon_id);
  const rosterActive = active?.kind === "roster" && Boolean(currentItem?.id);

  const refreshSetlist = useCallback(() => {
    if (!setlistId) return Promise.resolve();
    return getSetlist(setlistId, { fresh: true }).then(applySetlist);
  }, [setlistId, applySetlist]);

  const { bind: bindCue } = useHoldReorder(
    "live-cues",
    (fromId, toId) => {
      const from = cues.find((row) => row.id === fromId);
      const to = cues.find((row) => row.id === toId);
      if (!from || !to || !setlist) return;
      if (
        from.itemId === to.itemId &&
        from.slideId &&
        to.slideId &&
        from.slideId !== to.slideId
      ) {
        const item = setlist.items?.find((row) => row.id === from.itemId);
        if (!item?.sermon_id) return;
        const ids = [...(item.sermon?.slides ?? [])]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((row) => row.id);
        const next = moveItem(
          ids,
          ids.indexOf(from.slideId),
          ids.indexOf(to.slideId),
        );
        void reorderSermonSlides(item.sermon_id, next)
          .then(refreshSetlist)
          .catch((err) =>
            setError(err instanceof Error ? err.message : "Could not reorder points."),
          );
        return;
      }
      if (from.itemId === to.itemId) return;
      const ids = (setlist.items ?? []).map((row) => row.id);
      const next = moveItem(ids, ids.indexOf(from.itemId), ids.indexOf(to.itemId));
      void reorderSetlistItems(setlist.id, next)
        .then(applySetlist)
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Could not reorder the setlist."),
        );
    },
    live,
  );

  const { bind: bindItem } = useHoldReorder(
    "live-items",
    (fromId, toId) => {
      if (!setlist) return;
      const ids = (setlist.items ?? []).map((row) => row.id);
      const next = moveItem(ids, ids.indexOf(fromId), ids.indexOf(toId));
      void reorderSetlistItems(setlist.id, next)
        .then(applySetlist)
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Could not reorder the setlist."),
        );
    },
    live,
  );

  useEffect(() => {
    if (titleSlide) {
      setPointDraft("");
      setVerseDraft(firstSlide?.scripture_reference ?? "");
      return;
    }
    setPointDraft(currentSlide?.content ?? "");
    setVerseDraft("");
  }, [
    currentSlide?.id,
    firstSlide?.id,
    firstSlide?.scripture_reference,
    titleSlide,
  ]);

  const goToCue = useCallback(
    async (nextIndex: number) => {
      if (!presentation || !cues.length) return;
      const bounded = Math.max(0, Math.min(cues.length - 1, nextIndex));
      const cue = cues[bounded];
      setHint(true);
      window.setTimeout(() => setHint(false), 800);
      const next = await updatePresentation(presentation.id, {
        ...patchFromCue(cue),
        verse_overlay_ref: null,
        verse_overlay_translation: null,
        verse_overlay_page: 0,
        verse_overlay_take: 5,
      });
      setPresentation(next);
    },
    [cues, presentation],
  );

  const selectCue = useCallback(
    (nextIndex: number) => {
      if (!cues.length) return;
      const bounded = Math.max(0, Math.min(cues.length - 1, nextIndex));
      if (live) {
        void goToCue(bounded);
        return;
      }
      setPreviewIndex(bounded);
    },
    [cues.length, goToCue, live],
  );

  const readVerseTranslation = (): FreeBibleTranslation => {
    const current = presentation?.verse_overlay_translation;
    if (current && isFreeBibleTranslation(current)) return current;
    try {
      const stored = localStorage.getItem("mc.verseTranslation");
      if (stored && isFreeBibleTranslation(stored)) return stored;
    } catch {
      /* ignore */
    }
    return "ceb";
  };

  const setVerseTranslation = (next: FreeBibleTranslation) => {
    try {
      localStorage.setItem("mc.verseTranslation", next);
    } catch {
      /* ignore */
    }
    if (!presentation) return;
    void updatePresentation(presentation.id, {
      verse_overlay_translation: next,
      verse_overlay_page: 0,
    }).then(setPresentation);
  };

  const openVerse = (_raw: string, parsed: ParsedBibleRef) => {
    if (!live || !presentation) return;
    void updatePresentation(presentation.id, {
      verse_overlay_ref: formatBibleReference(
        parsed.book,
        parsed.chapter,
        parsed.verses,
      ),
      verse_overlay_translation: readVerseTranslation(),
      verse_overlay_page: 0,
      verse_overlay_take: 5,
    }).then(setPresentation);
  };

  const closeVerse = useCallback(() => {
    if (!presentation) return;
    void updatePresentation(presentation.id, {
      verse_overlay_ref: null,
      verse_overlay_translation: null,
      verse_overlay_page: 0,
      verse_overlay_take: 5,
    }).then(setPresentation);
  }, [presentation]);

  const savePoint = (content: string, verse: string) => {
    if (!live) return;
    const slide = titleSlide ? firstSlide : currentSlide;
    if (!slide) return;
    window.clearTimeout(slideSaveTimer.current);
    slideSaveTimer.current = window.setTimeout(() => {
      void updateSermonSlide(
        slide.id,
        titleSlide
          ? { scripture_reference: verse.trim() || null }
          : { content },
      )
        .then(refreshSetlist)
        .catch(() => undefined);
    }, 400);
  };

  const saveRoster = (next: RosterPayload) => {
    if (!live || !setlist || !currentItem || currentItem.item_type !== "roster") return;
    window.clearTimeout(rosterSaveTimer.current);
    rosterSaveTimer.current = window.setTimeout(() => {
      void updateSetlistItem(setlist.id, currentItem.id, {
        title: next.heading.trim() || "Next Week",
        subtitle: formatRosterDate(next.date),
        payload: next,
      })
        .then(applySetlist)
        .catch(() => undefined);
    }, 400);
  };

  useEffect(() => {
    if (!currentItem || currentItem.item_type !== "roster") {
      setRosterDraft(null);
      return;
    }
    setRosterDraft(normalizeRoster(currentItem.payload));
  }, [currentItem?.id]);

  useEffect(() => {
    setPreviewIndex(0);
  }, [setlistId]);

  useEffect(() => {
    if (live) {
      setPreviewIndex(liveIndex);
      return;
    }
    if (!cues.length) {
      setPreviewIndex(0);
      return;
    }
    setPreviewIndex((n) => Math.min(n, cues.length - 1));
  }, [cues.length, live, liveIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = isTypingTarget(event.target);
      if (typing) return;

      if (event.key === "Escape" && live && presentation?.verse_overlay_ref) {
        event.preventDefault();
        event.stopPropagation();
        closeVerse();
        return;
      }

      if (event.code === "Space" || event.key === "ArrowRight") {
        event.preventDefault();
        selectCue(index + 1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectCue(index - 1);
        return;
      }

      if (!live) return;
      if (presentation?.verse_overlay_ref) return;

      if (event.key.toLowerCase() === "b" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        if (!presentation) return;
        void updatePresentation(presentation.id, {
          is_blackout: !presentation.is_blackout,
        }).then(setPresentation);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [closeVerse, index, live, presentation, selectCue]);

  const goLive = async () => {
    if (!setlistId) return;
    setBusy(true);
    setError("");
    try {
      const row = await startPresentation(setlistId, setlist?.name);
      const cue = cues[previewIndex];
      const next = cue
        ? await updatePresentation(row.id, {
            ...patchFromCue(cue),
            verse_overlay_ref: null,
            verse_overlay_translation: null,
            verse_overlay_page: 0,
            verse_overlay_take: 5,
          })
        : row;
      setPresentation(next);
      setParams({ presentation: next.id }, { replace: true });
      await openProjectorWindow(row.id);
      toast.success("You’re live.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not go live.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const stopLive = async () => {
    if (!presentation) return;
    setBusy(true);
    try {
      await endPresentation(presentation.id);
      await closeProjectorWindow();
      setPresentation(null);
      setParams({}, { replace: true });
      toast.success("Live session ended.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not end the session.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const formatTime = (s: number) => {
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const sec = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${sec}`;
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="bg-background text-on-surface font-sans overflow-hidden h-screen select-none">
      <header className="fixed top-0 left-0 right-0 h-16 bg-surface/50 backdrop-blur-lg border-b border-white/5 flex items-center justify-between px-4 sm:px-6 z-50">
        <div className="flex items-center gap-4 sm:gap-6 min-w-0">
          <Link to="/dashboard" className="flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <span className="material-symbols-outlined filled text-on-primary text-[20px]">
                movie_filter
              </span>
            </div>
            <h1 className="hidden sm:block font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary text-xl">
              MinistryCast
            </h1>
          </Link>
          <div className="hidden md:block h-6 w-px bg-white/10" />
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20">
              <div
                className={`w-2 h-2 rounded-full ${live ? "bg-primary live-pulse" : "bg-white/30"}`}
              />
              <span className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary">
                {live ? "On Air" : "Standby"}
              </span>
            </div>
            <span className="text-xs text-on-surface-variant font-mono">
              {formatTime(elapsed)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {live ? (
            <button
              type="button"
              onClick={() => void openProjectorWindow(presentation.id)}
              className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-container-high border border-white/10 hover:bg-white/5 transition-all active:scale-95"
            >
              <span className="material-symbols-outlined text-[18px]">
                present_to_all
              </span>
              <span className="text-xs font-medium">Open Output</span>
            </button>
          ) : null}
          {live ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void stopLive()}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-error/15 text-error hover:brightness-110 transition-all active:scale-95 font-semibold disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">
                stop_circle
              </span>
              <span className="text-xs font-medium hidden sm:inline">
                End Presentation
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || !setlistId}
              onClick={() => void goLive()}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-primary text-on-primary hover:brightness-110 transition-all active:scale-95 font-semibold disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">
                play_circle
              </span>
              <span className="text-xs font-medium hidden sm:inline">
                {busy ? "Starting…" : "Go Live"}
              </span>
            </button>
          )}
        </div>
      </header>

      <main className="pt-16 h-screen flex">
        <aside className="hidden lg:flex w-[280px] border-r border-white/5 bg-surface-container-lowest/50 flex-col h-[calc(100vh-4rem)]">
          <div className="p-4 border-b border-white/5 bg-surface-container-low">
            <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant mb-2">
              Setlist
            </h3>
            <div
              className="flex flex-col gap-1 max-h-40 overflow-y-auto custom-scrollbar"
              role="tablist"
              aria-label="Setlists"
            >
              {setlists.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No setlists yet</p>
              ) : (
                setlists.map((row) => {
                  const selected = setlistId === row.id;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      disabled={live}
                      onClick={() => {
                        setSetlistId(row.id);
                        setParams(
                          (prev) => {
                            const next = new URLSearchParams(prev);
                            next.set("setlist", row.id);
                            return next;
                          },
                          { replace: true },
                        );
                      }}
                      className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-60 ${
                        selected
                          ? "bg-primary/15 text-primary border border-primary/30 font-semibold"
                          : "text-on-surface-variant hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      {row.name}
                    </button>
                  );
                })
              )}
            </div>
            <h2 className="text-xl font-semibold text-primary truncate mt-3">
              {active?.songTitle || active?.title || setlist?.name || "Empty setlist"}
            </h2>
            <div className="flex gap-2 mt-2">
              {active?.musicalKey ? (
                <span className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-bold border border-white/10">
                  {active.musicalKey}
                </span>
              ) : null}
              {active?.bpm ? (
                <span className="px-2 py-0.5 rounded bg-white/5 text-[10px] font-bold border border-white/10">
                  {active.bpm} BPM
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-2 space-y-2">
              {cues.map((item, cueIndex) => {
                const isSelected = cueIndex === index;
                const isActive = live && isSelected;
                const accent =
                  item.kind === "scripture"
                    ? "primary"
                    : item.kind === "sermon"
                      ? "tertiary"
                      : item.kind === "roster"
                        ? "secondary"
                        : "primary";
                const hold = bindCue(item.id);
                return (
                  <div
                    key={item.id}
                    {...hold}
                    role="button"
                    tabIndex={0}
                    onClick={() => selectCue(cueIndex)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") selectCue(cueIndex);
                    }}
                    className={`w-full text-left relative p-3 rounded-lg transition-colors border select-none touch-none ${
                      live
                        ? "cursor-grab active:cursor-grabbing"
                        : "cursor-pointer"
                    } ${
                      isActive
                        ? accent === "tertiary"
                          ? "border-tertiary bg-tertiary/10"
                          : accent === "secondary"
                            ? "border-secondary bg-secondary/10"
                            : "bg-primary/10 border-l-4 border-primary border-y-transparent border-r-transparent"
                        : isSelected
                          ? "border-white/20 bg-white/5"
                          : "border-white/5 hover:bg-white/5"
                    }`}
                  >
                    <span className="absolute top-2 right-3 text-[10px] font-bold text-primary/50">
                      {item.tag}
                    </span>
                    <div className="text-[10px] font-semibold tracking-wider mb-1 text-on-surface-variant">
                      {item.sectionLabel || item.label}
                    </div>
                    <p className="text-sm leading-snug text-on-surface line-clamp-2">
                      {item.heading && item.kind === "lyric"
                        ? `${item.heading} · ${item.preview}`
                        : item.preview}
                    </p>
                  </div>
                );
              })}
              {cues.length === 0 ? (
                <p className="px-3 py-8 text-sm text-on-surface-variant">
                  Add songs, sermons, scripture, or assignments to this setlist first.
                </p>
              ) : null}
            </div>
          </div>

          <div className="p-4 border-t border-white/5 bg-surface-container-low flex justify-between items-center">
            <button
              type="button"
              disabled={!cues.length}
              onClick={() => selectCue(index - 1)}
              className="p-2 rounded hover:bg-white/5 disabled:opacity-40"
            >
              <span className="material-symbols-outlined">skip_previous</span>
            </button>
            <span className="text-xs text-on-surface-variant">
              Slide {cues.length ? index + 1 : 0} / {cues.length}
            </span>
            <button
              type="button"
              disabled={!cues.length}
              onClick={() => selectCue(index + 1)}
              className="p-2 rounded hover:bg-white/5 disabled:opacity-40"
            >
              <span className="material-symbols-outlined">skip_next</span>
            </button>
          </div>
        </aside>

        <section className="flex-1 flex flex-col bg-surface-container-lowest p-3 sm:p-6 overflow-hidden min-w-0">
          {error ? (
            <p className="mb-3 text-sm text-[#ffb4ab]">{error}</p>
          ) : null}
          <div className="flex-1 relative flex flex-col gap-4 sm:gap-6 min-h-0">
            <div className="flex-1 rounded-xl overflow-hidden relative border-2 border-primary shadow-[0_0_40px_rgba(155,203,255,0.15)] min-h-[240px]">
              <StageBackdrop id={stageBg} />
              <div className="absolute inset-0">
                {presentation?.is_blackout ? (
                  <div className="h-full w-full flex items-center justify-center">
                    <p className="text-on-surface-variant uppercase tracking-[0.3em] text-sm">
                      Blackout
                    </p>
                  </div>
                ) : presentation?.show_logo ? (
                  <div className="h-full w-full flex items-center justify-center">
                    <span className="material-symbols-outlined filled text-primary text-7xl">
                      church
                    </span>
                  </div>
                ) : (
                  <div
                    key={active?.id ?? "empty"}
                    className={`h-full w-full ${lyricTransitionClass(transitionStyle, presentation?.transition_ms ?? 400)}`}
                    style={{ animationDuration: `${presentation?.transition_ms ?? 400}ms` }}
                  >
                    <CueStage
                      cue={active}
                      paddingTop={52}
                      font={font}
                      lyricSize={lyricSize}
                      lyricStyle={lyricStyle}
                      darkText={darkText}
                      onVerseClick={live ? openVerse : undefined}
                    />
                  </div>
                )}
              </div>
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1 bg-primary rounded text-on-primary font-bold text-[10px] uppercase">
                {live ? "On Air Preview" : "Standby Preview"}
              </div>
              {presentation?.verse_overlay_ref ? (
                <VerseOverlay
                  reference={presentation.verse_overlay_ref}
                  translation={presentation.verse_overlay_translation || "ceb"}
                  font={font}
                  textSize={
                    active?.kind === "lyric"
                      ? lyricSize
                      : active?.textSize || "md"
                  }
                  paddingTop={52}
                  page={presentation.verse_overlay_page ?? 0}
                  pageSize={presentation.verse_overlay_take || 5}
                  onPageChange={(next) => {
                    void updatePresentation(presentation.id, {
                      verse_overlay_page: next,
                    }).then(setPresentation);
                  }}
                  onPageSizeChange={(next) => {
                    void updatePresentation(presentation.id, {
                      verse_overlay_take: next,
                    }).then(setPresentation);
                  }}
                  onClose={closeVerse}
                />
              ) : null}
            </div>

            <div className="h-auto sm:h-48 flex flex-col sm:flex-row gap-3 sm:gap-6 shrink-0">
              <div className="flex-1 bg-surface-container rounded-xl border border-white/10 relative overflow-hidden min-h-[120px]">
                <div className="absolute inset-0 p-4 flex flex-col justify-center items-center text-center">
                  <span className="text-[10px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant absolute top-3 left-4">
                    Next Preview
                  </span>
                  <p className="text-lg sm:text-xl font-semibold text-on-surface-variant scale-95 opacity-70">
                    {nextCue?.preview ?? "End of setlist"}
                  </p>
                </div>
              </div>
              <div className="w-full sm:w-64 glass-panel rounded-xl p-4 flex flex-col gap-2 shrink-0">
                <span className="text-[10px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
                  Slide Progress
                </span>
                <div className="flex-1 flex flex-col justify-center gap-1">
                  <div className="h-2 rounded bg-primary/20 w-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-500"
                      style={{
                        width: cues.length
                          ? `${((index + 1) / cues.length) * 100}%`
                          : "0%",
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-on-surface-variant font-mono">
                    <span>
                      {index + 1}/{cues.length || 0}
                    </span>
                    <span>{setlist?.name ?? ""}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside
          className={`hidden xl:flex border-l border-white/5 bg-surface-container-lowest/50 flex-col p-4 gap-6 h-[calc(100vh-4rem)] overflow-y-auto custom-scrollbar transition-[width] duration-200 ${
            pointEditorActive || rosterActive ? "w-[min(560px,46vw)]" : "w-[320px]"
          }`}
        >
          {!live ? (
            <p className="text-[11px] leading-snug text-on-surface-variant rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              Standby is preview only. Press Go Live to edit slides, assignments, and output.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!live}
              onClick={() => {
                if (!presentation) return;
                void updatePresentation(presentation.id, {
                  is_blackout: !presentation.is_blackout,
                  show_logo: presentation.is_blackout ? presentation.show_logo : false,
                }).then(setPresentation);
              }}
              className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all active:scale-95 disabled:opacity-40 ${
                presentation?.is_blackout
                  ? "border-error bg-error/20"
                  : "border-error/20 bg-error/10 hover:bg-error/20"
              }`}
            >
              <span className="material-symbols-outlined text-error text-[32px]">
                block
              </span>
              <span className="text-[12px] font-semibold tracking-[0.05em] uppercase text-error">
                Blackout
              </span>
            </button>
            <button
              type="button"
              disabled={!live}
              onClick={() => {
                if (!presentation) return;
                void updatePresentation(presentation.id, {
                  show_logo: !presentation.show_logo,
                  is_blackout: presentation.show_logo ? presentation.is_blackout : false,
                }).then(setPresentation);
              }}
              className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all active:scale-95 disabled:opacity-40 ${
                presentation?.show_logo
                  ? "border-primary bg-primary/20"
                  : "border-primary/20 bg-primary/10 hover:bg-primary/20"
              }`}
            >
              <span className="material-symbols-outlined text-primary text-[32px]">
                branding_watermark
              </span>
              <span className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary">
                Logo
              </span>
            </button>
          </div>

          <div className="space-y-2">
            <h4 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
              Stage background
            </h4>
            <StageBackgroundPicker
              compact
              disabled={!live}
              value={stageBg}
              onChange={(next) => {
                if (!live) return;
                setStageBg(next);
                void patchChurchSettings({ stage_background: next }).catch((err) =>
                  setError(
                    err instanceof Error ? err.message : "Could not change background.",
                  ),
                );
              }}
            />
          </div>

          {rosterActive && rosterDraft ? (
            <div className="space-y-3">
              <h4 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
                Assignments
              </h4>
              <input
                value={rosterDraft.heading}
                disabled={!live}
                onChange={(event) => {
                  const next = { ...rosterDraft, heading: event.target.value };
                  setRosterDraft(next);
                  saveRoster(next);
                }}
                className="w-full bg-surface-container-low border border-white/10 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
              />
              <input
                type="date"
                value={rosterDraft.date}
                disabled={!live}
                onChange={(event) => {
                  const next = { ...rosterDraft, date: event.target.value };
                  setRosterDraft(next);
                  saveRoster(next);
                }}
                className="w-full bg-surface-container-low border border-white/10 rounded-lg px-3 py-2 text-sm"
              />
              <div className="space-y-2">
                {rosterDraft.roles.map((row, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      value={row.role}
                      disabled={!live}
                      onChange={(event) => {
                        const roles = rosterDraft.roles.map((item, i) =>
                          i === index ? { ...item, role: event.target.value } : item,
                        );
                        const next = { ...rosterDraft, roles };
                        setRosterDraft(next);
                        saveRoster(next);
                      }}
                      className="w-[46%] bg-surface-container-low border border-white/10 rounded-lg px-2 py-1.5 text-xs"
                      placeholder="Role"
                    />
                    <input
                      value={row.name}
                      disabled={!live}
                      onChange={(event) => {
                        const roles = rosterDraft.roles.map((item, i) =>
                          i === index ? { ...item, name: event.target.value } : item,
                        );
                        const next = { ...rosterDraft, roles };
                        setRosterDraft(next);
                        saveRoster(next);
                      }}
                      className="flex-1 bg-surface-container-low border border-white/10 rounded-lg px-2 py-1.5 text-xs"
                      placeholder="Name"
                    />
                    <button
                      type="button"
                      disabled={!live || rosterDraft.roles.length <= 1}
                      onClick={() => {
                        const next = {
                          ...rosterDraft,
                          roles: rosterDraft.roles.filter((_, i) => i !== index),
                        };
                        setRosterDraft(next);
                        saveRoster(next);
                      }}
                      className="text-on-surface-variant hover:text-error disabled:opacity-30"
                      aria-label="Remove role"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={!live}
                  onClick={() => {
                    const next = {
                      ...rosterDraft,
                      roles: [...rosterDraft.roles, { role: "", name: "" }],
                    };
                    setRosterDraft(next);
                    saveRoster(next);
                  }}
                  className="text-xs font-semibold text-primary hover:underline disabled:opacity-40"
                >
                  Add role
                </button>
              </div>
            </div>
          ) : null}

          {active?.kind === "lyric" || presentation?.verse_overlay_ref ? (
          <div className="space-y-2">
            <h4 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
              {presentation?.verse_overlay_ref ? "Verse display" : "Lyrics text"}
            </h4>
            {presentation?.verse_overlay_ref ? (
              <div className="grid grid-cols-3 gap-1.5">
                {FREE_BIBLE_TRANSLATIONS.map((item) => {
                  const activeLang =
                    (presentation.verse_overlay_translation || "ceb") === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      disabled={!live}
                      onClick={() => setVerseTranslation(item.value)}
                      className={`rounded-lg px-2 py-2 text-[11px] font-semibold leading-tight transition-colors disabled:opacity-40 ${
                        activeLang
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container-low border border-white/10 text-on-surface-variant hover:bg-white/5"
                      }`}
                    >
                      {item.value === "ceb"
                        ? "Bisaya"
                        : item.value === "kjv"
                          ? "English"
                          : "WEB"}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <select
              value={font}
              disabled={!live}
              onChange={(event) => {
                if (!live) return;
                const next = asStageFont(event.target.value);
                setFont(next);
                void patchChurchSettings({ default_font: next }).catch((err) =>
                  setError(err instanceof Error ? err.message : "Could not change font."),
                );
              }}
              className="w-full bg-surface-container-low border border-white/10 rounded-lg px-3 py-2 text-sm disabled:opacity-40"
            >
              {STAGE_FONTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                  {option.id === DEFAULT_STAGE_FONT ? " (Default)" : ""}
                </option>
              ))}
            </select>
            <TextSizePicker
              disabled={!live}
              value={
                presentation?.verse_overlay_ref && active?.kind !== "lyric"
                  ? currentItem?.sermon?.text_size || "md"
                  : lyricSize
              }
              onChange={(size) => {
                if (!live) return;
                if (presentation?.verse_overlay_ref && active?.kind !== "lyric") {
                  if (!currentItem?.sermon_id) return;
                  void updateSermonTextSize(currentItem.sermon_id, size)
                    .then(refreshSetlist)
                    .catch((err) =>
                      setError(
                        err instanceof Error ? err.message : "Could not change size.",
                      ),
                    );
                  return;
                }
                setLyricSize(size);
                void patchChurchSettings({ lyrics_text_size: size }).catch((err) =>
                  setError(err instanceof Error ? err.message : "Could not change size."),
                );
              }}
            />
            <TextStylePicker
              disabled={!live}
              value={lyricStyle}
              onChange={(next) => {
                if (!live) return;
                if (presentation?.verse_overlay_ref && active?.kind !== "lyric") return;
                setLyricStyle(next);
                void patchChurchSettings({
                  lyrics_text_style: serializeLyricTextStyle(next),
                }).catch((err) =>
                  setError(err instanceof Error ? err.message : "Could not change style."),
                );
              }}
            />
            <p className="text-[10px] text-on-surface-variant">
              {presentation?.verse_overlay_ref
                ? "Bisaya or English updates on the projector. Verse text is black, bold, and underlined."
                : "Title and section stay in Arial. Only the lyrics use this font and size."}
            </p>
          </div>
          ) : null}

          {sermonActive ? (
            <div className="space-y-3">
              {presentation?.verse_overlay_ref ? null : (
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
                    Point size
                  </h4>
                  <TextSizePicker
                    disabled={!live}
                    value={currentItem?.sermon?.text_size || "md"}
                    onChange={(size) => {
                      if (!live || !currentItem?.sermon_id) return;
                      void updateSermonTextSize(currentItem.sermon_id, size)
                        .then(refreshSetlist)
                        .catch((err) =>
                          setError(
                            err instanceof Error ? err.message : "Could not change size.",
                          ),
                        );
                    }}
                  />
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={!live || !currentSlide || isSermonSpace(currentSlide.content)}
                  onClick={() => {
                    if (!currentSlide || isSermonSpace(currentSlide.content)) return;
                    const next = insertSermonGap(pointDraft);
                    setPointDraft(next);
                    setPointSync((n) => n + 1);
                    savePoint(next, verseDraft);
                  }}
                  className="flex items-center justify-center gap-1 p-3 rounded-xl border border-white/10 hover:bg-white/5 text-[11px] font-semibold disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    space_bar
                  </span>
                  Space
                </button>
                <button
                  type="button"
                  disabled={!live}
                  onClick={() => {
                    if (!live || !currentItem?.sermon_id) return;
                    void insertSermonSlide(currentItem.sermon_id, {
                      content: "New point",
                      afterSlideId: currentSlide?.id ?? null,
                    })
                      .then(refreshSetlist)
                      .catch((err) =>
                        setError(
                          err instanceof Error ? err.message : "Could not add a point.",
                        ),
                      );
                  }}
                  className="flex items-center justify-center gap-1 p-3 rounded-xl border border-white/10 hover:bg-white/5 text-[11px] font-semibold"
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>
                  Point
                </button>
                <button
                  type="button"
                  disabled={!live || !currentSlide}
                  onClick={() => {
                    if (!currentSlide) return;
                    void deleteSermonSlide(currentSlide.id)
                      .then(refreshSetlist)
                      .catch((err) =>
                        setError(
                          err instanceof Error ? err.message : "Could not delete.",
                        ),
                      );
                  }}
                  className="flex items-center justify-center gap-1 p-3 rounded-xl border border-error/20 text-error hover:bg-error/10 text-[11px] font-semibold disabled:opacity-40"
                >
                  <span className="material-symbols-outlined text-[16px]">delete</span>
                  Delete
                </button>
              </div>
              {titleSlide && firstSlide ? (
                <div className="space-y-2">
                  <h4 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
                    Title verse
                  </h4>
                  <input
                    value={verseDraft}
                    disabled={!live}
                    onChange={(event) => {
                      const value = event.target.value;
                      setVerseDraft(value);
                      savePoint(pointDraft, value);
                    }}
                    className="w-full bg-surface-container-low border border-white/10 rounded-lg px-3 py-2 text-sm disabled:opacity-50"
                    placeholder="Verse · Fil 3:14"
                  />
                  <p className="text-[10px] text-on-surface-variant">
                    This verse sits at the bottom of the title slide only.
                  </p>
                </div>
              ) : currentSlide && !isSermonSpace(currentSlide.content) ? (
                <div className="space-y-2">
                  <h4 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
                    Edit point
                  </h4>
                  <PointEditor
                    value={pointDraft}
                    readOnly={!live}
                    expanded={pointEditorActive}
                    syncNonce={pointSync}
                    onFocusChange={setPointEditorActive}
                    onChange={(next) => {
                      if (!live) return;
                      setPointDraft(next);
                      savePoint(next, verseDraft);
                    }}
                  />
                </div>
              ) : (
                <p className="text-xs text-on-surface-variant">
                  This is a space. Advance when you are ready for the next point.
                </p>
              )}
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
                Transition Speed
              </h4>
              <span className="font-mono text-xs text-primary">{transitionSec}s</span>
            </div>
            <input
              className="w-full h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary"
              max={2}
              min={0}
              step={0.1}
              type="range"
              disabled={!live}
              value={(presentation?.transition_ms ?? 400) / 1000}
              onChange={(event) => {
                if (!presentation) return;
                const ms = Math.round(Number(event.target.value) * 1000);
                void updatePresentation(presentation.id, { transition_ms: ms }).then(
                  setPresentation,
                );
              }}
            />
            <div className="flex justify-between text-[10px] text-on-surface-variant font-medium">
              <span>CUT</span>
              <span>SMOOTH</span>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar min-h-0">
            <h4 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
              Service items
            </h4>
            <div className="space-y-2">
              {(setlist?.items ?? []).map((item) => {
                const hold = bindItem(item.id);
                return (
                <div
                  key={item.id}
                  {...hold}
                  className={`w-full p-3 rounded-lg bg-surface-container-high border border-white/5 flex items-center gap-3 text-left select-none touch-none ${
                    live
                      ? "cursor-grab active:cursor-grabbing"
                      : "cursor-default"
                  }`}
                >
                  <span className="material-symbols-outlined text-on-surface-variant text-[18px] shrink-0">
                    drag_indicator
                  </span>
                  <div className="w-8 h-8 rounded flex items-center justify-center bg-primary/20 text-primary shrink-0">
                    <span className="material-symbols-outlined text-[20px]">
                      {item.item_type === "song"
                        ? "music_note"
                        : item.item_type === "sermon"
                          ? "record_voice_over"
                          : item.item_type === "scripture"
                            ? "menu_book"
                            : item.item_type === "roster"
                              ? "assignment_ind"
                              : "movie"}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium truncate">{item.title}</div>
                    <div className="text-[10px] text-on-surface-variant truncate">
                      {item.subtitle || item.item_type}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </aside>
      </main>

      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 glass-panel px-4 py-2 rounded-full transition-opacity duration-300 pointer-events-none z-50 ${
          hint ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="text-[10px] font-bold text-primary tracking-widest uppercase">
          Space / arrows: next · {live ? "hold and drag to reorder" : "go live to edit"}
        </span>
      </div>
    </div>
  );
}
