import { parseKeyRoot, spellChord, transposeChordSymbol, type Accidentals } from "./chords";

export type ChordDisplay = {
  show: boolean;
  /** "auto" follows the stage background; otherwise a CSS color. */
  color: string;
  /** Chord size as a percent of the lyric size. */
  size: number;
  /** Write chords with flats (Bb), sharps (A#), or as saved. */
  accidentals: Accidentals;
  /** Semitones per setlist item. */
  transpose: Record<string, number>;
};

export const DEFAULT_CHORD_DISPLAY: ChordDisplay = {
  show: true,
  color: "auto",
  size: 55,
  accidentals: "auto",
  transpose: {},
};

export const CHORD_COLORS = [
  { id: "auto", label: "Auto", swatch: "linear-gradient(135deg,#fde68a 50%,#6366f1 50%)" },
  { id: "#fde68a", label: "Gold", swatch: "#fde68a" },
  { id: "#7dd3fc", label: "Sky", swatch: "#7dd3fc" },
  { id: "#86efac", label: "Green", swatch: "#86efac" },
  { id: "#f9a8d4", label: "Pink", swatch: "#f9a8d4" },
  { id: "#fca5a5", label: "Red", swatch: "#fca5a5" },
  { id: "#ffffff", label: "White", swatch: "#ffffff" },
  { id: "#111111", label: "Black", swatch: "#111111" },
];

export const CHORD_ACCIDENTALS: { id: Accidentals; label: string; hint: string }[] = [
  { id: "auto", label: "As saved", hint: "Keep each chord as written" },
  { id: "flat", label: "♭ Flats", hint: "Bb, Eb, Ab…" },
  { id: "sharp", label: "♯ Sharps", hint: "A#, D#, G#…" },
];

export const CHORD_SIZE_MIN = 30;
export const CHORD_SIZE_MAX = 100;

const STORAGE_KEY = "mc.chordDisplay";

export function asChordDisplay(raw: unknown): ChordDisplay {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<ChordDisplay>;
  const size = Number(value.size);
  const transpose: Record<string, number> = {};
  if (value.transpose && typeof value.transpose === "object") {
    for (const [id, steps] of Object.entries(value.transpose)) {
      const n = Math.round(Number(steps));
      if (Number.isFinite(n) && n % 12) transpose[id] = ((n % 12) + 12) % 12;
    }
  }
  return {
    show: typeof value.show === "boolean" ? value.show : DEFAULT_CHORD_DISPLAY.show,
    color:
      typeof value.color === "string" && value.color ? value.color : DEFAULT_CHORD_DISPLAY.color,
    size: Number.isFinite(size)
      ? Math.min(CHORD_SIZE_MAX, Math.max(CHORD_SIZE_MIN, Math.round(size)))
      : DEFAULT_CHORD_DISPLAY.size,
    accidentals:
      value.accidentals === "flat" || value.accidentals === "sharp" ? value.accidentals : "auto",
    transpose,
  };
}

export function readChordDisplay(): ChordDisplay {
  try {
    return asChordDisplay(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return { ...DEFAULT_CHORD_DISPLAY };
  }
}

export function saveChordDisplay(value: ChordDisplay) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* quota or private mode */
  }
}

export function transposeFor(display: ChordDisplay | null | undefined, itemId?: string | null) {
  if (!display || !itemId) return 0;
  return display.transpose[itemId] ?? 0;
}

/** Key name after shifting, e.g. `G` + 2 → `A`, `Em` + 1 → `Fm`. */
export function shiftedKey(
  key: string | null | undefined,
  steps: number,
  accidentals: Accidentals = "auto",
) {
  const raw = (key ?? "").trim();
  if (!raw || !parseKeyRoot(raw)) return raw;
  return spellChord(transposeChordSymbol(raw, steps), accidentals);
}
