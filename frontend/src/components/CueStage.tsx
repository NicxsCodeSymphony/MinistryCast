import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { mendWrappedRefs, type ParsedBibleRef } from "../lib/bible";
import { sermonSizePx, wrapLine } from "../lib/helpers";
import { renderSermonMarkup } from "../lib/sermonMarkup";
import { DEFAULT_STAGE_FONT, stageFontFamily } from "../lib/stageFonts";
import type { LiveCue } from "../lib/types";
import type { LyricTextStyle } from "../lib/lyricTextStyle";
import {
  DEFAULT_LYRIC_TEXT_STYLE,
  DEFAULT_STAGE_TEXT_SIZE,
  EMPTY_LYRIC_TEXT_STYLE,
  parseLyricTextStyle,
} from "../lib/lyricTextStyle";
import {
  chordStacks,
  chordStackMinWidth,
  isChordSymbol,
  spellChord,
  transposeChordSymbol,
  type Accidentals,
  type ChordStack,
} from "../lib/chords";
import { transposeFor, type ChordDisplay } from "../lib/chordDisplay";
import RosterStage from "./RosterStage";
import { SlideLayoutView, readSlideLayout } from "./sermon/slideLayout";

type CueStageProps = {
  cue?: LiveCue | null;
  className?: string;
  paddingTop?: number;
  font?: string | null;
  lyricSize?: string | null;
  darkText?: boolean;
  lyricStyle?: LyricTextStyle;
  /** Omitted: chords show in the default style. */
  chords?: ChordDisplay | null;
  onVerseClick?: (raw: string, parsed: ParsedBibleRef) => void;
};

const TITLE_PX = 22;
const SECTION_PX = 14;

export default function CueStage(props: CueStageProps) {
  if (props.cue?.kind === "roster") {
    return (
      <RosterStage
        cue={props.cue}
        className={props.className}
        paddingTop={props.paddingTop}
        darkText={props.darkText}
      />
    );
  }
  // Sermon slides designed on the canvas carry a layout marker in their content.
  const layout =
    props.cue?.kind === "sermon" && !props.cue.titleSlide && !props.cue.blank
      ? readSlideLayout(props.cue.lines.join("\n"))
      : null;
  if (layout) {
    return (
      <SlideLayoutView layout={layout} darkText={props.darkText} className={props.className} />
    );
  }
  return <LyricCueStage {...props} />;
}

function LyricCueStage({
  cue,
  className = "",
  paddingTop = 0,
  font = DEFAULT_STAGE_FONT,
  lyricSize = DEFAULT_STAGE_TEXT_SIZE,
  darkText = false,
  lyricStyle = DEFAULT_LYRIC_TEXT_STYLE,
  chords,
  onVerseClick,
}: CueStageProps) {
  const sermon = cue?.kind === "sermon";
  const heading = cue?.heading?.trim() || "";
  const sectionLabel = cue?.sectionLabel?.trim() || "";
  const verse = cue?.verse?.trim() || "";
  const showChords = chords?.show ?? true;
  const cueLines = cue?.lines;
  const rawLines = useMemo(
    () =>
      cue?.kind === "lyric" && !showChords
        ? (cueLines ?? []).map(withoutChords)
        : (cueLines ?? []),
    [cue?.kind, cueLines, showChords],
  );
  const chordSteps = transposeFor(chords, cue?.itemId);
  const accidentals = chords?.accidentals ?? "auto";
  const chordScale = (chords?.size ?? 55) / 100;
  const chordColor =
    chords?.color && chords.color !== "auto" ? chords.color : undefined;
  const blank = Boolean(cue?.blank);
  const scriptureOnly =
    cue?.kind === "scripture" && !rawLines.length && Boolean(heading);
  const headerTitle = scriptureOnly ? "" : heading;
  const titleSlide = Boolean(cue?.titleSlide);
  const bodyLines = useMemo(
    () => stageLines(rawLines, heading, verse, blank, scriptureOnly, titleSlide),
    [blank, heading, rawLines, scriptureOnly, titleSlide, verse],
  );
  const lineKey = bodyLines.join("\n");
  const footerVerse = cue?.versePlacement === "bottom" ? verse : "";
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const scripture = cue?.kind === "scripture";
  const maxPx = titleSlide
    ? 80
    : sermon
      ? sermonSizePx(cue?.textSize)
      : cue?.kind === "lyric"
        ? sermonSizePx(lyricSize)
        : scripture
          ? sermonSizePx(cue?.textSize || DEFAULT_STAGE_TEXT_SIZE)
          : 64;
  const [fontPx, setFontPx] = useState(maxPx);
  const bodyFamily = stageFontFamily(
    cue?.kind === "lyric" ? font : scripture ? cue?.font || DEFAULT_STAGE_FONT : DEFAULT_STAGE_FONT,
  );
  const scriptureStyleRaw = scripture ? cue?.textStyle : null;
  const bodyStyle = useMemo(
    () =>
      cue?.kind === "lyric"
        ? lyricStyle
        : scripture
          ? parseLyricTextStyle(scriptureStyleRaw)
          : EMPTY_LYRIC_TEXT_STYLE,
    [cue?.kind, lyricStyle, scripture, scriptureStyleRaw],
  );
  const bodyColor = scripture ? scriptureColor(cue?.color) : undefined;
  const metaFamily = stageFontFamily(DEFAULT_STAGE_FONT);
  const startAlign = sermon && cue?.align !== "center" && !titleSlide;

  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text || blank || !bodyLines.length) return;

    const minPx = Math.min(1, maxPx);

    const overflows = () =>
      text.scrollHeight > box.clientHeight + 1 ||
      text.scrollWidth > box.clientWidth + 1;

    const fit = () => {
      if (box.clientHeight < 8 || box.clientWidth < 8) return;
      let lo = minPx;
      let hi = maxPx;
      text.style.fontSize = `${hi}px`;
      if (!overflows()) {
        setFontPx(hi);
        return;
      }
      for (let i = 0; i < 16; i += 1) {
        const mid = (lo + hi) / 2;
        text.style.fontSize = `${mid}px`;
        if (overflows()) hi = mid;
        else lo = mid;
      }
      const next = Math.max(minPx, Math.floor(lo));
      text.style.fontSize = `${next}px`;
      setFontPx(next);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [
    blank,
    bodyLines.length,
    accidentals,
    chordScale,
    chordSteps,
    cue?.id,
    cue?.kind,
    cue?.textSize,
    bodyFamily,
    bodyStyle,
    lineKey,
    maxPx,
    sermon,
  ]);

  const verseSize = Math.max(16, Math.round(fontPx * (titleSlide ? 0.32 : 0.42)));

  return (
    <div
      className={`h-full w-full overflow-hidden flex flex-col ${
        startAlign ? "px-[5%] py-[4%]" : "px-[8%] py-[6%]"
      } ${className}`}
      style={{
        fontFamily: metaFamily,
        paddingTop: paddingTop ? `${paddingTop}px` : undefined,
      }}
    >
      {blank ? (
        <span className="sr-only">Space</span>
      ) : (
        <>
          {headerTitle || sectionLabel ? (
            <div
              className={`shrink-0 mb-3 ${startAlign ? "text-left" : "text-center"}`}
            >
              {headerTitle ? (
                <p
                  className={`font-semibold tracking-wide ${
                    darkText
                      ? "text-neutral-900"
                      : "text-white/90 drop-shadow-[0_4px_16px_rgba(0,0,0,0.65)]"
                  }`}
                  style={{
                    fontSize: `${TITLE_PX}px`,
                    lineHeight: 1.2,
                    fontFamily: metaFamily,
                  }}
                >
                  {headerTitle}
                </p>
              ) : null}
              {sectionLabel ? (
                <p
                  className={`uppercase tracking-[0.18em] mt-1 ${
                    darkText
                      ? "text-neutral-600"
                      : "text-white/70 drop-shadow-[0_4px_16px_rgba(0,0,0,0.65)]"
                  }`}
                  style={{
                    fontSize: `${SECTION_PX}px`,
                    lineHeight: 1.2,
                    fontFamily: metaFamily,
                  }}
                >
                  {sectionLabel}
                </p>
              ) : null}
            </div>
          ) : null}

          <div
            ref={boxRef}
            className={`min-h-0 flex-1 overflow-hidden flex w-full ${
              startAlign
                ? "items-start justify-start text-left"
                : "items-center justify-center text-center"
            }`}
          >
            {bodyLines.length ? (
              <div
                ref={textRef}
                className={`leading-[1.22] w-full max-w-none break-words ${
                  darkText
                    ? "text-black"
                    : "text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)]"
                }`}
                style={{
                  fontSize: `${fontPx}px`,
                  fontFamily: bodyFamily,
                  fontWeight: bodyStyle.bold ? 700 : undefined,
                  fontStyle: bodyStyle.italic ? "italic" : undefined,
                  textDecoration: bodyStyle.underline ? "underline" : undefined,
                  color: bodyColor,
                }}
              >
                {bodyLines.map((line, index) =>
                  line ? (
                    <span
                      key={`${index}-${line}`}
                      className="block w-full break-words whitespace-pre-wrap"
                    >
                      {cue?.kind === "lyric" && /\[[^\]]+\]/.test(line) ? (
                        <ChordProLine
                          line={line}
                          darkText={Boolean(darkText)}
                          color={chordColor}
                          scale={chordScale}
                          steps={chordSteps}
                          accidentals={accidentals}
                          onVerseClick={onVerseClick}
                        />
                      ) : (
                        renderSermonMarkup(line, onVerseClick, false, darkText)
                      )}
                    </span>
                  ) : (
                    <span
                      key={`${index}-gap`}
                      className="block"
                      style={{ height: `${Math.round(fontPx * 0.7)}px` }}
                      aria-hidden
                    />
                  ),
                )}
              </div>
            ) : null}
          </div>

          {footerVerse ? (
            <div
              className={`shrink-0 pt-4 break-words ${
                startAlign ? "text-left" : "text-center"
              } ${
                darkText
                  ? "text-neutral-800"
                  : "drop-shadow-[0_4px_16px_rgba(0,0,0,0.65)]"
              }`}
              style={{ fontSize: `${verseSize}px`, fontFamily: metaFamily }}
            >
              {wrapLine(footerVerse, 42).map((row, index) => (
                <span key={`${index}-${row}`} className="block w-full break-words">
                  {renderSermonMarkup(row, onVerseClick, true, darkText)}
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** White is the Add Scripture default; treat it as "follow the stage" so it stays readable on light backgrounds. */
function scriptureColor(raw?: string | null) {
  const value = raw?.trim();
  if (!value || value === "auto" || /^#?f{3}(?:f{3})?$/i.test(value)) return undefined;
  return value;
}

/** Drop chord markers but keep other bracketed text, e.g. `[G]Walk on` → `Walk on`. */
function withoutChords(line: string) {
  if (!line.includes("[")) return line;
  return line
    .replace(/\[([^\]]*)\]/g, (full, inner: string) =>
      !inner.trim() || isChordSymbol(inner) ? "" : full,
    )
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Split chord stacks into whole words so a line can only wrap between words; a chord placed
 * mid-word stays over its letter instead of the word breaking apart at the chord.
 */
function chordWords(line: string, steps: number, accidentals: Accidentals) {
  const words: ChordStack[][] = [];
  let current: ChordStack[] = [];
  for (const stack of chordStacks(line)) {
    const chord = stack.chord
      ? spellChord(transposeChordSymbol(stack.chord.trim(), steps), accidentals)
      : "";
    const parts = stack.text.match(/\S*\s*/g)?.filter(Boolean) ?? [];
    if (!parts.length) parts.push("");
    parts.forEach((part, index) => {
      current.push({ chord: index === 0 ? chord : "", text: part });
      if (/\s$/.test(part)) {
        words.push(current);
        current = [];
      }
    });
  }
  if (current.length) words.push(current);
  return words;
}

function ChordProLine({
  line,
  darkText,
  color,
  scale,
  steps,
  accidentals,
  onVerseClick,
}: {
  line: string;
  darkText: boolean;
  color?: string;
  scale: number;
  steps: number;
  accidentals: Accidentals;
  onVerseClick?: (raw: string, parsed: ParsedBibleRef) => void;
}) {
  const chordClass = color ? "" : darkText ? "text-primary" : "text-amber-200";
  const words = chordWords(line, steps, accidentals);

  return (
    <span
      className="inline-flex flex-wrap items-end justify-center leading-none"
      style={{ rowGap: "0.22em", paddingTop: "0.15em" }}
    >
      {words.map((word, wordIndex) => (
        <span key={`w-${wordIndex}`} className="inline-flex items-end whitespace-nowrap">
          {word.map((stack, index) => (
            <span
              key={`s-${index}-${stack.chord}`}
              className="inline-flex flex-col items-start"
              style={{ minWidth: chordStackMinWidth(stack, scale) }}
            >
              <span
                className={`w-0 overflow-visible whitespace-nowrap font-semibold tracking-wide ${chordClass}`}
                style={{
                  fontSize: `${scale}em`,
                  lineHeight: 1,
                  height: "0.95em",
                  marginBottom: "-0.05em",
                  color,
                }}
              >
                {stack.chord || "\u00a0"}
              </span>
              <span className="leading-[1.05] whitespace-pre">
                {stack.text
                  ? renderSermonMarkup(stack.text, onVerseClick, false, darkText)
                  : "\u00a0"}
              </span>
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

function stageLines(
  lines: string[],
  heading: string,
  verse: string,
  blank: boolean,
  scriptureOnly: boolean,
  titleSlide = false,
) {
  const source = lines.length
    ? lines
    : scriptureOnly
      ? [heading]
      : !blank && !heading && !verse
        ? ["Standby"]
        : [];
  if (!source.length) return [];
  const mended = mendWrappedRefs(source.join("\n")).split("\n");
  if (!titleSlide) return mended;
  return mended.flatMap((line) => (line.trim() ? wrapLine(line, 34) : [""]));
}
