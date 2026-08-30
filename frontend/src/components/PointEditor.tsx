import { useEffect, useRef, useState } from "react";
import {
  POINT_COLORS,
  editableToStored,
  storedToEditable,
} from "../lib/sermonMarkup";

type PointEditorProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  expanded?: boolean;
  syncNonce?: number;
  readOnly?: boolean;
  onFocusChange?: (focused: boolean) => void;
};

type FormatKind = "bold" | "italic" | "underline" | "color";

export default function PointEditor({
  value,
  onChange,
  placeholder = "Sermon point…",
  expanded = false,
  syncNonce = 0,
  readOnly = false,
  onFocusChange,
}: PointEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef(false);
  const savedRange = useRef<Range | null>(null);
  const [marks, setMarks] = useState({ bold: false, italic: false, underline: false });

  useEffect(() => {
    const el = editorRef.current;
    if (!el || focusedRef.current) return;
    const next = storedToEditable(value);
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [value]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || syncNonce === 0) return;
    el.innerHTML = storedToEditable(value);
  }, [syncNonce]);

  const flush = () => {
    const el = editorRef.current;
    if (!el) return;
    onChange(editableToStored(el.innerHTML));
  };

  const rememberRange = () => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    savedRange.current = range.cloneRange();
    setMarks({
      bold: isMarkActive(range, "bold"),
      italic: isMarkActive(range, "italic"),
      underline: isMarkActive(range, "underline"),
    });
  };

  const restoreRange = () => {
    const editor = editorRef.current;
    const range = savedRange.current;
    if (!editor || !range) return null;
    editor.focus();
    const sel = window.getSelection();
    if (!sel) return null;
    sel.removeAllRanges();
    sel.addRange(range);
    return range;
  };

  const applyFormat = (kind: FormatKind, color?: string) => {
    if (readOnly) return;
    const editor = editorRef.current;
    if (!editor) return;
    const range = restoreRange();
    if (!range || range.collapsed) return;

    wrapRange(editor, range, kind, color);
    rememberRange();
    flush();
  };

  return (
    <div className={`space-y-2 ${readOnly ? "opacity-60" : ""}`}>
      <div
        className="flex flex-wrap items-center gap-1"
        onMouseDown={(event) => {
          event.preventDefault();
          if (!readOnly) rememberRange();
        }}
      >
        <button
          type="button"
          disabled={readOnly}
          title="Bold (⌘B)"
          aria-label="Bold"
          aria-pressed={marks.bold}
          onClick={() => applyFormat("bold")}
          className={`w-8 h-8 rounded-md flex items-center justify-center disabled:opacity-40 ${
            marks.bold ? "bg-primary text-on-primary" : "bg-white/5 hover:bg-white/10 text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">format_bold</span>
        </button>
        <button
          type="button"
          disabled={readOnly}
          title="Italic (⌘I)"
          aria-label="Italic"
          aria-pressed={marks.italic}
          onClick={() => applyFormat("italic")}
          className={`w-8 h-8 rounded-md flex items-center justify-center disabled:opacity-40 ${
            marks.italic
              ? "bg-primary text-on-primary"
              : "bg-white/5 hover:bg-white/10 text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">format_italic</span>
        </button>
        <button
          type="button"
          disabled={readOnly}
          title="Underline (⌘U)"
          aria-label="Underline"
          aria-pressed={marks.underline}
          onClick={() => applyFormat("underline")}
          className={`w-8 h-8 rounded-md flex items-center justify-center disabled:opacity-40 ${
            marks.underline
              ? "bg-primary text-on-primary"
              : "bg-white/5 hover:bg-white/10 text-on-surface"
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">format_underlined</span>
        </button>
        <span className="w-px h-5 bg-white/10 mx-1" />
        {POINT_COLORS.map((color) => (
          <button
            key={color.id}
            type="button"
            disabled={readOnly}
            title={color.label}
            aria-label={`${color.label} text`}
            onClick={() => applyFormat("color", color.hex)}
            className={`w-6 h-6 rounded-full hover:scale-110 transition-transform ${
              color.id === "black" || color.id === "white"
                ? "border-2 border-white/70"
                : "border border-white/20"
            }`}
            style={{ background: color.hex }}
          />
        ))}
        <label
          className="w-8 h-8 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center cursor-pointer"
          title="Custom color"
        >
          <span className="material-symbols-outlined text-[18px]">palette</span>
          <input
            type="color"
            className="sr-only"
            disabled={readOnly}
            onChange={(event) => applyFormat("color", event.target.value)}
            aria-label="Custom text color"
          />
        </label>
      </div>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label="Edit point"
        aria-readonly={readOnly}
        contentEditable={!readOnly}
        data-placeholder={placeholder}
        suppressContentEditableWarning
        onFocus={() => {
          focusedRef.current = true;
          onFocusChange?.(true);
        }}
        onBlur={() => {
          focusedRef.current = false;
          onFocusChange?.(false);
          flush();
        }}
        onMouseUp={rememberRange}
        onKeyUp={rememberRange}
        onSelect={rememberRange}
        onInput={() => {
          if (readOnly) return;
          rememberRange();
          flush();
        }}
        onKeyDown={(event) => {
          if (readOnly) {
            event.preventDefault();
            return;
          }
          const meta = event.metaKey || event.ctrlKey;
          if (!meta) return;
          const key = event.key.toLowerCase();
          if (key === "b" || key === "i" || key === "u") {
            event.preventDefault();
            rememberRange();
            applyFormat(key === "b" ? "bold" : key === "i" ? "italic" : "underline");
          }
        }}
        className={`point-editor w-full bg-surface-container-low border border-white/10 rounded-lg p-3 text-sm text-on-surface focus:outline-none focus:border-primary/50 overflow-y-auto custom-scrollbar ${
          expanded ? "min-h-[220px] max-h-[46vh]" : "min-h-[120px] max-h-[28vh]"
        }`}
      />
      <p className="text-[10px] text-on-surface-variant">
        Select words, then bold, italic, underline, or a color. Shortcuts: ⌘B
        ⌘I ⌘U. Click an underlined verse to open it.
      </p>
    </div>
  );
}

function wrapRange(editor: HTMLElement, range: Range, kind: FormatKind, color?: string) {
  const pieces = splitSelectedText(range, editor);
  if (!pieces.length) return;
  const unwrap = kind !== "color" && pieces.every((node) => hasMark(node, kind));
  const wrapped: HTMLElement[] = [];

  for (const piece of pieces) {
    if (unwrap) {
      unwrapMark(piece, kind);
      continue;
    }
    const tag = kind === "bold" ? "b" : kind === "italic" ? "i" : kind === "underline" ? "u" : "span";
    const el = document.createElement(tag);
    if (kind === "color" && color) {
      el.setAttribute("data-c", color);
      el.style.color = color;
    }
    piece.parentNode?.insertBefore(el, piece);
    el.appendChild(piece);
    wrapped.push(el);
  }

  const sel = window.getSelection();
  if (!sel) return;
  const next = document.createRange();
  const first = wrapped[0] ?? pieces[0];
  const last = wrapped[wrapped.length - 1] ?? pieces[pieces.length - 1];
  if (!first || !last) return;
  next.setStartBefore(first);
  next.setEndAfter(last);
  sel.removeAllRanges();
  sel.addRange(next);
}

function splitSelectedText(range: Range, root: HTMLElement) {
  const nodes = textNodesInRange(range, root);
  const pieces: Text[] = [];
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    const from = node === range.startContainer ? range.startOffset : 0;
    const to = node === range.endContainer ? range.endOffset : node.data.length;
    if (from >= to) continue;
    let target = node;
    if (from > 0) target = node.splitText(from);
    const length = from > 0 ? to - from : to;
    if (length < target.data.length) target.splitText(length);
    if (target.data) pieces.unshift(target);
  }
  return pieces;
}

function textNodesInRange(range: Range, root: HTMLElement) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current.textContent && range.intersectsNode(current)) {
      nodes.push(current as Text);
    }
    current = walker.nextNode();
  }
  return nodes;
}

function hasMark(node: Node, kind: Exclude<FormatKind, "color">) {
  const match = markTags(kind);
  let current: Node | null = node;
  while (current && !(current instanceof HTMLElement && current.isContentEditable)) {
    if (current instanceof HTMLElement && match.includes(current.tagName)) return true;
    current = current.parentNode;
  }
  return false;
}

function unwrapMark(node: Text, kind: Exclude<FormatKind, "color">) {
  const match = markTags(kind);
  let current: Node | null = node.parentNode;
  while (current && !(current instanceof HTMLElement && current.isContentEditable)) {
    if (current instanceof HTMLElement && match.includes(current.tagName)) {
      const parent = current.parentNode;
      if (!parent) return;
      while (current.firstChild) parent.insertBefore(current.firstChild, current);
      parent.removeChild(current);
      return;
    }
    current = current.parentNode;
  }
}

function markTags(kind: Exclude<FormatKind, "color">) {
  if (kind === "bold") return ["B", "STRONG"];
  if (kind === "italic") return ["I", "EM"];
  return ["U"];
}

function isMarkActive(range: Range, kind: Exclude<FormatKind, "color">) {
  const node = range.startContainer;
  return hasMark(node, kind);
}
