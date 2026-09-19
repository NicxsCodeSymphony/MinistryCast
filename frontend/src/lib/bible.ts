import { idbDel, idbDelByPrefix, idbGet, idbSet } from "./offline/idb";
import { fetchGithubBibleChapter } from "./bibleGithub";

export type FreeBibleTranslation = "kjv" | "niv" | "ceb";

export type BibleBook = {
  name: string;
  testament: "ot" | "nt";
  chapters: number;
  aliases?: string[];
  apiName?: string;
};

export type BibleVerse = {
  verse: number;
  text: string;
};

export type BibleChapter = {
  book: string;
  chapter: number;
  translation: FreeBibleTranslation;
  verses: BibleVerse[];
};

export type ParsedBibleRef = {
  book: string;
  chapter: number;
  verses: number[];
};

export const FREE_BIBLE_TRANSLATIONS: {
  value: FreeBibleTranslation;
  label: string;
}[] = [
  { value: "ceb", label: "Visayan" },
  { value: "kjv", label: "English (KJV)" },
  { value: "niv", label: "English (NIV)" },
];

const BIBLE_CACHE_VERSION = 6;
const BIBLE_CACHE_VERSION_KEY = "bible-cache-version";

/** Drop stale chapter/API.Bible caches after translation source changes. */
export async function ensureBibleCacheFresh() {
  const current = await idbGet<number>(BIBLE_CACHE_VERSION_KEY);
  if (current === BIBLE_CACHE_VERSION) return;
  await idbDelByPrefix("bible-chapter:");
  await idbDelByPrefix("github-bible-content:");
  await idbDel("api-bible:translation-ids");
  await idbDel("api-bible:ceb-maayong-balita-id");
  await idbDel("api-bible:ceb-source");
  await idbSet(BIBLE_CACHE_VERSION_KEY, BIBLE_CACHE_VERSION);
}

export const BIBLE_BOOKS: BibleBook[] = [
  { name: "Genesis", testament: "ot", chapters: 50 },
  { name: "Exodus", testament: "ot", chapters: 40 },
  { name: "Leviticus", testament: "ot", chapters: 27 },
  { name: "Numbers", testament: "ot", chapters: 36 },
  { name: "Deuteronomy", testament: "ot", chapters: 34 },
  { name: "Joshua", testament: "ot", chapters: 24 },
  { name: "Judges", testament: "ot", chapters: 21 },
  { name: "Ruth", testament: "ot", chapters: 4 },
  { name: "1 Samuel", testament: "ot", chapters: 31, aliases: ["I Samuel"] },
  { name: "2 Samuel", testament: "ot", chapters: 24, aliases: ["II Samuel"] },
  { name: "1 Kings", testament: "ot", chapters: 22 },
  { name: "2 Kings", testament: "ot", chapters: 25 },
  { name: "1 Chronicles", testament: "ot", chapters: 29 },
  { name: "2 Chronicles", testament: "ot", chapters: 36 },
  { name: "Ezra", testament: "ot", chapters: 10 },
  { name: "Nehemiah", testament: "ot", chapters: 13 },
  { name: "Esther", testament: "ot", chapters: 10 },
  { name: "Job", testament: "ot", chapters: 42 },
  {
    name: "Psalms",
    testament: "ot",
    chapters: 150,
    aliases: ["Psalm", "Ps"],
    apiName: "Psalm",
  },
  { name: "Proverbs", testament: "ot", chapters: 31 },
  { name: "Ecclesiastes", testament: "ot", chapters: 12 },
  {
    name: "Song of Solomon",
    testament: "ot",
    chapters: 8,
    aliases: ["Song of Songs", "Canticles", "SOS"],
  },
  { name: "Isaiah", testament: "ot", chapters: 66 },
  { name: "Jeremiah", testament: "ot", chapters: 52 },
  { name: "Lamentations", testament: "ot", chapters: 5 },
  { name: "Ezekiel", testament: "ot", chapters: 48 },
  { name: "Daniel", testament: "ot", chapters: 12 },
  { name: "Hosea", testament: "ot", chapters: 14 },
  { name: "Joel", testament: "ot", chapters: 3 },
  { name: "Amos", testament: "ot", chapters: 9 },
  { name: "Obadiah", testament: "ot", chapters: 1 },
  { name: "Jonah", testament: "ot", chapters: 4 },
  { name: "Micah", testament: "ot", chapters: 7 },
  { name: "Nahum", testament: "ot", chapters: 3 },
  { name: "Habakkuk", testament: "ot", chapters: 3 },
  { name: "Zephaniah", testament: "ot", chapters: 3 },
  { name: "Haggai", testament: "ot", chapters: 2 },
  { name: "Zechariah", testament: "ot", chapters: 14 },
  { name: "Malachi", testament: "ot", chapters: 4 },
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
  { name: "1 Thessalonians", testament: "nt", chapters: 5 },
  { name: "2 Thessalonians", testament: "nt", chapters: 3 },
  { name: "1 Timothy", testament: "nt", chapters: 6 },
  { name: "2 Timothy", testament: "nt", chapters: 4 },
  { name: "Titus", testament: "nt", chapters: 3 },
  { name: "Philemon", testament: "nt", chapters: 1 },
  { name: "Hebrews", testament: "nt", chapters: 13 },
  { name: "James", testament: "nt", chapters: 5 },
  { name: "1 Peter", testament: "nt", chapters: 5 },
  { name: "2 Peter", testament: "nt", chapters: 3 },
  { name: "1 John", testament: "nt", chapters: 5 },
  { name: "2 John", testament: "nt", chapters: 1 },
  { name: "3 John", testament: "nt", chapters: 1 },
  { name: "Jude", testament: "nt", chapters: 1 },
  { name: "Revelation", testament: "nt", chapters: 22 },
];

function normalizeBook(value: string) {
  return value
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const BOOK_ALIASES: Record<string, string> = {
  gen: "Genesis",
  ex: "Exodus",
  exo: "Exodus",
  exod: "Exodus",
  lev: "Leviticus",
  num: "Numbers",
  deut: "Deuteronomy",
  dt: "Deuteronomy",
  jos: "Joshua",
  jdg: "Judges",
  jud: "Judges",
  ru: "Ruth",
  "1sam": "1 Samuel",
  "2sam": "2 Samuel",
  "1kgs": "1 Kings",
  "2kgs": "2 Kings",
  "1chr": "1 Chronicles",
  "2chr": "2 Chronicles",
  ezr: "Ezra",
  neh: "Nehemiah",
  est: "Esther",
  job: "Job",
  ps: "Psalms",
  psa: "Psalms",
  sal: "Psalms",
  salmo: "Psalms",
  pr: "Proverbs",
  prov: "Proverbs",
  ecc: "Ecclesiastes",
  sos: "Song of Solomon",
  isa: "Isaiah",
  jer: "Jeremiah",
  lam: "Lamentations",
  eze: "Ezekiel",
  ezk: "Ezekiel",
  dan: "Daniel",
  hos: "Hosea",
  joe: "Joel",
  amo: "Amos",
  oba: "Obadiah",
  jon: "Jonah",
  mic: "Micah",
  nah: "Nahum",
  hab: "Habakkuk",
  zep: "Zephaniah",
  hag: "Haggai",
  zec: "Zechariah",
  mal: "Malachi",
  mt: "Matthew",
  mat: "Matthew",
  mateo: "Matthew",
  mk: "Mark",
  mar: "Mark",
  marcos: "Mark",
  lk: "Luke",
  luc: "Luke",
  lucas: "Luke",
  jn: "John",
  joh: "John",
  jhn: "John",
  juan: "John",
  ac: "Acts",
  act: "Acts",
  buhat: "Acts",
  rom: "Romans",
  roma: "Romans",
  "1cor": "1 Corinthians",
  "1co": "1 Corinthians",
  "1corinto": "1 Corinthians",
  "2cor": "2 Corinthians",
  "2co": "2 Corinthians",
  gal: "Galatians",
  eph: "Ephesians",
  ef: "Ephesians",
  efeso: "Ephesians",
  php: "Philippians",
  phil: "Philippians",
  ph: "Philippians",
  fil: "Philippians",
  filip: "Philippians",
  filipos: "Philippians",
  col: "Colossians",
  "1th": "1 Thessalonians",
  "1tes": "1 Thessalonians",
  "2th": "2 Thessalonians",
  "2tes": "2 Thessalonians",
  "1tim": "1 Timothy",
  "1ti": "1 Timothy",
  "1timoteo": "1 Timothy",
  "2tim": "2 Timothy",
  "2ti": "2 Timothy",
  "2timoteo": "2 Timothy",
  tit: "Titus",
  tito: "Titus",
  phm: "Philemon",
  filemon: "Philemon",
  heb: "Hebrews",
  jas: "James",
  santiago: "James",
  "1pe": "1 Peter",
  "1ped": "1 Peter",
  "1pedro": "1 Peter",
  "2pe": "2 Peter",
  "1jn": "1 John",
  "1juan": "1 John",
  "2jn": "2 John",
  "3jn": "3 John",
  jude: "Jude",
  judas: "Jude",
  rev: "Revelation",
  pinadayag: "Revelation",
  bugna: "Revelation",
};

export function findBibleBook(name: string) {
  const needle = normalizeBook(name);
  const compact = needle.replace(/\s+/g, "");
  const mapped = BOOK_ALIASES[compact];
  if (mapped) {
    return BIBLE_BOOKS.find((book) => book.name === mapped) ?? null;
  }
  return (
    BIBLE_BOOKS.find((book) => {
      if (normalizeBook(book.name) === needle) return true;
      return (book.aliases ?? []).some((alias) => normalizeBook(alias) === needle);
    }) ?? null
  );
}

export function formatVerseRange(verses: number[]) {
  if (!verses.length) return "";
  const sorted = [...verses].sort((a, b) => a - b);
  if (sorted.length === 1) return String(sorted[0]);
  const contiguous = sorted.every((n, i) => i === 0 || n === sorted[i - 1] + 1);
  return contiguous
    ? `${sorted[0]}-${sorted[sorted.length - 1]}`
    : sorted.join(", ");
}

export function formatBibleReference(
  book: string,
  chapter: number,
  verses: number[],
) {
  if (!verses.length) return `${book} ${chapter}`;
  return `${book} ${chapter}:${formatVerseRange(verses)}`;
}

export function parseBibleReference(raw: string): ParsedBibleRef | null {
  const trimmed = raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^((?:[1-3]\s*)?[A-Za-z]+)\s*:\s*(\d)/, "$1 $2");
  const match = trimmed.match(
    /^(.*?)\s+(\d+)(?::(\d+)(?:\s*[-–—]\s*(\d+))?)?$/,
  );
  if (!match) return null;
  const book = findBibleBook(match[1]);
  if (!book) return null;
  const chapter = Number(match[2]);
  if (chapter < 1 || chapter > book.chapters) return null;
  if (!match[3]) return { book: book.name, chapter, verses: [] };
  const start = Number(match[3]);
  const end = match[4] ? Number(match[4]) : start;
  if (start < 1 || end < 1) return null;
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const verses: number[] = [];
  for (let n = lo; n <= hi; n += 1) verses.push(n);
  return { book: book.name, chapter, verses };
}

export type InlineBibleRef = {
  raw: string;
  index: number;
  length: number;
  parsed: ParsedBibleRef;
};

export function extractBibleReferences(text: string): InlineBibleRef[] {
  const source = mendWrappedRefs(text);
  const matches: InlineBibleRef[] = [];
  const pattern =
    /(?:[1-3]\s*)?[A-Za-z][A-Za-z.]{0,18}\s*:?\s*\d{1,3}\s*:\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const raw = match[0].replace(/^\s+|\s+$/g, "");
    const parsed = parseBibleReference(raw);
    if (!parsed) continue;
    matches.push({
      raw,
      index: match.index + match[0].indexOf(raw),
      length: raw.length,
      parsed,
    });
  }
  return matches;
}

export function mendWrappedRefs(text: string) {
  return text.replace(
    /((?:[1-3]\s*)?[A-Za-z][A-Za-z.]{0,18})\s*:?\s*[\n\r]+\s*(\d{1,3}\s*:\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?)/g,
    (full, book: string, rest: string) => {
      const name = book.replace(/:$/, "");
      if (!findBibleBook(name)) return full;
      return `${name} ${rest}`;
    },
  );
}

function chapterCacheKey(
  translation: FreeBibleTranslation,
  book: string,
  chapter: number,
) {
  return `bible-chapter:${translation}:${book}:${chapter}`;
}

async function fetchFromGithub(
  book: BibleBook,
  chapter: number,
  translation: FreeBibleTranslation,
): Promise<BibleVerse[]> {
  try {
    return await fetchGithubBibleChapter(book.name, chapter, translation);
  } catch (err) {
    throw err;
  }
}

export async function fetchBibleChapter(
  bookName: string,
  chapter: number,
  translation: FreeBibleTranslation,
  _signal?: AbortSignal,
  options?: { skipCache?: boolean },
): Promise<BibleChapter> {
  const book = findBibleBook(bookName);
  if (!book) throw new Error(`Unknown book: ${bookName}`);
  if (chapter < 1 || chapter > book.chapters) {
    throw new Error(`${book.name} has no chapter ${chapter}.`);
  }

  const cacheKey = chapterCacheKey(translation, book.name, chapter);
  if (!options?.skipCache) {
    const cached = await idbGet<BibleChapter>(cacheKey);
    if (cached?.verses?.length) return cached;
  }

  const verses = await fetchFromGithub(book, chapter, translation);

  const next: BibleChapter = {
    book: book.name,
    chapter,
    translation,
    verses,
  };
  if (!options?.skipCache) {
    await idbSet(cacheKey, next);
  }
  return next;
}

export function versesForRange(chapter: BibleChapter, verses: number[]) {
  if (!verses.length) return chapter.verses;
  const wanted = new Set(verses);
  return chapter.verses.filter((row) => wanted.has(row.verse));
}

export function joinVerseText(verses: BibleVerse[]) {
  return verses.map((row) => row.text).join(" ");
}

export function joinChapterText(verses: BibleVerse[]) {
  return verses.map((row) => `${row.verse} ${row.text}`).join("\n");
}

export function normalizeBibleTranslation(value: string): FreeBibleTranslation {
  const code = value.trim().toLowerCase();
  if (code === "web") return "niv";
  if (isFreeBibleTranslation(code)) return code;
  return "kjv";
}

export function isFreeBibleTranslation(
  value: string,
): value is FreeBibleTranslation {
  return value === "kjv" || value === "niv" || value === "ceb";
}
