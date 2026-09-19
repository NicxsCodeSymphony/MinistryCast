export type StageTransition = "dissolve" | "wipe" | "cut";

export function asStageTransition(raw?: string | null): StageTransition {
  if (raw === "wipe" || raw === "cut") return raw;
  return "dissolve";
}

export function lyricTransitionClass(style: StageTransition, ms: number) {
  if (style === "cut" || ms <= 0) return "";
  if (style === "wipe") return "lyric-wipe";
  return "lyric-in";
}
