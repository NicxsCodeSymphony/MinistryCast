import { useEffect, useMemo, useRef, useState } from "react";
import {
  bibleVersionIdForCode,
  findOrCreateScripturePassage,
  loadBibleChapter,
} from "../../lib/api";
import {
  BIBLE_BOOKS,
  FREE_BIBLE_TRANSLATIONS,
  findBibleBook,
  formatBibleReference,
  isFreeBibleTranslation,
  joinVerseText,
  parseBibleReference,
  type BibleChapter,
  type FreeBibleTranslation,
} from "../../lib/bible";
import { newServiceItem, type ServiceItem } from "./serviceItem";
import TextSizePicker from "../TextSizePicker";
import TextStylePicker from "../TextStylePicker";
import { DEFAULT_STAGE_FONT, STAGE_FONTS, stageFontFamily } from "../../lib/stageFonts";
import {
  DEFAULT_STAGE_TEXT_SIZE,
  serializeLyricTextStyle,
  type LyricTextStyle,
} from "../../lib/lyricTextStyle";

type ScriptureSelectPanelProps = {
  setlistName: string;
  onBack: () => void;
  onClose: () => void;
  onAdd: (item: ServiceItem) => void;
};

export default function ScriptureSelectPanel({
  setlistName,
  onBack,
  onClose,
  onAdd,
}: ScriptureSelectPanelProps) {
  const [quickRef, setQuickRef] = useState("Luke 4:2-4");
  const [translation, setTranslation] = useState<FreeBibleTranslation>("kjv");
  const [book, setBook] = useState("Luke");
  const [chapter, setChapter] = useState(4);
  const [selectedVerses, setSelectedVerses] = useState<number[]>([2, 3, 4]);
  const [previewMode, setPreviewMode] = useState<"screen" | "stage">("screen");
  const [perVerse, setPerVerse] = useState(true);
  const [textSize, setTextSize] = useState(DEFAULT_STAGE_TEXT_SIZE);
  const [font, setFont] = useState(DEFAULT_STAGE_FONT);
  const [textStyle, setTextStyle] = useState<LyricTextStyle>({
    bold: true,
    italic: false,
    underline: false,
  });
  const [color, setColor] = useState("#FFFFFF");
  const [saving, setSaving] = useState(false);
  const [chapterData, setChapterData] = useState<BibleChapter | null>(null);
  const [chapterBusy, setChapterBusy] = useState(false);
  const [chapterError, setChapterError] = useState("");

  const bookMeta = BIBLE_BOOKS.find((item) => item.name === book) ?? BIBLE_BOOKS[0];
  const verseMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of chapterData?.verses ?? []) map.set(row.verse, row.text);
    return map;
  }, [chapterData]);
  const verses = useMemo(
    () => (chapterData?.verses ?? []).map((row) => row.verse),
    [chapterData],
  );

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setChapterBusy(true);
    setChapterError("");
    setChapterData(null);
    void loadBibleChapter(book, chapter, translation, controller.signal)
      .then((data) => {
        if (cancelled) return;
        setChapterData(data);
        setSelectedVerses((prev) => {
          const allowed = new Set(data.verses.map((row) => row.verse));
          const next = prev.filter((n) => allowed.has(n));
          return next.length ? next : data.verses[0] ? [data.verses[0].verse] : [];
        });
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setChapterData(null);
        setChapterError(
          err instanceof Error ? err.message : "Could not load this chapter.",
        );
      })
      .finally(() => {
        if (!cancelled) setChapterBusy(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [book, chapter, translation]);

  const verseText = (n: number) =>
    verseMap.get(n) ?? (chapterBusy ? "Loading…" : "");

  /** Follow the quick reference as it is typed: "John" → book, "John 3" → chapter, "John 3:16" → verses. */
  const pickedRef = useRef("");
  const typedRef = useRef(false);
  const followQuickRef = (raw: string) => {
    if (raw === pickedRef.current) return;
    const cleaned = raw.trim().replace(/[\s:,.\-–—]+$/, "");
    if (!cleaned) return;
    typedRef.current = true;
    const parsed = parseBibleReference(cleaned);
    if (parsed) {
      const sameChapter = parsed.book === book && parsed.chapter === chapter;
      setBook(parsed.book);
      setChapter(parsed.chapter);
      if (parsed.verses.length) setSelectedVerses(parsed.verses);
      else if (!sameChapter) setSelectedVerses([1]);
      return;
    }
    if (!/^[1-3]?\s*[^\d]+$/.test(cleaned)) return;
    const found = findBibleBook(cleaned);
    if (found && found.name !== book) {
      setBook(found.name);
      setChapter(1);
      setSelectedVerses([1]);
    }
  };

  useEffect(() => {
    const id = window.setTimeout(() => followQuickRef(quickRef), 180);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickRef]);

  const applyQuickRef = () => followQuickRef(quickRef);

  const pick = (nextBook: string, nextChapter: number, nextVerses: number[]) => {
    setBook(nextBook);
    setChapter(nextChapter);
    setSelectedVerses(nextVerses);
    typedRef.current = false;
    pickedRef.current = formatBibleReference(nextBook, nextChapter, nextVerses);
    setQuickRef(pickedRef.current);
  };

  const toggleVerse = (n: number) => {
    const next = selectedVerses.includes(n)
      ? selectedVerses.filter((v) => v !== n)
      : [...selectedVerses, n].sort((a, b) => a - b);
    pick(book, chapter, next);
  };

  const allSelected = verses.length > 0 && selectedVerses.length === verses.length;
  const toggleAllVerses = () => {
    pick(book, chapter, allSelected ? (verses[0] ? [verses[0]] : []) : [...verses]);
  };

  const bookListRef = useRef<HTMLDivElement>(null);
  const chapterGridRef = useRef<HTMLDivElement>(null);
  const verseListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bookListRef.current
      ?.querySelector(`[data-book="${CSS.escape(book)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [book]);
  useEffect(() => {
    chapterGridRef.current
      ?.querySelector(`[data-chapter="${chapter}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [book, chapter]);
  const firstVerse = selectedVerses[0];
  useEffect(() => {
    if (!firstVerse || !chapterData || !typedRef.current) return;
    verseListRef.current
      ?.querySelector(`[data-verse="${firstVerse}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chapterData, firstVerse]);

  const reference = formatBibleReference(book, chapter, selectedVerses);
  const translationLabel = translation.toUpperCase();
  const previewText = selectedVerses.length
    ? selectedVerses
        .slice(0, 3)
        .map((n) => verseText(n))
        .filter(Boolean)
        .join(" ")
    : "Select verses to preview the lower third.";

  const addToSetlist = () => {
    if (!selectedVerses.length || saving) return;
    setSaving(true);
    void (async () => {
      const rows = selectedVerses
        .map((n) => ({ verse: n, text: verseMap.get(n) ?? "" }))
        .filter((row) => row.text);
      const text = joinVerseText(rows);
      const bibleVersionId = await bibleVersionIdForCode(translation);
      const passage = await findOrCreateScripturePassage({
        reference,
        text,
        bibleVersionId,
        text_size: textSize,
        font,
        text_style: serializeLyricTextStyle(textStyle),
        color,
      });
      onAdd(
        newServiceItem({
          itemType: "scripture",
          passageId: passage.id,
          title: `Scripture Reading: ${reference}`,
          subtitle:
            perVerse && rows.length > 1
              ? `${translationLabel} • ${rows.length} verses, one per slide`
              : `${translationLabel} • Layout: Lower Thirds`,
          duration: "01:30",
          label: "Verse",
          icon: "menu_book",
          accent: "secondary",
          payload: { kind: "scripture", translation, perVerse, verses: rows },
        }),
      );
    })()
      .catch(() => undefined)
      .finally(() => setSaving(false));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 relative overflow-hidden">
      <button
        type="button"
        onClick={onClose}
        className="absolute top-6 right-6 text-on-surface-variant hover:text-on-surface transition-colors z-20 bg-black/20 hover:bg-black/40 rounded-full p-2 backdrop-blur-md"
        aria-label="Close"
      >
        <span className="material-symbols-outlined block">close</span>
      </button>

      <div className="p-6 md:p-8 h-full flex flex-col gap-6 overflow-y-auto custom-scrollbar min-h-0">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pr-12 shrink-0">
          <div>
            <div className="flex items-center gap-2 text-on-surface-variant mb-1">
              <button
                type="button"
                onClick={onBack}
                className="text-[12px] font-medium hover:text-primary transition-colors"
              >
                {setlistName}
              </button>
              <span className="material-symbols-outlined text-sm">
                chevron_right
              </span>
              <span className="text-[12px] font-medium text-on-surface">
                Add Item
              </span>
            </div>
            <h2 className="text-[28px] leading-9 md:text-[48px] md:leading-[56px] font-bold text-on-surface tracking-tight">
              Add Scripture
            </h2>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="ghost-btn text-on-surface text-sm px-4 py-2 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={addToSetlist}
              disabled={!selectedVerses.length || chapterBusy || Boolean(chapterError)}
              className="bg-gradient-to-b from-primary to-primary-container text-on-primary text-sm font-medium px-6 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-40 shadow-[0_0_15px_rgba(155,203,255,0.3)]"
            >
              Add to Setlist
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-[520px]">
          <div className="lg:col-span-7 flex flex-col gap-6 min-h-0">
            <div className="glass-panel rounded-xl p-6 flex flex-col gap-6 shrink-0">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 flex flex-col gap-2">
                  <label className="text-[12px] font-medium text-on-surface-variant">
                    Quick Reference
                  </label>
                  <div className="relative soft-glow-focus rounded-lg">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">
                      search
                    </span>
                    <input
                      value={quickRef}
                      onChange={(event) => setQuickRef(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          applyQuickRef();
                        }
                      }}
                      onBlur={applyQuickRef}
                      className="w-full bg-surface-container-low border border-white/10 text-on-surface rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:ring-0 placeholder-outline-variant"
                      placeholder="e.g. John 3:16 · Juan 3:16 · Pina 21:4 · Mga Awit 23"
                      type="text"
                    />
                  </div>
                </div>
                <div className="sm:w-48 flex flex-col gap-2">
                  <label className="text-[12px] font-medium text-on-surface-variant">
                    Translation
                  </label>
                  <div className="relative soft-glow-focus rounded-lg">
                    <select
                      value={translation}
                      onChange={(event) => {
                        const next = event.target.value;
                        if (isFreeBibleTranslation(next)) setTranslation(next);
                      }}
                      className="w-full appearance-none bg-surface-container-low border border-white/10 text-on-surface rounded-lg pl-4 pr-10 py-3 focus:outline-none focus:ring-0"
                    >
                      {FREE_BIBLE_TRANSLATIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline pointer-events-none">
                      expand_more
                    </span>
                  </div>
                </div>
              </div>
              {chapterError ? (
                <p className="text-sm text-[#ffb4ab]">{chapterError}</p>
              ) : (
                <p className="text-xs text-on-surface-variant">
                  Search book names in English, Bisaya, or Tagalog (short forms work too).
                  Scripture text (NIV, KJV, Bisaya, and Tagalog) from
                  open-source XML repositories. Chapters are cached on this device
                  and saved to your church library.
                </p>
              )}
            </div>

            <div className="glass-panel rounded-xl flex-1 flex flex-col overflow-hidden min-h-[360px]">
              <div className="grid grid-cols-3 border-b border-white/10">
                {["BOOK", "CHAPTER"].map((label) => (
                  <div
                    key={label}
                    className="p-4 text-[12px] font-semibold tracking-widest text-on-surface-variant text-center border-r border-white/10"
                  >
                    {label}
                  </div>
                ))}
                <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold tracking-widest text-on-surface-variant">
                    VERSE
                  </span>
                  <button
                    type="button"
                    onClick={toggleAllVerses}
                    disabled={!verses.length || chapterBusy}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                      allSelected
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "bg-surface-container-low text-on-surface-variant border border-white/10 hover:text-on-surface hover:bg-white/5"
                    }`}
                    title={allSelected ? "Clear selection" : "Select every verse in this chapter"}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {allSelected ? "deselect" : "select_all"}
                    </span>
                    {allSelected ? "Clear" : `All ${verses.length || ""}`.trim()}
                  </button>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-3 min-h-0">
                <div
                  ref={bookListRef}
                  className="overflow-y-auto border-r border-white/10 py-2 custom-scrollbar"
                >
                  <ul className="space-y-1 px-2">
                    {BIBLE_BOOKS.map((item, index) => {
                      const prev = BIBLE_BOOKS[index - 1];
                      const showNt =
                        item.testament === "nt" && prev?.testament === "ot";
                      return (
                        <li key={item.name}>
                          {showNt ? (
                            <div className="px-4 py-2 text-[12px] font-semibold tracking-[0.05em] text-outline-variant mt-2 mb-1">
                              NEW TESTAMENT
                            </div>
                          ) : null}
                          {index === 0 ? (
                            <div className="px-4 py-2 text-[12px] font-semibold tracking-[0.05em] text-outline-variant mb-1">
                              OLD TESTAMENT
                            </div>
                          ) : null}
                          <button
                            type="button"
                            data-book={item.name}
                            onClick={() => pick(item.name, 1, [1])}
                            className={`w-full text-left px-4 py-2 rounded-md text-sm transition-colors ${
                              book === item.name
                                ? "text-primary bg-primary/10 border border-primary/20"
                                : "text-on-surface-variant hover:bg-white/5 hover:text-on-surface"
                            }`}
                          >
                            {item.name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div
                  ref={chapterGridRef}
                  className="overflow-y-auto border-r border-white/10 p-4 custom-scrollbar"
                >
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: bookMeta.chapters }, (_, i) => i + 1).map(
                      (n) => (
                        <button
                          key={n}
                          type="button"
                          data-chapter={n}
                          onClick={() => pick(book, n, [1])}
                          className={`aspect-square rounded-md flex items-center justify-center text-sm transition-colors ${
                            chapter === n
                              ? "text-primary bg-primary/10 border border-primary/30 shadow-[0_0_10px_rgba(155,203,255,0.2)]"
                              : "text-on-surface-variant bg-surface-container-low hover:bg-white/10 border border-white/5"
                          }`}
                        >
                          {n}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <div ref={verseListRef} className="overflow-y-auto p-2 custom-scrollbar">
                  {chapterBusy && !verses.length ? (
                    <div className="p-3 flex items-start gap-2 text-sm text-on-surface-variant">
                      <span className="material-symbols-outlined text-[18px] animate-spin shrink-0">
                        progress_activity
                      </span>
                      <div>
                        <p>
                          Loading {book} {chapter} (
                          {FREE_BIBLE_TRANSLATIONS.find((item) => item.value === translation)?.label ??
                            translation.toUpperCase()}
                          )…
                        </p>
                        <p className="text-[11px] mt-1 opacity-80">
                          The first time a translation is used it downloads once, then it is instant.
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <ul className="space-y-1">
                    {verses.map((n) => {
                      const checked = selectedVerses.includes(n);
                      const text = verseText(n);
                      return (
                        <li key={n} data-verse={n}>
                          <label
                            className={`flex items-start gap-3 p-2 rounded-md cursor-pointer transition-colors group ${
                              checked
                                ? "bg-primary/5 border border-primary/20"
                                : "hover:bg-white/5"
                            }`}
                          >
                            <div
                              className={`mt-1 relative flex items-center justify-center w-4 h-4 rounded border shrink-0 ${
                                checked
                                  ? "bg-primary border-primary"
                                  : "border-outline-variant group-hover:border-primary/50"
                              }`}
                            >
                              {checked ? (
                                <span className="material-symbols-outlined text-[12px] text-on-primary font-bold absolute pointer-events-none">
                                  check
                                </span>
                              ) : null}
                              <input
                                checked={checked}
                                onChange={() => toggleVerse(n)}
                                className="opacity-0 absolute inset-0 cursor-pointer"
                                type="checkbox"
                              />
                            </div>
                            <div>
                              <span
                                className={`text-[12px] font-semibold tracking-[0.05em] mr-2 ${
                                  checked ? "text-primary" : "text-outline-variant"
                                }`}
                              >
                                {n}
                              </span>
                              <span
                                className={`text-sm ${
                                  checked
                                    ? "text-on-surface"
                                    : "text-on-surface-variant line-clamp-2"
                                }`}
                              >
                                {text}
                              </span>
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6 min-h-0">
            <div className="glass-panel rounded-xl p-1 flex items-center justify-between bg-surface-container/50 shrink-0">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setPreviewMode("screen")}
                  className={`px-4 py-1.5 rounded-lg text-[12px] font-medium ${
                    previewMode === "screen"
                      ? "bg-surface-bright text-on-surface shadow-sm border border-white/10"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  Screen Preview
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode("stage")}
                  className={`px-4 py-1.5 rounded-lg text-[12px] font-medium ${
                    previewMode === "stage"
                      ? "bg-surface-bright text-on-surface shadow-sm border border-white/10"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  Stage Display
                </button>
              </div>
              <div className="px-3">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-low border border-white/5">
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(155,203,255,0.8)]" />
                  <span className="text-[12px] font-semibold tracking-[0.05em] text-primary">
                    {previewMode === "screen" ? "LOWER THIRD THEME" : "STAGE CUE"}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1 bg-black rounded-xl border border-white/10 relative overflow-hidden shadow-2xl flex flex-col justify-end min-h-[220px] aspect-video lg:aspect-auto">
              <div className="absolute inset-0 bg-surface-container-lowest/80 flex items-center justify-center">
                <span className="material-symbols-outlined text-outline-variant/30 text-6xl">
                  videocam
                </span>
              </div>
              <div
                className="relative z-10 w-full p-8 bg-gradient-to-t from-black/90 via-black/60 to-transparent"
                style={{
                  fontFamily: stageFontFamily(font),
                  color: color,
                }}
              >
                <div
                  className="border-l-4 border-primary pl-6 py-2 backdrop-blur-sm"
                  style={{
                    borderColor: color === "#FFFFFF" ? undefined : color,
                  }}
                >
                  <h3
                    className={`font-bold mb-2 max-w-2xl leading-snug drop-shadow-lg ${
                      textStyle.italic ? "italic" : ""
                    } ${textStyle.underline ? "underline" : ""}`}
                    style={{
                      fontSize:
                        textSize === "sm"
                          ? "1rem"
                          : textSize === "lg"
                            ? "1.75rem"
                            : textSize === "xl"
                              ? "2.25rem"
                              : "1.35rem",
                      fontWeight: textStyle.bold ? "bold" : "normal",
                    }}
                  >
                    {selectedVerses.slice(0, perVerse ? 1 : 2).map((n) => (
                      <span key={n}>
                        <sup
                          className="font-normal text-sm mr-1"
                          style={{ opacity: 0.7 }}
                        >
                          {n}
                        </sup>
                        {verseText(n)}{" "}
                      </span>
                    ))}
                    {!selectedVerses.length ? previewText : null}
                  </h3>
                  <p
                    className="font-medium tracking-wide uppercase text-sm mt-4 drop-shadow-md"
                    style={{ opacity: 0.9 }}
                  >
                    {perVerse && selectedVerses.length
                      ? formatBibleReference(book, chapter, [selectedVerses[0]])
                      : reference}{" "}
                    ({translationLabel})
                  </p>
                  {perVerse && selectedVerses.length > 1 ? (
                    <p className="text-[11px] mt-1" style={{ opacity: 0.7 }}>
                      Slide 1 of {selectedVerses.length} · each verse gets its own slide in Live
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-xl p-4 flex flex-wrap gap-4 justify-between items-center shrink-0">
              <div className="flex items-center gap-4 text-on-surface-variant">
                <select
                  value={font}
                  onChange={(e) => setFont(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-md px-2 py-1 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {STAGE_FONTS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>

                <TextSizePicker value={textSize} onChange={setTextSize} />
                <TextStylePicker value={textStyle} onChange={setTextStyle} />

                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-lg">palette</span>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-6 h-6 rounded bg-transparent border-none cursor-pointer"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[12px] font-medium text-on-surface-variant">
                  One verse per slide
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={perVerse}
                  onClick={() => setPerVerse((prev) => !prev)}
                  className={`w-10 h-6 rounded-full relative cursor-pointer transition-opacity ${
                    perVerse ? "bg-primary opacity-80 hover:opacity-100" : "bg-white/10"
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-on-primary rounded-full absolute top-1 shadow-sm transition-all ${
                      perVerse ? "right-1" : "left-1 bg-on-surface-variant"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
