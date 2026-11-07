/** Slide canvas toolbar: a fixed tools row plus a formatting row for the selection. */
import type { ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  Copy,
  Expand,
  Italic,
  Maximize2,
  Minimize2,
  Redo2,
  Shrink,
  Square,
  Trash2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import {
  BOX_FILLS,
  TEXT_COLORS,
  TEXT_SIZES,
  type SlideAlign,
  type SlideElement,
} from "./slideLayout";

function ToolBtn({
  label,
  onClick,
  active,
  disabled,
  children,
  wide,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`h-7 ${wide ? "px-2 gap-1.5" : "w-7"} inline-flex items-center justify-center rounded-md text-[12px] font-medium transition-colors disabled:opacity-35 ${
        active
          ? "bg-primary/15 text-primary"
          : "text-on-surface-variant hover:text-on-surface hover:bg-white/[0.06]"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="w-px h-4 shrink-0 bg-[color:var(--mc-hairline-strong)] mx-1" />;
}

/** A set of related tools that always stays together when the row wraps. */
function Group({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className={`flex items-center gap-0.5 shrink-0 ${className}`}>
      {children}
    </div>
  );
}

function Swatch({
  label,
  title,
  hex,
  active,
  round,
  onClick,
}: {
  label: string;
  title: string;
  hex: string;
  active: boolean;
  round?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`w-[18px] h-[18px] shrink-0 border border-[color:var(--mc-hairline-strong)] ${
        round ? "rounded-full" : "rounded-[4px]"
      } ${active ? "ring-2 ring-primary ring-offset-1 ring-offset-[color:var(--mc-surface-container-low)]" : ""}`}
      style={{ background: hex }}
    />
  );
}

type CanvasToolbarProps = {
  selected: SlideElement | null;
  canUndo: boolean;
  canRedo: boolean;
  onAddText: () => void;
  onAddBox: () => void;
  onPatch: (patch: Partial<SlideElement>) => void;
  onDuplicate: () => void;
  onForward: () => void;
  onBackward: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
};

const ICON = { size: 15, strokeWidth: 1.75 };

export default function CanvasToolbar({
  selected,
  canUndo,
  canRedo,
  onAddText,
  onAddBox,
  onPatch,
  onDuplicate,
  onForward,
  onBackward,
  onDelete,
  onUndo,
  onRedo,
  fullscreen = false,
  onToggleFullscreen,
}: CanvasToolbarProps) {
  const text = selected?.type === "text" ? selected : null;
  const box = selected?.type === "box" ? selected : null;
  const aligns: Array<{ id: SlideAlign; label: string; icon: ReactNode }> = [
    { id: "left", label: "Align left", icon: <AlignLeft {...ICON} /> },
    { id: "center", label: "Align center", icon: <AlignCenter {...ICON} /> },
    { id: "right", label: "Align right", icon: <AlignRight {...ICON} /> },
  ];

  return (
    <div
      role="toolbar"
      aria-label="Slide tools"
      className="rounded-lg border border-[color:var(--mc-hairline)] bg-surface-container-low"
    >
      {/* Row 1 never changes shape: insert · arrange · history. */}
      <div className="flex items-center gap-1 px-1.5 py-1 overflow-x-auto">
        <Group label="Insert">
          <ToolBtn label="Add text box" onClick={onAddText} wide>
            <Type {...ICON} />
            Text
          </ToolBtn>
          <ToolBtn label="Add shape" onClick={onAddBox} wide>
            <Square {...ICON} />
            Shape
          </ToolBtn>
        </Group>
        <Divider />
        <Group label="Arrange">
          <ToolBtn label="Duplicate" disabled={!selected} onClick={onDuplicate}>
            <Copy {...ICON} />
          </ToolBtn>
          <ToolBtn label="Bring forward" disabled={!selected} onClick={onForward}>
            <ArrowUpToLine {...ICON} />
          </ToolBtn>
          <ToolBtn label="Send backward" disabled={!selected} onClick={onBackward}>
            <ArrowDownToLine {...ICON} />
          </ToolBtn>
          <ToolBtn label="Delete element" disabled={!selected} onClick={onDelete}>
            <Trash2 {...ICON} />
          </ToolBtn>
        </Group>
        <Group label="History" className="ml-auto">
          <ToolBtn label="Undo" disabled={!canUndo} onClick={onUndo}>
            <Undo2 {...ICON} />
          </ToolBtn>
          <ToolBtn label="Redo" disabled={!canRedo} onClick={onRedo}>
            <Redo2 {...ICON} />
          </ToolBtn>
          {onToggleFullscreen ? (
            <>
              <Divider />
              <ToolBtn
                label={fullscreen ? "Exit full screen" : "Edit in full screen"}
                active={fullscreen}
                onClick={onToggleFullscreen}
              >
                {fullscreen ? <Minimize2 {...ICON} /> : <Maximize2 {...ICON} />}
              </ToolBtn>
            </>
          ) : null}
        </Group>
      </div>

      {/* Row 2: formatting for whatever is selected. Groups wrap whole. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 min-h-9 px-1.5 py-1 border-t border-[color:var(--mc-hairline)]">
        {text ? (
          <>
            <Group label="Text size">
              {TEXT_SIZES.map((size) => (
                <ToolBtn
                  key={size.id}
                  label={`Text size ${size.id}`}
                  active={text.size === size.px}
                  onClick={() => onPatch({ size: size.px })}
                >
                  {size.id}
                </ToolBtn>
              ))}
              <span className="ml-1 inline-flex items-center gap-1">
                <input
                  aria-label="Font size"
                  inputMode="numeric"
                  value={String(text.size ?? 72)}
                  onChange={(event) => {
                    const next = Number(event.target.value.replace(/[^\d]/g, ""));
                    if (Number.isFinite(next) && next >= 8 && next <= 400) onPatch({ size: next });
                  }}
                  className="w-11 h-7 px-1.5 rounded-md bg-transparent border border-[color:var(--mc-hairline-strong)] text-[12px] tabular-nums text-on-surface outline-none focus:border-primary/60"
                />
                <span className="text-[11px] text-on-surface-variant">px</span>
              </span>
            </Group>
            <Group label="Style">
              <ToolBtn label="Bold" active={Boolean(text.bold)} onClick={() => onPatch({ bold: !text.bold })}>
                <Bold {...ICON} />
              </ToolBtn>
              <ToolBtn
                label="Italic"
                active={Boolean(text.italic)}
                onClick={() => onPatch({ italic: !text.italic })}
              >
                <Italic {...ICON} />
              </ToolBtn>
              <ToolBtn
                label="Underline"
                active={Boolean(text.underline)}
                onClick={() => onPatch({ underline: !text.underline })}
              >
                <Underline {...ICON} />
              </ToolBtn>
            </Group>
            <Group label="Fit">
              <ToolBtn
                label="Shrink text to fit"
                active={text.fit !== false}
                onClick={() => onPatch({ fit: text.fit === false })}
                wide
              >
                <Shrink {...ICON} />
                Auto-fit
              </ToolBtn>
              <ToolBtn
                label="Fill slide"
                onClick={() => onPatch({ x: 5, y: 5, w: 90, h: 90, fit: true })}
                wide
              >
                <Expand {...ICON} />
                Fill slide
              </ToolBtn>
            </Group>
            <Group label="Alignment">
              {aligns.map((align) => (
                <ToolBtn
                  key={align.id}
                  label={align.label}
                  active={(text.align ?? "center") === align.id}
                  onClick={() => onPatch({ align: align.id })}
                >
                  {align.icon}
                </ToolBtn>
              ))}
            </Group>
            <Group label="Text color" className="gap-1.5 px-0.5">
              {TEXT_COLORS.map((color) => (
                <Swatch
                  key={color.id}
                  label={`Color ${color.label}`}
                  title={color.label}
                  hex={color.hex}
                  active={text.color === color.hex}
                  round
                  onClick={() => onPatch({ color: color.hex })}
                />
              ))}
            </Group>
          </>
        ) : box ? (
          <Group label="Shape fill" className="gap-1.5 px-0.5">
            <span className="text-[11px] text-on-surface-variant mr-1">Fill</span>
            {BOX_FILLS.map((fill) => (
              <Swatch
                key={fill.id}
                label={`Fill ${fill.label}`}
                title={fill.label}
                hex={fill.hex}
                active={box.fill === fill.hex}
                onClick={() => onPatch({ fill: fill.hex })}
              />
            ))}
          </Group>
        ) : (
          <p className="px-1 text-[12px] text-on-surface-variant">
            Select a text box or shape on the slide to format it.
          </p>
        )}
      </div>
    </div>
  );
}
