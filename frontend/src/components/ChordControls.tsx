import {
  CHORD_ACCIDENTALS,
  CHORD_COLORS,
  CHORD_SIZE_MAX,
  CHORD_SIZE_MIN,
  shiftedKey,
  transposeFor,
  type ChordDisplay,
} from "../lib/chordDisplay";
import Icon from "./Icon";

/** Show/hide chords on screen, plus color, size, key and sharps/flats while shown. */
export default function ChordControls({
  chords,
  onChange,
  itemId,
  songKey,
  hasChords,
  emptyHint = "This song has no chords yet. Add them in Songs to show them here.",
}: {
  chords: ChordDisplay;
  onChange: (patch: Partial<ChordDisplay>) => void;
  itemId?: string | null;
  songKey?: string | null;
  hasChords: boolean;
  emptyHint?: string;
}) {
  const steps = transposeFor(chords, itemId);
  const signed = steps > 6 ? steps - 12 : steps;
  const transpose = (delta: number) => {
    if (!itemId) return;
    const next = (((steps + delta) % 12) + 12) % 12;
    const map = { ...chords.transpose };
    if (next) map[itemId] = next;
    else delete map[itemId];
    onChange({ transpose: map });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[12px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
          Chords
        </h4>
        <button
          type="button"
          role="switch"
          aria-checked={chords.show}
          onClick={() => onChange({ show: !chords.show })}
          className="flex items-center gap-2 text-[11px] font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
        >
          {chords.show ? "Shown on screen" : "Hidden"}
          <span
            className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
              chords.show ? "bg-primary" : "bg-white/15"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                chords.show ? "left-[18px]" : "left-0.5"
              }`}
            />
          </span>
        </button>
      </div>
      {chords.show ? (
        <div className="space-y-3 rounded-lg border border-white/10 bg-surface-container-low p-3">
          {!hasChords ? <p className="text-[10px] text-on-surface-variant">{emptyHint}</p> : null}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Color
            </p>
            <div className="flex flex-wrap gap-1.5">
              {CHORD_COLORS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  title={option.label}
                  aria-label={`Chord color ${option.label}`}
                  aria-pressed={chords.color === option.id}
                  onClick={() => onChange({ color: option.id })}
                  className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${
                    chords.color === option.id
                      ? "border-primary ring-2 ring-primary/60"
                      : "border-white/20"
                  }`}
                  style={{ background: option.swatch }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                Size
              </p>
              <span className="text-[10px] text-on-surface-variant">{chords.size}% of lyrics</span>
            </div>
            <input
              type="range"
              min={CHORD_SIZE_MIN}
              max={CHORD_SIZE_MAX}
              step={5}
              value={chords.size}
              onChange={(event) => onChange({ size: Number(event.target.value) })}
              className="w-full accent-primary"
              aria-label="Chord size"
            />
          </div>
          {itemId ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  Key
                </p>
                {steps ? (
                  <button
                    type="button"
                    onClick={() => transpose(-steps)}
                    className="text-[10px] font-semibold text-primary hover:underline"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => transpose(-1)}
                  className="h-8 w-8 rounded-lg border border-white/10 bg-surface-container hover:bg-white/5 flex items-center justify-center"
                  aria-label="Key down a half step"
                >
                  <Icon name="remove" className="text-[18px]" />
                </button>
                <div className="flex-1 text-center leading-tight">
                  <p className="text-sm font-semibold text-on-surface">
                    {songKey
                      ? shiftedKey(songKey, steps, chords.accidentals)
                      : steps
                        ? `${signed > 0 ? "+" : ""}${signed}`
                        : "Original"}
                  </p>
                  <p className="text-[10px] text-on-surface-variant">
                    {steps
                      ? `${songKey ? `from ${shiftedKey(songKey, 0, chords.accidentals)} · ` : ""}${
                          signed > 0 ? "+" : ""
                        }${signed} half step${Math.abs(signed) === 1 ? "" : "s"}`
                      : "Original key"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => transpose(1)}
                  className="h-8 w-8 rounded-lg border border-white/10 bg-surface-container hover:bg-white/5 flex items-center justify-center"
                  aria-label="Key up a half step"
                >
                  <Icon name="add" className="text-[18px]" />
                </button>
              </div>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
              Sharps or flats
            </p>
            <div className="grid grid-cols-3 gap-1">
              {CHORD_ACCIDENTALS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  title={option.hint}
                  aria-pressed={chords.accidentals === option.id}
                  onClick={() => onChange({ accidentals: option.id })}
                  className={`rounded-lg px-1.5 py-1.5 text-[11px] font-semibold leading-tight transition-colors ${
                    chords.accidentals === option.id
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container border border-white/10 text-on-surface-variant hover:bg-white/5"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-on-surface-variant">
            Changes show on the projector right away. The key change only applies to this song on
            screen; the saved song stays the same.
          </p>
        </div>
      ) : (
        <p className="text-[10px] text-on-surface-variant">
          Chords are hidden on the projector. Turn on to show them and change their color, size,
          or key.
        </p>
      )}
    </div>
  );
}
