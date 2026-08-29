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

function structureStanzas(text: string) {
  const stanzas = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (stanzas.length <= 1) return `[Verse 1]\n${text}`;

  const firstLines = stanzas.map((block) => normalize(block.split("\n")[0] ?? ""));
  const counts = new Map<string, number>();
  for (const line of firstLines) {
    if (line.length < 12) continue;
    counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  const chorusLine = [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0]?.[0];

  const out: string[] = [];
  let verse = 0;
  for (let index = 0; index < stanzas.length; index += 1) {
    if (chorusLine && firstLines[index] === chorusLine) {
      out.push("[Chorus]", stanzas[index], "");
      continue;
    }
    verse += 1;
    out.push(`[Verse ${verse}]`, stanzas[index], "");
  }
  return out.join("\n").trim();
}

export function formatFetchedLyrics(raw: string) {
  const cleaned = cleanLyrics(raw);
  if (!cleaned) return "";
  const lines = cleaned.split("\n");
  const hasBracketHeadings = lines.some((line) => /^\s*\[[^\]]+\]\s*$/.test(line));
  const hasPrintedHeadings = lines.some((line) => HEADING.test(line.trim()));
  if (hasBracketHeadings || hasPrintedHeadings) return convertPrintedHeadings(cleaned);
  return structureStanzas(cleaned);
}

async function searchLrclib(
  title: string,
  artist: string,
  signal?: AbortSignal,
): Promise<LrclibHit[]> {
  const url = new URL("https://lrclib.net/api/search");
  url.searchParams.set("track_name", title);
  url.searchParams.set("artist_name", artist);
  const response = await fetch(url, { headers: LRCLIB_HEADERS, signal });
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
  const response = await fetch(url, { headers: LRCLIB_HEADERS, signal });
  if (!response.ok) return [];
  const data = (await response.json()) as LrclibHit[];
  return Array.isArray(data) ? data : [];
}

async function searchLyricsOvh(title: string, artist: string, signal?: AbortSignal) {
  const response = await fetch(
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
  const formatted = formatFetchedLyrics(lyrics);
  if (!formatted) {
    throw new Error("No lyrics found for that title and artist.");
  }
  return formatted;
}
