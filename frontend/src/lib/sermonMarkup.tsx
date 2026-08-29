import { type CSSProperties, type ReactNode } from "react";
import { extractBibleReferences, type ParsedBibleRef } from "./bible";

export const POINT_COLORS = [
  { id: "white", hex: "#ffffff", label: "White" },
  { id: "black", hex: "#000000", label: "Black" },
  { id: "gold", hex: "#f0c674", label: "Gold" },
  { id: "red", hex: "#ff6b6b", label: "Red" },
  { id: "yellow", hex: "#ffe566", label: "Yellow" },
  { id: "sky", hex: "#7dd3fc", label: "Sky" },
  { id: "lime", hex: "#86efac", label: "Lime" },
] as const;

export type SermonRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
};

const COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const VERSE_COLOR = "#f0c674";

function escapeText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function unescapeText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");
}

function normalizeColor(value: string) {
  const raw = value.trim().toLowerCase();
  if (raw === "black") return "#000000";
  if (raw === "white") return "#ffffff";
  const rgb = raw.match(
    /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/,
  );
  if (rgb) {
    return `#${[rgb[1], rgb[2], rgb[3]]
      .map((part) => Number(part).toString(16).padStart(2, "0"))
      .join("")}`;
  }
  if (!COLOR.test(raw)) return "";
  if (raw.length === 4) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }
  return raw;
}

function colorFromStyle(style: string) {
  const match = style.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
  return match ? normalizeColor(match[1].trim()) : "";
}

function styleHas(style: string, property: string, test: (value: string) => boolean) {
  const match = style.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "i"));
  return match ? test(match[1].trim()) : false;
}

export function sermonPlainText(html: string) {
  return parseSermonRuns(html)
    .map((run) => run.text)
    .join("")
    .replace(/\n+/g, " ")
    .trim();
}

export function parseSermonRuns(source: string): SermonRun[] {
  const runs: SermonRun[] = [];
  const marks = { bold: false, italic: false, underline: false };
  const colors: string[] = [];
  let text = "";

  const flush = () => {
    if (!text) return;
    const color = colors[colors.length - 1];
    runs.push({
      text,
      bold: marks.bold || undefined,
      italic: marks.italic || undefined,
      underline: marks.underline || undefined,
      color: color || undefined,
    });
    text = "";
  };

  const pushText = (chunk: string) => {
    if (!chunk) return;
    text += unescapeText(chunk);
  };

  const tokens = source.split(/(<[^>]+>)/g);
  for (const token of tokens) {
    if (!token) continue;
    if (token === "<br>" || token === "<br/>" || token === "<br />") {
      flush();
      runs.push({ text: "\n" });
      continue;
    }
    const open = token.match(/^<(b|strong|i|em|u)>$/i);
    const close = token.match(/^<\/(b|strong|i|em|u|span)>$/i);
    const span = token.match(/^<span\s+data-c="(#[0-9a-fA-F]{3,6})">$/i);
    if (open) {
      flush();
      const tag = open[1].toLowerCase();
      if (tag === "b" || tag === "strong") marks.bold = true;
      if (tag === "i" || tag === "em") marks.italic = true;
      if (tag === "u") marks.underline = true;
      continue;
    }
    if (span) {
      flush();
      const color = normalizeColor(span[1]);
      if (color) colors.push(color);
      continue;
    }
    if (close) {
      flush();
      const tag = close[1].toLowerCase();
      if (tag === "b" || tag === "strong") marks.bold = false;
      if (tag === "i" || tag === "em") marks.italic = false;
      if (tag === "u") marks.underline = false;
      if (tag === "span") colors.pop();
      continue;
    }
    if (token.startsWith("<")) continue;
    pushText(token);
  }
  flush();
  return runs.length ? runs : [{ text: source.replace(/<[^>]+>/g, "") }];
}

function serializeNode(node: Node, marks: SermonRun): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const value = node.textContent ?? "";
    if (!value) return "";
    let inner = escapeText(value);
    if (marks.bold) inner = `<b>${inner}</b>`;
    if (marks.italic) inner = `<i>${inner}</i>`;
    if (marks.underline) inner = `<u>${inner}</u>`;
    if (marks.color) inner = `<span data-c="${marks.color}">${inner}</span>`;
    return inner;
  }
  if (!(node instanceof HTMLElement)) return "";
  const tag = node.tagName;
  const next = { ...marks };
  if (tag === "B" || tag === "STRONG") next.bold = true;
  if (tag === "I" || tag === "EM") next.italic = true;
  if (tag === "U") next.underline = true;
  const style = node.getAttribute("style") || "";
  if (
    styleHas(style, "font-weight", (value) =>
      /bold|[6-9]00/.test(value),
    )
  ) {
    next.bold = true;
  }
  if (styleHas(style, "font-style", (value) => value.includes("italic"))) {
    next.italic = true;
  }
  if (
    styleHas(style, "text-decoration", (value) => value.includes("underline"))
  ) {
    next.underline = true;
  }
  if (tag === "FONT") {
    const color = normalizeColor(node.getAttribute("color") || "");
    if (color) next.color = color;
  }
  if (tag === "SPAN" || tag === "FONT" || style) {
    const data = normalizeColor(node.getAttribute("data-c") || "");
    const fromStyle = colorFromStyle(style);
    if (data || fromStyle) next.color = data || fromStyle;
  }
  if (tag === "BR") return "\n";
  if (tag === "DIV" || tag === "P" || tag === "LI") {
    const inner = Array.from(node.childNodes)
      .map((child) => serializeNode(child, next))
      .join("");
    return inner ? `${inner}\n` : "\n";
  }
  return Array.from(node.childNodes)
    .map((child) => serializeNode(child, next))
    .join("");
}

export function editableToStored(html: string) {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  return serializeNode(root, { text: "" })
    .replace(/\n+$/g, "")
    .replace(/\n{3,}/g, "\n\n");
}

export function storedToEditable(stored: string) {
  if (!stored) return "";
  return stored
    .split("\n")
    .map((line) => `<div>${line || "<br>"}</div>`)
    .join("");
}

export function renderSermonMarkup(
  line: string,
  onVerseClick?: (raw: string, parsed: ParsedBibleRef) => void,
  emphasize = false,
): ReactNode {
  const runs = parseSermonRuns(line);
  const nodes: ReactNode[] = [];
  let key = 0;
  for (const run of runs) {
    if (run.text === "\n") {
      nodes.push(<br key={`br-${key++}`} />);
      continue;
    }
    const refs = extractBibleReferences(run.text);
    const style: CSSProperties = {
      fontWeight: run.bold ? 700 : undefined,
      fontStyle: run.italic ? "italic" : undefined,
      textDecoration: run.underline ? "underline" : undefined,
      color: run.color || (emphasize ? VERSE_COLOR : undefined),
    };
    if (!refs.length) {
      nodes.push(
        <span key={`t-${key++}`} style={style}>
          {run.text}
        </span>,
      );
      continue;
    }
    let cursor = 0;
    refs.forEach((ref, index) => {
      if (ref.index > cursor) {
        nodes.push(
          <span key={`t-${key++}`} style={style}>
            {run.text.slice(cursor, ref.index)}
          </span>,
        );
      }
      nodes.push(
        <button
          key={`v-${key++}-${ref.raw}-${index}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onVerseClick?.(ref.raw, ref.parsed);
          }}
          className={`inline bg-transparent p-0 m-0 border-0 font-semibold underline decoration-2 underline-offset-4 whitespace-nowrap align-baseline ${
            onVerseClick ? "cursor-pointer hover:opacity-90" : "cursor-default"
          }`}
          style={{ ...style, color: VERSE_COLOR, font: "inherit" }}
        >
          {ref.raw}
        </button>,
      );
      cursor = ref.index + ref.length;
    });
    if (cursor < run.text.length) {
      nodes.push(
        <span key={`t-${key++}`} style={style}>
          {run.text.slice(cursor)}
        </span>,
      );
    }
  }
  return nodes;
}
