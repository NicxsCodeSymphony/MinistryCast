import { catalogFetch } from "./catalogFetch";

const LRCLIB_HEADERS = {
  "Lrclib-Client": "MinistryCast/0.1.0 (com.nicxs.frontend)",
  "X-User-Agent": "MinistryCast/0.1.0 (com.nicxs.frontend)",
};

type LrclibHit = {
  trackName?: string;
  artistName?: string;
  instrumental?: boolean;
  plainLyrics?: string | null;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreHit(hit: LrclibHit, title: string, artist: string) {
  const track = normalize(hit.trackName ?? "");
  const name = normalize(hit.artistName ?? "");
  const wantTitle = normalize(title);
  const wantArtist = normalize(artist);
  let score = 0;
  if (track === wantTitle) score += 120;
  else if (track.includes(wantTitle) || wantTitle.includes(track)) score += 50;
  if (name === wantArtist) score += 100;
  else if (name.includes(wantArtist) || wantArtist.includes(name)) score += 40;
  if (hit.instrumental) score -= 250;
  const lyrics = hit.plainLyrics?.trim() ?? "";
  if (!lyrics) score -= 120;
  else {
    score += Math.min(50, Math.round(lyrics.length / 60));
    score += Math.min(24, (lyrics.match(/\n\s*\n/g) ?? []).length * 2);
  }
  return score;
}

function cleanLyrics(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/^\s*\[(?:ar|ti|al|au|by|offset|length|re|ve|tool|lang|#)\s*:[^\]]*\]\s*$/gim, "")
    .replace(/^\s*\[?\d{1,2}:\d{2}(?:\.\d+)?\]\s*/gm, "")
    .replace(/^\s*\*+\s*this lyrics is not for commercial use.*$/gim, "")
    .replace(/^paroles de la chanson.*$/gim, "")
    .replace(/\[instrumental\]/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const HEADING =
  /^(?:\[|\()?\s*(verse|chorus|pre-?chorus|bridge|intro|outro|tag|hook|refrain|ending|interlude|vamp|coda|breakdown)\s*(\d+)?\s*(?:\]|\))?:?\s*$/i;

function canonicalHeading(kind: string, number?: string) {
  const key = kind.toLowerCase().replace(/\s+/g, "").replace("prechorus", "pre-chorus");
  const labels: Record<string, string> = {
    verse: "Verse",
    chorus: "Chorus",
    "pre-chorus": "Pre-Chorus",
    bridge: "Bridge",
    intro: "Intro",
    outro: "Outro",
    tag: "Tag",
    hook: "Hook",
    refrain: "Chorus",
    ending: "Ending",
    interlude: "Interlude",
    vamp: "Vamp",
    coda: "Coda",
    breakdown: "Breakdown",
  };
  const label = labels[key] ?? kind;
  return number ? `${label} ${number}` : label;
}

function convertPrintedHeadings(text: string) {
  return text
    .split("\n")
    .map((line) => {
      const match = line.trim().match(HEADING);
      if (!match) return line;
      return `[${canonicalHeading(match[1], match[2])}]`;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Comparable form of a sung line, ignoring ad-libs in parentheses. */
function lineKey(line: string) {
  return normalize(line.replace(/\([^)]*\)/g, " "));
}

function uniqueLines(stanza: string[]) {
  return [...new Set(stanza.map(lineKey).filter(Boolean))];
}

/** Same line, or nearly (one word swapped, e.g. "beautiful Name" → "wonderful Name"). */
function linesMatch(a: string, b: string) {
  if (a === b) return true;
  const wordsA = new Set(a.split(" "));
  const wordsB = new Set(b.split(" "));
  if (wordsA.size < 3 || wordsB.size < 3) return false;
  const shared = [...wordsA].filter((word) => wordsB.has(word)).length;
  return shared / (wordsA.size + wordsB.size - shared) >= 0.7;
}

function matchedShare(from: string[], into: string[]) {
  if (!from.length) return 0;
  return from.filter((line) => into.some((other) => linesMatch(line, other))).length / from.length;
}

/** 0–1: how much two stanzas share, measured against the bigger one so a short tag isn't a chorus. */
function stanzaSimilarity(a: string[], b: string[]) {
  const linesA = uniqueLines(a);
  const linesB = uniqueLines(b);
  if (!linesA.length || !linesB.length) return 0;
  const matched = linesA.filter((line) => linesB.some((other) => linesMatch(line, other))).length;
  return matched / Math.max(linesA.length, linesB.length);
}

/** Lyrics with no blank lines: cut them where a run of 3+ lines repeats (usually the chorus). */
function splitOnRepeatedRuns(lines: string[]) {
  const keys = lines.map(normalize);
  const maxRun = Math.min(8, Math.floor(lines.length / 2));
  for (let run = maxRun; run >= 3; run -= 1) {
    for (let start = 0; start + run <= lines.length; start += 1) {
      const window = keys.slice(start, start + run);
      if (window.some((key) => !key)) continue;
      const wanted = window.join("\n");
      const hits: number[] = [];
      for (let at = 0; at + run <= lines.length; ) {
        if (keys.slice(at, at + run).join("\n") === wanted) {
          hits.push(at);
          at += run;
        } else {
          at += 1;
        }
      }
      if (hits.length < 2) continue;
      const parts: string[][] = [];
      let cursor = 0;
      for (const hit of hits) {
        if (hit > cursor) parts.push(lines.slice(cursor, hit));
        parts.push(lines.slice(hit, hit + run));
        cursor = hit + run;
      }
      if (cursor < lines.length) parts.push(lines.slice(cursor));
      return parts;
    }
  }
  return [lines];
}

/** Label stanzas as Verse / Pre-Chorus / Chorus / Post-Chorus / Bridge / Outro from how they repeat. */
function labelStanzas(stanzas: string[][], title: string) {
  const count = stanzas.length;
  const group = new Array<number>(count).fill(-1);
  let groups = 0;
  for (let i = 0; i < count; i += 1) {
    if (group[i] !== -1) continue;
    group[i] = groups;
    for (let j = i + 1; j < count; j += 1) {
      if (group[j] === -1 && stanzaSimilarity(stanzas[i], stanzas[j]) >= 0.6) group[j] = groups;
    }
    groups += 1;
  }
  const times = (id: number) => group.filter((value) => value === id).length;
  /** Back-to-back repeats of the same stanza count as one occurrence. */
  const runs = (id: number) =>
    group.flatMap((value, index) =>
      value === id && group[index - 1] !== id ? [index] : [],
    );
  const ids = [...new Set(group)];
  const repeated = ids.filter((id) => times(id) >= 2);
  const titleKey = normalize(title);
  const score = (id: number) => {
    const text = normalize(stanzas[group.indexOf(id)].join(" "));
    const hasTitle = titleKey.length >= 3 && text.includes(titleKey);
    return runs(id).length * 10 + times(id) + (hasTitle ? 15 : 0);
  };
  const chorus = repeated.sort((a, b) => score(b) - score(a))[0] ?? -1;

  const chorusesBefore = (index: number) =>
    group.slice(0, index).filter((value) => value === chorus).length;
  const firstAt = (id: number) => group.indexOf(id);
  const runEnd = (start: number) => {
    let end = start;
    while (group[end + 1] === group[start]) end += 1;
    return end;
  };

  const role = new Map<number, string>();
  if (chorus !== -1) {
    role.set(chorus, "Chorus");
    const chorusLines = uniqueLines(stanzas[firstAt(chorus)]);
    for (const id of ids) {
      if (id === chorus) continue;
      const lines = uniqueLines(stanzas[firstAt(id)]);
      if (lines.length < chorusLines.length && matchedShare(lines, chorusLines) >= 0.6) {
        role.set(id, "Tag");
        continue;
      }
      if (times(id) < 2) continue;
      if (chorusesBefore(firstAt(id)) >= 2) {
        role.set(id, "Bridge");
        continue;
      }
      const starts = runs(id);
      const before = starts.filter((start) => group[runEnd(start) + 1] === chorus).length;
      const after = starts.filter((start) => group[start - 1] === chorus).length;
      if (before / starts.length >= 0.5) role.set(id, "Pre-Chorus");
      else if (after / starts.length >= 0.5) role.set(id, "Post-Chorus");
    }
  }

  const labels: string[] = [];
  const verseOf = new Map<number, number>();
  let verses = 0;
  let verseLength = 0;
  for (let index = 0; index < count; index += 1) {
    const id = group[index];
    const known = role.get(id);
    if (known) {
      labels.push(known);
      continue;
    }
    const lines = stanzas[index].length;
    const afterChoruses = chorus !== -1 && chorusesBefore(index) >= 2;
    const last = index === count - 1;
    if (last && chorus !== -1 && chorusesBefore(index) >= 1 && (lines <= 4 || labels.includes("Bridge"))) {
      labels.push("Outro");
      continue;
    }
    if (afterChoruses && !verseOf.has(id) && verseLength && Math.abs(lines - verseLength) >= 2) {
      labels.push("Bridge");
      continue;
    }
    if (!verseOf.has(id)) {
      verses += 1;
      verseOf.set(id, verses);
      if (!verseLength) verseLength = lines;
    }
    labels.push(`Verse ${verseOf.get(id)}`);
  }
  return labels;
}

function structureStanzas(text: string, title: string) {
  let stanzas = text
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim()))
    .filter((block) => block.length);
  if (stanzas.length === 1 && stanzas[0].length >= 8) stanzas = splitOnRepeatedRuns(stanzas[0]);
  stanzas = stanzas.reduce<string[][]>((kept, block) => {
    const adLibOnly = !uniqueLines(block).length;
    if (adLibOnly && kept.length) kept[kept.length - 1] = [...kept[kept.length - 1], ...block];
    else kept.push(block);
    return kept;
  }, []);
  const labels = labelStanzas(stanzas, title);
  return stanzas
    .map((block, index) => `[${labels[index]}]\n${block.join("\n")}`)
    .join("\n\n")
    .trim();
}

const SECTION_HEADING = /^\s*\[[^\]:]+\]\s*$/;

const FILLER_WORDS = new Set(["oh", "ohh", "ooh", "oooh", "yeah", "yeh", "hey", "whoa", "woah", "cause", "and", "yes"]);

/** A line's words without ad-libs and filler ("oh", "yeah", "come on"), for spotting repeats. */
function repeatKey(line: string) {
  return lineKey(line)
    .replace(/\bcome on\b/g, " ")
    .split(" ")
    .filter((word) => word && !FILLER_WORDS.has(word))
    .join(" ");
}

/** `A B A B` → `A B`: a block that is the same lines sung twice in a row (ad-lib lines ignored). */
function collapseDoubledBlock(lines: string[]): string[] {
  const sung = lines.filter((line) => repeatKey(line));
  if (sung.length < lines.length) {
    const collapsed = collapseDoubledBlock(sung);
    return collapsed.length < sung.length ? collapsed : lines;
  }
  const keys = lines.map(repeatKey);
  for (let size = Math.floor(lines.length / 2); size >= 1; size -= 1) {
    if (lines.length % size !== 0 || lines.length === size) continue;
    const first = keys.slice(0, size).join("\n");
    let repeats = true;
    for (let start = size; start < lines.length && repeats; start += size) {
      repeats = keys.slice(start, start + size).join("\n") === first;
    }
    if (repeats && size >= 2) return collapseDoubledBlock(lines.slice(0, size));
  }
  return lines;
}

/** Keep each section's words only once: a chorus sung again with the same lyrics is dropped. */
export function dropRepeatedSections(text: string) {
  const sections: { heading: string | null; body: string[] }[] = [];
  for (const line of text.split("\n")) {
    if (SECTION_HEADING.test(line)) {
      sections.push({ heading: line.trim(), body: [] });
      continue;
    }
    if (!sections.length) sections.push({ heading: null, body: [] });
    sections[sections.length - 1].body.push(line);
  }

  const seen = new Set<string>();
  /** Lines already shown under each kind of heading (Chorus, Bridge, …). */
  const linesByKind = new Map<string, Set<string>>();
  const kept: string[] = [];
  for (const section of sections) {
    const sung = section.body.filter((line) => line.trim());
    if (!sung.length) {
      if (section.heading) kept.push(section.heading);
      continue;
    }
    const body = collapseDoubledBlock(sung);
    const keys = body.map(repeatKey).filter(Boolean);
    const key = keys.join("\n");
    if (key && seen.has(key)) continue;

    const kind = (section.heading ?? "")
      .replace(/[[\]]/g, "")
      .replace(/\s*\d+\s*$/, "")
      .trim()
      .toLowerCase();
    const shown = kind ? linesByKind.get(kind) : undefined;
    const distinct = [...new Set(keys)];
    if (shown && distinct.length) {
      const repeated = distinct.filter((line) => shown.has(line)).length;
      if (repeated / distinct.length >= 0.6) continue;
    }

    if (key) seen.add(key);
    if (kind) {
      const set = linesByKind.get(kind) ?? new Set<string>();
      for (const line of distinct) set.add(line);
      linesByKind.set(kind, set);
    }
    kept.push([section.heading, ...body].filter(Boolean).join("\n"));
  }
  return kept.join("\n\n").trim();
}

export function formatFetchedLyrics(raw: string, title = "") {
  const cleaned = cleanLyrics(raw);
  if (!cleaned) return "";
  const lines = cleaned.split("\n");
  const hasBracketHeadings = lines.some((line) => SECTION_HEADING.test(line));
  const hasPrintedHeadings = lines.some((line) => HEADING.test(line.trim()));
  if (hasBracketHeadings || hasPrintedHeadings) {
    return dropRepeatedSections(convertPrintedHeadings(cleaned));
  }
  return dropRepeatedSections(structureStanzas(cleaned, title));
}

async function searchLrclib(
  title: string,
  artist: string,
  signal?: AbortSignal,
): Promise<LrclibHit[]> {
  const url = new URL("https://lrclib.net/api/search");
  url.searchParams.set("track_name", title);
  url.searchParams.set("artist_name", artist);
  const response = await catalogFetch(url.toString(), {
    headers: LRCLIB_HEADERS,
    signal,
  });
  if (response.status === 429) {
    throw new Error("Lyrics lookup is busy. Wait a moment and try again.");
  }
  if (!response.ok) return [];
  const data = (await response.json()) as LrclibHit[];
  return Array.isArray(data) ? data : [];
}

async function searchLrclibQuery(
  title: string,
  artist: string,
  signal?: AbortSignal,
): Promise<LrclibHit[]> {
  const url = new URL("https://lrclib.net/api/search");
  url.searchParams.set("q", `${title} ${artist}`.trim());
  const response = await catalogFetch(url.toString(), {
    headers: LRCLIB_HEADERS,
    signal,
  });
  if (!response.ok) return [];
  const data = (await response.json()) as LrclibHit[];
  return Array.isArray(data) ? data : [];
}

async function searchLyricsOvh(title: string, artist: string, signal?: AbortSignal) {
  const response = await catalogFetch(
    `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
    { signal },
  );
  if (!response.ok) return "";
  const data = (await response.json()) as { lyrics?: string };
  return data.lyrics?.trim() ?? "";
}

function pickBest(hits: LrclibHit[], title: string, artist: string) {
  const ranked = hits
    .map((hit) => ({ hit, score: scoreHit(hit, title, artist) }))
    .filter((row) => row.hit.plainLyrics?.trim() && row.score >= 40)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.hit.plainLyrics?.match(/\n\s*\n/g)?.length ?? 0) -
          (a.hit.plainLyrics?.match(/\n\s*\n/g)?.length ?? 0) ||
        (b.hit.plainLyrics?.length ?? 0) - (a.hit.plainLyrics?.length ?? 0),
    );
  return ranked[0]?.hit.plainLyrics?.trim() ?? "";
}

export type SingerSuggestion = {
  artist: string;
  title: string;
  /** Formatted lyrics when the catalog already has them, otherwise "". */
  lyrics: string;
  cover?: string;
};

type DeezerSuggestion = {
  title?: string;
  title_short?: string;
  artist?: { name?: string };
  album?: { cover_small?: string };
};

async function searchLrclibTitle(title: string, signal?: AbortSignal) {
  const url = new URL("https://lrclib.net/api/search");
  url.searchParams.set("track_name", title);
  const response = await catalogFetch(url.toString(), {
    headers: LRCLIB_HEADERS,
    signal,
  });
  if (!response.ok) return [];
  const data = (await response.json()) as LrclibHit[];
  return Array.isArray(data) ? data : [];
}

/** lyrics.ovh proxies Deezer search, which is ordered by popularity. */
async function suggestFromLyricsOvh(title: string, signal?: AbortSignal) {
  const response = await catalogFetch(
    `https://api.lyrics.ovh/suggest/${encodeURIComponent(title)}`,
    { signal },
  );
  if (!response.ok) return [];
  const data = (await response.json()) as { data?: DeezerSuggestion[] };
  return Array.isArray(data?.data) ? data.data : [];
}

function sameSong(candidate: string, wanted: string) {
  if (/\b(?:instrumental|karaoke|backing track|playback)\b/i.test(candidate)) return false;
  const name = normalize(candidate);
  if (!name) return false;
  if (name.replace(/ /g, "") === wanted.replace(/ /g, "")) return true;
  return name.startsWith(`${wanted} `) || wanted.startsWith(`${name} `);
}

function artistKey(name: string) {
  return normalize(name.replace(/\s+(?:feat\.?|ft\.?|featuring)\s.*$/i, ""));
}

/** Who sings a song with this title, most popular first, with lyrics attached when available. */
export async function suggestSongArtists(
  title: string,
  signal?: AbortSignal,
): Promise<SingerSuggestion[]> {
  const track = title.trim();
  if (track.length < 2) return [];
  const wanted = normalize(track);
  const [deezer, lrclib] = await Promise.allSettled([
    suggestFromLyricsOvh(track, signal),
    searchLrclibTitle(track, signal),
  ]);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  if (deezer.status === "rejected" && lrclib.status === "rejected") {
    throw deezer.reason instanceof Error
      ? deezer.reason
      : new Error("Could not look up singers right now.");
  }

  const withLyrics = new Map<string, { artist: string; title: string; lyrics: string; score: number }>();
  for (const hit of lrclib.status === "fulfilled" ? lrclib.value : []) {
    const lyrics = hit.plainLyrics?.trim() ?? "";
    if (hit.instrumental || !lyrics || !hit.artistName || !hit.trackName) continue;
    if (!sameSong(hit.trackName, wanted)) continue;
    const key = artistKey(hit.artistName);
    const score = scoreHit(hit, track, hit.artistName);
    const prev = withLyrics.get(key);
    if (!prev || score > prev.score) {
      withLyrics.set(key, { artist: hit.artistName, title: hit.trackName, lyrics, score });
    }
  }

  const out: SingerSuggestion[] = [];
  const seen = new Set<string>();
  for (const row of deezer.status === "fulfilled" ? deezer.value : []) {
    const artist = row.artist?.name?.trim() ?? "";
    const songTitle = (row.title_short || row.title || "")
      .replace(/\s*[([][^)\]]*\b(?:live|acoustic|remaster(?:ed)?|version|edit|radio|feat\.?|ft\.?)\b[^)\]]*[)\]]\s*$/i, "")
      .trim();
    if (!artist || !songTitle || !sameSong(songTitle, wanted)) continue;
    const key = artistKey(artist);
    if (seen.has(key)) continue;
    seen.add(key);
    const match = withLyrics.get(key);
    out.push({
      artist,
      title: match?.title ?? songTitle,
      lyrics: match ? formatFetchedLyrics(match.lyrics, track) : "",
      cover: row.album?.cover_small,
    });
  }
  const rest = [...withLyrics.entries()].sort((a, b) => b[1].score - a[1].score);
  for (const [key, match] of rest) {
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      artist: match.artist,
      title: match.title,
      lyrics: formatFetchedLyrics(match.lyrics, track),
    });
  }
  return out.slice(0, 8);
}

export async function lookupSongLyrics(
  title: string,
  artist: string,
  signal?: AbortSignal,
) {
  const track = title.trim();
  const singer = artist.trim();
  if (!track || !singer) {
    throw new Error("Add a song title and artist first.");
  }

  const primary = await searchLrclib(track, singer, signal);
  let lyrics = pickBest(primary, track, singer);
  if (!lyrics) {
    lyrics = pickBest(await searchLrclibQuery(track, singer, signal), track, singer);
  }
  if (!lyrics) {
    lyrics = await searchLyricsOvh(track, singer, signal);
  }
  const formatted = formatFetchedLyrics(lyrics, track);
  if (!formatted) {
    throw new Error("No lyrics found for that title and artist.");
  }
  return formatted;
}
