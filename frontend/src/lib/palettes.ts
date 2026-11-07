/**
 * Curated color palettes (Settings › Theme). Each is an accent plus a subtle
 * surface tint; the actual tokens live in App.css under html[data-palette].
 * Swatches here only drive the preview cards.
 */
export type PaletteId =
  | "indigo"
  | "ocean"
  | "evergreen"
  | "teal"
  | "amethyst"
  | "rose"
  | "sunset"
  | "gold"
  | "graphite";

export type Palette = {
  id: PaletteId;
  label: string;
  description: string;
  /** Preview colors: [accent dark, surface dark, accent light, surface light]. */
  swatch: { accent: string; dark: string; light: string; lightAccent: string };
};

export const PALETTES: Palette[] = [
  {
    id: "indigo",
    label: "Indigo",
    description: "Calm and focused. The default.",
    swatch: { accent: "#5e6ad2", dark: "#17181c", light: "#ffffff", lightAccent: "#5e6ad2" },
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Clear blue on cool slate.",
    swatch: { accent: "#2f7de1", dark: "#151a22", light: "#f7f9fc", lightAccent: "#1f6fd1" },
  },
  {
    id: "evergreen",
    label: "Evergreen",
    description: "Fresh green on deep moss.",
    swatch: { accent: "#12976b", dark: "#141b18", light: "#f7faf8", lightAccent: "#0d7d58" },
  },
  {
    id: "teal",
    label: "Lagoon",
    description: "Soft teal, quiet and modern.",
    swatch: { accent: "#0f9d8f", dark: "#141b1b", light: "#f6faf9", lightAccent: "#0b7d72" },
  },
  {
    id: "amethyst",
    label: "Amethyst",
    description: "Royal violet for worship nights.",
    swatch: { accent: "#7c4ddb", dark: "#19161f", light: "#faf8fd", lightAccent: "#6a3ccc" },
  },
  {
    id: "rose",
    label: "Rose",
    description: "Warm rose with gentle contrast.",
    swatch: { accent: "#db3f5f", dark: "#1c1618", light: "#fdf8f8", lightAccent: "#c42f50" },
  },
  {
    id: "sunset",
    label: "Sunset",
    description: "Ember orange on warm stone.",
    swatch: { accent: "#e2622b", dark: "#1c1714", light: "#fdf9f6", lightAccent: "#c4501c" },
  },
  {
    id: "gold",
    label: "Sanctuary Gold",
    description: "Candlelit gold, rich and classic.",
    swatch: { accent: "#d4a73a", dark: "#1b1914", light: "#fcfaf4", lightAccent: "#8f6a12" },
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Pure monochrome. No color at all.",
    swatch: { accent: "#ededef", dark: "#17181c", light: "#ffffff", lightAccent: "#1b1c1f" },
  },
];

export const DEFAULT_PALETTE: PaletteId = "indigo";
const PALETTE_KEY = "mc.palette";

export function asPalette(raw: unknown): PaletteId {
  return PALETTES.some((row) => row.id === raw) ? (raw as PaletteId) : DEFAULT_PALETTE;
}

export function readStoredPalette(): PaletteId {
  try {
    return asPalette(localStorage.getItem(PALETTE_KEY));
  } catch {
    return DEFAULT_PALETTE;
  }
}

export function storePalette(id: PaletteId) {
  try {
    localStorage.setItem(PALETTE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function applyPalette(id: PaletteId) {
  const root = document.documentElement;
  if (id === DEFAULT_PALETTE) root.removeAttribute("data-palette");
  else root.setAttribute("data-palette", id);
}
