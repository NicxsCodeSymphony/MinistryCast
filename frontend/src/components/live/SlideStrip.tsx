import { useEffect, useRef } from "react";
import type { LiveCue } from "../../lib/types";

/**
 * Horizontal strip of the current item's slides as small text thumbnails.
 * Current slide is outlined, the next one is subtly marked. When the next
 * cue belongs to another item, an "Up next" tile closes the strip.
 */
export default function SlideStrip({
  cues,
  index,
  onSelect,
}: {
  cues: LiveCue[];
  index: number;
  onSelect: (index: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const active = cues[index];
  const itemId = active?.itemId;
  const slides = cues
    .map((cue, cueIndex) => ({ cue, cueIndex }))
    .filter((row) => row.cue.itemId === itemId);
  const nextCue = cues[index + 1];
  const nextOutside = nextCue && nextCue.itemId !== itemId ? nextCue : null;

  useEffect(() => {
    const list = ref.current;
    const tile = list?.querySelector<HTMLElement>(`[data-cue-index="${index}"]`);
    if (!list || !tile || !list.clientWidth) return;
    const left = tile.offsetLeft - (list.clientWidth - tile.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [index, itemId, cues.length]);

  if (!active) return null;

  return (
    <div
      ref={ref}
      className="relative flex gap-2 overflow-x-auto custom-scrollbar pb-1"
      role="group"
      aria-label="Slides in this item"
    >
      {slides.map(({ cue, cueIndex }) => {
        const current = cueIndex === index;
        const next = cueIndex === index + 1;
        return (
          <button
            key={cue.id}
            type="button"
            data-cue-index={cueIndex}
            aria-current={current ? "true" : undefined}
            onClick={() => onSelect(cueIndex)}
            className={`group shrink-0 w-[148px] h-[84px] rounded-lg border text-left px-2.5 py-2 flex flex-col transition-colors ${
              current
                ? "border-primary bg-primary/10 ring-1 ring-primary"
                : next
                  ? "border-white/20 bg-surface-container hover:bg-surface-container-high"
                  : "border-white/10 bg-surface-container-low hover:bg-surface-container"
            }`}
          >
            <span className="flex items-center gap-1.5 text-[10px] text-on-surface-variant">
              <span className="tabular-nums">{cueIndex + 1}</span>
              <span className="truncate">{cue.sectionLabel || cue.label}</span>
              {next ? <span className="ml-auto shrink-0 text-primary">Next</span> : null}
            </span>
            <span
              className={`mt-1 text-[11px] leading-snug line-clamp-3 ${
                current ? "text-on-surface" : "text-on-surface-variant group-hover:text-on-surface"
              }`}
            >
              {cue.blank ? "Blank" : cue.preview || cue.title}
            </span>
          </button>
        );
      })}
      {nextOutside ? (
        <button
          type="button"
          data-cue-index={index + 1}
          onClick={() => onSelect(index + 1)}
          className="shrink-0 w-[148px] h-[84px] rounded-lg border border-dashed border-white/20 text-left px-2.5 py-2 flex flex-col hover:bg-surface-container transition-colors"
        >
          <span className="text-[10px] text-primary">Up next</span>
          <span className="mt-1 text-[11px] font-medium text-on-surface truncate">
            {nextOutside.songTitle || nextOutside.title}
          </span>
          <span className="text-[11px] leading-snug text-on-surface-variant line-clamp-2">
            {nextOutside.preview}
          </span>
        </button>
      ) : null}
      {!nextCue ? (
        <div className="shrink-0 w-[120px] h-[84px] rounded-lg border border-dashed border-white/10 flex items-center justify-center text-[11px] text-on-surface-variant">
          End of setlist
        </div>
      ) : null}
    </div>
  );
}
