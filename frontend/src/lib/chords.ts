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
  /^([A-G](?:#|b)?)((?:maj|min|m|M|dim|aug|sus|add|no|7|9|11|13|6|5|2|4|°|ø|\+|-|#|b|\(|\))*)((?:\/[A-G](?:#|b)?)?)$/i;

/** Case-sensitive chord check for plain-text chord sheets (so lyric words like "am" don't count). */
const SHEET_CHORD =
  /^([A-G](?:#|b|♯|♭)?)((?:maj|min|m|M|dim|aug|sus|add|no|[0-9]|°|ø|Δ|\+|-|#|b|\(|\))*)(\/[A-G](?:#|b|♯|♭)?)?$/;

const SHEET_FILLER = /^(\||\|\||-+|\/|\*+|\.{2,}|x\d+|\(x?\d+x?\)|\d+x|N\.?C\.?|%)$/i;

const KEY_NAMES = [
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

export type Accidentals = "auto" | "flat" | "sharp";

const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** Write a chord's root and bass with sharps (`A#`) or flats (`Bb`); "auto" leaves it as is. */
export function spellChord(chord: string, accidentals: Accidentals) {
  if (accidentals === "auto") return chord;
  const match = chord.match(CHORD_TOKEN);
  if (!match) return chord;
  const names = accidentals === "sharp" ? SHARP_NAMES : FLAT_NAMES;
  const respell = (note: string) => {
    const idx =
      ENHARMONIC[note] ??
      ENHARMONIC[note.charAt(0).toUpperCase() + note.slice(1)] ??
      ENHARMONIC[note.replace("♯", "#").replace("♭", "b")];
    return idx === undefined ? note : names[idx];
  };
  const [, root, quality = "", bass = ""] = match;
  return `${respell(root)}${quality}${bass ? `/${respell(bass.slice(1))}` : ""}`;
}

/** Re-spell each chord on a chords-only line, keeping chords in their columns where they fit. */
function transposeChordLine(line: string, delta: number) {
  let out = "";
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line))) {
    const token = match[0];
    const chord = sheetChord(token);
    const next = chord ? token.replace(chord, transposeChordSymbol(chord, delta)) : token;
    const col = out.length && out.length >= match.index ? out.length + 1 : match.index;
    out = out.padEnd(col, " ") + next;
  }
  return out;
}

/** Transpose every [Chord] token and every chords-above-lyrics line. */
export function transposeChordProText(text: string, delta: number) {
  if (!delta || !text) return text;
  return text
    .split("\n")
    .map((line) => {
      const expanded = expandTabs(line);
      if (isChordOnlyLine(expanded)) return transposeChordLine(expanded, delta);
      return line.replace(/\[([^\]]+)\]/g, (full, inner: string) => {
        const trimmed = inner.trim();
        if (!trimmed || !isChordSymbol(trimmed)) return full;
        return `[${transposeChordSymbol(trimmed, delta)}]`;
      });
    })
    .join("\n");
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

export type ChordStack = { chord: string; text: string };

/** Pair each chord with the lyric text that follows it. */
export function chordStacks(line: string): ChordStack[] {
  const stacks: ChordStack[] = [];
  let pendingChord = "";
  for (const part of splitChordProLine(line)) {
    if (part.type === "chord") {
      if (pendingChord) stacks.push({ chord: pendingChord, text: "" });
      pendingChord = part.value;
      continue;
    }
    stacks.push({ chord: pendingChord, text: part.value });
    pendingChord = "";
  }
  if (pendingChord) stacks.push({ chord: pendingChord, text: "" });
  return stacks;
}

/**
 * Room a chord needs before the next one can start. Only applied where the lyric run ends at a
 * word break, so words are never split apart by a gap.
 */
export function chordStackMinWidth(stack: ChordStack, chordEm: number) {
  if (!stack.chord) return undefined;
  const atWordBreak = !stack.text || /\s$/.test(stack.text);
  if (!atWordBreak) return undefined;
  return `${(stack.chord.length * 0.62 + 0.5) * chordEm}em`;
}

function sheetChord(token: string) {
  const bare = token.replace(/^\((.+)\)$/, "$1").replace(/♯/g, "#").replace(/♭/g, "b");
  return SHEET_CHORD.test(bare) ? bare : null;
}

function expandTabs(line: string) {
  let out = "";
  for (const ch of line) {
    out += ch === "\t" ? " ".repeat(4 - (out.length % 4)) : ch;
  }
  return out;
}

/** A plain-text line made only of chords (plus bar lines / repeat marks), e.g. `D   G/B  A`. */
export function isChordOnlyLine(line: string) {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  let chords = 0;
  for (const token of tokens) {
    if (sheetChord(token)) chords += 1;
    else if (!SHEET_FILLER.test(token)) return false;
  }
  return chords > 0;
}

const SECTION_LABEL =
  /^\s*\[?\s*((?:intro|verse|pre[- ]?chorus|chorus|bridge|outro|tag|interlude|instrumental|ending|refrain|hook|coda|vamp|turnaround|break|solo)\b[^\]:]*?)\s*\]?\s*:?\s*$/i;

const SHEET_META = /^\s*(capo|tuning|key|tempo|bpm|time|time signature)\s*[:-]/i;

function chordLineInline(line: string) {
  return line
    .trim()
    .split(/(\s+)/)
    .map((token) => {
      const chord = sheetChord(token);
      return chord ? `[${chord}]` : token;
    })
    .join("");
}

function mergeChordsIntoLyric(chordLine: string, lyric: string) {
  const marks: { col: number; chord: string }[] = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(chordLine))) {
    const chord = sheetChord(match[0]);
    if (chord) marks.push({ col: match.index, chord });
  }
  let out = lyric;
  for (let index = marks.length - 1; index >= 0; index -= 1) {
    const { col, chord } = marks[index];
    if (col > out.length) out = out.padEnd(col, " ");
    out = `${out.slice(0, col)}[${chord}]${out.slice(col)}`;
  }
  return out.replace(/\s+$/, "");
}

/** Key name like the song form uses (flats, `m` suffix for minor) for a chord symbol. */
export function keyNameForChord(chord: string) {
  const match = chord.match(SHEET_CHORD);
  if (!match) return null;
  const root = ENHARMONIC[match[1]];
  if (root === undefined) return null;
  const minor = /^m(?!aj)/.test(match[2] ?? "") || /^min/.test(match[2] ?? "");
  return `${KEY_NAMES[root]}${minor ? "m" : ""}`;
}

/** True when pasted text looks like an Ultimate Guitar style sheet (chord lines above lyrics). */
export function looksLikeChordSheet(text: string) {
  return text.split(/\r?\n/).some((line) => isChordOnlyLine(expandTabs(line)));
}

function isSheetLyricLine(line: string | undefined) {
  return (
    line !== undefined &&
    line.trim() !== "" &&
    !isChordOnlyLine(expandTabs(line)) &&
    !isLyricSectionHeading(line) &&
    !SECTION_LABEL.test(line) &&
    !SHEET_META.test(line)
  );
}

/**
 * Clean up a pasted chords-over-lyrics sheet while keeping chord lines above the lyrics:
 * `Chorus:` becomes `[Chorus]`, Key/Capo/Tuning lines are dropped, tabs become spaces.
 * Returns the detected key (from a `Key:` line, else the first chord) so callers can transpose.
 */
export function tidyChordSheet(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map(expandTabs);
  const out: string[] = [];
  let detectedKey: string | null = null;
  let firstChord: string | null = null;

  for (const line of lines) {
    const keyLine = line.match(/^\s*key\s*[:-]\s*([A-G][#b♯♭]?m?)\b/i);
    if (keyLine) {
      detectedKey = keyNameForChord(keyLine[1].replace(/^[a-g]/, (c) => c.toUpperCase()));
      continue;
    }
    if (SHEET_META.test(line)) continue;
    if (isLyricSectionHeading(line)) {
      out.push(line.trim());
      continue;
    }
    if (isChordOnlyLine(line)) {
      if (!firstChord) {
        firstChord = line.trim().split(/\s+/).map(sheetChord).find(Boolean) ?? null;
      }
      out.push(line.replace(/\s+$/, ""));
      continue;
    }
    const section = line.match(SECTION_LABEL);
    if (section) {
      const label = section[1].trim();
      out.push(`[${label.charAt(0).toUpperCase()}${label.slice(1)}]`);
      continue;
    }
    out.push(line.replace(/\s+$/, ""));
  }

  return {
    text: out.join("\n").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\s+$/g, ""),
    key: detectedKey ?? (firstChord ? keyNameForChord(firstChord) : null),
  };
}

/** A sung line that can carry a chord line above it (not a heading, chord line, or blank). */
export function isChordableLyricLine(line: string) {
  return isSheetLyricLine(line);
}

/** Normalise a typed chord (`am7` → `Am7`, `d/f#` → `D/F#`); null when it isn't a chord. */
export function normalizeTypedChord(raw: string) {
  const typed = raw
    .trim()
    .replace(/^[a-g]/, (c) => c.toUpperCase())
    .replace(/\/([a-g])/, (_, c: string) => `/${c.toUpperCase()}`);
  return typed && sheetChord(typed) ? typed : null;
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SHARP_MAJOR_KEYS = new Set([2, 4, 6, 7, 9, 11]);

/** The six common chords of a key (I ii iii IV V vi, or i III iv v VI VII in minor). Defaults to C. */
export function diatonicChords(key: string | null | undefined) {
  const parsed = parseKeyRoot(key) ?? { index: 0, minor: false };
  const majorIndex = parsed.minor ? (parsed.index + 3) % 12 : parsed.index;
  const names = SHARP_MAJOR_KEYS.has(majorIndex) ? SHARP_NAMES : KEY_NAMES;
  const steps: [number, string, string][] = parsed.minor
    ? [[0, "m", "i"], [3, "", "III"], [5, "m", "iv"], [7, "m", "v"], [8, "", "VI"], [10, "", "VII"]]
    : [[0, "", "I"], [2, "m", "ii"], [4, "m", "iii"], [5, "", "IV"], [7, "", "V"], [9, "m", "vi"]];
  return steps.map(([step, quality, numeral]) => ({
    chord: `${names[(parsed.index + step) % 12]}${quality}`,
    numeral,
  }));
}

function chordMarks(line: string) {
  const marks: { col: number; token: string }[] = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line))) marks.push({ col: match.index, token: match[0] });
  return marks;
}

function chordLineAbove(lines: string[], lineIndex: number) {
  const above = lineIndex > 0 ? expandTabs(lines[lineIndex - 1]) : null;
  return above !== null && isChordOnlyLine(above) ? above : null;
}

/** The chord already sitting above column `col` of line `lineIndex`, if any. */
export function sheetChordAt(text: string, lineIndex: number, col: number) {
  const above = chordLineAbove(text.split("\n"), lineIndex);
  if (above === null) return null;
  const hit = chordMarks(above).find(
    (mark) => col >= mark.col && col < mark.col + Math.max(1, mark.token.length),
  );
  return hit ? hit.token : null;
}

/**
 * Put `chord` above column `col` of lyric line `lineIndex` (or remove it when `chord` is null),
 * creating or dropping the chord line as needed.
 */
export function placeSheetChord(
  text: string,
  lineIndex: number,
  col: number,
  chord: string | null,
) {
  const lines = text.split("\n");
  const above = chordLineAbove(lines, lineIndex);
  const marks = (above === null ? [] : chordMarks(above)).filter(
    (mark) => !(col >= mark.col && col < mark.col + Math.max(1, mark.token.length)),
  );
  if (chord) marks.push({ col, token: chord });
  marks.sort((a, b) => a.col - b.col);
  let line = "";
  for (const mark of marks) {
    const at = line.length && line.length >= mark.col ? line.length + 1 : mark.col;
    line = line.padEnd(at, " ") + mark.token;
  }
  if (above !== null) {
    if (line) lines[lineIndex - 1] = line;
    else lines.splice(lineIndex - 1, 1);
  } else if (line) {
    lines.splice(lineIndex, 0, line);
  }
  return lines.join("\n");
}

/** Every chord in the text, in order: chords-above-lyrics lines and inline [Chord] markers. */
function chordsInText(text: string) {
  const chords: string[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = expandTabs(raw);
    if (isChordOnlyLine(line)) {
      for (const token of line.trim().split(/\s+/)) {
        const chord = sheetChord(token);
        if (chord) chords.push(chord);
      }
      continue;
    }
    for (const match of line.matchAll(/\[([^\]]+)\]/g)) {
      const inner = match[1].trim();
      if (isChordSymbol(inner) && sheetChord(inner)) chords.push(sheetChord(inner)!);
    }
  }
  return chords;
}

/**
 * Best-guess key of the chords in a sheet (`Eb`, `Am`, …), or null when there are too few chords.
 * Scores each key by how many chords fit its scale, favouring the first and last chord as home.
 */
export function detectChordKey(text: string) {
  const chords = chordsInText(text).flatMap((chord) => {
    const match = chord.match(SHEET_CHORD);
    const root = match ? ENHARMONIC[match[1]] : undefined;
    if (!match || root === undefined) return [];
    const quality = match[2] ?? "";
    const kind = /^(dim|°|ø|m7b5)/.test(quality)
      ? "dim"
      : /^m(?!aj)|^min/.test(quality)
        ? "minor"
        : "major";
    return [{ root, kind }];
  });
  if (chords.length < 3) return null;

  const fits = (tonic: number, chord: { root: number; kind: string }) => {
    const step = (chord.root - tonic + 12) % 12;
    if (chord.kind === "major") return step === 0 || step === 5 || step === 7;
    if (chord.kind === "minor") return step === 2 || step === 4 || step === 9;
    return step === 11;
  };
  const isChord = (chord: { root: number; kind: string } | undefined, root: number, kind: string) =>
    Boolean(chord && chord.root === root && chord.kind === kind);
  const first = chords[0];
  const last = chords[chords.length - 1];

  let best = { tonic: 0, score: -Infinity };
  for (let tonic = 0; tonic < 12; tonic += 1) {
    let score = 0;
    for (const chord of chords) {
      if (fits(tonic, chord)) score += 1;
      else if (chord.kind !== "dim") score -= 0.5;
      if (isChord(chord, tonic, "major")) score += 0.3;
    }
    const relative = (tonic + 9) % 12;
    if (isChord(first, tonic, "major") || isChord(first, relative, "minor")) score += 2;
    if (isChord(last, tonic, "major") || isChord(last, relative, "minor")) score += 2;
    if (score > best.score) best = { tonic, score };
  }

  const relative = (best.tonic + 9) % 12;
  const count = (root: number, kind: string) =>
    chords.filter((chord) => isChord(chord, root, kind)).length;
  const minorHome =
    (isChord(first, relative, "minor") || isChord(last, relative, "minor")) &&
    !isChord(first, best.tonic, "major") &&
    count(relative, "minor") >= count(best.tonic, "major");
  return minorHome ? `${KEY_NAMES[relative]}m` : KEY_NAMES[best.tonic];
}

/** True when two key names share the same notes (same key, or relative major/minor). */
export function sameKeySignature(a: string | null | undefined, b: string | null | undefined) {
  const left = parseKeyRoot(a);
  const right = parseKeyRoot(b);
  if (!left || !right) return false;
  const major = (key: { index: number; minor: boolean }) => (key.minor ? (key.index + 3) % 12 : key.index);
  return major(left) === major(right);
}

/** Remove chord-only lines, leaving section headings and lyrics. */
export function stripChordLines(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => !isChordOnlyLine(expandTabs(line)))
    .join("\n");
}

function lyricMatchKey(line: string) {
  return line.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");
}

/** Move chord columns from `fromLyric` onto `toLyric`, which has the same letters but maybe different punctuation. */
function realignChordLine(chordLine: string, fromLyric: string, toLyric: string) {
  const letters = (text: string) =>
    [...text].flatMap((ch, index) => (/[\p{L}\p{N}]/u.test(ch) ? [index] : []));
  const from = letters(fromLyric);
  const to = letters(toLyric);
  if (from.length !== to.length) return chordLine;
  let out = "";
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(chordLine))) {
    const col = match.index;
    const k = from.findIndex((pos) => pos >= col);
    let next =
      k === -1
        ? toLyric.length + (col - fromLyric.length)
        : to[k] - (from[k] - col);
    next = Math.max(next, out.length ? out.length + 1 : 0);
    out = out.padEnd(next, " ") + match[0];
  }
  return out;
}

/**
 * Take the chord lines from a generated chart and place them above the matching lines of
 * `lyrics`, so the user's own wording is never changed. `matched` counts lines that got chords.
 */
export function applyChordChart(lyrics: string, chart: string) {
  const chartLines = chart.replace(/\r\n?/g, "\n").split("\n").map(expandTabs);
  const pairs: { chords: string; lyric: string }[] = [];
  for (let index = 0; index < chartLines.length; index += 1) {
    const line = chartLines[index];
    if (isChordOnlyLine(line)) {
      const next = chartLines[index + 1];
      if (isSheetLyricLine(next)) {
        pairs.push({ chords: line.replace(/\s+$/, ""), lyric: next! });
        index += 1;
      }
      continue;
    }
    if (isSheetLyricLine(line)) pairs.push({ chords: "", lyric: line });
  }

  const out: string[] = [];
  let cursor = 0;
  let matched = 0;
  for (const line of stripChordLines(lyrics).split("\n")) {
    if (isSheetLyricLine(line)) {
      const want = lyricMatchKey(line);
      const end = Math.min(pairs.length, cursor + 4);
      for (let look = cursor; look < end; look += 1) {
        if (lyricMatchKey(pairs[look].lyric) !== want) continue;
        if (pairs[look].chords) {
          out.push(realignChordLine(pairs[look].chords, pairs[look].lyric, expandTabs(line)));
          matched += 1;
        }
        cursor = look + 1;
        break;
      }
    }
    out.push(line);
  }
  return { text: out.join("\n"), matched };
}

/**
 * Fold chords-above-lyrics lines into inline [Chord] markers for display:
 *   `D        G`            →  `[D]Lord I've come to [G]touch`
 *   `Lord I've come to touch`
 * Every other line is left as it is.
 */
export function chordSheetToInline(text: string) {
  if (!text) return text;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = expandTabs(lines[index]);
    if (!isChordOnlyLine(line)) {
      out.push(lines[index]);
      continue;
    }
    const next = lines[index + 1];
    if (isSheetLyricLine(next)) {
      out.push(mergeChordsIntoLyric(line, expandTabs(next!)));
      index += 1;
    } else {
      out.push(chordLineInline(line));
    }
  }
  return out.join("\n");
}

/** Turn inline `[D]Lord I've [G]come` lines into a chord line above the lyric line. */
export function chordProToSheet(text: string) {
  return text
    .split("\n")
    .flatMap((line) => {
      if (isLyricSectionHeading(line) || !/\[[^\]]+\]/.test(line)) return [line];
      let lyric = "";
      let chords = "";
      let found = false;
      for (const part of splitChordProLine(line)) {
        if (part.type === "text") {
          lyric += part.value;
          continue;
        }
        if (!isChordSymbol(part.value)) {
          lyric += `[${part.value}]`;
          continue;
        }
        found = true;
        const col = chords.length && chords.length >= lyric.length ? chords.length + 1 : lyric.length;
        chords = chords.padEnd(col, " ") + part.value.trim();
      }
      if (!found) return [line];
      return lyric.trim() ? [chords, lyric.replace(/\s+$/, "")] : [chords];
    })
    .join("\n");
}

/** Build UG-like stacked chord + lyric rows for a section. */
export function chordProToDisplayLines(
  content: string,
  options?: { stripChords?: boolean; transposeDelta?: number },
) {
  const delta = options?.transposeDelta ?? 0;
  const source = chordSheetToInline(transposeChordProText(content, delta));
  if (options?.stripChords) {
    return source
      .split("\n")
      .map((line) => stripChordProMarkers(line))
      .filter((line) => line.length > 0);
  }
  return source.split("\n").filter((line) => line.length > 0);
}
