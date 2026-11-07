import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import CueStage from "../../components/CueStage";
import LiveEditWorkspace from "../../components/LiveEditWorkspace";
import StageBackdrop from "../../components/StageBackdrop";
import StageBackgroundPicker from "../../components/StageBackgroundPicker";
import VerseOverlay from "../../components/VerseOverlay";
import { ConsoleSkeleton } from "../../components/Skeleton";
import TextSizePicker from "../../components/TextSizePicker";
import TextStylePicker from "../../components/TextStylePicker";
import {
  buildCues,
  cueIndexFor,
  endPresentation,
  getActivePresentation,
  getChurchSettings,
  getPresentation,
  getSetlist,
  updateSetlistBackground,
  listSetlists,
  patchChurchSettings,
  patchFromCue,
  reorderSetlistItems,
  startPresentation,
  subscribePresentation,
  updatePresentation,
  updateScripturePassage,
  updateSetlistItem,
} from "../../lib/api";
import {
  isSermonSpace,
  isTypingTarget,
  moveItem,
} from "../../lib/helpers";
import { sermonPlainText } from "../../lib/sermonMarkup";
import {
  formatBibleReference,
  FREE_BIBLE_TRANSLATIONS,
  isFreeBibleTranslation,
  type FreeBibleTranslation,
  type ParsedBibleRef,
} from "../../lib/bible";
import { useHoldReorder } from "../../lib/holdDrag";
import { subscribeContent, setlistFingerprint, publishStageSnapshot } from "../../lib/offline/live";
import { usePageActive } from "../../lib/PageActiveContext";
import { readPreferredSetlistId } from "../../lib/preferredSetlist";
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
  stageBackgroundDef,
  stageUsesDarkText,
  type StageBackgroundId,
} from "../../lib/stageBackgrounds";
import {
  DEFAULT_LYRIC_TEXT_STYLE,
  DEFAULT_STAGE_TEXT_SIZE,
  parseLyricTextStyle,
  serializeLyricTextStyle,
  type LyricTextStyle,
} from "../../lib/lyricTextStyle";
import { asStageTransition, lyricTransitionClass, type StageTransition } from "../../lib/stageTransition";
import { readChordDisplay, saveChordDisplay, type ChordDisplay } from "../../lib/chordDisplay";
import ChordControls from "../../components/ChordControls";
import ScriptureStyleControls from "../../components/ScriptureStyleControls";
import { usePrefs } from "../../lib/PrefsContext";
import { useToast } from "../../lib/ToastContext";
import type { LiveCue, Presentation, Setlist } from "../../lib/types";
import Icon from "../../components/Icon";
import { Badge, Button, Kbd, SectionLabel } from "../../components/ui";
import ConsoleSection from "../../components/live/ConsoleSection";
import RunOfShow, { itemIcon } from "../../components/live/RunOfShow";
import SlideStrip from "../../components/live/SlideStrip";
import ConfirmDialog from "../../components/modals/ConfirmDialog";

export default function Live() {
  const toast = useToast();
  const { t } = usePrefs();
  const [params, setParams] = useSearchParams();
  const pageActive = usePageActive();
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
  const [font, setFont] = useState(DEFAULT_STAGE_FONT);
  const [lyricSize, setLyricSize] = useState(DEFAULT_STAGE_TEXT_SIZE);
  const [lyricStyle, setLyricStyle] = useState<LyricTextStyle>(DEFAULT_LYRIC_TEXT_STYLE);
  // Church-wide default; a setlist may override it with its own background.
  const [churchBg, setChurchBg] = useState<StageBackgroundId>(DEFAULT_STAGE_BACKGROUND);
  const [bgScope, setBgScope] = useState<"setlist" | "church" | null>(null);
  const stageBg: StageBackgroundId = setlist?.stage_background
    ? asStageBackground(setlist.stage_background)
    : churchBg;
  const [transitionStyle, setTransitionStyle] = useState<StageTransition>("dissolve");
  const [chords, setChords] = useState<ChordDisplay>(readChordDisplay);
  const updateChords = (patch: Partial<ChordDisplay>) => {
    setChords((prev) => {
      const next = { ...prev, ...patch };
      saveChordDisplay(next);
      return next;
    });
  };
  const [rosterDraft, setRosterDraft] = useState<RosterPayload | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  // Stage settings accordion: closed by default, only one section open at a time.
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [hiddenDecks, setHiddenDecks] = useState<{ left: boolean; right: boolean }>(() => {
    try {
      return { left: false, right: false, ...JSON.parse(localStorage.getItem("mc.liveDecks") || "{}") };
    } catch {
      return { left: false, right: false };
    }
  });
  const toggleDeck = (side: "left" | "right") => {
    setHiddenDecks((prev) => {
      const next = { ...prev, [side]: !prev[side] };
      try {
        localStorage.setItem("mc.liveDecks", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
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

    // Prefer the setlist from Setlists → Go Live / preferred presentation setlist.
    const preferred = readPreferredSetlistId();
    const nextSetlistId =
      requestedSetlist ||
      live?.setlist_id ||
      (preferred && listed.items.some((row) => row.id === preferred)
        ? preferred
        : "") ||
      listed.items[0]?.id ||
      "";
    const liveForSetlist =
      live && (!requestedSetlist || live.setlist_id === requestedSetlist)
        ? live
        : null;

    setSetlistId(nextSetlistId);
    if (nextSetlistId) {
      try {
        const next = await getSetlist(nextSetlistId, { fresh: true });
        setlistFp.current = setlistFingerprint(next);
        setSetlist(next);
        setSetlists((prev) =>
          prev.some((row) => row.id === next.id) ? prev : [next, ...prev],
        );
      } catch (err) {
        setSetlist(null);
        setError(
          err instanceof Error ? err.message : "Could not load setlist.",
        );
      }
    } else {
      setSetlist(null);
    }
    setPresentation(liveForSetlist);
    if (liveForSetlist) {
      setParams({ presentation: liveForSetlist.id }, { replace: true });
    } else if (requestedSetlist) {
      setParams({ setlist: requestedSetlist }, { replace: true });
    }
    try {
      const settings = await getChurchSettings();
      setFont(asStageFont(settings?.default_font));
      setLyricSize(settings?.lyrics_text_size || DEFAULT_STAGE_TEXT_SIZE);
      setLyricStyle(parseLyricTextStyle(settings?.lyrics_text_style));
      setChurchBg(asStageBackground(settings?.stage_background));
      setTransitionStyle(asStageTransition(settings?.default_transition));
    } catch {
      setFont(DEFAULT_STAGE_FONT);
    }
  }, [requestedId, requestedSetlist, setParams]);

  useEffect(() => {
    if (!pageActive) return;
    void (async () => {
      try {
        await loadBundle();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load live.");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadBundle, pageActive]);

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
          setLyricSize(settings?.lyrics_text_size || DEFAULT_STAGE_TEXT_SIZE);
          setLyricStyle(parseLyricTextStyle(settings?.lyrics_text_style));
          setChurchBg(asStageBackground(settings?.stage_background));
          setTransitionStyle(asStageTransition(settings?.default_transition));
        })
        .catch(() => undefined);
    };
    const unsub = subscribeContent(reload);
    // Content changes arrive via subscribeContent (BroadcastChannel / storage /
    // desktop events). This is only a slow safety net, not the update path.
    const timer = window.setInterval(reload, 10_000);
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
      chords,
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
    chords,
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

  const displayPresentation = presentation;
  const displaySetlist = setlist;

  const cues = useMemo(() => (displaySetlist ? buildCues(displaySetlist) : []), [displaySetlist]);
  const live = displayPresentation?.status === "live";
  const liveIndex = displayPresentation ? cueIndexFor(displayPresentation, cues) : 0;
  const index = live ? liveIndex : previewIndex;
  const active: LiveCue | undefined = cues[index];
  const darkText = stageUsesDarkText(stageBg);
  const setlistHasBg = Boolean(setlist?.stage_background);
  const backgroundScope = bgScope ?? (setlistHasBg ? "setlist" : "church");
  const transitionSec = ((displayPresentation?.transition_ms ?? 400) / 1000).toFixed(1);
  const currentItem = displaySetlist?.items?.find((row: { id: string }) => row.id === active?.itemId);
  const currentSlide = currentItem?.sermon?.slides?.find(
    (row: { id: string }) => row.id === active?.slideId,
  );
  const titleSlide = Boolean(active?.titleSlide);
  const activeHasChords = useMemo(
    () =>
      Boolean(active?.itemId) &&
      cues.some(
        (cue) =>
          cue.itemId === active?.itemId &&
          (cue.lines ?? []).some((line) => /\[[^\]]+\]/.test(line)),
      ),
    [active?.itemId, cues],
  );
  const sermonActive = active?.kind === "sermon" && Boolean(currentItem?.sermon_id);
  const rosterActive = active?.kind === "roster" && Boolean(currentItem?.id);

  const refreshSetlist = useCallback(() => {
    if (!setlistId) return Promise.resolve();
    return getSetlist(setlistId, { fresh: true }).then(applySetlist);
  }, [setlistId, applySetlist]);

  const currentPassage =
    currentItem?.item_type === "scripture" ? currentItem.passage ?? null : null;
  const patchScriptureStyle = (
    patch: Parameters<typeof updateScripturePassage>[1],
  ) => {
    if (!currentPassage) return;
    void updateScripturePassage(currentPassage.id, patch)
      .then(() => refreshSetlist())
      .catch(() => toast.error("Could not update the scripture style."));
  };

  const toggleSection = (id: string) => {
    setOpenSection((prev) => (prev === id ? null : id));
  };

  const patchPresentation = useCallback(
    (patch: Partial<Presentation>) => {
      if (!presentation) return;
      void updatePresentation(presentation.id, patch).then(setPresentation);
    },
    [presentation],
  );

  const patchSettings = useCallback(
    (patch: any) => {
      if (patch.stage_background) setChurchBg(asStageBackground(patch.stage_background));
      if (patch.default_font) setFont(asStageFont(patch.default_font));
      if (patch.lyrics_text_size) setLyricSize(patch.lyrics_text_size);
      if (patch.lyrics_text_style) setLyricStyle(parseLyricTextStyle(patch.lyrics_text_style));
      void patchChurchSettings(patch).catch((err) =>
        setError(err instanceof Error ? err.message : "Could not update settings."),
      );
    },
    [],
  );

  const { bind: bindItem } = useHoldReorder(
    "live-items",
    (fromId, toId) => {
      if (!displaySetlist) return;
      const ids = (displaySetlist.items ?? []).map((row) => row.id);
      const fromIndex = ids.indexOf(fromId);
      const toIndex = ids.indexOf(toId);
      if (fromIndex === -1 || toIndex === -1) return;

      const nextIds = moveItem(ids, fromIndex, toIndex);
      const nextItems = moveItem([...(displaySetlist.items ?? [])], fromIndex, toIndex);

      // Optimistic update for setlist items
      applySetlist({ ...displaySetlist, items: nextItems });

      void reorderSetlistItems(displaySetlist.id, nextIds)
        .then(applySetlist)
        .catch((err) =>
          setError(err instanceof Error ? err.message : "Could not reorder the setlist."),
        );
    },
    live,
  );

  const { bind: bindRosterRole } = useHoldReorder(
    "roster-roles",
    (fromId, toId) => {
      if (!rosterDraft || !displaySetlist) return;
      const fromIndex = Number.parseInt(fromId, 10);
      const toIndex = Number.parseInt(toId, 10);
      const roles = moveItem(rosterDraft.roles, fromIndex, toIndex);
      const next = { ...rosterDraft, roles };
      setRosterDraft(next);
      saveRoster(next);
    },
    live,
  );

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
        verse_overlay_take: 1,
      });
      setPresentation(next);
    },
    [cues, presentation],
  );

  const goLiveNext = useCallback(() => {
    if (!presentation || !cues.length) return;
    void goToCue(liveIndex + 1);
  }, [presentation, cues.length, liveIndex, goToCue]);

  const goLivePrev = useCallback(() => {
    if (!presentation || !cues.length) return;
    void goToCue(liveIndex - 1);
  }, [presentation, cues.length, liveIndex, goToCue]);

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
    patchPresentation({
      verse_overlay_translation: next,
      verse_overlay_page: 0,
    });
  };

  const openVerse = (_raw: string, parsed: ParsedBibleRef) => {
    if (!live || !presentation) return;
    patchPresentation({
      verse_overlay_ref: formatBibleReference(
        parsed.book,
        parsed.chapter,
        parsed.verses,
      ),
      verse_overlay_translation: readVerseTranslation(),
      verse_overlay_page: 0,
      verse_overlay_take: 1,
      verse_overlay_font:
        presentation.verse_overlay_font || font || DEFAULT_STAGE_FONT,
      verse_overlay_text_size:
        presentation.verse_overlay_text_size || lyricSize || DEFAULT_STAGE_TEXT_SIZE,
      verse_overlay_text_style:
        presentation.verse_overlay_text_style ||
        serializeLyricTextStyle({ bold: true, italic: false, underline: false }),
      verse_overlay_color: presentation.verse_overlay_color || "black",
    });
  };

  const closeVerse = useCallback(() => {
    patchPresentation({
      verse_overlay_ref: null,
      verse_overlay_translation: null,
      verse_overlay_page: 0,
      verse_overlay_take: 1,
    });
  }, [patchPresentation]);

  const saveRoster = (next: RosterPayload) => {
    if (!live || !displaySetlist || !currentItem || currentItem.item_type !== "roster") return;

    window.clearTimeout(rosterSaveTimer.current);
    rosterSaveTimer.current = window.setTimeout(() => {
      void updateSetlistItem(displaySetlist.id, currentItem.id, {
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
    if (!live) setEditMode(false);
  }, [live]);

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
      if (editMode) return;
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
        patchPresentation({
          is_blackout: !presentation.is_blackout,
        });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    closeVerse,
    index,
    live,
    presentation,
    selectCue,
    patchPresentation,
    editMode,
  ]);

  const goLive = async () => {
    if (!setlistId) return;
    setBusy(true);
    setError("");
    try {
      const row = await startPresentation(setlistId, setlist?.name);
      // Refresh local setlist after unarchive / cue rebuild.
      try {
        const refreshed = await getSetlist(setlistId, { fresh: true });
        setlistFp.current = setlistFingerprint(refreshed);
        setSetlist(refreshed);
        setSetlists((prev) => {
          const without = prev.filter((item) => item.id !== refreshed.id);
          return [refreshed, ...without];
        });
      } catch {
        /* keep current setlist */
      }
      const cue = cues[previewIndex];
      const next = cue
        ? await updatePresentation(row.id, {
            ...patchFromCue(cue),
            verse_overlay_ref: null,
            verse_overlay_translation: null,
            verse_overlay_page: 0,
            verse_overlay_take: 1,
          })
        : row;
      setPresentation(next);
      setParams({ presentation: next.id, setlist: setlistId }, { replace: true });
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

  const [confirmEnd, setConfirmEnd] = useState(false);

  const stopLive = async () => {
    if (!presentation) return;
    setBusy(true);
    try {
      await endPresentation(presentation.id);
      await closeProjectorWindow();
      setPresentation(null);
      const keepSetlist = presentation.setlist_id || setlistId;
      setParams(
        keepSetlist ? { setlist: keepSetlist } : {},
        { replace: true },
      );
      if (keepSetlist) setSetlistId(keepSetlist);
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

  if (loading) return <ConsoleSkeleton />;

  const items = displaySetlist?.items ?? [];
  const verseOpen = Boolean(presentation?.verse_overlay_ref);
  const fontLabel = (id: string) => STAGE_FONTS.find((row) => row.id === id)?.label ?? id;
  const textSummary = verseOpen
    ? fontLabel(displayPresentation?.verse_overlay_font || font || DEFAULT_STAGE_FONT)
    : fontLabel(font);
  const rosterWide = rosterActive && openSection === "roster";

  return (
    <div className="bg-background text-on-surface font-sans overflow-hidden h-screen flex flex-col select-none">
      {/* ── Top bar ─────────────────────────────────────────────────── */}
      <header className="h-12 shrink-0 app-chrome border-b flex items-center gap-3 pl-2 pr-3 z-50">
        <Link
          to="/dashboard"
          className="ui-btn ui-btn-ghost ui-btn-sm shrink-0"
          title={t("live.backToDashboard")}
        >
          <Icon name="arrow_back" className="text-[15px]" />
          <span className="sr-only xl:not-sr-only">{t("live.backToDashboard")}</span>
        </Link>
        <span className="h-5 w-px bg-white/10 shrink-0" aria-hidden />
        <span
          className="w-6 h-6 rounded-md bg-primary-container flex items-center justify-center shrink-0"
          title="MinistryCast"
        >
          <Icon name="movie_filter" className="filled text-on-primary text-[14px]" />
        </span>

        <div className="min-w-0 flex-1 flex items-center gap-3">
          {setlists.length === 0 ? (
            <span className="text-[13px] text-on-surface-variant truncate">
              {t("live.noSetlists")}
            </span>
          ) : (
            <div
              role="tablist"
              aria-label={t("live.setlist")}
              className="ui-tabs min-w-0 max-w-full overflow-x-auto [scrollbar-width:none]"
              title={live ? "End the presentation to switch setlists" : undefined}
            >
              {setlists.map((row) => {
                const selected = setlistId === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    disabled={live && !selected}
                    onClick={() => {
                      if (live) return;
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
                    className="ui-tab shrink-0 disabled:opacity-40"
                  >
                    <span className="max-w-[160px] truncate">{row.name}</span>
                  </button>
                );
              })}
            </div>
          )}
          <span className="shrink-0 flex items-center gap-2">
            <Badge tone={live ? "danger" : "neutral"}>
              <span
                className={`w-1.5 h-1.5 rounded-full ${live ? "bg-error live-pulse" : "bg-outline"}`}
                aria-hidden
              />
              {live ? t("live.onAir") : t("live.standby")}
            </Badge>
            <span
              className="text-[12px] text-on-surface-variant font-mono tabular-nums"
              title="Session time"
            >
              {formatTime(elapsed)}
            </span>
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden lg:flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => toggleDeck("left")}
              aria-pressed={!hiddenDecks.left}
              title={hiddenDecks.left ? "Show setlist deck" : "Hide setlist deck"}
              className="ui-icon-btn"
            >
              <Icon
                name={hiddenDecks.left ? "left_panel_open" : "left_panel_close"}
                className="text-[16px]"
              />
            </button>
            <button
              type="button"
              onClick={() => toggleDeck("right")}
              aria-pressed={!hiddenDecks.right}
              title={hiddenDecks.right ? "Show controls deck" : "Hide controls deck"}
              className="ui-icon-btn hidden xl:inline-flex"
            >
              <Icon
                name={hiddenDecks.right ? "right_panel_open" : "right_panel_close"}
                className="text-[16px]"
              />
            </button>
          </div>
          {live && displayPresentation ? (
            <>
              <span className="hidden lg:block h-5 w-px bg-white/10 mx-1" aria-hidden />
              <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditMode(true)}>
                {t("live.editMode")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon="present_to_all"
                className="hidden sm:inline-flex"
                onClick={() => void openProjectorWindow(displayPresentation.id)}
              >
                Open Output
              </Button>
              <span className="h-5 w-px bg-white/10 mx-1" aria-hidden />
              <Button
                size="sm"
                variant="danger"
                icon="stop_circle"
                disabled={busy}
                onClick={() => setConfirmEnd(true)}
              >
                {t("live.endPresentation")}
              </Button>
            </>
          ) : (
            <>
              <span className="h-5 w-px bg-white/10 mx-1" aria-hidden />
              <Button
                size="sm"
                variant="primary"
                icon="play_circle"
                disabled={busy || !setlistId}
                onClick={() => void goLive()}
              >
                {busy ? t("live.starting") : t("live.goLive")}
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 min-h-0 flex overflow-hidden">
        {/* ── Left rail: run of show ──────────────────────────────────── */}
        <aside
          className={`${
            hiddenDecks.left ? "hidden" : "hidden lg:flex"
          } w-[260px] shrink-0 flex-col border-r border-white/5 bg-surface-container-lowest`}
        >
          <div className="h-10 shrink-0 flex items-center justify-between px-4 border-b border-white/5">
            <h2 className="text-[12px] font-medium text-on-surface-variant">
              {t("live.setlist")}
            </h2>
            <span className="text-[11px] text-on-surface-variant tabular-nums">
              {items.length}
            </span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            {items.length ? (
              <RunOfShow
                items={items}
                cues={cues}
                activeItemId={active?.itemId}
                live={live}
                onJump={selectCue}
                bindItem={bindItem}
              />
            ) : (
              <p className="px-4 py-6 text-[13px] text-on-surface-variant">
                Add songs, sermons, scripture, or assignments to this setlist first.
              </p>
            )}
          </div>
          <p className="shrink-0 border-t border-white/5 px-4 py-2.5 text-[11px] text-on-surface-variant">
            {live ? "Hold and drag an item to reorder." : "Click an item to preview it."}
          </p>
        </aside>

        {/* ── Center: program preview, transport, slide strip ────────── */}
        <section className="flex-1 min-w-0 flex flex-col px-4 sm:px-6 py-4 bg-background">
          {error ? (
            <p role="alert" className="shrink-0 mb-2 text-[13px] text-error">
              {error}
            </p>
          ) : null}

          {/* Preview, transport and strip share one width so their edges line up. */}
          <div className="flex-1 min-h-[320px] [container-type:size]">
            <div
              className="h-full flex flex-col items-center justify-center gap-3 [--stage-w:min(100cqw,calc((100cqh-148px)*16/9))] [--rail-w:max(var(--stage-w),min(100cqw,520px))]"
            >
              <div
                className={`relative shrink-0 aspect-video w-[var(--stage-w)] rounded-xl overflow-hidden border ${
                  live ? "border-error/50" : "border-white/10"
                }`}
              >
                <StageBackdrop id={stageBg} />
                <div className="absolute inset-0">
                  {presentation?.is_blackout ? (
                    <div className="h-full w-full flex items-center justify-center bg-black">
                      <p className="text-white/50 uppercase tracking-[0.3em] text-sm">Blackout</p>
                    </div>
                  ) : presentation?.show_logo ? (
                    <div className="h-full w-full flex items-center justify-center">
                      <Icon name="church" className="filled text-primary text-7xl" />
                    </div>
                  ) : (
                    <div
                      key={active?.id ?? "empty"}
                      className={`h-full w-full ${lyricTransitionClass(transitionStyle, presentation?.transition_ms ?? 400)}`}
                      style={{ animationDuration: `${presentation?.transition_ms ?? 400}ms` }}
                    >
                      <CueStage
                        cue={active}
                        paddingTop={44}
                        font={font}
                        lyricSize={lyricSize}
                        lyricStyle={lyricStyle}
                        chords={chords}
                        darkText={darkText}
                        onVerseClick={live ? openVerse : undefined}
                      />
                    </div>
                  )}
                </div>
                <span
                  className={`absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[11px] font-medium ${
                    live ? "bg-error text-white" : "bg-black/60 text-white/85"
                  }`}
                >
                  {live ? "On Air Preview" : "Standby Preview"}
                </span>
                {displayPresentation?.verse_overlay_ref ? (
                  <VerseOverlay
                    reference={displayPresentation.verse_overlay_ref}
                    translation={displayPresentation.verse_overlay_translation || "ceb"}
                    font={displayPresentation.verse_overlay_font || font || DEFAULT_STAGE_FONT}
                    textSize={
                      displayPresentation.verse_overlay_text_size ||
                      lyricSize ||
                      DEFAULT_STAGE_TEXT_SIZE
                    }
                    textStyle={displayPresentation.verse_overlay_text_style || "bold"}
                    color={displayPresentation.verse_overlay_color || "black"}
                    paddingTop={44}
                    page={displayPresentation.verse_overlay_page ?? 0}
                    pageSize={displayPresentation.verse_overlay_take || 5}
                    onPageChange={(next) => {
                      patchPresentation({ verse_overlay_page: next });
                    }}
                    onPageSizeChange={(next) => {
                      patchPresentation({ verse_overlay_take: next });
                    }}
                    onReferenceChange={(next) => {
                      patchPresentation({ verse_overlay_ref: next, verse_overlay_page: 0 });
                    }}
                    onClose={closeVerse}
                  />
                ) : null}
              </div>

              {/* Transport */}
              <div className="shrink-0 w-[var(--rail-w)] grid grid-cols-[1fr_auto_1fr] items-center gap-3 h-9">
                <div className="min-w-0 flex items-center gap-2">
                  {currentItem ? (
                    <Icon
                      name={itemIcon(currentItem.item_type)}
                      className="text-[15px] text-on-surface-variant shrink-0"
                    />
                  ) : null}
                  <span className="min-w-0 truncate text-[13px] font-medium text-on-surface">
                    {active?.songTitle || currentItem?.title || active?.title || setlist?.name || "Empty setlist"}
                  </span>
                  {active?.musicalKey ? <Badge>{active.musicalKey}</Badge> : null}
                  {active?.bpm ? <Badge>{active.bpm} BPM</Badge> : null}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={!cues.length || index <= 0}
                    onClick={() => selectCue(index - 1)}
                    aria-label="Previous slide"
                    title="Previous slide (←)"
                    className="ui-icon-btn w-8 h-8"
                  >
                    <Icon name="skip_previous" className="text-[18px]" />
                  </button>
                  <span className="min-w-[96px] text-center text-[13px] text-on-surface tabular-nums">
                    Slide {cues.length ? index + 1 : 0} / {cues.length}
                  </span>
                  <button
                    type="button"
                    disabled={!cues.length}
                    onClick={() => selectCue(index + 1)}
                    aria-label="Next slide"
                    title="Next slide (→ or Space)"
                    className="ui-icon-btn w-8 h-8"
                  >
                    <Icon name="skip_next" className="text-[18px]" />
                  </button>
                </div>
                <div className="min-w-0 hidden md:flex items-center justify-end gap-1.5 text-[11px] text-on-surface-variant">
                  {verseOpen && live ? (
                    <>
                      <Kbd>Esc</Kbd>
                      <span>close verse</span>
                    </>
                  ) : (
                    <>
                      <Kbd>←</Kbd>
                      <Kbd>→</Kbd>
                      <span>or</span>
                      <Kbd>Space</Kbd>
                      <span>to step</span>
                    </>
                  )}
                </div>
              </div>

              {/* Slides of the current item */}
              <div className="shrink-0 w-[var(--rail-w)]">
                {cues.length ? (
                  <SlideStrip cues={cues} index={index} onSelect={selectCue} />
                ) : (
                  <p className="h-[84px] flex items-center justify-center rounded-lg border border-dashed border-white/10 text-[13px] text-on-surface-variant">
                    No slides yet. Add songs, sermons, scripture, or assignments to this setlist first.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Right rail: output + stage settings ─────────────────────── */}
        <aside
          className={`${
            hiddenDecks.right ? "hidden" : "hidden xl:flex"
          } shrink-0 flex-col border-l border-white/5 bg-surface-container-lowest overflow-y-auto custom-scrollbar transition-[width] duration-200 ${
            rosterWide ? "w-[min(560px,46vw)]" : "w-[300px]"
          }`}
        >
          <div className="px-4 pt-4 pb-4 border-b border-white/5">
            <SectionLabel>Output</SectionLabel>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!live}
                aria-pressed={Boolean(displayPresentation?.is_blackout)}
                onClick={() => {
                  if (!displayPresentation) return;
                  patchPresentation({
                    is_blackout: !displayPresentation.is_blackout,
                    show_logo: displayPresentation.is_blackout ? displayPresentation.show_logo : false,
                  });
                }}
                className={`h-11 flex items-center gap-2 px-3 rounded-lg border text-[13px] font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                  displayPresentation?.is_blackout
                    ? "border-error bg-error/15 text-error"
                    : "border-white/10 bg-surface-container text-on-surface enabled:hover:bg-surface-container-high"
                }`}
              >
                <Icon name="block" className="text-[16px] shrink-0" />
                <span className="flex-1 text-left">Blackout</span>
                <Kbd>B</Kbd>
              </button>
              <button
                type="button"
                disabled={!live}
                aria-pressed={Boolean(displayPresentation?.show_logo)}
                onClick={() => {
                  if (!displayPresentation) return;
                  patchPresentation({
                    show_logo: !displayPresentation.show_logo,
                    is_blackout: displayPresentation.show_logo ? displayPresentation.is_blackout : false,
                  });
                }}
                className={`h-11 flex items-center gap-2 px-3 rounded-lg border text-[13px] font-medium transition-colors disabled:opacity-45 disabled:cursor-not-allowed ${
                  displayPresentation?.show_logo
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-white/10 bg-surface-container text-on-surface enabled:hover:bg-surface-container-high"
                }`}
              >
                <Icon name="branding_watermark" className="text-[16px] shrink-0" />
                <span className="flex-1 text-left">Logo</span>
              </button>
            </div>
            {!live ? (
              <p className="mt-3 text-[12px] leading-snug text-on-surface-variant">
                Standby is preview only. Press Go Live to edit slides, assignments, and output.
              </p>
            ) : displayPresentation?.is_blackout || displayPresentation?.show_logo ? (
              <p className="mt-3 text-[12px] leading-snug text-on-surface-variant">
                {displayPresentation.is_blackout
                  ? "The projector is black. Press Blackout again to bring slides back."
                  : "The projector shows the logo. Press Logo again to bring slides back."}
              </p>
            ) : null}
          </div>

          <div className="pt-4">
            <div className="px-4">
              <SectionLabel>Stage settings</SectionLabel>
            </div>
            <div className="border-t border-white/5">
              <ConsoleSection
                id="background"
                title="Stage background"
                icon="palette"
                summary={`${stageBackgroundDef(stageBg).label}${setlistHasBg ? " · setlist" : ""}`}
                open={openSection === "background"}
                onToggle={toggleSection}
              >
                {setlist ? (
                  <div className="mb-3">
                    <p className="text-[11px] text-on-surface-variant mb-1.5">Apply to</p>
                    <div role="radiogroup" aria-label="Apply background to" className="ui-tabs w-full">
                      {(
                        [
                          ["setlist", "This setlist"],
                          ["church", "Church default"],
                        ] as const
                      ).map(([scope, label]) => (
                        <button
                          key={scope}
                          type="button"
                          role="radio"
                          aria-checked={backgroundScope === scope}
                          aria-selected={backgroundScope === scope}
                          disabled={!live}
                          onClick={() => setBgScope(scope)}
                          className="ui-tab flex-1 justify-center"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {backgroundScope === "setlist" && setlistHasBg ? (
                      <button
                        type="button"
                        disabled={!live}
                        onClick={() => {
                          void updateSetlistBackground(setlist.id, null)
                            .then((next) => next && applySetlist(next))
                            .catch(() => toast.error("Could not reset the background."));
                        }}
                        className="mt-1.5 text-[11px] text-primary hover:underline disabled:opacity-40"
                      >
                        Reset to church default
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <StageBackgroundPicker
                  compact
                  disabled={!live}
                  value={stageBg}
                  onChange={(next) => {
                    if (!live) return;
                    if (backgroundScope === "setlist" && setlist) {
                      void updateSetlistBackground(setlist.id, next)
                        .then((updated) => updated && applySetlist(updated))
                        .catch(() => toast.error("Could not update the setlist background."));
                      return;
                    }
                    setChurchBg(next);
                    patchSettings({ stage_background: next });
                  }}
                />
              </ConsoleSection>

              {rosterActive && rosterDraft ? (
                <ConsoleSection
                  id="roster"
                  title="Assignments"
                  icon="assignment_ind"
                  summary={`${rosterDraft.roles.length} roles`}
                  open={openSection === "roster"}
                  onToggle={toggleSection}
                >
                  <input
                    value={rosterDraft.heading}
                    disabled={!live}
                    aria-label="Assignments heading"
                    onChange={(event) => {
                      const next = { ...rosterDraft, heading: event.target.value };
                      setRosterDraft(next);
                      saveRoster(next);
                    }}
                    className="ui-input disabled:opacity-50"
                  />
                  <input
                    type="date"
                    value={rosterDraft.date}
                    disabled={!live}
                    aria-label="Assignments date"
                    onChange={(event) => {
                      const next = { ...rosterDraft, date: event.target.value };
                      setRosterDraft(next);
                      saveRoster(next);
                    }}
                    className="ui-input disabled:opacity-50"
                  />
                  <div className="space-y-2">
                    {rosterDraft.roles.map((row, roleIndex) => {
                      const hold = bindRosterRole(String(roleIndex));
                      return (
                        <div
                          key={roleIndex}
                          {...hold}
                          className="flex items-center gap-2 select-none touch-none cursor-grab active:cursor-grabbing"
                        >
                          <span className="text-on-surface-variant shrink-0" aria-hidden>
                            <Icon name="drag_indicator" className="text-[15px]" />
                          </span>
                          <input
                            value={row.role}
                            disabled={!live}
                            data-hold-ignore
                            onChange={(event) => {
                              const roles = rosterDraft.roles.map((item, i) =>
                                i === roleIndex ? { ...item, role: event.target.value } : item,
                              );
                              const next = { ...rosterDraft, roles };
                              setRosterDraft(next);
                              saveRoster(next);
                            }}
                            className="ui-input !h-8 w-[46%] text-[12px]"
                            placeholder="Role"
                          />
                          <input
                            value={row.name}
                            disabled={!live}
                            data-hold-ignore
                            onChange={(event) => {
                              const roles = rosterDraft.roles.map((item, i) =>
                                i === roleIndex ? { ...item, name: event.target.value } : item,
                              );
                              const next = { ...rosterDraft, roles };
                              setRosterDraft(next);
                              saveRoster(next);
                            }}
                            className="ui-input !h-8 flex-1 min-w-0 text-[12px]"
                            placeholder="Name"
                          />
                          <button
                            type="button"
                            disabled={!live || rosterDraft.roles.length <= 1}
                            onClick={() => {
                              const next = {
                                ...rosterDraft,
                                roles: rosterDraft.roles.filter((_, i) => i !== roleIndex),
                              };
                              setRosterDraft(next);
                              saveRoster(next);
                            }}
                            className="ui-icon-btn ui-icon-btn-danger shrink-0"
                            aria-label="Remove role"
                          >
                            <Icon name="close" className="text-[14px]" />
                          </button>
                        </div>
                      );
                    })}
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="add"
                      disabled={!live}
                      onClick={() => {
                        const next = {
                          ...rosterDraft,
                          roles: [...rosterDraft.roles, { role: "", name: "" }],
                        };
                        setRosterDraft(next);
                        saveRoster(next);
                      }}
                    >
                      Add role
                    </Button>
                  </div>
                </ConsoleSection>
              ) : null}

              {active?.kind === "lyric" || verseOpen ? (
                <ConsoleSection
                  id="lyrics"
                  title={verseOpen ? "Verse display" : "Lyrics text"}
                  icon={verseOpen ? "auto_stories" : "format_bold"}
                  summary={textSummary}
                  open={openSection === "lyrics"}
                  onToggle={toggleSection}
                >
                  {verseOpen ? (
                    <div className="grid grid-cols-2 gap-1.5">
                      {FREE_BIBLE_TRANSLATIONS.map((item) => {
                        const activeLang =
                          (displayPresentation?.verse_overlay_translation || "ceb") === item.value;
                        return (
                          <button
                            key={item.value}
                            type="button"
                            disabled={!live}
                            aria-pressed={activeLang}
                            onClick={() => setVerseTranslation(item.value)}
                            className={`rounded-lg px-2 py-2 text-[11px] font-medium leading-tight transition-colors disabled:opacity-40 ${
                              activeLang
                                ? "bg-primary text-on-primary"
                                : "bg-surface-container border border-white/10 text-on-surface-variant hover:bg-surface-container-high"
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-[1fr_96px] gap-2">
                    <select
                      value={
                        verseOpen
                          ? displayPresentation?.verse_overlay_font || font || DEFAULT_STAGE_FONT
                          : font
                      }
                      disabled={!live}
                      onChange={(event) => {
                        if (!live) return;
                        const next = asStageFont(event.target.value);
                        if (verseOpen) {
                          patchPresentation({ verse_overlay_font: next });
                          return;
                        }
                        setFont(next);
                        patchSettings({ default_font: next });
                      }}
                      className="ui-input disabled:opacity-40"
                      aria-label="Font family"
                    >
                      {STAGE_FONTS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                          {option.id === DEFAULT_STAGE_FONT ? " (Default)" : ""}
                        </option>
                      ))}
                    </select>
                    <select
                      value={
                        verseOpen
                          ? parseLyricTextStyle(displayPresentation?.verse_overlay_text_style || "bold")
                              .bold
                            ? "700"
                            : "400"
                          : lyricStyle.bold
                            ? "700"
                            : "400"
                      }
                      disabled={!live}
                      onChange={(event) => {
                        if (!live) return;
                        const bold = event.target.value === "700";
                        if (verseOpen) {
                          const current = parseLyricTextStyle(
                            displayPresentation?.verse_overlay_text_style || "bold",
                          );
                          patchPresentation({
                            verse_overlay_text_style: serializeLyricTextStyle({ ...current, bold }),
                          });
                          return;
                        }
                        const next = { ...lyricStyle, bold };
                        setLyricStyle(next);
                        patchSettings({ lyrics_text_style: serializeLyricTextStyle(next) });
                      }}
                      className="ui-input disabled:opacity-40"
                      aria-label="Font weight"
                    >
                      <option value="400">Regular</option>
                      <option value="700">Bold</option>
                    </select>
                  </div>
                  <TextSizePicker
                    disabled={!live}
                    value={
                      verseOpen
                        ? displayPresentation?.verse_overlay_text_size ||
                          lyricSize ||
                          DEFAULT_STAGE_TEXT_SIZE
                        : lyricSize
                    }
                    onChange={(size) => {
                      if (!live) return;
                      if (verseOpen) {
                        patchPresentation({ verse_overlay_text_size: size });
                        return;
                      }
                      setLyricSize(size);
                      patchSettings({ lyrics_text_size: size });
                    }}
                  />
                  <TextStylePicker
                    disabled={!live}
                    value={
                      verseOpen
                        ? parseLyricTextStyle(displayPresentation?.verse_overlay_text_style || "bold")
                        : lyricStyle
                    }
                    onChange={(next) => {
                      if (!live) return;
                      if (verseOpen) {
                        patchPresentation({
                          verse_overlay_text_style: serializeLyricTextStyle(next),
                        });
                        return;
                      }
                      setLyricStyle(next);
                      patchSettings({ lyrics_text_style: serializeLyricTextStyle(next) });
                    }}
                  />
                  <p className="text-[11px] text-on-surface-variant">
                    {verseOpen
                      ? "Font, weight, size, and style update on the projector for this verse overlay."
                      : "Title and section stay in Arial. Only the lyrics use this font and size."}
                  </p>
                </ConsoleSection>
              ) : null}

              {active?.kind === "lyric" && !verseOpen ? (
                <ConsoleSection
                  id="chords"
                  title="Chords"
                  icon="music_note"
                  summary={chords.show ? "Shown" : "Hidden"}
                  open={openSection === "chords"}
                  onToggle={toggleSection}
                >
                  <ChordControls
                    chords={chords}
                    onChange={updateChords}
                    itemId={active.itemId}
                    songKey={active.musicalKey}
                    hasChords={activeHasChords}
                  />
                </ConsoleSection>
              ) : null}

              {active?.kind === "scripture" && currentPassage && !verseOpen ? (
                <ConsoleSection
                  id="scripture"
                  title="Scripture text"
                  icon="menu_book"
                  open={openSection === "scripture"}
                  onToggle={toggleSection}
                >
                  <ScriptureStyleControls passage={currentPassage} onChange={patchScriptureStyle} />
                </ConsoleSection>
              ) : null}

              {sermonActive ? (
                <ConsoleSection
                  id="sermon"
                  title="Sermon"
                  icon="record_voice_over"
                  open={openSection === "sermon"}
                  onToggle={toggleSection}
                >
                  <div className="rounded-lg border border-white/10 bg-surface-container-low p-3">
                    <p className="text-[11px] text-on-surface-variant mb-1">
                      {titleSlide
                        ? "Title slide"
                        : currentSlide && isSermonSpace(currentSlide.content)
                          ? "Space"
                          : "Current point"}
                    </p>
                    <p className="text-[13px] text-on-surface line-clamp-4 whitespace-pre-line">
                      {titleSlide
                        ? currentItem?.sermon?.title || currentItem?.title
                        : currentSlide && isSermonSpace(currentSlide.content)
                          ? "Blank slide. Advance when you are ready for the next point."
                          : sermonPlainText(currentSlide?.content ?? "").trim() || "Empty point"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon="edit_note"
                    className="w-full"
                    disabled={!live}
                    onClick={() => setEditMode(true)}
                  >
                    Edit sermon slides
                  </Button>
                </ConsoleSection>
              ) : null}

              <ConsoleSection
                id="transition"
                title="Transition"
                icon="timer"
                summary={`${transitionSec}s`}
                open={openSection === "transition"}
                onToggle={toggleSection}
              >
                <div className="flex justify-between items-center text-[12px]">
                  <span className="text-on-surface-variant">Speed</span>
                  <span className="font-mono text-on-surface tabular-nums">{transitionSec}s</span>
                </div>
                <input
                  className="w-full h-1 bg-surface-container-highest rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-40"
                  max={2}
                  min={0}
                  step={0.1}
                  type="range"
                  disabled={!live}
                  aria-label="Transition speed"
                  value={(displayPresentation?.transition_ms ?? 400) / 1000}
                  onChange={(event) => {
                    if (!displayPresentation) return;
                    const ms = Math.round(Number(event.target.value) * 1000);
                    patchPresentation({ transition_ms: ms });
                  }}
                />
                <div className="flex justify-between text-[11px] text-on-surface-variant">
                  <span>Cut</span>
                  <span>Smooth</span>
                </div>
              </ConsoleSection>
            </div>
          </div>
        </aside>
      </main>

      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 panel px-4 py-2 rounded-full transition-opacity duration-300 pointer-events-none z-50 ${
          hint ? "opacity-100" : "opacity-0"
        }`}
      >
        <span className="text-[11px] font-medium text-on-surface-variant">
          {`Space / arrows: next · ${live ? "hold and drag to reorder" : "go live to edit"}`}
        </span>
      </div>

      <LiveEditWorkspace
        open={editMode && live}
        setlist={displaySetlist}
        presentation={displayPresentation}
        cues={cues}
        liveIndex={liveIndex}
        font={font}
        lyricSize={lyricSize}
        lyricStyle={lyricStyle}
        chords={chords}
        stageBg={stageBg}
        actions={{
          onFontChange: (next) => patchSettings({ default_font: next }),
          onLyricSizeChange: (next) => patchSettings({ lyrics_text_size: next }),
          onLyricStyleChange: (next) =>
            patchSettings({ lyrics_text_style: serializeLyricTextStyle(next) }),
          onChordsChange: updateChords,
        }}
        onPrev={goLivePrev}
        onNext={goLiveNext}
        onShowCue={(next) => void goToCue(next)}
        onRefresh={refreshSetlist}
        onClose={() => setEditMode(false)}
      />
      <ConfirmDialog
        open={confirmEnd}
        title="End the presentation?"
        description="The projector goes back to standby for everyone. You can go live again at any time."
        confirmLabel="End Presentation"
        onClose={() => setConfirmEnd(false)}
        onConfirm={async () => {
          setConfirmEnd(false);
          await stopLive();
        }}
      />
    </div>
  );
}
