import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { lookupScripture } from "../lib/api";
import {
  type BibleVerse,
  type FreeBibleTranslation,
} from "../lib/bible";
import { sermonSizePx } from "../lib/helpers";
import { DEFAULT_STAGE_FONT, stageFontFamily } from "../lib/stageFonts";
import type { LyricTextStyle } from "../lib/lyricTextStyle";

const VERSE_PAGE_SIZE = 5;

type VerseOverlayProps = {
  reference: string;
  translation?: string | null;
  font?: string | null;
  textSize?: string | null;
  textStyle?: string | null;
  color?: string | null;
  paddingTop?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onReferenceChange?: (reference: string) => void;
  onClose?: () => void;
};

export default function VerseOverlay({
  reference,
  translation = "ceb",
  font = DEFAULT_STAGE_FONT,
  textSize = "md",
  textStyle,
  color,
  paddingTop = 0,
  page = 0,
  pageSize = VERSE_PAGE_SIZE,
  onPageChange,
  onPageSizeChange,
  onReferenceChange,
  onClose,
}: VerseOverlayProps) {
  const [title, setTitle] = useState(reference);
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [allVerses, setAllVerses] = useState<BibleVerse[]>([]);
  const [bookName, setBookName] = useState("");
  const [chapterNum, setChapterNum] = useState(1);
  const [internalStyles, setInternalStyles] = useState<{
    textSize?: string | null;
    font?: string | null;
    textStyle?: string | null;
    color?: string | null;
  }>({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const effectiveTextSize = textSize || internalStyles.textSize || "md";
  const effectiveFont = font || internalStyles.font || DEFAULT_STAGE_FONT;
  const effectiveTextStyle = textStyle || internalStyles.textStyle;
  const effectiveColor = color || internalStyles.color;

  const [fontPx, setFontPx] = useState(sermonSizePx(effectiveTextSize));
  const [takeDraft, setTakeDraft] = useState(String(pageSize));
  const code = (translation || "ceb") as FreeBibleTranslation;
  const language =
    code === "ceb"
      ? "Visayan"
      : code === "niv"
        ? "English (NIV)"
        : "English (KJV)";
  const family = stageFontFamily(effectiveFont);
  const maxPx = sermonSizePx(effectiveTextSize);
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

  const styleObj: LyricTextStyle = useMemo(() => {
    try {
      return effectiveTextStyle
        ? JSON.parse(effectiveTextStyle)
        : { bold: true, italic: false, underline: false };
    } catch {
      return { bold: true, italic: false, underline: false };
    }
  }, [effectiveTextStyle]);

  const start = verses.length
    ? Math.min(Math.max(0, page), verses.length - 1)
    : 0;
  const remaining = Math.max(0, verses.length - start);
  const take = Math.min(
    Math.max(1, pageSize || VERSE_PAGE_SIZE),
    Math.max(1, remaining || 1),
  );
  const visible = useMemo(
    () => verses.slice(start, start + Math.min(take, remaining)),
    [remaining, start, take, verses],
  );
  const verseKey = visible.map((row) => `${row.verse}:${row.text}`).join("\n");
  const hasPrev = start > 0;
  const hasNext = start + visible.length < verses.length;
  const showNav = Boolean(onClose) && verses.length > 0;

  useEffect(() => {
    setTakeDraft(String(Math.min(Math.max(1, pageSize), Math.max(1, verses.length || 1))));
  }, [pageSize, reference, verses.length]);

  useEffect(() => {
    if (!verses.length) return;
    if (page === start) return;
    onPageChange?.(start);
  }, [onPageChange, page, start, verses.length]);

  useEffect(() => {
    setFontPx(maxPx);
  }, [maxPx, remaining, start, reference]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    void lookupScripture(reference, code)
      .then((result) => {
        if (cancelled) return;
        setTitle(result.reference);
        setVerses(result.selectedVerses);
        setAllVerses(result.verses);
        setBookName(result.book);
        setChapterNum(result.chapter);
        if (result.passage) {
          setInternalStyles({
            textSize: result.passage.text_size,
            font: result.passage.font,
            textStyle: result.passage.text_style,
            color: result.passage.color,
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load that verse.");
        setVerses([]);
        setAllVerses([]);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, reference]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const text = textRef.current;
    if (!box || !text || busy || error || !visible.length) return;

    let cancelled = false;
    const minPx = 20;
    const gutter = 16;

    const targetPx = () =>
      Math.min(
        160,
        Math.max(maxPx, Math.round(maxPx * Math.max(1, box.clientHeight / 520))),
      );

    const overflows = () =>
      text.scrollHeight > box.clientHeight - gutter + 1;

    const shrinkToFit = (hi: number) => {
      let lo = minPx;
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

    const fit = () => {
      if (cancelled) return;
      if (box.clientHeight < 8 || box.clientWidth < 8) return;
      const scaled = targetPx();
      text.style.fontSize = `${scaled}px`;
      if (!overflows()) {
        setFontPx(scaled);
        return;
      }
      shrinkToFit(scaled);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    void document.fonts.ready.then(fit);
    document.fonts.addEventListener("loadingdone", fit);
    return () => {
      cancelled = true;
      observer.disconnect();
      document.fonts.removeEventListener("loadingdone", fit);
    };
  }, [busy, error, family, maxPx, verseKey, visible.length]);

  const updateSelection = useCallback(
    (newVerses: number[]) => {
      if (!onReferenceChange) return;
      import("../lib/bible").then(({ formatBibleReference }) => {
        const next = formatBibleReference(bookName, chapterNum, newVerses);
        onReferenceChange(next);
      });
    },
    [bookName, chapterNum, onReferenceChange],
  );

  const addVerseEnd = () => {
    const last = verses[verses.length - 1]?.verse;
    if (!last) return;
    const next = allVerses.find((v) => v.verse === last + 1);
    if (!next) return;
    const current = verses.map((v) => v.verse);
    updateSelection([...current, next.verse]);
  };

  const removeVerseEnd = () => {
    if (verses.length <= 1) return;
    const current = verses.map((v) => v.verse);
    updateSelection(current.slice(0, -1));
  };

  const addVerseStart = () => {
    const first = verses[0]?.verse;
    if (!first) return;
    const prev = allVerses.find((v) => v.verse === first - 1);
    if (!prev) return;
    const current = verses.map((v) => v.verse);
    updateSelection([prev.verse, ...current]);
  };

  const removeVerseStart = () => {
    if (verses.length <= 1) return;
    const current = verses.map((v) => v.verse);
    updateSelection(current.slice(1));
  };

  const goNext = useCallback(() => {
    const next = start + take;
    if (next < verses.length) onPageChange?.(next);
  }, [onPageChange, start, take, verses.length]);

  const goPrev = useCallback(() => {
    const next = Math.max(0, start - take);
    if (next !== start) onPageChange?.(next);
  }, [onPageChange, start, take]);

  const maxTake = verses.length;

  const adjustTake = useCallback(
    (delta: number) => {
      const next = Math.min(maxTake, Math.max(1, take + delta));
      setTakeDraft(String(next));
      if (next !== pageSize) onPageSizeChange?.(next);
    },
    [maxTake, onPageSizeChange, pageSize, take],
  );

  useEffect(() => {
    if (!onClose || (!hasPrev && !hasNext)) return;
    const onKey = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement;
      if (typing) return;
      if (event.key === "ArrowRight" || event.code === "Space") {
        event.preventDefault();
        event.stopPropagation();
        goNext();
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [goNext, goPrev, hasNext, hasPrev, onClose]);

  const foreground = effectiveColor || "black";

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col bg-white"
      style={{
        fontFamily: family,
        paddingTop: paddingTop ? `${paddingTop}px` : undefined,
        color: foreground,
      }}
    >
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-black/10 text-black hover:bg-black/15"
          aria-label="Close verse"
        >
          <span className="material-symbols-outlined text-[22px]">close</span>
        </button>
      ) : null}

      <div className="min-h-0 flex-1 overflow-hidden px-[7%] pt-[6%] pb-[8%]">
        <div
          ref={boxRef}
          className="h-full w-full min-w-0 overflow-hidden flex flex-col justify-center"
        >
          {busy ? (
            <p className="text-center text-2xl opacity-50">Loading verse…</p>
          ) : error ? (
            <p className="text-[#b42318] text-center text-2xl">{error}</p>
          ) : (
            <div
              ref={textRef}
              className="w-full min-w-0 max-w-full break-words"
              style={{
                fontSize: `${fontPx}px`,
                fontFamily: family,
                fontWeight: styleObj.bold ? "bold" : "normal",
                fontStyle: styleObj.italic ? "italic" : "normal",
                textDecoration: styleObj.underline ? "underline" : "none",
              }}
            >
              <div className="text-center mb-[0.9em]">
                <p
                  className="font-bold tracking-[0.16em] uppercase"
                  style={{ fontSize: "0.62em" }}
                >
                  {language}
                </p>
                <div className="flex items-center justify-center gap-4 mt-[0.45em]">
                  {onReferenceChange && !busy && verses.length > 0 && (
                    <div className="flex flex-col gap-1 translate-y-[-2px]">
                      <button
                        type="button"
                        onClick={removeVerseStart}
                        disabled={verses.length <= 1}
                        className="w-6 h-6 flex items-center justify-center rounded bg-black/5 hover:bg-black/10 disabled:opacity-30 disabled:hover:bg-black/5"
                        style={{ color: "black" }}
                        title="Contract range from start"
                      >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                      </button>
                      <button
                        type="button"
                        onClick={addVerseStart}
                        disabled={verses[0]?.verse === allVerses[0]?.verse}
                        className="w-6 h-6 flex items-center justify-center rounded bg-black/5 hover:bg-black/10 disabled:opacity-30 disabled:hover:bg-black/5"
                        style={{ color: "black" }}
                        title="Expand range backwards"
                      >
                        <span className="material-symbols-outlined text-[18px]">remove</span>
                      </button>
                    </div>
                  )}

                  <h2
                    className="font-bold underline underline-offset-[0.18em]"
                    style={{ fontSize: "1em", lineHeight: 1.15 }}
                  >
                    {title}
                  </h2>

                  {onReferenceChange && !busy && verses.length > 0 && (
                    <div className="flex flex-col gap-1 translate-y-[-2px]">
                      <button
                        type="button"
                        onClick={addVerseEnd}
                        disabled={verses[verses.length - 1]?.verse === allVerses[allVerses.length - 1]?.verse}
                        className="w-6 h-6 flex items-center justify-center rounded bg-black/5 hover:bg-black/10 disabled:opacity-30 disabled:hover:bg-black/5"
                        style={{ color: "black" }}
                        title="Add next verse"
                      >
                        <span className="material-symbols-outlined text-[18px]">add</span>
                      </button>
                      <button
                        type="button"
                        onClick={removeVerseEnd}
                        disabled={verses.length <= 1}
                        className="w-6 h-6 flex items-center justify-center rounded bg-black/5 hover:bg-black/10 disabled:opacity-30 disabled:hover:bg-black/5"
                        style={{ color: "black" }}
                        title="Remove last verse"
                      >
                        <span className="material-symbols-outlined text-[18px]">remove</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div
                className="text-left leading-[1.35] font-bold"
                style={{ color: foreground }}
              >
                {visible.map((row) => (
                  <p
                    key={row.verse}
                    className="mb-[0.45em] last:mb-0 break-words whitespace-normal"
                  >
                    <span className="font-bold mr-[0.4em] tabular-nums underline underline-offset-[0.16em] decoration-2">
                      {row.verse}
                    </span>
                    <span>{row.text}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showNav ? (
        <div className="shrink-0 flex flex-col items-center gap-3 px-6 pb-5 pt-1">
          <label className="flex items-center gap-2 text-sm text-black/70">
            <span>Show</span>
            <button
              type="button"
              onClick={() => adjustTake(-1)}
              disabled={take <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/10 text-black font-bold text-lg leading-none hover:bg-black/15 disabled:pointer-events-none disabled:opacity-30"
              aria-label="Show fewer verses"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              max={maxTake}
              value={takeDraft}
              onChange={(event) => setTakeDraft(event.target.value)}
              onBlur={() => {
                const parsed = Number(takeDraft);
                const next = Number.isFinite(parsed)
                  ? Math.min(Math.max(1, Math.round(parsed)), maxTake)
                  : take;
                setTakeDraft(String(next));
                if (next !== pageSize) onPageSizeChange?.(next);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                (event.target as HTMLInputElement).blur();
              }}
              className="w-16 rounded-lg px-2 py-1 text-center text-sm font-semibold tabular-nums focus:outline-none bg-black/5 border border-black/15 text-black focus:border-black/40"
              aria-label="Number of verses to show"
            />
            <button
              type="button"
              onClick={() => adjustTake(1)}
              disabled={take >= maxTake}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/10 text-black font-bold text-lg leading-none hover:bg-black/15 disabled:pointer-events-none disabled:opacity-30"
              aria-label="Show more verses"
            >
              +
            </button>
            <span>
              of {verses.length} verse{verses.length === 1 ? "" : "s"}
            </span>
          </label>
          {hasPrev || hasNext ? (
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={goPrev}
                disabled={!hasPrev}
                className="flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold disabled:pointer-events-none disabled:opacity-30 bg-black/10 text-black hover:bg-black/15"
                aria-label="Previous verses"
              >
                <span className="material-symbols-outlined text-[20px]">
                  chevron_left
                </span>
                Previous
              </button>
              <span className="min-w-[4.5rem] text-center text-sm font-bold tabular-nums tracking-wide text-black">
                {visible[0]?.verse ?? ""}
                {visible.length > 1 ? `–${visible[visible.length - 1]?.verse}` : ""}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={!hasNext}
                className="flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold disabled:pointer-events-none disabled:opacity-30 bg-black/10 text-black hover:bg-black/15"
                aria-label="Next verses"
              >
                Next
                <span className="material-symbols-outlined text-[20px]">
                  chevron_right
                </span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
