import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import CueStage from "./CueStage";
import PointEditor from "./PointEditor";
import StageBackdrop from "./StageBackdrop";
import { sermonSizePx } from "../lib/helpers";
import type { ChordDisplay } from "../lib/chordDisplay";
import type { LyricTextStyle } from "../lib/lyricTextStyle";
import { stageUsesDarkText, type StageBackgroundId } from "../lib/stageBackgrounds";
import { DEFAULT_STAGE_FONT, stageFontFamily } from "../lib/stageFonts";
import type { LiveCue } from "../lib/types";

const OUTPUT_WIDTH = 1920;
const OUTPUT_HEIGHT = 1080;
const TITLE_SLIDE_PX = 80;

/** Lays content out at projector size (1920×1080) and scales it down, so text sizes match the output. */
export function ScaledStage({
  stageBg,
  highlight,
  children,
}: {
  stageBg: StageBackgroundId;
  highlight?: boolean;
  children: ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;
    const update = () => setScale(outer.clientWidth / OUTPUT_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={outerRef}
      className={`relative w-full aspect-video overflow-hidden rounded-lg ${
        stageUsesDarkText(stageBg) ? "bg-white" : "bg-black"
      } ${highlight ? "ring-2 ring-primary" : "border border-white/10"}`}
    >
      <StageBackdrop id={stageBg} />
      {scale ? (
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            width: OUTPUT_WIDTH,
            height: OUTPUT_HEIGHT,
            transform: `scale(${scale})`,
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function MiniStage({
  cue,
  font,
  lyricSize,
  lyricStyle,
  chords,
  stageBg,
  blackout,
  logo,
  highlight,
}: {
  cue?: LiveCue | null;
  font: string;
  lyricSize: string;
  lyricStyle: LyricTextStyle;
  chords?: ChordDisplay | null;
  stageBg: StageBackgroundId;
  blackout?: boolean;
  logo?: boolean;
  highlight?: boolean;
}) {
  const darkText = stageUsesDarkText(stageBg);
  if (blackout) {
    return (
      <div
        className={`relative w-full aspect-video overflow-hidden rounded-lg bg-black flex items-center justify-center ${
          highlight ? "ring-2 ring-primary" : "border border-white/10"
        }`}
      >
        <span className="text-[10px] uppercase tracking-[0.3em] text-white/50">Blackout</span>
      </div>
    );
  }
  return (
    <ScaledStage stageBg={stageBg} highlight={highlight}>
      {logo ? (
        <div className="h-full w-full flex items-center justify-center">
          <span className="material-symbols-outlined filled text-primary text-[160px]">church</span>
        </div>
      ) : cue ? (
        <CueStage
          cue={cue}
          font={font}
          lyricSize={lyricSize}
          lyricStyle={lyricStyle}
          chords={chords}
          darkText={darkText}
        />
      ) : null}
    </ScaledStage>
  );
}

/** A sermon point you type straight onto the projected slide, with the formatting toolbar under it. */
export function StagePointEditor({
  value,
  syncNonce,
  size,
  stageBg,
  onChange,
  placeholder,
  focusKey,
}: {
  value: string;
  syncNonce: number;
  size: string;
  stageBg: StageBackgroundId;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Changing this focuses the slide with the caret at the end. */
  focusKey?: string | number | null;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const darkText = stageUsesDarkText(stageBg);

  function measureOverflow() {
    const el = frameRef.current?.querySelector<HTMLElement>(".point-editor");
    setOverflowing(Boolean(el && el.scrollHeight > el.clientHeight + 2));
  }

  useLayoutEffect(() => {
    measureOverflow();
    const id = requestAnimationFrame(measureOverflow);
    return () => cancelAnimationFrame(id);
  }, [size, syncNonce]);

  useLayoutEffect(() => {
    if (focusKey == null) return;
    const id = requestAnimationFrame(() => {
      const el = frameRef.current?.querySelector<HTMLElement>(".point-editor");
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
    <div className="space-y-2">
      <PointEditor
        value={value}
        syncNonce={syncNonce}
        placeholder={placeholder}
        toolbarBelow
        onChange={onChange}
        onInput={measureOverflow}
        frame={(editor) => (
          <div ref={frameRef}>
            <ScaledStage stageBg={stageBg} highlight>
              {editor}
            </ScaledStage>
          </div>
        )}
        editorClassName={`absolute inset-0 overflow-y-auto custom-scrollbar text-left leading-[1.22] break-words cursor-text ${
          darkText
            ? "text-black caret-black"
            : "text-white caret-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)]"
        }`}
        editorStyle={{
          fontSize: `${sermonSizePx(size)}px`,
          padding: "4% 5%",
          fontFamily: stageFontFamily(DEFAULT_STAGE_FONT),
        }}
      />
      {overflowing ? (
        <p className="text-[11px] text-amber-300">
          This point is taller than the screen, so it will shrink to fit. Try a smaller size or
          split it into two slides.
        </p>
      ) : null}
    </div>
  );
}

/** The sermon title slide, with the title and its verse typed directly on the stage. */
export function StageTitleEditor({
  title,
  verse,
  stageBg,
  onTitleChange,
  onVerseChange,
  versePlaceholder = "Add a verse (optional)",
}: {
  title: string;
  verse: string;
  stageBg: StageBackgroundId;
  onTitleChange: (next: string) => void;
  onVerseChange?: (next: string) => void;
  versePlaceholder?: string;
}) {
  const darkText = stageUsesDarkText(stageBg);
  const ink = darkText
    ? "text-black caret-black placeholder:text-black/30"
    : "text-white caret-white placeholder:text-white/30 drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)]";
  const family = stageFontFamily(DEFAULT_STAGE_FONT);

  return (
    <ScaledStage stageBg={stageBg} highlight>
      <div className="h-full w-full flex flex-col px-[8%] py-[6%]">
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <AutoGrowText
            value={title}
            onChange={onTitleChange}
            placeholder="Sermon title"
            className={`w-full text-center leading-[1.22] ${ink}`}
            style={{ fontSize: `${TITLE_SLIDE_PX}px`, fontFamily: family }}
            autoFocus={!title}
          />
        </div>
        {onVerseChange ? (
          <AutoGrowText
            value={verse}
            onChange={onVerseChange}
            placeholder={versePlaceholder}
            className={`shrink-0 w-full text-center pt-4 ${
              darkText ? "text-neutral-800 caret-black placeholder:text-black/25" : ink
            }`}
            style={{ fontSize: `${Math.round(TITLE_SLIDE_PX * 0.32)}px`, fontFamily: family }}
          />
        ) : null}
      </div>
    </ScaledStage>
  );
}

export function AutoGrowText({
  value,
  onChange,
  placeholder,
  className,
  style,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  className: string;
  style: CSSProperties;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      autoFocus={autoFocus}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className={`block resize-none overflow-hidden bg-transparent border-0 outline-none focus:ring-0 p-0 ${className}`}
      style={style}
    />
  );
}

export function SlideRow({
  label,
  text,
  selected,
  live,
  dirty,
  onClick,
}: {
  label: string;
  text: string;
  selected: boolean;
  live?: boolean;
  dirty?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg px-3 py-2 border transition-colors ${
        selected
          ? "border-secondary/60 bg-secondary/10"
          : "border-transparent hover:bg-white/5"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
          {label}
        </span>
        {dirty ? (
          <span className="w-1.5 h-1.5 rounded-full bg-secondary" title="Unsaved" />
        ) : null}
        {live ? (
          <span className="ml-auto text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary text-on-primary">
            Live
          </span>
        ) : null}
      </div>
      <p className="text-xs text-on-surface line-clamp-2">{text}</p>
    </button>
  );
}

export function ToolButton({
  icon,
  label,
  disabled,
  danger,
  onClick,
}: {
  icon: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`flex items-center justify-center h-9 rounded-lg border text-[11px] disabled:opacity-40 ${
        danger
          ? "border-error/20 text-error hover:bg-error/10"
          : "border-white/10 hover:bg-white/5"
      }`}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
    </button>
  );
}
