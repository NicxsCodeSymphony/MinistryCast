import type { CategoryColor } from "./types";

export type CategoryTone = CategoryColor;

export type CategoryIconOption = {
  id: string;
  label: string;
};

export const CATEGORY_ICONS: CategoryIconOption[] = [
  { id: "campaign", label: "Call to Worship" },
  { id: "music_note", label: "Opening Song" },
  { id: "celebration", label: "Praise" },
  { id: "favorite", label: "Worship" },
  { id: "auto_awesome", label: "Holy of Holies" },
];

export const CATEGORY_COLOR_IDS = [
  "sky",
  "violet",
  "gold",
  "rose",
  "amber",
  "emerald",
  "teal",
  "coral",
  "cyan",
  "indigo",
] as const;

export type PickerCategoryColor = (typeof CATEGORY_COLOR_IDS)[number];

const ALIASES: Record<string, PickerCategoryColor> = {
  primary: "sky",
  secondary: "violet",
  tertiary: "gold",
  error: "coral",
  accent: "cyan",
};

export function categoryTone(color?: string | null): PickerCategoryColor {
  if (color && (CATEGORY_COLOR_IDS as readonly string[]).includes(color)) {
    return color as PickerCategoryColor;
  }
  if (color && ALIASES[color]) return ALIASES[color];
  return "sky";
}

export const categoryVisual: Record<
  PickerCategoryColor,
  { bar: string; icon: string; chip: string; wash: string; hex: string }
> = {
  sky: {
    bar: "bg-[#4facfe]",
    icon: "bg-[#4facfe] text-[#003256] shadow-[0_8px_24px_rgba(79,172,254,0.4)]",
    chip: "border-[#4facfe]/40 text-[#4facfe] bg-[#4facfe]/15",
    wash: "bg-[#4facfe]/12 border-[#4facfe]/30",
    hex: "#4facfe",
  },
  violet: {
    bar: "bg-[#c084fc]",
    icon: "bg-[#c084fc] text-[#3b0764] shadow-[0_8px_24px_rgba(192,132,252,0.4)]",
    chip: "border-[#c084fc]/40 text-[#c084fc] bg-[#c084fc]/15",
    wash: "bg-[#c084fc]/12 border-[#c084fc]/30",
    hex: "#c084fc",
  },
  gold: {
    bar: "bg-[#e9c349]",
    icon: "bg-[#e9c349] text-[#3c2f00] shadow-[0_8px_24px_rgba(233,195,73,0.4)]",
    chip: "border-[#e9c349]/40 text-[#e9c349] bg-[#e9c349]/15",
    wash: "bg-[#e9c349]/12 border-[#e9c349]/30",
    hex: "#e9c349",
  },
  rose: {
    bar: "bg-[#fb7185]",
    icon: "bg-[#fb7185] text-[#4c0519] shadow-[0_8px_24px_rgba(251,113,133,0.4)]",
    chip: "border-[#fb7185]/40 text-[#fb7185] bg-[#fb7185]/15",
    wash: "bg-[#fb7185]/12 border-[#fb7185]/30",
    hex: "#fb7185",
  },
  amber: {
    bar: "bg-[#f59e0b]",
    icon: "bg-[#f59e0b] text-[#451a03] shadow-[0_8px_24px_rgba(245,158,11,0.4)]",
    chip: "border-[#f59e0b]/40 text-[#d97706] bg-[#f59e0b]/15",
    wash: "bg-[#f59e0b]/12 border-[#f59e0b]/30",
    hex: "#f59e0b",
  },
  emerald: {
    bar: "bg-[#34d399]",
    icon: "bg-[#34d399] text-[#022c22] shadow-[0_8px_24px_rgba(52,211,153,0.4)]",
    chip: "border-[#34d399]/40 text-[#34d399] bg-[#34d399]/15",
    wash: "bg-[#34d399]/12 border-[#34d399]/30",
    hex: "#34d399",
  },
  teal: {
    bar: "bg-[#2dd4bf]",
    icon: "bg-[#2dd4bf] text-[#042f2e] shadow-[0_8px_24px_rgba(45,212,191,0.4)]",
    chip: "border-[#2dd4bf]/40 text-[#2dd4bf] bg-[#2dd4bf]/15",
    wash: "bg-[#2dd4bf]/12 border-[#2dd4bf]/30",
    hex: "#2dd4bf",
  },
  coral: {
    bar: "bg-[#ff8a7a]",
    icon: "bg-[#ff8a7a] text-[#4c0519] shadow-[0_8px_24px_rgba(255,138,122,0.4)]",
    chip: "border-[#ff8a7a]/40 text-[#ff8a7a] bg-[#ff8a7a]/15",
    wash: "bg-[#ff8a7a]/12 border-[#ff8a7a]/30",
    hex: "#ff8a7a",
  },
  cyan: {
    bar: "bg-[#22d3ee]",
    icon: "bg-[#22d3ee] text-[#083344] shadow-[0_8px_24px_rgba(34,211,238,0.4)]",
    chip: "border-[#22d3ee]/40 text-[#0891b2] bg-[#22d3ee]/15",
    wash: "bg-[#22d3ee]/12 border-[#22d3ee]/30",
    hex: "#22d3ee",
  },
  indigo: {
    bar: "bg-[#818cf8]",
    icon: "bg-[#818cf8] text-[#1e1b4b] shadow-[0_8px_24px_rgba(129,140,248,0.4)]",
    chip: "border-[#818cf8]/40 text-[#818cf8] bg-[#818cf8]/15",
    wash: "bg-[#818cf8]/12 border-[#818cf8]/30",
    hex: "#818cf8",
  },
};

export type ServiceCategoryPreset = {
  names: string[];
  icon: string;
  color: PickerCategoryColor;
};

export const SERVICE_CATEGORY_PRESETS: ServiceCategoryPreset[] = [
  {
    names: ["call to worship", "call-to-worship"],
    icon: "campaign",
    color: "sky",
  },
  {
    names: ["opening song", "opening songs"],
    icon: "music_note",
    color: "violet",
  },
  {
    names: ["praise"],
    icon: "celebration",
    color: "amber",
  },
  {
    names: ["worship"],
    icon: "favorite",
    color: "rose",
  },
  {
    names: ["holy of holies", "holy holies", "holy-holies"],
    icon: "auto_awesome",
    color: "gold",
  },
];

function normalizeCategoryName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function presetForCategoryName(name?: string | null) {
  if (!name) return null;
  const key = normalizeCategoryName(name);
  return (
    SERVICE_CATEGORY_PRESETS.find((preset) => preset.names.includes(key)) ??
    null
  );
}

export function presetForIcon(icon: string) {
  return SERVICE_CATEGORY_PRESETS.find((preset) => preset.icon === icon) ?? null;
}
