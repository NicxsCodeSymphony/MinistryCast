/** Stored on a scripture setlist item so Live can show the passage one verse per slide. */
export type ScripturePayload = {
  kind: "scripture";
  translation: string;
  perVerse: boolean;
  verses: { verse: number; text: string }[];
};

export function asScripturePayload(raw: unknown): ScripturePayload | null {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<ScripturePayload>;
  if (row.kind !== "scripture" || !Array.isArray(row.verses)) return null;
  const verses = row.verses
    .map((item) => ({ verse: Number(item?.verse), text: String(item?.text ?? "").trim() }))
    .filter((item) => Number.isFinite(item.verse) && item.text);
  return {
    kind: "scripture",
    translation: typeof row.translation === "string" ? row.translation : "",
    perVerse: row.perVerse !== false,
    verses,
  };
}
