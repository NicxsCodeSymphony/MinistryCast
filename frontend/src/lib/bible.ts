import { idbGet, idbSet } from "./offline/idb";

export type FreeBibleTranslation = "kjv" | "web" | "ceb";

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
  { value: "ceb", label: "Bisaya" },
  { value: "kjv", label: "English (KJV)" },
  { value: "web", label: "English (WEB)" },
];

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

const HELLOAO_BOOK: Record<string, string> = {
  Genesis: "GEN",
  Exodus: "EXO",
  Leviticus: "LEV",
  Numbers: "NUM",
  Deuteronomy: "DEU",
  Joshua: "JOS",
  Judges: "JDG",
  Ruth: "RUT",
  "1 Samuel": "1SA",
  "2 Samuel": "2SA",
  "1 Kings": "1KI",
  "2 Kings": "2KI",
  "1 Chronicles": "1CH",
  "2 Chronicles": "2CH",
  Ezra: "EZR",
  Nehemiah: "NEH",
  Esther: "EST",
  Job: "JOB",
  Psalms: "PSA",
  Proverbs: "PRO",
  Ecclesiastes: "ECC",
  "Song of Solomon": "SNG",
  Isaiah: "ISA",
  Jeremiah: "JER",
  Lamentations: "LAM",
  Ezekiel: "EZK",
  Daniel: "DAN",
  Hosea: "HOS",
  Joel: "JOL",
  Amos: "AMO",
  Obadiah: "OBA",
  Jonah: "JON",
  Micah: "MIC",
  Nahum: "NAM",
  Habakkuk: "HAB",
  Zephaniah: "ZEP",
  Haggai: "HAG",
  Zechariah: "ZEC",
  Malachi: "MAL",
  Matthew: "MAT",
  Mark: "MRK",
  Luke: "LUK",
  John: "JHN",
  Acts: "ACT",
  Romans: "ROM",
  "1 Corinthians": "1CO",
  "2 Corinthians": "2CO",
  Galatians: "GAL",
  Ephesians: "EPH",
  Philippians: "PHP",
  Colossians: "COL",
  "1 Thessalonians": "1TH",
  "2 Thessalonians": "2TH",
  "1 Timothy": "1TI",
  "2 Timothy": "2TI",
  Titus: "TIT",
  Philemon: "PHM",
  Hebrews: "HEB",
  James: "JAS",
  "1 Peter": "1PE",
  "2 Peter": "2PE",
  "1 John": "1JN",
  "2 John": "2JN",
  "3 John": "3JN",
  Jude: "JUD",
  Revelation: "REV",
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

function cleanVerseText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

type BibleApiVerse = {
  verse?: number;
  text?: string;
};

type BibleApiChapter = {
  verses?: BibleApiVerse[];
};

async function fetchFromBibleApi(
  book: BibleBook,
  chapter: number,
  translation: FreeBibleTranslation,
  signal?: AbortSignal,
): Promise<BibleVerse[]> {
  const apiBook = book.apiName ?? book.name;
  const url = `https://bible-api.com/${encodeURIComponent(`${apiBook} ${chapter}`)}?translation=${translation}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Could not load ${book.name} ${chapter}.`);
  }
  const data = (await res.json()) as BibleApiChapter;
  const verses = (data.verses ?? [])
    .map((row) => ({
      verse: Number(row.verse),
      text: cleanVerseText(String(row.text ?? "")),
    }))
    .filter((row) => row.verse > 0 && row.text);
  if (!verses.length) {
    throw new Error(`No verses found for ${book.name} ${chapter}.`);
  }
  return verses;
}

async function fetchFromHelloao(
  book: BibleBook,
  chapter: number,
  signal?: AbortSignal,
): Promise<BibleVerse[]> {
  const usfm = HELLOAO_BOOK[book.name];
  if (!usfm) throw new Error(`Could not load ${book.name} ${chapter}.`);
  const url = `https://bible.helloao.org/api/ceb_ulb/${usfm}/${chapter}.json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Could not load ${book.name} ${chapter}.`);
  const data = (await res.json()) as {
    chapter?: { content?: { type?: string; number?: number; content?: unknown }[] };
  };
  const verses: BibleVerse[] = [];
  for (const block of data.chapter?.content ?? []) {
    if (block.type !== "verse" || !block.number) continue;
    const text = flattenHelloao(block.content);
    if (!text) continue;
    verses.push({ verse: block.number, text: cleanVerseText(text) });
  }
  if (!verses.length) {
    throw new Error(`No verses found for ${book.name} ${chapter}.`);
  }
  return verses;
}

function flattenHelloao(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenHelloao).join("");
  if (value && typeof value === "object" && "text" in value) {
    return String((value as { text?: string }).text ?? "");
  }
  return "";
}

export async function fetchBibleChapter(
  bookName: string,
  chapter: number,
  translation: FreeBibleTranslation,
  signal?: AbortSignal,
): Promise<BibleChapter> {
  const book = findBibleBook(bookName);
  if (!book) throw new Error(`Unknown book: ${bookName}`);
  if (chapter < 1 || chapter > book.chapters) {
    throw new Error(`${book.name} has no chapter ${chapter}.`);
  }

  const cacheKey = chapterCacheKey(translation, book.name, chapter);
  const cached = await idbGet<BibleChapter>(cacheKey);
  if (cached?.verses?.length) return cached;

  const verses =
    translation === "ceb"
      ? await fetchFromHelloao(book, chapter, signal)
      : await fetchFromBibleApi(book, chapter, translation, signal);
  const next: BibleChapter = {
    book: book.name,
    chapter,
    translation,
    verses,
  };
  await idbSet(cacheKey, next);
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

export function isFreeBibleTranslation(
  value: string,
): value is FreeBibleTranslation {
  return value === "kjv" || value === "web" || value === "ceb";
}
