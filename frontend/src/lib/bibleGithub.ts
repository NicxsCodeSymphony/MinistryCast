import { idbGet, idbSet } from "./offline/idb";
import type { BibleVerse, FreeBibleTranslation } from "./bible";
import { findBibleBook, BIBLE_BOOKS } from "./bible";

const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/Beblia/Holy-Bible-XML-Format/master";

const GITHUB_FILE_MAP: Record<FreeBibleTranslation, string> = {
  ceb: "Cebuano1999Bible.xml",
  kjv: "EnglishKJBible.xml",
  niv: "EnglishNIVBible.xml",
};

/** 
 * Cache for the entire Bible XML content to avoid repeated large downloads.
 * We store the parsed JSON structure in IndexedDB.
 */
const BIBLE_ID_CACHE_PREFIX = "github-bible-content:";

type CachedBible = {
  translation: FreeBibleTranslation;
  books: Record<number, Record<number, BibleVerse[]>>;
};

async function fetchGithubBible(translation: FreeBibleTranslation): Promise<CachedBible> {
  const cacheKey = `${BIBLE_ID_CACHE_PREFIX}${translation}`;
  const cached = await idbGet<CachedBible>(cacheKey);
  if (cached) return cached;

  const fileName = GITHUB_FILE_MAP[translation];
  const url = `${GITHUB_RAW_BASE}/${fileName}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not fetch ${translation} from GitHub (${res.status}).`);
  }
  const xmlText = await res.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");

  const bibleData: Record<number, Record<number, BibleVerse[]>> = {};

  const books = xmlDoc.getElementsByTagName("book");
  for (let i = 0; i < books.length; i++) {
    const bookEl = books[i];
    const bookNum = parseInt(bookEl.getAttribute("number") || "0", 10);
    if (!bookNum) continue;

    const chaptersMap: Record<number, BibleVerse[]> = {};
    const chapters = bookEl.getElementsByTagName("chapter");
    for (let j = 0; j < chapters.length; j++) {
      const chapterEl = chapters[j];
      const chapterNum = parseInt(chapterEl.getAttribute("number") || "0", 10);
      if (!chapterNum) continue;

      const versesList: BibleVerse[] = [];
      const verses = chapterEl.getElementsByTagName("verse");
      for (let k = 0; k < verses.length; k++) {
        const verseEl = verses[k];
        const verseNum = parseInt(verseEl.getAttribute("number") || "0", 10);
        const text = verseEl.textContent || "";
        if (verseNum && text) {
          versesList.push({ verse: verseNum, text: text.trim() });
        }
      }
      chaptersMap[chapterNum] = versesList;
    }
    bibleData[bookNum] = chaptersMap;
  }

  const result: CachedBible = {
    translation,
    books: bibleData,
  };

  await idbSet(cacheKey, result);
  return result;
}

export async function fetchGithubBibleChapter(
  bookName: string,
  chapter: number,
  translation: FreeBibleTranslation,
): Promise<BibleVerse[]> {
  const book = findBibleBook(bookName);
  if (!book) throw new Error(`Unknown book: ${bookName}`);

  const bible = await fetchGithubBible(translation);
  
  // Find book index (1-based)
  const bookIndex = BIBLE_BOOKS.findIndex(b => b.name === book.name) + 1;
  
  const chapters = bible.books[bookIndex];
  if (!chapters) {
    throw new Error(`Book ${bookName} not found in ${translation} (GitHub).`);
  }

  const verses = chapters[chapter];
  if (!verses) {
    throw new Error(`${bookName} ${chapter} not found in ${translation} (GitHub).`);
  }

  return verses;
}
