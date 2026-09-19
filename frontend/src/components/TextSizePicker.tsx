import { useEffect, useState } from "react";
import { SERMON_TEXT_SIZES, sermonSizePx } from "../lib/helpers";

type TextSizePickerProps = {
  value: string;
  onChange: (size: string) => void;
  disabled?: boolean;
};

const MIN_PX = 1;
const MAX_PX = 160;

function commitPx(raw: string) {
  const next = Number(raw);
  if (!Number.isFinite(next)) return null;
  const rounded = Math.round(next);
  if (rounded < MIN_PX || rounded > MAX_PX) return null;
  return String(rounded);
}

export default function TextSizePicker({
  value,
  onChange,
  disabled,
}: TextSizePickerProps) {
  const px = sermonSizePx(value);
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    setDraft(null);
  }, [value]);

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Text size">
      {SERMON_TEXT_SIZES.map((size) => {
        const selected = value === size.id;
        return (
          <button
            key={size.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(size.id)}
            className={`min-w-9 h-8 px-2 rounded-md text-xs font-bold transition-colors disabled:opacity-40 ${
              selected
                ? "bg-primary text-on-primary"
                : "bg-white/5 text-on-surface-variant hover:bg-white/10 hover:text-on-surface"
            }`}
            title={`${size.label} · ${size.px}px`}
          >
            {size.label}
          </button>
        );
      })}
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={draft ?? String(px)}
        onChange={(event) => {
          const raw = event.target.value.replace(/[^\d]/g, "");
          setDraft(raw);
          const committed = commitPx(raw);
          if (committed) onChange(committed);
        }}
        onBlur={() => {
          const committed = commitPx(draft ?? String(px));
          if (committed) onChange(committed);
          setDraft(null);
        }}
        className="w-14 h-8 ml-1 rounded-md bg-white/5 border border-white/10 text-center text-xs text-on-surface disabled:opacity-40"
        aria-label="Font size in pixels"
        title="Size in pixels"
      />
      <span className="text-[10px] text-on-surface-variant">px</span>
    </div>
  );
}
