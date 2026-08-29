import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { mendWrappedRefs, type ParsedBibleRef } from "../lib/bible";
import { sermonSizePx, wrapLine } from "../lib/helpers";
import { renderSermonMarkup } from "../lib/sermonMarkup";
import { DEFAULT_STAGE_FONT, stageFontFamily } from "../lib/stageFonts";
import type { LiveCue } from "../lib/types";
import type { LyricTextStyle } from "../lib/lyricTextStyle";
import { EMPTY_LYRIC_TEXT_STYLE } from "../lib/lyricTextStyle";
import RosterStage from "./RosterStage";

type CueStageProps = {
  cue?: LiveCue | null;
  className?: string;
  paddingTop?: number;
  font?: string | null;
  lyricSize?: string | null;
  darkText?: boolean;
  lyricStyle?: LyricTextStyle;
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
  return <LyricCueStage {...props} />;
}

function LyricCueStage({
  cue,
  className = "",
  paddingTop = 0,
  font = DEFAULT_STAGE_FONT,
  lyricSize = "48",
  darkText = false,
  lyricStyle = EMPTY_LYRIC_TEXT_STYLE,
  onVerseClick,
}: CueStageProps) {
  const sermon = cue?.kind === "sermon";
  const heading = cue?.heading?.trim() || "";
  const sectionLabel = cue?.sectionLabel?.trim() || "";
  const verse = cue?.verse?.trim() || "";
  const rawLines = cue?.lines ?? [];
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
  const maxPx = titleSlide
    ? 80
    : sermon
      ? sermonSizePx(cue?.textSize)
      : cue?.kind === "lyric"
        ? sermonSizePx(lyricSize)
        : 64;
  const [fontPx, setFontPx] = useState(maxPx);
  const bodyFamily = stageFontFamily(cue?.kind === "lyric" ? font : DEFAULT_STAGE_FONT);
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
  }, [blank, bodyLines.length, cue?.id, cue?.kind, cue?.textSize, lineKey, lyricStyle, maxPx, sermon]);

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
                  fontWeight: cue?.kind === "lyric" && lyricStyle.bold ? 700 : undefined,
                  fontStyle: cue?.kind === "lyric" && lyricStyle.italic ? "italic" : undefined,
                  textDecoration:
                    cue?.kind === "lyric" && lyricStyle.underline
                      ? "underline"
                      : undefined,
                }}
              >
                {bodyLines.map((line, index) =>
                  line ? (
                    <span
                      key={`${index}-${line}`}
                      className="block w-full break-words whitespace-pre-wrap"
                    >
                      {renderSermonMarkup(line, onVerseClick)}
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
                  {renderSermonMarkup(row, onVerseClick, true)}
                </span>
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
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
