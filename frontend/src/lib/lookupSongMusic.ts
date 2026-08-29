const CLIENT = "MinistryCast/0.1.0 (com.nicxs.frontend)";

const KEYS = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

const SIGNATURES = ["4/4", "3/4", "6/8", "2/4", "5/4"] as const;

export type SongMusicMeta = {
  bpm: string | null;
  key: string | null;
  signature: string | null;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(title: string) {
  return title.replace(/\s*[\(\[][^)\]]*[\)\]]\s*/g, " ").replace(/\s+/g, " ").trim();
}

function mapKey(raw: string | null | undefined) {
  if (!raw) return null;
  let text = raw
    .trim()
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/\b(major|minor|maj|min)\b/gi, "")
    .trim();
  text = text.replace(/m$/i, "").trim();
  const match = text.match(/^([A-Ga-g])\s*(#|b)?/);
  if (!match) return null;
  let note = match[1].toUpperCase() + (match[2] ?? "");
  const sharps: Record<string, string> = {
    "C#": "Db",
    "D#": "Eb",
    "F#": "Gb",
    "G#": "Ab",
    "A#": "Bb",
  };
  if (sharps[note]) note = sharps[note];
  return (KEYS as readonly string[]).includes(note) ? note : null;
}

function mapSignature(raw: string | null | undefined) {
  if (!raw) return null;
  const text = raw.trim().replace(/\s+/g, "");
  const aliases: Record<string, string> = {
    "4/4": "4/4",
    "4": "4/4",
    "44": "4/4",
    "3/4": "3/4",
    "3": "3/4",
    "34": "3/4",
    "6/8": "6/8",
    "68": "6/8",
    "2/4": "2/4",
    "2": "2/4",
    "5/4": "5/4",
    "5": "5/4",
  };
  const mapped = aliases[text] ?? text;
  return (SIGNATURES as readonly string[]).includes(mapped) ? mapped : null;
}

function mapBpm(raw: unknown) {
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string"
        ? Number.parseFloat(raw)
        : Number.NaN;
  if (!Number.isFinite(value) || value < 40 || value > 240) return null;
  let bpm = Math.round(value);
  if (bpm > 160) bpm = Math.round(bpm / 2);
  if (bpm < 50) bpm *= 2;
  return String(bpm);
}

type AudioDbTrack = {
  strTrack?: string;
  strArtist?: string;
  intTempo?: string | number | null;
  strKey?: string | null;
  strTimeSignature?: string | null;
  strMusicBrainzID?: string | null;
};

type MbRecording = {
  id: string;
  title?: string;
  "artist-credit"?: { name?: string; artist?: { name?: string } }[];
};

type AbDoc = {
  rhythm?: { bpm?: number };
  tonal?: { key_key?: string; key_scale?: string };
  metadata?: { tags?: Record<string, string[] | string | undefined> };
};

async function fetchJson<T>(url: string, signal: AbortSignal | undefined, headers?: HeadersInit) {
  const response = await fetch(url, { signal, headers });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

async function searchAudioDb(title: string, artist: string, signal?: AbortSignal) {
  const url = new URL("https://www.theaudiodb.com/api/v1/json/2/searchtrack.php");
  url.searchParams.set("s", artist);
  url.searchParams.set("t", title);
  const data = await fetchJson<{ track?: AudioDbTrack[] | null }>(url.toString(), signal);
  const tracks = data?.track;
  if (!tracks?.length) return null;
  const wantTitle = normalize(title);
  const wantArtist = normalize(artist);
  return [...tracks].sort((a, b) => {
    const aScore =
      (normalize(a.strTrack ?? "") === wantTitle ? 2 : 0) +
      (normalize(a.strArtist ?? "") === wantArtist ? 2 : 0);
    const bScore =
      (normalize(b.strTrack ?? "") === wantTitle ? 2 : 0) +
      (normalize(b.strArtist ?? "") === wantArtist ? 2 : 0);
    return bScore - aScore;
  })[0];
}

async function searchMusicBrainz(title: string, artist: string, signal?: AbortSignal) {
  const url = new URL("https://musicbrainz.org/ws/2/recording");
  url.searchParams.set("query", `recording:"${title}" AND artist:"${artist}"`);
  url.searchParams.set("fmt", "json");
  url.searchParams.set("limit", "8");
  const headers = {
    Accept: "application/json",
    "User-Agent": CLIENT,
    "X-User-Agent": CLIENT,
  };
  let data = await fetchJson<{ recordings?: MbRecording[]; error?: string }>(
    url.toString(),
    signal,
    headers,
  );
  if (!data?.recordings?.length) {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 700));
    if (signal?.aborted) return [];
    data = await fetchJson<{ recordings?: MbRecording[] }>(url.toString(), signal, headers);
  }
  return data?.recordings ?? [];
}

async function acousticBrainz(mbid: string, signal?: AbortSignal) {
  const url = new URL(`https://acousticbrainz.org/api/v1/${mbid}/low-level`);
  url.searchParams.set(
    "features",
    "rhythm.bpm;tonal.key_key;tonal.key_scale;metadata.tags",
  );
  const data = await fetchJson<AbDoc>(url.toString(), signal, {
    "X-User-Agent": CLIENT,
  });
  if (!data?.rhythm && !data?.tonal && !data?.metadata) return null;
  return data;
}

function tagValue(
  tags: Record<string, string[] | string | undefined> | undefined,
  name: string,
) {
  if (!tags) return null;
  const match = Object.entries(tags).find(([key]) => key.toLowerCase() === name);
  const value = match?.[1];
  if (Array.isArray(value)) return value[0] ?? null;
  return typeof value === "string" ? value : null;
}

function fromAudioDb(track: AudioDbTrack): SongMusicMeta {
  return {
    bpm: mapBpm(track.intTempo),
    key: mapKey(track.strKey),
    signature: mapSignature(track.strTimeSignature),
  };
}

function fromAcousticBrainz(doc: AbDoc): SongMusicMeta {
  const tags = doc.metadata?.tags;
  return {
    bpm: mapBpm(tagValue(tags, "bpm")) ?? mapBpm(doc.rhythm?.bpm),
    key: mapKey(tagValue(tags, "initialkey")) ?? mapKey(tagValue(tags, "key")) ?? mapKey(doc.tonal?.key_key),
    signature:
      mapSignature(tagValue(tags, "time_signature")) ??
      mapSignature(tagValue(tags, "timesignature")),
  };
}

function mergeMeta(parts: SongMusicMeta[]): SongMusicMeta {
  return {
    bpm: parts.find((part) => part.bpm)?.bpm ?? null,
    key: parts.find((part) => part.key)?.key ?? null,
    signature: parts.find((part) => part.signature)?.signature ?? null,
  };
}

function artistNames(recording: MbRecording) {
  return (recording["artist-credit"] ?? [])
    .map((row) => row.name || row.artist?.name || "")
    .filter(Boolean)
    .join(" ");
}

export async function lookupSongMusic(
  title: string,
  artist: string,
  signal?: AbortSignal,
): Promise<SongMusicMeta> {
  const track = title.trim();
  const singer = artist.trim();
  if (!track || !singer) {
    throw new Error("Add a song title and artist first.");
  }

  const titles = [...new Set([track, cleanTitle(track)].filter(Boolean))];
  const artists = [...new Set([singer, singer.replace(/\s+worship$/i, "").trim()].filter(Boolean))];

  let tadb: AudioDbTrack | null = null;
  for (const nextTitle of titles) {
    for (const nextArtist of artists) {
      tadb = await searchAudioDb(nextTitle, nextArtist, signal);
      if (tadb) break;
    }
    if (tadb) break;
  }

  const collected: SongMusicMeta[] = [];
  if (tadb) collected.push(fromAudioDb(tadb));

  const mbids: string[] = [];
  if (tadb?.strMusicBrainzID) mbids.push(tadb.strMusicBrainzID);

  const missing = () => {
    const merged = mergeMeta(collected);
    return !merged.bpm || !merged.key || !merged.signature;
  };

  if (missing()) {
    for (const nextTitle of titles) {
      const recordings = await searchMusicBrainz(nextTitle, singer, signal);
      const wantTitle = normalize(nextTitle);
      const wantArtist = normalize(singer);
      const ranked = recordings
        .map((row) => {
          const recTitle = normalize(row.title ?? "");
          const recArtist = normalize(artistNames(row));
          let score = 0;
          if (recTitle === wantTitle) score += 5;
          else if (recTitle.includes(wantTitle) || wantTitle.includes(recTitle)) score += 2;
          if (recArtist.includes(wantArtist) || wantArtist.includes(recArtist)) score += 4;
          return { row, score };
        })
        .filter((row) => row.score >= 4)
        .sort((a, b) => b.score - a.score);
      for (const hit of ranked.slice(0, 4)) {
        if (!mbids.includes(hit.row.id)) mbids.push(hit.row.id);
      }
      if (mbids.length) break;
    }
  }

  for (const mbid of mbids.slice(0, 4)) {
    if (!missing()) break;
    const doc = await acousticBrainz(mbid, signal);
    if (doc) collected.push(fromAcousticBrainz(doc));
  }

  const result = mergeMeta(collected);
  if (!result.bpm && !result.key && !result.signature) {
    throw new Error("No BPM, key, or time signature found for that song.");
  }
  return result;
}
