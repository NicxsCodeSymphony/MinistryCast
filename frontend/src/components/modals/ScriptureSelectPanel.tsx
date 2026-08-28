import { useEffect, useMemo, useState } from "react";
import { newServiceItem, type ServiceItem } from "./serviceItem";

type Book = {
  name: string;
  testament: "ot" | "nt";
  chapters: number;
};

const BOOKS: Book[] = [
  { name: "Genesis", testament: "ot", chapters: 50 },
  { name: "Exodus", testament: "ot", chapters: 40 },
  { name: "Leviticus", testament: "ot", chapters: 27 },
  { name: "Numbers", testament: "ot", chapters: 36 },
  { name: "Deuteronomy", testament: "ot", chapters: 34 },
  { name: "Joshua", testament: "ot", chapters: 24 },
  { name: "Judges", testament: "ot", chapters: 21 },
  { name: "Ruth", testament: "ot", chapters: 4 },
  { name: "1 Samuel", testament: "ot", chapters: 31 },
  { name: "2 Samuel", testament: "ot", chapters: 24 },
  { name: "1 Kings", testament: "ot", chapters: 22 },
  { name: "2 Kings", testament: "ot", chapters: 25 },
  { name: "Psalms", testament: "ot", chapters: 150 },
  { name: "Proverbs", testament: "ot", chapters: 31 },
  { name: "Isaiah", testament: "ot", chapters: 66 },
  { name: "Jeremiah", testament: "ot", chapters: 52 },
  { name: "Matthew", testament: "nt", chapters: 28 },
  { name: "Mark", testament: "nt", chapters: 16 },
  { name: "Luke", testament: "nt", chapters: 24 },
  { name: "John", testament: "nt", chapters: 21 },
  { name: "Acts", testament: "nt", chapters: 28 },
  { name: "Romans", testament: "nt", chapters: 16 },
  { name: "1 Corinthians", testament: "nt", chapters: 16 },
  { name: "2 Corinthians", testament: "nt", chapters: 13 },
  { name: "Galatians", testament: "nt", chapters: 6 },
  { name: "Ephesians", testament: "nt", chapters: 6 },
  { name: "Philippians", testament: "nt", chapters: 4 },
  { name: "Colossians", testament: "nt", chapters: 4 },
  { name: "Hebrews", testament: "nt", chapters: 13 },
  { name: "James", testament: "nt", chapters: 5 },
  { name: "Revelation", testament: "nt", chapters: 22 },
];

const TRANSLATIONS = [
  { value: "niv", label: "NIV (New International)" },
  { value: "esv", label: "ESV (English Standard)" },
  { value: "kjv", label: "KJV (King James)" },
  { value: "nlt", label: "NLT (New Living)" },
  { value: "nasb", label: "NASB (New American Standard)" },
];

const SAMPLE_VERSES: Record<string, Record<number, Record<number, string>>> = {
  Luke: {
    4: {
      1: "And Jesus, full of the Holy Spirit, returned from the Jordan and was led by the Spirit in the wilderness",
      2: "for forty days, being tempted by the devil. And he ate nothing during those days. And when they were ended, he was hungry.",
      3: 'The devil said to him, "If you are the Son of God, command this stone to become bread."',
      4: 'And Jesus answered him, "It is written, \'Man shall not live by bread alone.\'"',
      5: "And the devil took him up and showed him all the kingdoms of the world in a moment of time.",
    },
  },
  John: {
    3: {
      16: "For God so loved the world, that he gave his only Son, that whoever believes in him should not perish but have eternal life.",
      17: "For God did not send his Son into the world to condemn the world, but in order that the world might be saved through him.",
    },
    4: {
      23: "But the hour is coming, and is now here, when the true worshipers will worship the Father in spirit and truth.",
      24: "God is spirit, and those who worship him must worship in spirit and truth.",
    },
  },
  Psalms: {
    23: {
      1: "The Lord is my shepherd; I shall not want.",
      2: "He makes me lie down in green pastures. He leads me beside still waters.",
      3: "He restores my soul. He leads me in paths of righteousness for his name's sake.",
      4: "Even though I walk through the valley of the shadow of death, I will fear no evil.",
    },
  },
};

function verseCount(book: string, chapter: number) {
  const known = SAMPLE_VERSES[book]?.[chapter];
  if (known) return Math.max(...Object.keys(known).map(Number), 8);
  if (book === "Psalms") return 20;
  return 12;
}

function verseText(book: string, chapter: number, verse: number) {
  return (
    SAMPLE_VERSES[book]?.[chapter]?.[verse] ??
    `${book} ${chapter}:${verse} — selected for the reading.`
  );
}

function parseReference(raw: string) {
  const match = raw
    .trim()
    .match(
      /^((?:[1-3]\s)?[A-Za-z]+(?:\s[A-Za-z]+)?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/i,
    );
  if (!match) return null;
  const bookName = match[1].replace(/\s+/g, " ");
  const book = BOOKS.find(
    (item) => item.name.toLowerCase() === bookName.toLowerCase(),
  );
  if (!book) return null;
  const chapter = Number(match[2]);
  if (chapter < 1 || chapter > book.chapters) return null;
  const start = match[3] ? Number(match[3]) : 1;
  const end = match[4] ? Number(match[4]) : match[3] ? Number(match[3]) : start;
  const max = verseCount(book.name, chapter);
  const verses: number[] = [];
  for (let n = Math.min(start, end); n <= Math.min(Math.max(start, end), max); n += 1) {
    verses.push(n);
  }
  return { book: book.name, chapter, verses };
}

function formatRange(verses: number[]) {
  if (!verses.length) return "";
  const sorted = [...verses].sort((a, b) => a - b);
  if (sorted.length === 1) return String(sorted[0]);
  const contiguous = sorted.every(
    (n, i) => i === 0 || n === sorted[i - 1] + 1,
  );
  return contiguous
    ? `${sorted[0]}-${sorted[sorted.length - 1]}`
    : sorted.join(", ");
}

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
  const [translation, setTranslation] = useState("esv");
  const [book, setBook] = useState("Luke");
  const [chapter, setChapter] = useState(4);
  const [selectedVerses, setSelectedVerses] = useState<number[]>([2, 3, 4]);
  const [previewMode, setPreviewMode] = useState<"screen" | "stage">("screen");
  const [autoPaginate, setAutoPaginate] = useState(true);

  const bookMeta = BOOKS.find((item) => item.name === book) ?? BOOKS[0];
  const verses = useMemo(
    () =>
      Array.from({ length: verseCount(book, chapter) }, (_, i) => i + 1),
    [book, chapter],
  );

  useEffect(() => {
    setSelectedVerses((prev) => prev.filter((n) => n <= verses.length));
  }, [verses.length]);

  const applyQuickRef = () => {
    const parsed = parseReference(quickRef);
    if (!parsed) return;
    setBook(parsed.book);
    setChapter(parsed.chapter);
    setSelectedVerses(parsed.verses);
  };

  const toggleVerse = (n: number) => {
    setSelectedVerses((prev) =>
      prev.includes(n) ? prev.filter((v) => v !== n) : [...prev, n].sort((a, b) => a - b),
    );
  };

  const reference = selectedVerses.length
    ? `${book} ${chapter}:${formatRange(selectedVerses)}`
    : `${book} ${chapter}`;

  const translationLabel =
    TRANSLATIONS.find((item) => item.value === translation)?.value.toUpperCase() ??
    "ESV";

  const previewText = selectedVerses.length
    ? selectedVerses
        .slice(0, 3)
        .map((n) => verseText(book, chapter, n))
        .join(" ")
    : "Select verses to preview the lower third.";

  const addToSetlist = () => {
    if (!selectedVerses.length) return;
    onAdd(
      newServiceItem({
        title: `Scripture Reading: ${reference}`,
        subtitle: `${translationLabel} • Layout: Lower Thirds`,
        duration: "01:30",
        label: "Verse",
        icon: "menu_book",
        accent: "secondary",
      }),
    );
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
              disabled={!selectedVerses.length}
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
                      placeholder="e.g. John 3:16"
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
                      onChange={(event) => setTranslation(event.target.value)}
                      className="w-full appearance-none bg-surface-container-low border border-white/10 text-on-surface rounded-lg pl-4 pr-10 py-3 focus:outline-none focus:ring-0"
                    >
                      {TRANSLATIONS.map((item) => (
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
            </div>

            <div className="glass-panel rounded-xl flex-1 flex flex-col overflow-hidden min-h-[360px]">
              <div className="grid grid-cols-3 border-b border-white/10">
                {["BOOK", "CHAPTER", "VERSE"].map((label) => (
                  <div
                    key={label}
                    className={`p-4 text-[12px] font-semibold tracking-widest text-on-surface-variant text-center ${
                      label !== "VERSE" ? "border-r border-white/10" : ""
                    }`}
                  >
                    {label}
                  </div>
                ))}
              </div>
              <div className="flex-1 grid grid-cols-3 min-h-0">
                <div className="overflow-y-auto border-r border-white/10 py-2 custom-scrollbar">
                  <ul className="space-y-1 px-2">
                    {BOOKS.map((item, index) => {
                      const prev = BOOKS[index - 1];
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
                            onClick={() => {
                              setBook(item.name);
                              setChapter(1);
                              setSelectedVerses([1]);
                            }}
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
                <div className="overflow-y-auto border-r border-white/10 p-4 custom-scrollbar">
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: bookMeta.chapters }, (_, i) => i + 1)
                      .slice(0, 48)
                      .map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => {
                            setChapter(n);
                            setSelectedVerses([1]);
                          }}
                          className={`aspect-square rounded-md flex items-center justify-center text-sm transition-colors ${
                            chapter === n
                              ? "text-primary bg-primary/10 border border-primary/30 shadow-[0_0_10px_rgba(155,203,255,0.2)]"
                              : "text-on-surface-variant bg-surface-container-low hover:bg-white/10 border border-white/5"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                  </div>
                </div>
                <div className="overflow-y-auto p-2 custom-scrollbar">
                  <ul className="space-y-1">
                    {verses.map((n) => {
                      const checked = selectedVerses.includes(n);
                      const text = verseText(book, chapter, n);
                      return (
                        <li key={n}>
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
              <div className="relative z-10 w-full p-8 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
                <div className="border-l-4 border-primary pl-6 py-2 backdrop-blur-sm">
                  <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 max-w-2xl leading-snug drop-shadow-lg">
                    {selectedVerses.slice(0, 2).map((n) => (
                      <span key={n}>
                        <sup className="text-primary/70 font-normal text-sm mr-1">
                          {n}
                        </sup>
                        {verseText(book, chapter, n)}{" "}
                      </span>
                    ))}
                    {!selectedVerses.length ? previewText : null}
                  </h3>
                  <p className="text-primary/90 font-medium tracking-wide uppercase text-sm mt-4 drop-shadow-md">
                    {reference} ({translationLabel})
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-xl p-4 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4 text-on-surface-variant">
                {["format_size", "vertical_align_bottom", "palette"].map(
                  (icon) => (
                    <button
                      key={icon}
                      type="button"
                      className="hover:text-primary transition-colors group"
                    >
                      <span className="material-symbols-outlined text-lg group-hover:bg-primary/20 p-1.5 rounded-md transition-colors">
                        {icon}
                      </span>
                    </button>
                  ),
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[12px] font-medium text-on-surface-variant">
                  Auto-paginate long verses
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoPaginate}
                  onClick={() => setAutoPaginate((prev) => !prev)}
                  className={`w-10 h-6 rounded-full relative cursor-pointer transition-opacity ${
                    autoPaginate ? "bg-primary opacity-80 hover:opacity-100" : "bg-white/10"
                  }`}
                >
                  <div
                    className={`w-4 h-4 bg-on-primary rounded-full absolute top-1 shadow-sm transition-all ${
                      autoPaginate ? "right-1" : "left-1 bg-on-surface-variant"
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
