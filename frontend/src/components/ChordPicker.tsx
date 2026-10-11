import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import {
  diatonicChords,
  isChordableLyricLine,
  normalizeTypedChord,
  placeSheetChord,
  sheetChordAt,
} from "../lib/chords";

type Anchor = {
  end: number;
  lineIndex: number;
  col: number;
  word: string;
  current: string | null;
  x: number;
  y: number;
  lineHeight: number;
};

const MIRRORED_STYLES = [
  "box-sizing",
  "width",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "line-height",
  "text-transform",
  "word-spacing",
  "text-indent",
  "tab-size",
];

/** Screen position of character `index` inside a textarea, via an off-screen mirror. */
function caretPoint(field: HTMLTextAreaElement, index: number) {
  const style = window.getComputedStyle(field);
  const mirror = document.createElement("div");
  for (const name of MIRRORED_STYLES) {
    mirror.style.setProperty(name, style.getPropertyValue(name));
  }
  const wraps =
    !/^pre$|nowrap/.test(style.whiteSpace) && style.getPropertyValue("text-wrap-mode") !== "nowrap";
  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = wraps ? "pre-wrap" : "pre";
  mirror.style.overflowWrap = wraps ? "break-word" : "normal";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.textContent = field.value.slice(0, index);
  const marker = document.createElement("span");
  marker.textContent = field.value.slice(index) || ".";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  const left = marker.offsetLeft;
  document.body.removeChild(mirror);
  const rect = field.getBoundingClientRect();
  // The field may sit inside a CSS-scaled stage; offsets above are unscaled layout pixels.
  const scale = field.offsetWidth ? rect.width / field.offsetWidth : 1;
  const fontSize = parseFloat(style.fontSize) || 14;
  return {
    x: rect.left + (left - field.scrollLeft) * scale,
    y: rect.top + (top - field.scrollTop) * scale,
    lineHeight: (parseFloat(style.lineHeight) || fontSize * 1.5) * scale,
  };
}

/**
 * Highlight a letter or word in a chord-sheet textarea to drop a chord on the line above it.
 * Chords offered are the common ones for `songKey`, plus any chord you type.
 */
export default function ChordPicker({
  fieldRef,
  value,
  songKey,
  enabled = true,
  onChange,
}: {
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  songKey: string;
  enabled?: boolean;
  onChange: (next: string) => void;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [custom, setCustom] = useState("");
  const [customError, setCustomError] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const field = fieldRef.current;
    if (!field || !enabled) {
      setAnchor(null);
      return;
    }

    const check = () => {
      const start = field.selectionStart;
      const end = field.selectionEnd;
      const text = field.value;
      const selected = text.slice(start, end);
      if (start === end || !selected.trim() || selected.includes("\n")) {
        setAnchor(null);
        return;
      }
      const lineStart = text.lastIndexOf("\n", start - 1) + 1;
      const lineEnd = text.indexOf("\n", start);
      const line = text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      if (!isChordableLyricLine(line)) {
        setAnchor(null);
        return;
      }
      const lead = selected.length - selected.trimStart().length;
      const lineIndex = text.slice(0, lineStart).split("\n").length - 1;
      const col = start + lead - lineStart;
      const point = caretPoint(field, start + lead);
      setAnchor({
        end,
        lineIndex,
        col,
        word: selected.trim().slice(0, 24),
        current: sheetChordAt(text, lineIndex, col),
        ...point,
      });
      setCustom("");
      setCustomError(false);
    };

    const hide = () => setAnchor(null);
    const onMouseUp = () => requestAnimationFrame(check);
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
      else if (event.shiftKey || event.key.startsWith("Arrow")) check();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (popoverRef.current?.contains(event.target as Node)) return;
      hide();
    };
    const onScroll = (event: Event) => {
      if (popoverRef.current?.contains(event.target as Node)) return;
      hide();
    };

    field.addEventListener("mouseup", onMouseUp);
    field.addEventListener("keyup", onKeyUp);
    field.addEventListener("input", hide);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", hide);
    return () => {
      field.removeEventListener("mouseup", onMouseUp);
      field.removeEventListener("keyup", onKeyUp);
      field.removeEventListener("input", hide);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", hide);
    };
  }, [fieldRef, enabled]);

  if (!anchor) return null;

  const apply = (chord: string | null) => {
    const prev = valueRef.current;
    const next = placeSheetChord(prev, anchor.lineIndex, anchor.col, chord);
    const shift = next.length - prev.length;
    const caret = anchor.end + shift;
    setAnchor(null);
    if (next === prev) return;
    onChange(next);
    requestAnimationFrame(() => {
      const field = fieldRef.current;
      if (!field) return;
      field.focus();
      field.setSelectionRange(caret, caret);
    });
  };

  const submitCustom = () => {
    const chord = normalizeTypedChord(custom);
    if (!chord) {
      setCustomError(true);
      return;
    }
    apply(chord);
  };

  const chords = diatonicChords(songKey);
  const width = 288;
  const above = anchor.y > 220;
  const left = Math.min(Math.max(8, anchor.x - 16), window.innerWidth - width - 8);

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Add a chord"
      className="fixed z-[300] rounded-xl border border-white/10 bg-surface-container-high shadow-2xl p-3 space-y-2.5"
      style={{
        width,
        left,
        top: above ? anchor.y - 8 : anchor.y + anchor.lineHeight + 6,
        transform: above ? "translateY(-100%)" : undefined,
      }}
      onMouseDown={(event) => {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      }}
    >
      <p className="text-[11px] text-on-surface-variant">
        Chord over “<span className="font-semibold text-on-surface">{anchor.word}</span>”
        {anchor.current ? (
          <>
            {" "}
            · now <span className="font-semibold text-secondary">{anchor.current}</span>
          </>
        ) : null}
        <span className="block text-[10px] opacity-80">
          {songKey ? `Common chords in ${songKey}` : "No key set, showing chords in C"}
        </span>
      </p>
      <div className="grid grid-cols-6 gap-1">
        {chords.map(({ chord, numeral }) => (
          <button
            key={chord}
            type="button"
            onClick={() => apply(chord)}
            className={`flex flex-col items-center justify-center h-11 rounded-lg border text-sm font-semibold transition-colors ${
              anchor.current === chord
                ? "border-secondary/60 bg-secondary/15 text-secondary"
                : "border-white/10 hover:border-primary/50 hover:bg-primary/10 text-on-surface"
            }`}
          >
            {chord}
            <span className="text-[9px] font-medium text-on-surface-variant">{numeral}</span>
          </button>
        ))}
      </div>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          submitCustom();
        }}
      >
        <input
          value={custom}
          onChange={(event) => {
            setCustom(event.target.value);
            setCustomError(false);
          }}
          placeholder="Other: D/F#, Gsus4, Em7…"
          className={`flex-1 min-w-0 h-8 rounded-lg bg-surface-container-lowest border px-2.5 text-xs focus:outline-none ${
            customError ? "border-error/60" : "border-white/10 focus:border-primary"
          }`}
          aria-invalid={customError}
        />
        <button
          type="submit"
          className="h-8 px-3 rounded-lg bg-primary text-on-primary text-xs font-semibold"
        >
          Add
        </button>
      </form>
      {customError ? (
        <p className="text-[10px] text-error">That doesn't look like a chord. Try G, Am7 or D/F#.</p>
      ) : null}
      {anchor.current ? (
        <button
          type="button"
          onClick={() => apply(null)}
          className="w-full h-8 rounded-lg border border-error/20 text-error hover:bg-error/10 text-xs font-semibold flex items-center justify-center gap-1"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
          Remove {anchor.current}
        </button>
      ) : null}
    </div>,
    document.body,
  );
}
