/**
 * Sermon page building blocks: the property grid fields, the numbered point
 * list (document-style editing with PointEditor) and the side-panel stage
 * preview. Layout only — all state lives in pages/Sermon.tsx.
 */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import PointEditor from "../PointEditor";
import CueStage from "../CueStage";
import { ScaledStage } from "../StageEditor";
import { Button, RowMenu, type MenuItem } from "../ui";
import SlideCanvas from "./SlideCanvas";
import { layoutPlainText, type SlideLayout } from "./slideLayout";
import { SERMON_SPACE, isSermonSpace } from "../../lib/helpers";
import { sermonPlainText } from "../../lib/sermonMarkup";
import { stageUsesDarkText, type StageBackgroundId } from "../../lib/stageBackgrounds";
import type { LiveCue } from "../../lib/types";

export type DraftSlide = {
  id: string;
  content: string;
  verse: string;
  /** Canvas layout (text boxes / shapes). When set, it is the slide. */
  layout?: SlideLayout | null;
};

export function sermonPointNumber(slides: DraftSlide[], id: string) {
  let point = 0;
  for (const row of slides) {
    if (isSermonSpace(row.content)) continue;
    point += 1;
    if (row.id === id) return point;
  }
  return Math.max(1, point);
}

/* ── Property grid ───────────────────────────────────────────────────── */

export const propInputClass =
  "w-full h-8 px-2 -mx-2 rounded-md bg-transparent text-[13px] text-on-surface placeholder:text-outline outline-none border border-transparent hover:bg-white/[0.04] focus:bg-surface-container focus:border-[color:var(--mc-hairline-strong)]";

export function PropField({
  label,
  children,
  hint,
  wide,
}: {
  label: string;
  children: ReactNode;
  hint?: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[112px_minmax(0,1fr)] items-start gap-x-3 ${wide ? "sm:col-span-2" : ""}`}>
      <span className="h-8 flex items-center text-[13px] text-on-surface-variant">{label}</span>
      <div className="min-w-0">
        {children}
        {hint ? (
          <p className="text-[11px] text-on-surface-variant leading-snug pb-1 truncate">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

/* ── Points list ─────────────────────────────────────────────────────── */

type PointListProps = {
  slides: DraftSlide[];
  selectedKey: string;
  syncNonce: number;
  focusKey: string | null;
  onSelect: (id: string, focus?: boolean) => void;
  onChange: (id: string, content: string) => void;
  onMove: (id: string, delta: number) => void;
  onAddSpace: (id: string) => void;
  onInsertAfter: (id: string, content: string) => void;
  onDelete: (slide: DraftSlide) => void;
  stageBg: StageBackgroundId;
  onLayoutChange: (id: string, layout: SlideLayout) => void;
  /** Turns a plain point into a canvas slide and adds a text box or shape. */
  onDesign: (id: string, kind: "text" | "box") => void;
  onPlainText: (id: string) => void;
  canvasStart: { slideId: string; id: string; edit: boolean } | null;
};

export function PointList({
  slides,
  selectedKey,
  syncNonce,
  focusKey,
  onSelect,
  onChange,
  onMove,
  onAddSpace,
  onInsertAfter,
  onDelete,
  stageBg,
  onLayoutChange,
  onDesign,
  onPlainText,
  canvasStart,
}: PointListProps) {
  const activeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (focusKey == null) return;
    const id = requestAnimationFrame(() => {
      const el = activeRef.current?.querySelector<HTMLElement>(".point-editor");
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    return () => cancelAnimationFrame(id);
  }, [focusKey]);

  return (
    <ol className="border-t border-[color:var(--mc-hairline)]">
      {slides.map((slide, index) => {
        const blank = isSermonSpace(slide.content);
        const selected = selectedKey === slide.id;
        const number = sermonPointNumber(slides, slide.id);
        const name = blank ? "blank slide" : `point ${number}`;
        const layout = slide.layout ?? null;
        const text = layout
          ? layoutPlainText(layout).replace(/\n+/g, " ")
          : sermonPlainText(slide.content).trim();
        const items: MenuItem[] = [
          {
            label: "Move up",
            icon: "arrow_upward",
            disabled: index === 0,
            onSelect: () => onMove(slide.id, -1),
          },
          {
            label: "Move down",
            icon: "arrow_downward",
            disabled: index === slides.length - 1,
            onSelect: () => onMove(slide.id, 1),
          },
          ...(layout
            ? [
                {
                  label: "Use plain text",
                  icon: "edit_note",
                  onSelect: () => onPlainText(slide.id),
                },
              ]
            : []),
          ...(blank || layout
            ? []
            : [
                {
                  label: "Add space",
                  icon: "space_bar",
                  onSelect: () => onAddSpace(slide.id),
                },
              ]),
          {
            label: "Insert point below",
            icon: "add",
            onSelect: () => onInsertAfter(slide.id, ""),
          },
          {
            label: "Insert blank slide below",
            icon: "crop_landscape",
            onSelect: () => onInsertAfter(slide.id, SERMON_SPACE),
          },
          {
            label: "Delete slide",
            icon: "delete",
            danger: true,
            onSelect: () => onDelete(slide),
          },
        ];
        return (
          <li
            key={slide.id}
            className={`group relative grid grid-cols-[32px_minmax(0,1fr)_32px] gap-x-2 py-2.5 border-b border-[color:var(--mc-hairline)] ${
              selected ? "" : "hover:bg-white/[0.02]"
            }`}
          >
            {selected ? (
              <span aria-hidden className="absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-full bg-primary -ml-3" />
            ) : null}
            <span
              className={`pt-1 text-[12px] tabular-nums text-right ${
                selected ? "text-primary font-medium" : "text-outline"
              }`}
            >
              {blank ? "—" : number}
            </span>
            <div className="min-w-0">
              {blank ? (
                <button
                  type="button"
                  onClick={() => onSelect(slide.id)}
                  className="w-full text-left py-1 text-[13px] text-on-surface-variant italic"
                >
                  Blank screen
                </button>
              ) : selected && layout ? (
                <div className="pt-0.5 pb-1">
                  <SlideCanvas
                    key={slide.id}
                    layout={layout}
                    stageBg={stageBg}
                    startWith={
                      canvasStart?.slideId === slide.id
                        ? { id: canvasStart.id, edit: canvasStart.edit }
                        : null
                    }
                    onChange={(next) => onLayoutChange(slide.id, next)}
                  />
                </div>
              ) : selected ? (
                <div ref={activeRef} className="sermon-point-active">
                  <div className="flex items-center gap-1 mb-1.5 -ml-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="edit_note"
                      aria-label="Add text box"
                      title="Design this slide: add a text box"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onDesign(slide.id, "text")}
                    >
                      Text
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="crop_landscape"
                      aria-label="Add shape"
                      title="Design this slide: add a shape"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onDesign(slide.id, "box")}
                    >
                      Shape
                    </Button>
                    <span className="text-[11px] text-outline ml-1">
                      Add to the slide to place things freely, like PowerPoint
                    </span>
                  </div>
                  <PointEditor
                    value={slide.content}
                    syncNonce={syncNonce}
                    placeholder="Type this point…"
                    toolbarBelow
                    onChange={(next) => onChange(slide.id, next)}
                    editorClassName="w-full min-h-[56px] max-h-[40vh] overflow-y-auto custom-scrollbar py-1 text-[15px] leading-relaxed text-on-surface whitespace-pre-wrap break-words"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(slide.id, true)}
                  aria-label={`Edit ${name}`}
                  className="w-full text-left py-1 text-[15px] leading-relaxed"
                >
                  {layout ? (
                    <span className="mr-2 align-middle inline-flex items-center h-[18px] px-1.5 rounded text-[10px] font-medium text-on-surface-variant border border-[color:var(--mc-hairline-strong)]">
                      Canvas
                    </span>
                  ) : null}
                  {text ? (
                    <span className="text-on-surface line-clamp-3 whitespace-pre-line">{text}</span>
                  ) : layout ? (
                    <span className="text-outline">Designed slide</span>
                  ) : (
                    <span className="text-outline">Empty point</span>
                  )}
                </button>
              )}
            </div>
            <div className={`pt-0.5 ${selected ? "" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"}`}>
              <RowMenu label={`More actions for ${name}`} items={items} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ── Stage preview ───────────────────────────────────────────────────── */

export function StagePreview({ cue, stageBg }: { cue: LiveCue; stageBg: StageBackgroundId }) {
  return (
    <ScaledStage stageBg={stageBg}>
      <CueStage cue={cue} darkText={stageUsesDarkText(stageBg)} />
    </ScaledStage>
  );
}
