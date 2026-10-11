import TextSizePicker from "./TextSizePicker";
import TextStylePicker from "./TextStylePicker";
import {
  DEFAULT_STAGE_TEXT_SIZE,
  parseLyricTextStyle,
  serializeLyricTextStyle,
} from "../lib/lyricTextStyle";
import { asStageFont, DEFAULT_STAGE_FONT, STAGE_FONTS } from "../lib/stageFonts";
import type { ScripturePassage } from "../lib/types";

export type ScriptureStylePatch = Partial<
  Pick<ScripturePassage, "text_size" | "font" | "text_style" | "color">
>;

const SCRIPTURE_COLORS = [
  { id: "auto", label: "Auto", swatch: "linear-gradient(135deg,#ffffff 50%,#111111 50%)" },
  { id: "#fde68a", label: "Gold", swatch: "#fde68a" },
  { id: "#7dd3fc", label: "Sky", swatch: "#7dd3fc" },
  { id: "#86efac", label: "Green", swatch: "#86efac" },
  { id: "#f9a8d4", label: "Pink", swatch: "#f9a8d4" },
  { id: "#fca5a5", label: "Red", swatch: "#fca5a5" },
  { id: "#111111", label: "Black", swatch: "#111111" },
];

/** White is the Add Scripture default, so it counts as Auto (follows the stage background). */
export function scriptureColorIsAuto(color?: string | null) {
  const value = color?.trim();
  return !value || value === "auto" || /^#?f{3}(?:f{3})?$/i.test(value);
}

/** Font, size, bold/italic/underline and color for a scripture passage on screen. */
export default function ScriptureStyleControls({
  passage,
  onChange,
}: {
  passage: Pick<ScripturePassage, "reference" | "text_size" | "font" | "text_style" | "color">;
  onChange: (patch: ScriptureStylePatch) => void;
}) {
  return (
    <div className="space-y-2">
      <select
        value={asStageFont(passage.font)}
        onChange={(event) => onChange({ font: asStageFont(event.target.value) })}
        className="w-full bg-surface-container-low border border-white/10 rounded-lg px-3 py-2 text-sm"
        aria-label="Scripture font"
      >
        {STAGE_FONTS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
            {option.id === DEFAULT_STAGE_FONT ? " (Default)" : ""}
          </option>
        ))}
      </select>
      <TextSizePicker
        value={passage.text_size || DEFAULT_STAGE_TEXT_SIZE}
        onChange={(size) => onChange({ text_size: size })}
      />
      <TextStylePicker
        value={parseLyricTextStyle(passage.text_style)}
        onChange={(next) => onChange({ text_style: serializeLyricTextStyle(next) })}
      />
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
          Color
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {SCRIPTURE_COLORS.map((option) => {
            const selected =
              option.id === "auto"
                ? scriptureColorIsAuto(passage.color)
                : passage.color?.toLowerCase() === option.id;
            return (
              <button
                key={option.id}
                type="button"
                title={option.label}
                aria-label={`Scripture color ${option.label}`}
                aria-pressed={selected}
                onClick={() => onChange({ color: option.id === "auto" ? null : option.id })}
                className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${
                  selected ? "border-primary ring-2 ring-primary/60" : "border-white/20"
                }`}
                style={{ background: option.swatch }}
              />
            );
          })}
          <label
            className="relative h-6 w-6 rounded-full border border-white/20 overflow-hidden cursor-pointer hover:scale-110 transition-transform"
            title="Custom color"
            style={{
              background:
                "conic-gradient(#f87171,#fbbf24,#4ade80,#38bdf8,#a78bfa,#f472b6,#f87171)",
            }}
          >
            <input
              type="color"
              value={scriptureColorIsAuto(passage.color) ? "#ffffff" : passage.color || "#ffffff"}
              onChange={(event) => onChange({ color: event.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Custom scripture color"
            />
          </label>
        </div>
      </div>
      <p className="text-[10px] text-on-surface-variant">
        Applies to every slide of {passage.reference} and updates the projector right away. Auto
        uses white on dark backgrounds and black on light ones.
      </p>
    </div>
  );
}
