export const DEFAULT_STAGE_FONT = "Arial";

export const STAGE_FONTS = [
  { id: "Arial", label: "Arial", family: "Arial, Helvetica, sans-serif" },
  { id: "Inter", label: "Inter (Modern Sans)", family: "Inter, sans-serif" },
  { id: "Helvetica", label: "Helvetica", family: "Helvetica, Arial, sans-serif" },
  { id: "Georgia", label: "Georgia", family: "Georgia, serif" },
  { id: "Times New Roman", label: "Times New Roman", family: '"Times New Roman", Times, serif' },
  { id: "Playfair Display", label: "Playfair Display (Serif)", family: '"Playfair Display", Georgia, serif' },
] as const;

export function stageFontFamily(id?: string | null) {
  const match = STAGE_FONTS.find((font) => font.id === id);
  return match?.family ?? STAGE_FONTS[0].family;
}

export function asStageFont(id?: string | null) {
  return STAGE_FONTS.some((font) => font.id === id) ? id! : DEFAULT_STAGE_FONT;
}
