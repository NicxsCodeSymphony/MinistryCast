/**
 * PowerPoint-style editor for one sermon slide: text boxes and shapes placed
 * freely on a 16:9 stage. Positions are % of the stage, font sizes are px at
 * 1920×1080 scaled with container units, so it matches the projector.
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Minimize2 } from "lucide-react";
import StageBackdrop from "../StageBackdrop";
import { stageUsesDarkText, type StageBackgroundId } from "../../lib/stageBackgrounds";
import CanvasToolbar from "./CanvasToolbar";
import {
  STAGE_H,
  STAGE_W,
  elementBoxStyle,
  elementFillStyle,
  elementTextStyle,
  FittedText,
  newElementId,
  textareaOverflows,
  useTextFitScale,
  type SlideElement,
  type SlideLayout,
} from "./slideLayout";

type Corner = "nw" | "ne" | "sw" | "se";

type Session =
  | { kind: "move"; id: string; startX: number; startY: number; orig: SlideElement }
  | { kind: "resize"; id: string; corner: Corner; startX: number; startY: number; orig: SlideElement };

const SNAP = 1.2;
const MIN = 3;

export function newTextElement(text = "", size = 72): SlideElement {
  return {
    id: newElementId(),
    type: "text",
    x: 20,
    y: 41,
    w: 60,
    h: 18,
    text,
    size,
    align: "center",
  };
}

export function newBoxElement(): SlideElement {
  return {
    id: newElementId(),
    type: "box",
    x: 25,
    y: 32.5,
    w: 50,
    h: 35,
    fill: "rgba(0,0,0,0.45)",
    radius: 24,
  };
}

type SlideCanvasProps = {
  layout: SlideLayout;
  onChange: (next: SlideLayout) => void;
  stageBg: StageBackgroundId;
  /** Element to select (and edit, for text) when the canvas opens. */
  startWith?: { id: string; edit: boolean } | null;
};

export default function SlideCanvas({ layout, onChange, stageBg, startWith }: SlideCanvasProps) {
  const darkText = stageUsesDarkText(stageBg);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(startWith?.id ?? null);
  const [editingId, setEditingId] = useState<string | null>(
    startWith?.edit ? startWith.id : null,
  );
  const [guides, setGuides] = useState({ v: false, h: false });
  /** Big-screen editing: the same editor over the whole window. */
  const [fullscreen, setFullscreen] = useState(false);
  const [, force] = useState(0);
  const past = useRef<SlideLayout[]>([]);
  const future = useRef<SlideLayout[]>([]);
  const session = useRef<Session | null>(null);
  const latest = useRef(layout);
  latest.current = layout;

  const selected = layout.els.find((el) => el.id === selectedId) ?? null;

  const commit = (next: SlideLayout, record = true) => {
    if (record) {
      past.current.push(latest.current);
      if (past.current.length > 100) past.current.shift();
      future.current = [];
      force((n) => n + 1);
    }
    latest.current = next;
    onChange(next);
  };

  const patchEl = (id: string, patch: Partial<SlideElement>, record = true) =>
    commit(
      { ...latest.current, els: latest.current.els.map((el) => (el.id === id ? { ...el, ...patch } : el)) },
      record,
    );

  const undo = () => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(latest.current);
    setEditingId(null);
    commit(prev, false);
    force((n) => n + 1);
  };

  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(latest.current);
    setEditingId(null);
    commit(next, false);
    force((n) => n + 1);
  };

  const add = (el: SlideElement, edit: boolean) => {
    const els = el.type === "box" ? [el, ...latest.current.els] : [...latest.current.els, el];
    commit({ ...latest.current, els });
    setSelectedId(el.id);
    setEditingId(edit ? el.id : null);
    if (!edit) rootRef.current?.focus();
  };

  const remove = (id: string) => {
    commit({ ...latest.current, els: latest.current.els.filter((el) => el.id !== id) });
    setSelectedId(null);
    setEditingId(null);
    rootRef.current?.focus();
  };

  const duplicate = (id: string) => {
    const el = latest.current.els.find((row) => row.id === id);
    if (!el) return;
    const copy = { ...el, id: newElementId(), x: el.x + 2, y: el.y + 3 };
    const index = latest.current.els.findIndex((row) => row.id === id);
    const els = [...latest.current.els];
    els.splice(index + 1, 0, copy);
    commit({ ...latest.current, els });
    setSelectedId(copy.id);
  };

  const reorder = (id: string, delta: number) => {
    const els = [...latest.current.els];
    const from = els.findIndex((row) => row.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= els.length) return;
    const [row] = els.splice(from, 1);
    els.splice(to, 0, row);
    commit({ ...latest.current, els });
  };

  const finishEditing = () => {
    const id = editingId;
    setEditingId(null);
    if (!id) return;
    const el = latest.current.els.find((row) => row.id === id);
    // An empty text box would be invisible on stage, so drop it.
    if (el?.type === "text" && !(el.text ?? "").trim()) {
      commit({ ...latest.current, els: latest.current.els.filter((row) => row.id !== id) }, false);
      setSelectedId(null);
    }
  };

  /* Pointer: move and resize. */
  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const s = session.current;
      const stage = stageRef.current;
      if (!s || !stage) return;
      const rect = stage.getBoundingClientRect();
      const dx = ((event.clientX - s.startX) / rect.width) * 100;
      const dy = ((event.clientY - s.startY) / rect.height) * 100;
      const o = s.orig;
      if (s.kind === "move") {
        let x = o.x + dx;
        let y = o.y + dy;
        let v = false;
        let h = false;
        if (Math.abs(x + o.w / 2 - 50) < SNAP) {
          x = 50 - o.w / 2;
          v = true;
        }
        if (Math.abs(y + o.h / 2 - 50) < SNAP) {
          y = 50 - o.h / 2;
          h = true;
        }
        x = Math.min(100 - 2, Math.max(-o.w + 2, x));
        y = Math.min(100 - 2, Math.max(-o.h + 2, y));
        setGuides({ v, h });
        patchEl(s.id, { x, y }, false);
        return;
      }
      let { x, y, w, h } = o;
      if (s.corner.includes("e")) w = Math.max(MIN, o.w + dx);
      if (s.corner.includes("s")) h = Math.max(MIN, o.h + dy);
      if (s.corner.includes("w")) {
        w = Math.max(MIN, o.w - dx);
        x = o.x + o.w - w;
      }
      if (s.corner.includes("n")) {
        h = Math.max(MIN, o.h - dy);
        y = o.y + o.h - h;
      }
      patchEl(s.id, { x, y, w, h }, false);
    };
    const onUp = () => {
      if (!session.current) return;
      session.current = null;
      // A click without movement should not leave an empty undo step.
      if (past.current[past.current.length - 1] === latest.current) {
        past.current.pop();
        force((n) => n + 1);
      }
      setGuides({ v: false, h: false });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  });

  /* Full screen: Esc steps back (finish typing → deselect → exit) and never
     reaches page-level Esc handlers such as "close Edit Mode". */
  const escState = useRef({ editingId, selectedId });
  escState.current = { editingId, selectedId };
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Inside the canvas the canvas's own key handler steps back one level.
      if (event.target instanceof Node && rootRef.current?.contains(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (escState.current.editingId) {
        finishEditing();
        rootRef.current?.focus();
      } else if (escState.current.selectedId) {
        setSelectedId(null);
      } else {
        setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = overflow;
    };
  });

  useEffect(() => {
    if (fullscreen) rootRef.current?.focus();
  }, [fullscreen]);

  const begin = (
    event: ReactPointerEvent,
    el: SlideElement,
    kind: "move" | "resize",
    corner: Corner = "se",
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (kind === "move" && editingId === el.id) return;
    event.preventDefault();
    if (editingId && editingId !== el.id) finishEditing();
    setSelectedId(el.id);
    rootRef.current?.focus();
    // One undo step per drag.
    past.current.push(latest.current);
    future.current = [];
    force((n) => n + 1);
    session.current =
      kind === "move"
        ? { kind, id: el.id, startX: event.clientX, startY: event.clientY, orig: el }
        : { kind, id: el.id, corner, startX: event.clientX, startY: event.clientY, orig: el };
  };

  const onKeyDown = (event: ReactKeyboardEvent) => {
    const meta = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (editingId) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finishEditing();
        rootRef.current?.focus();
      }
      return;
    }
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (meta && key === "z") {
      handled();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (meta && key === "y") {
      handled();
      redo();
      return;
    }
    if (!selected) {
      if (event.key === "Escape" && fullscreen) {
        handled();
        setFullscreen(false);
      }
      return;
    }
    if (meta && key === "d") {
      handled();
      duplicate(selected.id);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      handled();
      remove(selected.id);
      return;
    }
    if (event.key === "Enter" && selected.type === "text") {
      handled();
      setEditingId(selected.id);
      return;
    }
    if (event.key === "Escape") {
      handled();
      setSelectedId(null);
      return;
    }
    const step = event.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (move) {
      handled();
      patchEl(selected.id, {
        x: selected.x + (move[0] / STAGE_W) * 100,
        y: selected.y + (move[1] / STAGE_H) * 100,
      });
    }
  };

  const editor = (
    <div className={fullscreen ? "flex-1 min-h-0 flex flex-col gap-3" : "space-y-2"}>
      <CanvasToolbar
        selected={selected}
        canUndo={past.current.length > 0}
        canRedo={future.current.length > 0}
        onAddText={() => add(newTextElement(), true)}
        onAddBox={() => add(newBoxElement(), false)}
        onPatch={(patch) => selected && patchEl(selected.id, patch)}
        onDuplicate={() => selected && duplicate(selected.id)}
        onForward={() => selected && reorder(selected.id, 1)}
        onBackward={() => selected && reorder(selected.id, -1)}
        onDelete={() => selected && remove(selected.id)}
        onUndo={undo}
        onRedo={redo}
        fullscreen={fullscreen}
        onToggleFullscreen={() => setFullscreen((on) => !on)}
      />
      {/* In full screen the stage is the largest 16:9 box that fits. */}
      <div
        className={fullscreen ? "flex-1 min-h-0 flex items-center justify-center" : "contents"}
        style={fullscreen ? { containerType: "size" } : undefined}
      >
      <div
        ref={rootRef}
        tabIndex={0}
        role="group"
        aria-label="Slide canvas"
        data-testid="slide-canvas"
        onKeyDown={onKeyDown}
        onPointerDown={() => {
          if (editingId) finishEditing();
          setSelectedId(null);
          rootRef.current?.focus();
        }}
        style={fullscreen ? { width: "min(100cqw, calc(100cqh * 16 / 9))" } : undefined}
        className={`relative ${fullscreen ? "" : "w-full"} aspect-video overflow-hidden rounded-lg border border-[color:var(--mc-hairline-strong)] outline-none focus-visible:ring-2 focus-visible:ring-primary/50 select-none ${
          darkText ? "bg-white" : "bg-black"
        }`}
      >
        <StageBackdrop id={stageBg} />
        <div ref={stageRef} className="absolute inset-0" style={{ containerType: "size" }}>
          {layout.els.map((el) => {
            const isSelected = el.id === selectedId;
            const isEditing = el.id === editingId;
            return (
              <div
                key={el.id}
                data-testid="canvas-element"
                data-type={el.type}
                aria-label={el.type === "text" ? `Text box: ${el.text || "empty"}` : "Shape"}
                onPointerDown={(event) => begin(event, el, "move")}
                onDoubleClick={(event) => {
                  event.stopPropagation();
                  if (el.type === "text") {
                    setSelectedId(el.id);
                    setEditingId(el.id);
                  }
                }}
                style={{
                  ...elementBoxStyle(el),
                  ...(el.type === "box" ? elementFillStyle(el) : {}),
                  cursor: isEditing ? "text" : "move",
                  touchAction: "none",
                }}
              >
                {el.type === "text" ? (
                  isEditing ? (
                    <FitTextarea
                      el={el}
                      darkText={darkText}
                      onFocus={() => {
                        past.current.push(latest.current);
                        future.current = [];
                      }}
                      onChange={(text) => patchEl(el.id, { text }, false)}
                      onBlur={finishEditing}
                    />
                  ) : (
                    <FittedText el={el} darkText={darkText} />
                  )
                ) : null}
                {isSelected ? (
                  <>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -inset-px border-[1.5px] border-primary rounded-[2px]"
                    />
                    {!isEditing
                      ? (["nw", "ne", "sw", "se"] as Corner[]).map((corner) => (
                          <span
                            key={corner}
                            data-handle={corner}
                            onPointerDown={(event) => begin(event, el, "resize", corner)}
                            className={`absolute w-2.5 h-2.5 rounded-[2px] bg-white border border-primary ${
                              corner.includes("n") ? "-top-[5px]" : "-bottom-[5px]"
                            } ${corner.includes("w") ? "-left-[5px]" : "-right-[5px]"} ${
                              corner === "nw" || corner === "se" ? "cursor-nwse-resize" : "cursor-nesw-resize"
                            }`}
                            style={{ touchAction: "none" }}
                          />
                        ))
                      : null}
                  </>
                ) : null}
              </div>
            );
          })}
          {guides.v ? (
            <span aria-hidden className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-px bg-primary/80" />
          ) : null}
          {guides.h ? (
            <span aria-hidden className="pointer-events-none absolute left-0 right-0 top-1/2 h-px bg-primary/80" />
          ) : null}
          {layout.els.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className={`text-[13px] ${darkText ? "text-black/40" : "text-white/50"}`}>
                Add a text box or a shape
              </span>
            </div>
          ) : null}
        </div>
      </div>
      </div>
      <p className="text-[11px] text-on-surface-variant">
        Double-click text to edit · drag to move · corners resize · arrows nudge (Shift ×10) · ⌘Z
        undo · Delete removes{fullscreen ? " · Esc exits full screen" : ""}
      </p>
    </div>
  );

  if (!fullscreen) return editor;

  return (
    <>
      <div className="aspect-video w-full rounded-lg border border-dashed border-[color:var(--mc-hairline-strong)] flex flex-col items-center justify-center gap-2 text-[12px] text-on-surface-variant">
        Editing this slide in full screen
        <button
          type="button"
          onClick={() => setFullscreen(false)}
          className="ui-btn ui-btn-secondary !h-8 text-[12px]"
        >
          Exit full screen
        </button>
      </div>
      {createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Slide editor, full screen"
          className="fixed inset-0 z-[150] flex flex-col gap-3 p-3 sm:p-5 bg-surface-container-lowest"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-medium text-on-surface">Slide editor</p>
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="ui-btn ui-btn-secondary !h-8 gap-1.5 text-[12px]"
            >
              <Minimize2 size={14} strokeWidth={1.75} />
              Exit full screen
              <kbd className="ui-kbd ml-1">Esc</kbd>
            </button>
          </div>
          {editor}
        </div>,
        document.body,
      )}
    </>
  );
}

/** In-place text editing that shrinks the same way the finished slide does. */
function FitTextarea({
  el,
  darkText,
  onFocus,
  onChange,
  onBlur,
}: {
  el: SlideElement;
  darkText: boolean;
  onFocus: () => void;
  onChange: (text: string) => void;
  onBlur: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const scale = useTextFitScale(el, ref, textareaOverflows);
  return (
    <textarea
      ref={ref}
      autoFocus
      aria-label="Text box text"
      value={el.text ?? ""}
      placeholder="Type here"
      onFocus={onFocus}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      onPointerDown={(event) => event.stopPropagation()}
      className="block w-full h-full resize-none bg-transparent border-0 outline-none p-0 overflow-hidden placeholder:opacity-50"
      style={{
        ...elementTextStyle(el, darkText, scale),
        caretColor: "currentColor",
      }}
    />
  );
}
