import { STAGE_BACKGROUNDS, type StageBackgroundId } from "../lib/stageBackgrounds";
import { stageBackgroundThumbStyle } from "./StageBackdrop";

type StageBackgroundPickerProps = {
  value: StageBackgroundId;
  onChange: (id: StageBackgroundId) => void;
  compact?: boolean;
  disabled?: boolean;
};

export default function StageBackgroundPicker({
  value,
  onChange,
  compact = false,
  disabled = false,
}: StageBackgroundPickerProps) {
  return (
    <div
      className={`grid gap-2 ${
        compact ? "grid-cols-4" : "grid-cols-3 sm:grid-cols-6 lg:grid-cols-12"
      }`}
    >
      {STAGE_BACKGROUNDS.map((bg) => {
        const selected = value === bg.id;
        return (
          <button
            key={bg.id}
            type="button"
            disabled={disabled}
            onClick={() => onChange(bg.id)}
            className={`group flex flex-col gap-1.5 text-left focus:outline-none disabled:opacity-40 disabled:pointer-events-none ${
              compact ? "" : ""
            }`}
            aria-pressed={selected}
            title={bg.label}
          >
            <span
              className={`relative block w-full overflow-hidden rounded-lg border-2 transition-all ${
                compact ? "aspect-[16/10]" : "aspect-video"
              } ${
                selected
                  ? "border-primary shadow-[0_0_0_1px_rgba(155,203,255,0.4)]"
                  : "border-white/10 hover:border-white/30"
              }`}
              style={stageBackgroundThumbStyle(bg.id)}
            >
              {bg.id === "none" ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="material-symbols-outlined text-white/50 text-[18px]">
                    hide_image
                  </span>
                </span>
              ) : null}
              {bg.id === "white" ? (
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-black/70">
                  Aa
                </span>
              ) : null}
            </span>
            <span
              className={`truncate text-[10px] leading-tight ${
                selected ? "text-primary font-semibold" : "text-on-surface-variant"
              }`}
            >
              {bg.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
