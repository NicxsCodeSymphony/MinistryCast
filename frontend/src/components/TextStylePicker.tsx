import type { LyricTextStyle } from "../lib/lyricTextStyle";

type TextStylePickerProps = {
  value: LyricTextStyle;
  onChange: (next: LyricTextStyle) => void;
  disabled?: boolean;
};

const OPTIONS = [
  { key: "bold" as const, label: "B", title: "Bold", className: "font-bold" },
  { key: "italic" as const, label: "I", title: "Italic", className: "italic" },
  {
    key: "underline" as const,
    label: "U",
    title: "Underline",
    className: "underline",
  },
];

export default function TextStylePicker({
  value,
  onChange,
  disabled,
}: TextStylePickerProps) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Text style">
      {OPTIONS.map((option) => {
        const selected = value[option.key];
        return (
          <button
            key={option.key}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            title={option.title}
            onClick={() => onChange({ ...value, [option.key]: !selected })}
            className={`min-w-9 h-8 px-2 rounded-md text-xs transition-colors disabled:opacity-40 ${option.className} ${
              selected
                ? "bg-primary text-on-primary"
                : "bg-white/5 text-on-surface-variant hover:bg-white/10 hover:text-on-surface"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
