import { readCachedSessionProfile } from "./auth";
import { isChordSymbol, isLyricSectionHeading } from "./chords";
import { supabase } from "./supabase";
import { readSetlistViewChurchId } from "./viewChurch";

export function asError(
  error: { message: string } | null | undefined,
  fallback: string,
) {
  return new Error(error?.message || fallback);
}

export async function requireChurchId() {
  const cachedProfile = readCachedSessionProfile();
  // Superadmin browses a selected church workspace (setlist/sermon church picker).
  if (cachedProfile?.user?.role === "superadmin") {
    const viewId = readSetlistViewChurchId();
    if (viewId) return viewId;
  }
  const cached = cachedProfile?.church?.id;
  if (cached) return cached;
  const { data, error } = await supabase.rpc("get_session_profile");
  if (error) throw asError(error, "Could not load your account.");
  const profile = data as {
    user?: { role?: string } | null;
    church?: { id?: string } | null;
  } | null;
  if (profile?.user?.role === "superadmin") {
    const viewId = readSetlistViewChurchId();
    if (viewId) return viewId;
  }
  const churchId = profile?.church?.id;
  if (!churchId) throw new Error("No church workspace is available.");
  return churchId as string;
}

export async function requireUserId() {
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionId = sessionData.session?.user?.id;
  if (sessionId) return sessionId;
  const cached = readCachedSessionProfile()?.user?.id;
  if (cached) return cached;
  throw new Error("You need to sign in again.");
}

export function pageMeta<T>(
  items: T[],
  total: number,
  offset: number,
  limit: number,
) {
  return {
    items,
    total,
    offset,
    limit,
    hasMore: offset + items.length < total,
  };
}

export function parseDurationSeconds(input: string | undefined | null) {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const mmss = trimmed.match(/^(\d+):(\d{2})$/);
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2]);
  const mins = trimmed.match(/^(\d+)\s*(m|min|mins|minutes)?$/i);
  if (mins) return Number(mins[1]) * 60;
  const n = Number(trimmed);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatRelative(iso: string | null | undefined) {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "Never";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

export function lyricsToText(
  sections?: { section: string; content: string }[] | null,
) {
  if (!sections?.length) return "";
  return coerceLyricSections(sections)
    .map((block) => {
      const heading = block.section.startsWith("[")
        ? block.section
        : `[${block.section}]`;
      return `${heading}\n${block.content}`.trim();
    })
    .join("\n\n");
}

/**
 * Repair sections produced by the old parser that treated `[C]lyric` as a
 * heading named `C]lyric` (so previews showed `C]…` instead of a chord above).
 */
export function coerceLyricSections(
  sections: { section: string; content: string }[],
) {
  const out: { section: string; content: string }[] = [];
  for (const block of sections) {
    const section = (block.section ?? "").trim();
    const content = block.content ?? "";
    const chordOnly = isChordSymbol(section);
    const mangledChordLine =
      !content.trim() &&
      /^[A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add|maj7|m7|7|9|11|13|6|2|4)*\]/i.test(
        section,
      );

    if (chordOnly || mangledChordLine) {
      const line = chordOnly ? `[${section}]` : `[${section}`;
      const prev = out[out.length - 1];
      if (prev) {
        prev.content = [prev.content, line].filter(Boolean).join("\n");
      } else {
        out.push({ section: "Verse 1", content: line });
      }
      continue;
    }
    out.push({ section: section || "Verse 1", content });
  }
  return out;
}

export function textToLyricSections(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const lines = trimmed.split("\n");
  const sections: { section: string; content: string }[] = [];
  let section = "Verse 1";
  let body: string[] = [];
  let sawHeading = false;

  const flush = () => {
    const content = body.join("\n").replace(/^\n+|\n+$/g, "");
    if (sawHeading || content) {
      sections.push({ section, content });
    }
    body = [];
  };

  for (const line of lines) {
    if (isLyricSectionHeading(line)) {
      if (sawHeading || body.length) flush();
      section = line.trim().replace(/^\[|\]$/g, "");
      sawHeading = true;
      continue;
    }
    body.push(line);
  }
  if (sawHeading || body.length) flush();
  return sections;
}

export function splitLyricLines(content: string) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export const SERMON_SPACE = "[space]";

export function isSermonSpace(content: string) {
  return content.trim().toLowerCase() === SERMON_SPACE;
}

export function insertSermonGap(text: string) {
  const base = text.replace(/\s+$/g, "");
  return base ? `${base}\n\n` : "\n";
}

export function sermonDisplayLines(text: string) {
  const normalized = text.replace(/\[space\]/gi, "\n");
  const rows: string[] = [];
  for (const line of normalized.split("\n")) {
    if (!line.trim()) {
      if (rows.length) rows.push("");
      continue;
    }
    rows.push(line.trim());
  }
  while (rows.length && rows[rows.length - 1] === "") rows.pop();
  return rows;
}

export function wrapLine(line: string, maxChars = 48) {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const rows: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) rows.push(current);
    current = word;
  }
  if (current) rows.push(current);
  return rows;
}

export function paginateSermonText(text: string, maxLines = 5) {
  if (isSermonSpace(text) || !text.trim()) return [] as string[][];
  const wrapped = sermonDisplayLines(text);
  if (!wrapped.length) return [] as string[][];
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += maxLines) {
    pages.push(wrapped.slice(i, i + maxLines));
  }
  return pages;
}

export function formatSectionLabel(section?: string | null) {
  const cleaned = (section ?? "").replace(/^\[|\]$/g, "").trim();
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export type SermonTextSize = "sm" | "md" | "lg" | "xl";

export const SERMON_TEXT_SIZES: { id: SermonTextSize; label: string; px: number }[] =
  [
    { id: "sm", label: "S", px: 28 },
    { id: "md", label: "M", px: 40 },
    { id: "lg", label: "L", px: 56 },
    { id: "xl", label: "XL", px: 72 },
  ];

export function sermonSizePx(size?: string | null) {
  if (!size) return 40;
  const numeric = Number(size);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.min(160, Math.max(1, Math.round(numeric)));
  }
  return SERMON_TEXT_SIZES.find((row) => row.id === size)?.px ?? 40;
}

export function sermonPageLines(size?: string | null) {
  const px = sermonSizePx(size);
  if (px >= 64) return 3;
  if (px >= 50) return 4;
  if (px >= 34) return 5;
  return 7;
}

export function asSermonTextSize(value?: string | null): SermonTextSize {
  return SERMON_TEXT_SIZES.some((row) => row.id === value)
    ? (value as SermonTextSize)
    : "md";
}

export function moveItem<T>(items: T[], from: number, to: number) {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  return next;
}

/** Open http(s) links in the system browser (Tauri) or a new tab. */
export async function openExternalUrl(url: string) {
  let trimmed = url.trim();
  if (!trimmed) return;
  if (/^www\./i.test(trimmed)) trimmed = `https://${trimmed}`;
  if (!/^https?:\/\//i.test(trimmed)) return;
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(trimmed);
  } catch {
    window.open(trimmed, "_blank", "noopener,noreferrer");
  }
}

const URL_FIND_RE = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;

/** Split plain text into text / link segments for chat rendering. */
export function splitTextLinks(
  text: string,
): Array<{ type: "text" | "link"; value: string }> {
  if (!text) return [];
  const parts: Array<{ type: "text" | "link"; value: string }> = [];
  let last = 0;
  const re = new RegExp(URL_FIND_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: "text", value: text.slice(last, match.index) });
    }
    let url = match[0];
    while (/[),.!?;:]$/.test(url)) {
      url = url.slice(0, -1);
    }
    if (url) parts.push({ type: "link", value: url });
    last = match.index + url.length;
  }
  if (last < text.length) {
    parts.push({ type: "text", value: text.slice(last) });
  }
  return parts.length ? parts : [{ type: "text", value: text }];
}
