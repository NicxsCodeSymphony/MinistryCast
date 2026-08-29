export const STAGE_BACKGROUND_IDS = [
  "none",
  "white",
  "sanctuary",
  "midnight",
  "goldHaze",
  "royal",
  "forest",
  "dawn",
  "candlelight",
  "ocean",
  "ember",
  "slate",
] as const;

export type StageBackgroundId = (typeof STAGE_BACKGROUND_IDS)[number];

export const DEFAULT_STAGE_BACKGROUND: StageBackgroundId = "sanctuary";

export type StageBackgroundDef = {
  id: StageBackgroundId;
  label: string;
  kind: "none" | "photo" | "wash";
  style?: Record<string, string>;
};

export const STAGE_BACKGROUNDS: StageBackgroundDef[] = [
  { id: "none", label: "None", kind: "none" },
  {
    id: "white",
    label: "White",
    kind: "wash",
    style: { background: "#ffffff" },
  },
  { id: "sanctuary", label: "Sanctuary", kind: "photo" },
  {
    id: "midnight",
    label: "Midnight",
    kind: "wash",
    style: {
      background:
        "radial-gradient(120% 80% at 50% 0%, #1a3a6a 0%, #0b1224 42%, #05060c 100%)",
    },
  },
  {
    id: "goldHaze",
    label: "Gold haze",
    kind: "wash",
    style: {
      background:
        "radial-gradient(90% 70% at 50% 20%, #6b4a1e 0%, #2a1a0c 45%, #0c0804 100%)",
    },
  },
  {
    id: "royal",
    label: "Royal",
    kind: "wash",
    style: {
      background:
        "radial-gradient(110% 80% at 50% 10%, #3a1d6e 0%, #160b2e 48%, #07040f 100%)",
    },
  },
  {
    id: "forest",
    label: "Forest",
    kind: "wash",
    style: {
      background:
        "radial-gradient(100% 80% at 50% 0%, #1c4a38 0%, #0c221c 50%, #040a08 100%)",
    },
  },
  {
    id: "dawn",
    label: "Dawn",
    kind: "wash",
    style: {
      background:
        "linear-gradient(180deg, #4a2a3a 0%, #7a4a38 38%, #1a1020 100%)",
    },
  },
  {
    id: "candlelight",
    label: "Candlelight",
    kind: "wash",
    style: {
      background:
        "radial-gradient(70% 60% at 50% 70%, #8a4a18 0%, #3a1c0c 42%, #0c0604 100%)",
    },
  },
  {
    id: "ocean",
    label: "Ocean",
    kind: "wash",
    style: {
      background:
        "radial-gradient(120% 90% at 50% 0%, #145a6a 0%, #0a2438 48%, #040c14 100%)",
    },
  },
  {
    id: "ember",
    label: "Ember",
    kind: "wash",
    style: {
      background:
        "radial-gradient(90% 70% at 50% 80%, #7a2018 0%, #2a0c0c 50%, #080404 100%)",
    },
  },
  {
    id: "slate",
    label: "Slate",
    kind: "wash",
    style: {
      background:
        "radial-gradient(100% 80% at 50% 0%, #3a4658 0%, #161c24 50%, #08090c 100%)",
    },
  },
];

export function asStageBackground(raw?: string | null): StageBackgroundId {
  if (raw && (STAGE_BACKGROUND_IDS as readonly string[]).includes(raw)) {
    return raw as StageBackgroundId;
  }
  return DEFAULT_STAGE_BACKGROUND;
}

export function stageUsesDarkText(id?: string | null) {
  return asStageBackground(id) === "white";
}

export function stageBackgroundDef(id?: string | null): StageBackgroundDef {
  const next = asStageBackground(id);
  return STAGE_BACKGROUNDS.find((row) => row.id === next) ?? STAGE_BACKGROUNDS[1];
}
