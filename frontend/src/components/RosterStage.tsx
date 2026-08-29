import { useLayoutEffect, useRef, useState } from "react";
import { formatRosterDate } from "../lib/roster";
import { DEFAULT_STAGE_FONT, stageFontFamily } from "../lib/stageFonts";
import type { LiveCue } from "../lib/types";

const DESIGN_W = 1600;
const DESIGN_H = 900;
const GOLD = "#e8c97a";

type RosterStageProps = {
  cue: LiveCue;
  className?: string;
  paddingTop?: number;
};

export default function RosterStage({
  cue,
  className = "",
  paddingTop = 0,
}: RosterStageProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const roster = cue.roster;
  const heading = (roster?.heading || cue.heading || "Next Week").trim();
  const dateLabel = roster?.date ? formatRosterDate(roster.date) : "";
  const roles = roster?.roles?.length
    ? roster.roles
    : [{ role: "Assignment", name: "" }];
  const family = stageFontFamily(DEFAULT_STAGE_FONT);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => {
      const w = box.clientWidth;
      const h = box.clientHeight;
      if (w < 8 || h < 8) return;
      setScale(Math.min(w / DESIGN_W, h / DESIGN_H));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [roles.length, heading, dateLabel]);

  return (
    <div
      ref={boxRef}
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{
        fontFamily: family,
        paddingTop: paddingTop ? `${paddingTop}px` : undefined,
      }}
    >
      <div
        className="absolute left-1/2 top-1/2 flex flex-col items-center justify-center px-[120px]"
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        <p
          className="text-center font-semibold uppercase"
          style={{
            color: GOLD,
            fontSize: 28,
            letterSpacing: "0.42em",
            textShadow: "0 4px 24px rgba(0,0,0,0.7)",
          }}
        >
          {heading}
        </p>
        {dateLabel ? (
          <h2
            className="text-center font-semibold text-white mt-5"
            style={{
              fontSize: 72,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              textShadow: "0 8px 32px rgba(0,0,0,0.75)",
            }}
          >
            {dateLabel}
          </h2>
        ) : null}
        <div
          className="mt-8 mb-12"
          style={{
            width: 96,
            height: 2,
            background: GOLD,
            opacity: 0.85,
            boxShadow: "0 0 16px rgba(232,201,122,0.45)",
          }}
        />
        <div className="w-full max-w-[1180px] space-y-7">
          {roles.map((row, index) => (
            <div
              key={`${index}-${row.role}`}
              className="flex items-baseline gap-5"
              style={{
                fontSize: 36,
                lineHeight: 1.2,
                textShadow: "0 6px 24px rgba(0,0,0,0.7)",
              }}
            >
              <span
                className="shrink-0 font-medium"
                style={{ color: GOLD, minWidth: "38%" }}
              >
                {row.role}
              </span>
              <span
                className="flex-1 min-w-[48px]"
                style={{
                  borderBottom: "2px dotted rgba(255,255,255,0.28)",
                  transform: "translateY(-8px)",
                }}
                aria-hidden
              />
              <span
                className="shrink-0 text-right font-semibold text-white"
                style={{ minWidth: "28%", color: row.name ? "#fff" : "rgba(255,255,255,0.4)" }}
              >
                {row.name || "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
