export type LyricTextStyle = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export const EMPTY_LYRIC_TEXT_STYLE: LyricTextStyle = {
  bold: false,
  italic: false,
  underline: false,
};

/** Stage text starts bold until someone picks a style. */
export const DEFAULT_LYRIC_TEXT_STYLE: LyricTextStyle = {
  bold: true,
  italic: false,
  underline: false,
};

/** XL — the default size for lyrics, scripture and sermons on screen. */
export const DEFAULT_STAGE_TEXT_SIZE = "xl";

const NO_STYLE = "none";

export function parseLyricTextStyle(raw?: string | null): LyricTextStyle {
  if (!raw?.trim()) return { ...DEFAULT_LYRIC_TEXT_STYLE };
  if (raw.trim().toLowerCase() === NO_STYLE) return { ...EMPTY_LYRIC_TEXT_STYLE };
  if (raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Partial<LyricTextStyle>;
      return {
        bold: Boolean(parsed.bold),
        italic: Boolean(parsed.italic),
        underline: Boolean(parsed.underline),
      };
    } catch {
      /* fall through to flag list */
    }
  }
  const parts = new Set(
    (raw ?? "")
      .toLowerCase()
      .split(/[,\s]+/)
      .filter(Boolean),
  );
  return {
    bold: parts.has("bold") || parts.has("b"),
    italic: parts.has("italic") || parts.has("i"),
    underline: parts.has("underline") || parts.has("u"),
  };
}

/** Empty means "use the default" (bold), so an explicit no-style choice is stored as "none". */
export function serializeLyricTextStyle(style: LyricTextStyle) {
  return (
    [
      style.bold ? "bold" : "",
      style.italic ? "italic" : "",
      style.underline ? "underline" : "",
    ]
      .filter(Boolean)
      .join(",") || NO_STYLE
  );
}

export function wrapLyricMark(
  text: string,
  start: number,
  end: number,
  tag: "b" | "i" | "u",
) {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const selected = text.slice(from, to);
  const beforeWrap = text.slice(Math.max(0, from - open.length), from);
  const afterWrap = text.slice(to, to + close.length);

  if (selected.startsWith(open) && selected.endsWith(close) && selected.length > open.length + close.length) {
    const inner = selected.slice(open.length, selected.length - close.length);
    return {
      next: `${text.slice(0, from)}${inner}${text.slice(to)}`,
      start: from,
      end: from + inner.length,
    };
  }
  if (beforeWrap === open && afterWrap === close) {
    return {
      next: `${text.slice(0, from - open.length)}${selected}${text.slice(to + close.length)}`,
      start: from - open.length,
      end: from - open.length + selected.length,
    };
  }
  const inner = selected || "";
  return {
    next: `${text.slice(0, from)}${open}${inner}${close}${text.slice(to)}`,
    start: from + open.length,
    end: from + open.length + inner.length,
  };
}
