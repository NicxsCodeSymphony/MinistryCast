/** ChordPro-style helpers: [Am], [G/B], [F#m7], [Bbmaj7], etc. */

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "Eb",
  "E",
  "F",
  "F#",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
] as const;

const ENHARMONIC: Record<string, number> = {
  C: 0,
  "B#": 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  F: 5,
  "E#": 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
};

const CHORD_TOKEN =
  /^([A-G](?:#|b)?)((?:maj|min|m|dim|aug|sus|add|maj7|m7|7|9|11|13|6|2|4|°|ø|°)*)((?:\/[A-G](?:#|b)?)?)$/i;

/** True when `inner` looks like a ChordPro chord (C, Am7, G/B), not a section label. */
export function isChordSymbol(inner: string) {
  return CHORD_TOKEN.test(inner.trim());
}

/**
 * A lyric section heading is a whole line like `[Verse 1]` / `[Chorus]`.
 * Chord markers like `[C]` or `[G/B]` on their own line stay in the lyric body.
 */
export function isLyricSectionHeading(line: string) {
  const match = line.trim().match(/^\[([^\]]+)\]\s*$/);
  if (!match) return false;
  return !isChordSymbol(match[1]);
}

export function parseKeyRoot(key: string | null | undefined) {
  const raw = (key ?? "").trim();
  if (!raw) return null;
  const minor = /m$/i.test(raw) && !/^maj/i.test(raw.slice(1));
  const root = raw.replace(/m$/i, "");
  const idx = ENHARMONIC[root] ?? ENHARMONIC[root.replace("♯", "#").replace("♭", "b")];
  if (idx === undefined) return null;
  return { index: idx, minor };
}

export function keySemitoneDelta(
  fromKey: string | null | undefined,
  toKey: string | null | undefined,
) {
  const from = parseKeyRoot(fromKey);
  const to = parseKeyRoot(toKey);
  if (!from || !to) return 0;
  return (to.index - from.index + 12) % 12;
}

function transposeNote(note: string, delta: number) {
  const idx = ENHARMONIC[note] ?? ENHARMONIC[note.replace("♯", "#").replace("♭", "b")];
  if (idx === undefined) return note;
  return NOTE_NAMES[(idx + delta + 120) % 12];
}

export function transposeChordSymbol(chord: string, delta: number) {
  if (!delta) return chord;
  const match = chord.match(CHORD_TOKEN);
  if (!match) return chord;
  const [, root, quality = "", bass = ""] = match;
  const nextRoot = transposeNote(root, delta);
  const nextBass = bass
    ? `/${transposeNote(bass.slice(1), delta)}`
    : "";
  return `${nextRoot}${quality}${nextBass}`;
}

/** Transpose every [Chord] token in ChordPro / lyric text. */
export function transposeChordProText(text: string, delta: number) {
  if (!delta || !text) return text;
  return text.replace(/\[([^\]]+)\]/g, (_full, inner: string) => {
    const trimmed = inner.trim();
    if (!trimmed) return `[${inner}]`;
    return `[${transposeChordSymbol(trimmed, delta)}]`;
  });
}

export function stripChordProMarkers(text: string) {
  return text.replace(/\[([^\]]*)\]/g, "").replace(/[ \t]+\n/g, "\n").trim();
}

export type ChordLinePart =
  | { type: "text"; value: string }
  | { type: "chord"; value: string };

/** Split a line into alternating text/chord parts for UG-style display. */
export function splitChordProLine(line: string): ChordLinePart[] {
  const parts: ChordLinePart[] = [];
  const re = /\[([^\]]*)\]/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line))) {
    if (match.index > last) {
      parts.push({ type: "text", value: line.slice(last, match.index) });
    }
    parts.push({ type: "chord", value: match[1] });
    last = match.index + match[0].length;
  }
  if (last < line.length) {
    parts.push({ type: "text", value: line.slice(last) });
  }
  return parts.length ? parts : [{ type: "text", value: line }];
}

/** Build UG-like stacked chord + lyric rows for a section. */
export function chordProToDisplayLines(
  content: string,
  options?: { stripChords?: boolean; transposeDelta?: number },
) {
  const delta = options?.transposeDelta ?? 0;
  const source = transposeChordProText(content, delta);
  if (options?.stripChords) {
    return source
      .split("\n")
      .map((line) => stripChordProMarkers(line))
      .filter((line) => line.length > 0);
  }
  return source.split("\n").filter((line) => line.length > 0);
}
