import { chordSheetToInline, chordStackMinWidth, chordStacks } from "../lib/chords";

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
  if (!content.trim()) {
    return <p className={lyricClassName}>—</p>;
  }
  const lines = chordSheetToInline(content).split("\n");

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

        return (
          <p
            key={`c-${index}`}
            className={`flex flex-wrap items-end leading-none ${lyricClassName}`}
          >
            {chordStacks(line).map((stack, stackIndex) => (
              <span
                key={`s-${stackIndex}`}
                className="inline-flex flex-col items-start"
                style={{ minWidth: chordStackMinWidth(stack, 0.72) }}
              >
                <span
                  className={`h-[1.05em] w-0 overflow-visible whitespace-nowrap text-[0.72em] tracking-wide ${chordClassName}`}
                >
                  {stack.chord || "\u00a0"}
                </span>
                <span className="leading-relaxed whitespace-pre">
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
