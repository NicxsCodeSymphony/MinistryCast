import { splitChordProLine } from "../lib/chords";

type ChordLyricPreviewProps = {
  content: string;
  className?: string;
  chordClassName?: string;
  lyricClassName?: string;
};

/** Ultimate Guitar–style: each chord sits directly above the lyric it marks. */
export default function ChordLyricPreview({
  content,
  className = "",
  chordClassName = "text-primary font-semibold",
  lyricClassName = "text-on-surface-variant",
}: ChordLyricPreviewProps) {
  const lines = content.split("\n");
  if (!content.trim()) {
    return <p className={lyricClassName}>—</p>;
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {lines.map((line, index) => {
        if (!line.trim()) {
          return <div key={`gap-${index}`} className="h-3" aria-hidden />;
        }
        if (!/\[[^\]]+\]/.test(line)) {
          return (
            <p key={`t-${index}`} className={`leading-relaxed ${lyricClassName}`}>
              {line}
            </p>
          );
        }

        const parts = splitChordProLine(line);
        // Pair chord tokens with the following text run (UG column stacks).
        const stacks: { chord: string; text: string }[] = [];
        let pendingChord = "";
        for (const part of parts) {
          if (part.type === "chord") {
            if (pendingChord) stacks.push({ chord: pendingChord, text: "" });
            pendingChord = part.value;
            continue;
          }
          stacks.push({ chord: pendingChord, text: part.value });
          pendingChord = "";
        }
        if (pendingChord) stacks.push({ chord: pendingChord, text: "" });

        return (
          <p
            key={`c-${index}`}
            className={`flex flex-wrap items-end leading-none ${lyricClassName}`}
          >
            {stacks.map((stack, stackIndex) => (
              <span
                key={`s-${stackIndex}`}
                className="inline-flex flex-col items-start mr-0.5"
              >
                <span
                  className={`min-h-[1.05em] text-[0.72em] tracking-wide ${chordClassName}`}
                >
                  {stack.chord || "\u00a0"}
                </span>
                <span className="leading-relaxed whitespace-pre-wrap">
                  {stack.text || "\u00a0"}
                </span>
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
