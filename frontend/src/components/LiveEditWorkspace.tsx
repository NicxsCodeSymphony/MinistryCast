import { useEffect, useMemo, useRef, useState } from "react";
import { MiniStage, SlideRow, StagePointEditor, ToolButton } from "./StageEditor";
import TextSizePicker from "./TextSizePicker";
import ConfirmDialog from "./modals/ConfirmDialog";
import RosterEditPanel from "./liveEdit/RosterEditPanel";
import ScriptureEditPanel from "./liveEdit/ScriptureEditPanel";
import SongEditPanel from "./liveEdit/SongEditPanel";
import SlideCanvas from "./sermon/SlideCanvas";
import { composeSlideContent, readSlideLayout } from "./sermon/slideLayout";
import type { EditPanelHandle, StageActions } from "./liveEdit/shared";
import {
  deleteSermonSlide,
  insertSermonSlide,
  reorderSermonSlides,
  updateSermonSlide,
  updateSermonTextSize,
} from "../lib/api";
import {
  DEFAULT_SERMON_TEXT_SIZE,
  insertSermonGap,
  isSermonSpace,
  isTypingTarget,
  moveItem,
  sermonDisplayLines,
} from "../lib/helpers";
import type { ChordDisplay } from "../lib/chordDisplay";
import type { LyricTextStyle } from "../lib/lyricTextStyle";
import { sermonPlainText } from "../lib/sermonMarkup";
import type { StageBackgroundId } from "../lib/stageBackgrounds";
import { useToast } from "../lib/ToastContext";
import type { LiveCue, Presentation, SermonSlide, Setlist, SetlistItem } from "../lib/types";
import Icon from "./Icon";

type SlideDraft = { content?: string; scripture_reference?: string | null };

type LiveEditWorkspaceProps = {
  open: boolean;
  setlist: Setlist | null;
  presentation: Presentation | null;
  cues: LiveCue[];
  liveIndex: number;
  font: string;
  lyricSize: string;
  lyricStyle: LyricTextStyle;
  chords?: ChordDisplay | null;
  stageBg: StageBackgroundId;
  actions?: StageActions;
  onPrev: () => void;
  onNext: () => void;
  onShowCue: (index: number) => void;
  onRefresh: () => Promise<void>;
  onClose: () => void;
};

const TITLE_KEY = "title";

const ITEM_KIND_LABEL: Record<string, string> = {
  sermon: "Sermon",
  song: "Song",
  scripture: "Scripture",
  roster: "Assignments",
};

function isEditable(item: SetlistItem) {
  if (item.item_type === "sermon") return Boolean(item.sermon);
  if (item.item_type === "song") return Boolean(item.song);
  if (item.item_type === "scripture") return Boolean(item.passage);
  return item.item_type === "roster";
}

function itemName(item: SetlistItem) {
  if (item.item_type === "sermon") return item.sermon?.title || item.title;
  if (item.item_type === "song") return item.song?.title || item.title;
  if (item.item_type === "scripture") return item.passage?.reference || item.title;
  return item.title || "Assignments";
}

function sortedSlides(item: SetlistItem | undefined) {
  return [...(item?.sermon?.slides ?? [])].sort((a, b) => a.sort_order - b.sort_order);
}

function titleHolderOf(slides: SermonSlide[]) {
  return slides.find((slide) => !isSermonSpace(slide.content));
}

function pointNumber(slides: SermonSlide[], id: string) {
  let n = 0;
  for (const slide of slides) {
    if (isSermonSpace(slide.content)) continue;
    n += 1;
    if (slide.id === id) return n;
  }
  return 0;
}

export default function LiveEditWorkspace({
  open,
  setlist,
  presentation,
  cues,
  liveIndex,
  font,
  lyricSize,
  lyricStyle,
  chords,
  stageBg,
  actions = {},
  onPrev,
  onNext,
  onShowCue,
  onRefresh,
  onClose,
}: LiveEditWorkspaceProps) {
  const toast = useToast();
  const editableItems = useMemo(() => (setlist?.items ?? []).filter(isEditable), [setlist]);
  const liveCue = cues[liveIndex];
  const nextCue = cues[liveIndex + 1];
  const prevCue = liveIndex > 0 ? cues[liveIndex - 1] : undefined;

  const [itemId, setItemId] = useState("");
  const [selectedKey, setSelectedKey] = useState(TITLE_KEY);
  const [slideDrafts, setSlideDrafts] = useState<Record<string, SlideDraft>>({});
  const [sizeDrafts, setSizeDrafts] = useState<Record<string, string>>({});
  const [syncNonce, setSyncNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [working, setWorking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SermonSlide | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [panelDirty, setPanelDirty] = useState(0);
  const panelRef = useRef<EditPanelHandle | null>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open && !wasOpen.current) {
      const liveItem = editableItems.find((item) => item.id === liveCue?.itemId);
      const startItem = liveItem ?? editableItems[0];
      setItemId(startItem?.id ?? "");
      setSelectedKey(
        liveItem?.item_type === "sermon" && liveCue?.slideId && !liveCue.titleSlide
          ? liveCue.slideId
          : TITLE_KEY,
      );
      setSlideDrafts({});
      setSizeDrafts({});
      setPanelDirty(0);
      setSyncNonce((n) => n + 1);
    }
    wasOpen.current = open;
  }, [open, editableItems, liveCue]);

  const selectedItem = editableItems.find((row) => row.id === itemId) ?? editableItems[0];
  const item = selectedItem?.item_type === "sermon" ? selectedItem : undefined;
  const sermon = item?.sermon ?? null;
  const slides = useMemo(() => sortedSlides(item), [item]);
  const titleHolder = titleHolderOf(slides);
  const selectedSlide =
    selectedKey === TITLE_KEY ? undefined : slides.find((slide) => slide.id === selectedKey);

  useEffect(() => {
    if (!open || !item) return;
    if (selectedKey !== TITLE_KEY && !selectedSlide) {
      setSelectedKey(TITLE_KEY);
      setSyncNonce((n) => n + 1);
    }
  }, [open, item, selectedKey, selectedSlide]);

  const sermonTitle = sermon?.title || item?.title || "Sermon";
  const savedSize = sermon?.text_size || DEFAULT_SERMON_TEXT_SIZE;
  const size = (sermon && sizeDrafts[sermon.id]) || savedSize;

  const contentOf = (slide: SermonSlide) => slideDrafts[slide.id]?.content ?? slide.content;
  const verseOf = (slide: SermonSlide | undefined) => {
    if (!slide) return sermon?.primary_scripture ?? "";
    const draft = slideDrafts[slide.id];
    return (
      (draft && "scripture_reference" in draft ? draft.scripture_reference : slide.scripture_reference) ??
      ""
    );
  };

  const patchSlideDraft = (slide: SermonSlide, patch: SlideDraft) => {
    setSlideDrafts((prev) => {
      const next = { ...(prev[slide.id] ?? {}), ...patch };
      if (next.content === slide.content) delete next.content;
      if (
        "scripture_reference" in next &&
        (next.scripture_reference || null) === (slide.scripture_reference || null)
      ) {
        delete next.scripture_reference;
      }
      const rest = { ...prev };
      if (Object.keys(next).length) rest[slide.id] = next;
      else delete rest[slide.id];
      return rest;
    });
  };

  const sermonDirtyCount = Object.keys(slideDrafts).length + Object.keys(sizeDrafts).length;
  const dirtyCount = sermonDirtyCount + panelDirty;
  const dirty = dirtyCount > 0;

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      if (sermonDirtyCount) {
        for (const [id, draft] of Object.entries(slideDrafts)) {
          await updateSermonSlide(id, draft);
        }
        for (const [id, nextSize] of Object.entries(sizeDrafts)) {
          await updateSermonTextSize(id, nextSize);
        }
        await onRefresh();
        setSlideDrafts({});
        setSizeDrafts({});
      }
      if (panelDirty && panelRef.current) await panelRef.current.save();
      toast.success("Changes saved and shown on screen.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (saving) return;
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  };

  const run = async (task: () => Promise<void>, failure: string) => {
    if (working) return;
    setWorking(true);
    try {
      await task();
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : failure);
    } finally {
      setWorking(false);
    }
  };

  const keepTitleVerse = async (ordered: SermonSlide[]) => {
    const before = titleHolder;
    const after = titleHolderOf(ordered);
    if (!before || !after || before.id === after.id) return;
    const verse = before.scripture_reference;
    if (!verse) return;
    await updateSermonSlide(after.id, { scripture_reference: verse });
    if (ordered.some((slide) => slide.id === before.id)) {
      await updateSermonSlide(before.id, { scripture_reference: null });
    }
  };

  const selectSlide = (key: string) => {
    setSelectedKey(key);
    setSyncNonce((n) => n + 1);
  };

  const addSlide = () => {
    if (!sermon) return;
    void run(async () => {
      const { slideId } = await insertSermonSlide(sermon.id, {
        content: "New point",
        afterSlideId: selectedSlide?.id ?? null,
        atStart: selectedKey === TITLE_KEY,
      });
      await onRefresh();
      selectSlide(slideId);
    }, "Could not add a slide.");
  };

  const moveSlide = (delta: number) => {
    if (!sermon || !selectedSlide) return;
    const from = slides.findIndex((slide) => slide.id === selectedSlide.id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= slides.length) return;
    const ordered = moveItem(slides, from, to);
    void run(async () => {
      await reorderSermonSlides(
        sermon.id,
        ordered.map((slide) => slide.id),
      );
      await keepTitleVerse(ordered);
    }, "Could not move the slide.");
  };

  const deleteSlide = async (slide: SermonSlide) => {
    const remaining = slides.filter((row) => row.id !== slide.id);
    await run(async () => {
      await keepTitleVerse(remaining);
      await deleteSermonSlide(slide.id);
      setSlideDrafts((prev) => {
        const rest = { ...prev };
        delete rest[slide.id];
        return rest;
      });
      const index = slides.findIndex((row) => row.id === slide.id);
      const fallback = remaining[Math.min(index, remaining.length - 1)];
      selectSlide(fallback && index > 0 ? fallback.id : TITLE_KEY);
    }, "Could not delete the slide.");
  };

  const cueIndexOfKey = (key: string) => {
    if (!item) return -1;
    if (key === TITLE_KEY) {
      return cues.findIndex((cue) => cue.itemId === item.id && cue.titleSlide);
    }
    return cues.findIndex((cue) => cue.slideId === key);
  };
  const liveKey =
    item && liveCue?.itemId === item.id
      ? liveCue.titleSlide
        ? TITLE_KEY
        : liveCue.slideId ?? ""
      : "";
  const selectedCueIndex = cueIndexOfKey(selectedKey);

  const draftCue: LiveCue | null = useMemo(() => {
    if (!item) return null;
    if (selectedKey === TITLE_KEY) {
      const verse = verseOf(titleHolder).trim();
      return {
        id: `${item.id}-title-draft`,
        itemId: item.id,
        kind: "sermon",
        label: "TITLE",
        tag: "TTL",
        title: sermonTitle,
        preview: sermonTitle,
        lines: [sermonTitle],
        heading: null,
        align: "center",
        textSize: size,
        verse: verse || null,
        versePlacement: verse ? "bottom" : undefined,
        titleSlide: true,
      };
    }
    if (!selectedSlide) return null;
    const content = contentOf(selectedSlide);
    const lines = sermonDisplayLines(content);
    const n = pointNumber(slides, selectedSlide.id);
    return {
      id: `${selectedSlide.id}-draft`,
      itemId: item.id,
      kind: "sermon",
      label: `POINT ${n}`,
      tag: `P${n}`,
      title: sermonTitle,
      preview: sermonPlainText(content).slice(0, 80),
      lines: lines.length ? lines : [content],
      heading: null,
      slideId: selectedSlide.id,
      align: "start",
      textSize: size,
    };
  }, [item, selectedKey, selectedSlide, slides, slideDrafts, size, sermonTitle, titleHolder]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (confirmDelete || confirmDiscard) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (isTypingTarget(event.target)) return;
      // Keys inside the slide canvas belong to the canvas (nudging, selecting).
      if (event.target instanceof Element && event.target.closest("[data-testid='slide-canvas']")) {
        return;
      }
      if (event.code === "Space" || event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        onNext();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        onPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const editingPoint = Boolean(selectedSlide && !isSermonSpace(selectedSlide.content));
  // Slides designed on the canvas are edited on the canvas, so the saved
  // layout (what the stage renders) carries the edit.
  const canvasLayout = editingPoint && selectedSlide ? readSlideLayout(contentOf(selectedSlide)) : null;

  if (!open) return null;

  const stageProps = { font, lyricSize, lyricStyle, chords, stageBg };
  const selectedIndex = selectedSlide ? slides.findIndex((s) => s.id === selectedSlide.id) : -1;

  const itemPicker = (
    <select
      value={selectedItem?.id ?? ""}
      onChange={(event) => {
        if (panelDirty) {
          toast.warning("Save or discard your changes before switching.");
          return;
        }
        setItemId(event.target.value);
        selectSlide(TITLE_KEY);
      }}
      className="w-full bg-surface-container-low border border-white/10 rounded-lg px-3 py-2 text-sm"
      aria-label="Item to edit"
    >
      {editableItems.map((row) => (
        <option key={row.id} value={row.id}>
          {`${ITEM_KIND_LABEL[row.item_type] ?? "Item"} · ${itemName(row)}`}
        </option>
      ))}
    </select>
  );

  const panelProps = selectedItem
    ? {
        item: selectedItem,
        itemPicker,
        cues,
        liveIndex,
        stage: stageProps,
        actions,
        onShowCue,
        onRefresh,
        onDirtyChange: setPanelDirty,
        handleRef: panelRef,
      }
    : null;
  const panel = !panelProps ? null : selectedItem!.item_type === "song" ? (
    <SongEditPanel key={selectedItem!.id} {...panelProps} />
  ) : selectedItem!.item_type === "scripture" ? (
    <ScriptureEditPanel key={selectedItem!.id} {...panelProps} />
  ) : selectedItem!.item_type === "roster" ? (
    <RosterEditPanel key={selectedItem!.id} {...panelProps} />
  ) : null;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col app-overlay text-on-surface">
      <header className="shrink-0 h-16 flex items-center justify-between gap-4 px-4 sm:px-6 border-b border-white/10 bg-surface-container-low">
        <div className="flex items-center gap-3 min-w-0">
          <Icon name="edit_note" className="text-secondary" />
          <div className="min-w-0">
            <p className="text-[12px] font-semibold tracking-[0.08em] uppercase text-secondary">
              Edit mode
            </p>
            <p className="text-xs text-on-surface-variant truncate">
              The audience keeps seeing the live slide until you save.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden md:inline text-[11px] text-on-surface-variant">
            {dirty ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"} · ⌘S` : "All changes saved"}
          </span>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => setConfirmDiscard(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-on-surface-variant hover:bg-white/5 text-xs font-semibold disabled:opacity-40"
          >
            <Icon name="undo" className="text-[16px]" />
            Discard
          </button>
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={() => void save()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-on-primary hover:brightness-110 text-xs font-semibold disabled:opacity-40"
          >
            <Icon name={saving ? "progress_activity" : "save"} className="text-[16px]" />
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={requestClose}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-high border border-white/10 hover:bg-white/5 text-xs font-semibold"
          >
            <Icon name="close" className="text-[16px]" />
            Done
          </button>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        {item ? (
        <>
        <aside className="w-64 shrink-0 border-r border-white/10 flex flex-col min-h-0 bg-surface-container-lowest">
          <div className="p-3 border-b border-white/10">{itemPicker}</div>
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {!item ? null : (
              <>
                <SlideRow
                  label="Title"
                  text={sermonTitle}
                  selected={selectedKey === TITLE_KEY}
                  live={liveKey === TITLE_KEY}
                  dirty={Boolean(titleHolder && slideDrafts[titleHolder.id]?.scripture_reference !== undefined)}
                  onClick={() => selectSlide(TITLE_KEY)}
                />
                {slides.map((slide) => {
                  const space = isSermonSpace(slide.content);
                  return (
                    <SlideRow
                      key={slide.id}
                      label={space ? "Space" : `Point ${pointNumber(slides, slide.id)}`}
                      text={space ? "Blank" : sermonPlainText(contentOf(slide)) || "Empty point"}
                      selected={selectedKey === slide.id}
                      live={liveKey === slide.id}
                      dirty={slideDrafts[slide.id]?.content !== undefined}
                      onClick={() => selectSlide(slide.id)}
                    />
                  );
                })}
              </>
            )}
          </div>
          {item ? (
            <div className="shrink-0 p-2 border-t border-white/10 grid grid-cols-4 gap-1">
              <ToolButton icon="add" label="Add slide" disabled={working} onClick={addSlide} />
              <ToolButton
                icon="arrow_upward"
                label="Move up"
                disabled={working || selectedIndex <= 0}
                onClick={() => moveSlide(-1)}
              />
              <ToolButton
                icon="arrow_downward"
                label="Move down"
                disabled={working || selectedIndex < 0 || selectedIndex >= slides.length - 1}
                onClick={() => moveSlide(1)}
              />
              <ToolButton
                icon="delete"
                label={liveKey === selectedSlide?.id ? "Move off this slide before deleting" : "Delete"}
                danger
                disabled={working || !selectedSlide || liveKey === selectedSlide.id}
                onClick={() => selectedSlide && setConfirmDelete(selectedSlide)}
              />
            </div>
          ) : null}
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-4 sm:p-6">
          {item ? (
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
                  {selectedKey === TITLE_KEY
                    ? "Title slide"
                    : editingPoint
                      ? `Point ${pointNumber(slides, selectedSlide!.id)} · ${
                          canvasLayout ? "double-click text to edit" : "click the slide to type"
                        }`
                      : "Space slide"}
                </p>
                <button
                  type="button"
                  disabled={selectedCueIndex < 0 || selectedCueIndex === liveIndex}
                  onClick={() => onShowCue(selectedCueIndex)}
                  title={dirty ? "Shows the last saved version. Save first to show your edits." : undefined}
                  className="inline-flex items-center gap-1 px-3 h-8 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 text-[11px] font-semibold disabled:opacity-40"
                >
                  <Icon name="cast" className="text-[16px]" />
                  {selectedCueIndex === liveIndex ? "On screen now" : "Show on screen"}
                </button>
              </div>

              {canvasLayout && selectedSlide ? (
                <SlideCanvas
                  key={`${selectedSlide.id}:${syncNonce}`}
                  layout={canvasLayout}
                  stageBg={stageBg}
                  onChange={(next) =>
                    patchSlideDraft(selectedSlide, { content: composeSlideContent(next) })
                  }
                />
              ) : editingPoint && selectedSlide ? (
                <StagePointEditor
                  value={contentOf(selectedSlide)}
                  syncNonce={syncNonce}
                  size={size}
                  stageBg={stageBg}
                  onChange={(next) => patchSlideDraft(selectedSlide, { content: next })}
                />
              ) : (
                <MiniStage cue={draftCue} {...stageProps} highlight />
              )}

              {/* Canvas slides size each text box in the canvas toolbar; the
                  sermon-wide size only applies to plain points, so showing it
                  here (on a different S/M/L/XL scale) was contradictory. */}
              {canvasLayout ? null : (
              <div className="rounded-xl border border-white/10 bg-surface-container-low/60 p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-2" title="Size of text on plain points (not canvas slides)">
                  <span className="text-[11px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
                    Point text size
                  </span>
                  <TextSizePicker
                    value={size}
                    onChange={(next) => {
                      if (!sermon) return;
                      setSizeDrafts((prev) => {
                        const rest = { ...prev };
                        if (next === savedSize) delete rest[sermon.id];
                        else rest[sermon.id] = next;
                        return rest;
                      });
                    }}
                  />
                </div>
                {editingPoint && selectedSlide && !canvasLayout ? (
                  <button
                    type="button"
                    onClick={() => {
                      patchSlideDraft(selectedSlide, {
                        content: insertSermonGap(contentOf(selectedSlide)),
                      });
                      setSyncNonce((n) => n + 1);
                    }}
                    className="inline-flex items-center gap-1 px-3 h-8 rounded-lg border border-white/10 hover:bg-white/5 text-[11px] font-semibold"
                  >
                    <Icon name="space_bar" className="text-[16px]" />
                    Add space
                  </button>
                ) : null}
                {selectedKey === TITLE_KEY ? (
                  <label className="flex flex-1 min-w-[240px] items-center gap-2">
                    <span className="text-[11px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant shrink-0">
                      Title verse
                    </span>
                    <input
                      value={verseOf(titleHolder)}
                      disabled={!titleHolder}
                      onChange={(event) => {
                        if (!titleHolder) return;
                        patchSlideDraft(titleHolder, {
                          scripture_reference: event.target.value.trim() ? event.target.value : null,
                        });
                      }}
                      placeholder={titleHolder ? "Verse · Fil 3:14" : "Add a point first to set a verse"}
                      className="flex-1 bg-surface-container-low border border-white/10 rounded-lg px-3 h-8 text-sm disabled:opacity-50"
                    />
                  </label>
                ) : null}
                {selectedSlide && !editingPoint ? (
                  <p className="text-[11px] text-on-surface-variant">
                    This is a blank space slide. Use Add slide to put a point after it, or delete it.
                  </p>
                ) : null}
              </div>
              )}
            </div>
          ) : null}
        </main>
        </>
        ) : selectedItem ? (
          panel
        ) : (
          <main className="flex-1 min-w-0 p-6">
            <p className="text-sm text-on-surface-variant">
              Add a song, sermon, scripture or assignments to this setlist to edit them here.
            </p>
          </main>
        )}

        <aside className="hidden lg:flex w-80 shrink-0 border-l border-white/10 flex-col min-h-0 overflow-y-auto custom-scrollbar p-4 gap-4 bg-surface-container-low/40">
          <div className="flex items-center justify-between">
            <h3 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-primary">
              Live control
            </h3>
            <span className="text-[11px] text-on-surface-variant tabular-nums">
              {cues.length ? `${liveIndex + 1} / ${cues.length}` : "—"}
            </span>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              On screen now
            </p>
            <MiniStage
              cue={liveCue}
              {...stageProps}
              font={font}
              blackout={Boolean(presentation?.is_blackout)}
              logo={Boolean(presentation?.show_logo)}
              highlight
            />
            <p className="text-xs text-on-surface truncate">
              {liveCue ? `${liveCue.label} · ${liveCue.preview || liveCue.title}` : "Nothing live"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={liveIndex <= 0}
              onClick={onPrev}
              className="flex items-center justify-center gap-1 p-3 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-semibold disabled:opacity-40"
            >
              <Icon name="arrow_back" className="text-[18px]" />
              Previous
            </button>
            <button
              type="button"
              disabled={liveIndex >= cues.length - 1}
              onClick={onNext}
              className="flex items-center justify-center gap-1 p-3 rounded-xl bg-primary text-on-primary hover:brightness-110 text-xs font-semibold disabled:opacity-40"
            >
              Next
              <Icon name="arrow_forward" className="text-[18px]" />
            </button>
          </div>
          <p className="text-[10px] text-on-surface-variant">
            Space or → for next, ← for previous (when you are not typing).
          </p>
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Next
            </p>
            <MiniStage cue={nextCue} {...stageProps} font={font} />
            <p className="text-xs text-on-surface-variant truncate">
              {nextCue ? `${nextCue.label} · ${nextCue.preview || nextCue.title}` : "End of setlist"}
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Previous
            </p>
            <p className="text-xs text-on-surface-variant truncate">
              {prevCue ? `${prevCue.label} · ${prevCue.preview || prevCue.title}` : "Start of setlist"}
            </p>
          </div>
        </aside>
      </div>

      <div className="lg:hidden shrink-0 flex items-center gap-2 p-3 border-t border-white/10 bg-surface-container-low">
        <button
          type="button"
          disabled={liveIndex <= 0}
          onClick={onPrev}
          className="flex-1 flex items-center justify-center gap-1 p-3 rounded-xl border border-white/10 text-xs font-semibold disabled:opacity-40"
        >
          <Icon name="arrow_back" className="text-[18px]" />
          Previous
        </button>
        <span className="text-[11px] text-on-surface-variant tabular-nums px-2">
          {cues.length ? `${liveIndex + 1} / ${cues.length}` : "—"}
        </span>
        <button
          type="button"
          disabled={liveIndex >= cues.length - 1}
          onClick={onNext}
          className="flex-1 flex items-center justify-center gap-1 p-3 rounded-xl bg-primary text-on-primary text-xs font-semibold disabled:opacity-40"
        >
          Next
          <Icon name="arrow_forward" className="text-[18px]" />
        </button>
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          const slide = confirmDelete;
          setConfirmDelete(null);
          if (slide) await deleteSlide(slide);
        }}
        title="Delete this slide?"
        description="It is removed from the sermon right away."
        highlight={confirmDelete ? sermonPlainText(confirmDelete.content).slice(0, 80) : undefined}
      />
      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          setSlideDrafts({});
          setSizeDrafts({});
          panelRef.current?.discard();
          setSyncNonce((n) => n + 1);
          onClose();
        }}
        title="Discard unsaved changes?"
        description="Your edits haven't been saved, so the screen still shows the old version."
        confirmLabel="Discard"
      />
    </div>
  );
}
