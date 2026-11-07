/** Compact calendar tile: weekday over day number. */
export default function DateBlock({
  value,
  highlight,
}: {
  value: string | null | undefined;
  highlight?: boolean;
}) {
  const at = value ? new Date(value) : null;
  const valid = at && Number.isFinite(at.getTime());
  return (
    <span
      aria-hidden
      className={`w-11 h-11 rounded-lg border bg-surface-container-high flex flex-col items-center justify-center leading-none ${
        highlight
          ? "border-primary/40 text-primary"
          : "border-white/10 text-on-surface-variant"
      }`}
    >
      {valid ? (
        <>
          <span className="text-[9px] font-medium uppercase tracking-wide">
            {at.toLocaleDateString(undefined, { weekday: "short" })}
          </span>
          <span
            className={`mt-0.5 text-[14px] font-semibold tabular-nums ${
              highlight ? "text-primary" : "text-on-surface"
            }`}
          >
            {at.getDate()}
          </span>
        </>
      ) : (
        <span className="text-[13px] text-outline">–</span>
      )}
    </span>
  );
}
