/**
 * Free-form sermon slide layouts ("PowerPoint-style" text boxes and shapes).
 *
 * Storage (no schema change): the layout is appended to the slide's existing
 * `content` column as a trailing HTML comment:
 *
 *   <plain text of the boxes><!--mc-layout:<encodeURIComponent(JSON)>-->
 *
 * URI-encoding guarantees the payload never contains `<` or `>`, so every
 * existing markup parser (which tokenises on `<...>` and skips unknown tags)
 * ignores the marker and still shows the plain text. Slides without the
 * marker behave exactly as before.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { DEFAULT_STAGE_FONT, stageFontFamily } from "../../lib/stageFonts";

export const LAYOUT_PREFIX = "<!--mc-layout:";
export const LAYOUT_SUFFIX = "-->";
const LAYOUT_RE = /<!--mc-layout:([^<>]*?)-->/;

/** Output canvas the font sizes refer to (same as the projector). */
export const STAGE_W = 1920;
export const STAGE_H = 1080;

export type SlideAlign = "left" | "center" | "right";

export type SlideElement = {
  id: string;
  type: "text" | "box";
  /** Position and size in % of the stage. */
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  /** Font size in px at 1920×1080. */
  size?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: SlideAlign;
  color?: string;
  /** Box fill. */
  fill?: string;
  /** Box corner radius in px at 1920×1080. */
  radius?: number;
  /**
   * Text only: shrink the font so long text stays inside its box.
   * Missing means on (older slides get it too); false keeps the exact size.
   */
  fit?: boolean;
};

export type SlideLayout = {
  v: 1;
  els: SlideElement[];
};

export const TEXT_SIZES = [
  { id: "S", px: 48 },
  { id: "M", px: 72 },
  { id: "L", px: 96 },
  { id: "XL", px: 128 },
] as const;

export const TEXT_COLORS = [
  { id: "white", hex: "#ffffff", label: "White" },
  { id: "black", hex: "#000000", label: "Black" },
  { id: "accent", hex: "#8b8ff8", label: "Accent" },
  { id: "gold", hex: "#f0c674", label: "Gold" },
  { id: "red", hex: "#ff6b6b", label: "Red" },
  { id: "sky", hex: "#7dd3fc", label: "Sky" },
] as const;

export const BOX_FILLS = [
  { id: "shade", hex: "rgba(0,0,0,0.45)", label: "Dark shade" },
  { id: "light", hex: "rgba(255,255,255,0.85)", label: "Light" },
  { id: "accent", hex: "#5b5fe0", label: "Accent" },
  { id: "gold", hex: "#f0c674", label: "Gold" },
  { id: "black", hex: "#000000", label: "Black" },
  { id: "white", hex: "#ffffff", label: "White" },
] as const;

function num(value: unknown, fallback: number, min = -1000, max = 1000) {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function str(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function cleanElement(raw: unknown, index: number): SlideElement | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const type = row.type === "box" ? "box" : row.type === "text" ? "text" : null;
  if (!type) return null;
  const align = row.align === "left" || row.align === "right" ? row.align : "center";
  return {
    id: str(row.id) || `el-${index}`,
    type,
    x: num(row.x, 10),
    y: num(row.y, 10),
    w: num(row.w, 30, 1, 400),
    h: num(row.h, 15, 1, 400),
    text: type === "text" ? (str(row.text) ?? "") : undefined,
    size: type === "text" ? num(row.size, 72, 8, 400) : undefined,
    bold: row.bold === true || undefined,
    italic: row.italic === true || undefined,
    underline: row.underline === true || undefined,
    align: type === "text" ? align : undefined,
    color: str(row.color),
    fill: str(row.fill),
    radius: type === "box" ? num(row.radius, 24, 0, 540) : undefined,
  };
}

/** Reads the layout marker out of stored slide content (null when there is none). */
export function readSlideLayout(content: string | null | undefined): SlideLayout | null {
  if (!content || !content.includes(LAYOUT_PREFIX)) return null;
  const match = content.match(LAYOUT_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(match[1])) as { els?: unknown };
    const els = Array.isArray(parsed?.els)
      ? parsed.els.map(cleanElement).filter((row): row is SlideElement => Boolean(row))
      : [];
    return { v: 1, els };
  } catch {
    return null;
  }
}

/** Stored content without the layout marker. */
export function stripSlideLayout(content: string) {
  return content.includes(LAYOUT_PREFIX) ? content.replace(LAYOUT_RE, "") : content;
}

function escapeMarkup(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Plain text of every text box, top to bottom, for lists, search and older renderers. */
export function layoutPlainText(layout: SlideLayout) {
  return [...layout.els]
    .filter((el) => el.type === "text" && (el.text ?? "").trim())
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((el) => (el.text ?? "").trim())
    .join("\n");
}

/** Stored `content` for a slide with a layout. */
export function composeSlideContent(layout: SlideLayout) {
  const payload = encodeURIComponent(JSON.stringify({ v: 1, els: layout.els }));
  return `${escapeMarkup(layoutPlainText(layout))}${LAYOUT_PREFIX}${payload}${LAYOUT_SUFFIX}`;
}

export function newElementId() {
  return `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Font size that scales with the stage container (needs `container-type: size`). */
export function stageFontSize(px: number) {
  return `${(px / STAGE_W) * 100}cqw`;
}

export function elementBoxStyle(el: SlideElement): CSSProperties {
  return {
    position: "absolute",
    left: `${el.x}%`,
    top: `${el.y}%`,
    width: `${el.w}%`,
    height: `${el.h}%`,
  };
}

/** Smallest share of the chosen size auto-fit may shrink to (e.g. 96px → 14px). */
export const MIN_FIT_SCALE = 0.15;

export function textFits(el: SlideElement) {
  return el.type === "text" && el.fit !== false;
}

/**
 * Shrink-to-fit for a text box. Measures in the live DOM and returns the scale
 * (≤ 1) to apply to the element's size. Sizes are container units, so the
 * same scale comes out in the small editor, the preview and the projector.
 *
 * `boxRef` is the element whose font size is set; `overflows` says whether
 * the text spills out at the size currently applied to it.
 */
export function useTextFitScale(
  el: SlideElement,
  boxRef: RefObject<HTMLElement | null>,
  overflows: (box: HTMLElement) => boolean,
) {
  const [scale, setScale] = useState(1);
  const overflowsRef = useRef(overflows);
  overflowsRef.current = overflows;
  const enabled = textFits(el);
  const base = el.size ?? 72;

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const apply = (next: number) => {
      box.style.fontSize = stageFontSize(base * next);
    };
    const fit = () => {
      if (!enabled) {
        apply(1);
        setScale(1);
        return;
      }
      if (box.clientHeight < 4 || box.clientWidth < 4) return;
      const tooBig = (next: number) => {
        apply(next);
        return overflowsRef.current(box);
      };
      let next = 1;
      if (tooBig(1)) {
        let lo = MIN_FIT_SCALE;
        let hi = 1;
        for (let i = 0; i < 14; i += 1) {
          const mid = (lo + hi) / 2;
          if (tooBig(mid)) hi = mid;
          else lo = mid;
        }
        next = lo;
      }
      apply(next);
      setScale((prev) => (Math.abs(prev - next) < 0.001 ? prev : next));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [boxRef, enabled, base, el.text, el.w, el.h, el.bold, el.italic, el.underline, el.align]);

  return scale;
}

/** Overflow test for a box that wraps its text in one child (display mode). */
export function childOverflows(box: HTMLElement) {
  const inner = box.firstElementChild as HTMLElement | null;
  if (!inner) return false;
  return inner.offsetHeight > box.clientHeight + 1 || inner.scrollWidth > box.clientWidth + 1;
}

/** Overflow test for a textarea (edit mode). */
export function textareaOverflows(box: HTMLElement) {
  return box.scrollHeight > box.clientHeight + 1;
}

export function elementTextStyle(
  el: SlideElement,
  darkText: boolean,
  fitScale = 1,
): CSSProperties {
  return {
    fontFamily: stageFontFamily(DEFAULT_STAGE_FONT),
    fontSize: stageFontSize((el.size ?? 72) * fitScale),
    fontWeight: el.bold ? 700 : 500,
    fontStyle: el.italic ? "italic" : undefined,
    textDecoration: el.underline ? "underline" : undefined,
    textAlign: el.align ?? "center",
    color: el.color || (darkText ? "#000000" : "#ffffff"),
    lineHeight: 1.2,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  };
}

export function elementFillStyle(el: SlideElement): CSSProperties {
  return {
    background: el.fill || "rgba(0,0,0,0.45)",
    borderRadius: `${((el.radius ?? 24) / STAGE_W) * 100}cqw`,
  };
}

/** Read-only render of a layout, filling its parent (used on stage, preview and output). */
export function SlideLayoutView({
  layout,
  darkText = false,
  className = "",
}: {
  layout: SlideLayout;
  darkText?: boolean;
  className?: string;
}) {
  return (
    <div
      data-slide-layout
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{ containerType: "size" }}
    >
      {layout.els.map((el) =>
        el.type === "box" ? (
          <div key={el.id} style={{ ...elementBoxStyle(el), ...elementFillStyle(el) }} />
        ) : (
          <div key={el.id} style={elementBoxStyle(el)}>
            <FittedText el={el} darkText={darkText} />
          </div>
        ),
      )}
    </div>
  );
}

/** A text box's words, shrunk to fit when the box asks for it. Fills its parent. */
export function FittedText({
  el,
  darkText,
  className = "",
}: {
  el: SlideElement;
  darkText: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const scale = useTextFitScale(el, ref, childOverflows);
  return (
    <div
      ref={ref}
      data-slide-text
      data-fit-scale={scale < 1 ? scale.toFixed(3) : undefined}
      className={`w-full h-full flex flex-col justify-center overflow-hidden ${className}`}
      style={{
        ...elementTextStyle(el, darkText, scale),
        textShadow:
          darkText || el.color === "#000000" ? undefined : "0 6px 24px rgba(0,0,0,0.65)",
      }}
    >
      <span>{el.text}</span>
    </div>
  );
}
