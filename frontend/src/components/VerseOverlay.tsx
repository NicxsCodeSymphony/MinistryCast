import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { lookupScripture } from "../lib/api";
import { type BibleVerse, type FreeBibleTranslation } from "../lib/bible";
import { sermonSizePx } from "../lib/helpers";
import { DEFAULT_STAGE_FONT, stageFontFamily } from "../lib/stageFonts";

const VERSE_PAGE_SIZE = 5;

type VerseOverlayProps = {
  reference: string;
  translation?: string | null;
  font?: string | null;
  textSize?: string | null;
  paddingTop?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onClose?: () => void;
  darkText?: boolean;
};

export default function VerseOverlay({
  reference,
  translation = "ceb",
  font = DEFAULT_STAGE_FONT,
  textSize = "md",
  paddingTop = 0,
  page = 0,
  pageSize = VERSE_PAGE_SIZE,
  onPageChange,
  onPageSizeChange,
  onClose,
  darkText = false,
}: VerseOverlayProps) {
  const [title, setTitle] = useState(reference);
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [fontPx, setFontPx] = useState(sermonSizePx(textSize));
  const [takeDraft, setTakeDraft] = useState(String(pageSize));
  const code = (translation || "ceb") as FreeBibleTranslation;
  const language =
    code === "ceb"
      ? "Bisaya KJV"
      : code === "web"
        ? "World English"
        : "King James";
  const family = stageFontFamily(font);
  const maxPx = sermonSizePx(textSize);
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);

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
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load that verse.");
        setVerses([]);
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
  }, [busy, error, maxPx, verseKey, visible.length]);

  const goNext = useCallback(() => {
    if (!hasNext) return;
    onPageChange?.(start + visible.length);
  }, [hasNext, onPageChange, start, visible.length]);

  const goPrev = useCallback(() => {
    if (!hasPrev) return;
    onPageChange?.(Math.max(0, start - take));
  }, [hasPrev, onPageChange, start, take]);

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

  return (
    <div
      className={`absolute inset-0 z-30 flex flex-col ${
        darkText ? "bg-white" : "bg-[#05070d]"
      }`}
      style={{
        fontFamily: family,
        paddingTop: paddingTop ? `${paddingTop}px` : undefined,
      }}
    >
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className={`absolute top-4 right-4 z-10 w-11 h-11 rounded-full ${
            darkText
              ? "bg-black/10 text-black hover:bg-black/15"
              : "bg-white/10 text-white hover:bg-white/20"
          }`}
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
            <p className={`text-center text-2xl ${darkText ? "text-black/50" : "text-white/60"}`}>Loading verse…</p>
          ) : error ? (
            <p className="text-[#ffb4ab] text-center text-2xl">{error}</p>
          ) : (
            <div
              ref={textRef}
              className="w-full min-w-0 max-w-full break-words"
              style={{ fontSize: `${fontPx}px`, fontFamily: family }}
            >
              <div className="text-center mb-[0.9em]">
                <p
                  className={`font-semibold tracking-[0.16em] uppercase ${
                    darkText ? "text-neutral-500" : "text-[#f0c674]"
                  }`}
                  style={{ fontSize: "0.62em" }}
                >
                  {language}
                </p>
                <h2
                  className={`mt-[0.45em] font-semibold ${
                    darkText
                      ? "text-black"
                      : "text-white drop-shadow-[0_4px_16px_rgba(0,0,0,0.65)]"
                  }`}
                  style={{ fontSize: "1em", lineHeight: 1.15 }}
                >
                  {title}
                </h2>
              </div>
              <div
                className={`text-left leading-[1.35] ${
                  darkText
                    ? "text-black"
                    : "text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)]"
                }`}
              >
                {visible.map((row) => (
                  <p
                    key={row.verse}
                    className="mb-[0.45em] last:mb-0 break-words whitespace-normal"
                  >
                    <span
                      className={`font-semibold mr-[0.4em] tabular-nums ${
                        darkText ? "text-neutral-500" : "text-[#f0c674]"
                      }`}
                    >
                      {row.verse}
                    </span>
                    {row.text}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showNav ? (
        <div className="shrink-0 flex flex-col items-center gap-3 px-6 pb-5 pt-1">
          <label className={`flex items-center gap-2 text-sm ${darkText ? "text-black/70" : "text-white/80"}`}>
            <span>Show</span>
            <input
              type="number"
              min={1}
              max={Math.max(1, verses.length)}
              value={takeDraft}
              onChange={(event) => setTakeDraft(event.target.value)}
              onBlur={() => {
                const parsed = Number(takeDraft);
                const next = Number.isFinite(parsed)
                  ? Math.min(
                      Math.max(1, Math.round(parsed)),
                      Math.max(1, verses.length),
                    )
                  : take;
                setTakeDraft(String(next));
                if (next !== pageSize) onPageSizeChange?.(next);
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                (event.target as HTMLInputElement).blur();
              }}
              className={`w-16 rounded-lg px-2 py-1 text-center text-sm font-semibold tabular-nums focus:outline-none ${
                darkText
                  ? "bg-black/5 border border-black/15 text-black focus:border-black/40"
                  : "bg-white/10 border border-white/15 text-white focus:border-[#f0c674]"
              }`}
              aria-label="Number of verses to show"
            />
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
                className={`flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold disabled:pointer-events-none disabled:opacity-30 ${
                  darkText
                    ? "bg-black/10 text-black hover:bg-black/15"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
                aria-label="Previous verses"
              >
                <span className="material-symbols-outlined text-[20px]">
                  chevron_left
                </span>
                Previous
              </button>
              <span className="min-w-[4.5rem] text-center text-sm font-semibold tabular-nums tracking-wide text-[#f0c674]">
                {visible[0]?.verse ?? ""}
                {visible.length > 1 ? `–${visible[visible.length - 1]?.verse}` : ""}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={!hasNext}
                className={`flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold disabled:pointer-events-none disabled:opacity-30 ${
                  darkText
                    ? "bg-black/10 text-black hover:bg-black/15"
                    : "bg-white/10 text-white hover:bg-white/20"
                }`}
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
