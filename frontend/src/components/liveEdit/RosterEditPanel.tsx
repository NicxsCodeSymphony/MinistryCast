import { useEffect, useImperativeHandle, useMemo, useState } from "react";
import { ScaledStage, SlideRow, ToolButton } from "../StageEditor";
import { ControlCard, EditPanelShell, type EditPanelProps } from "./shared";
import { updateSetlistItem } from "../../lib/api";
import { formatRosterDate, normalizeRoster, type RosterPayload } from "../../lib/roster";
import { stageUsesDarkText } from "../../lib/stageBackgrounds";
import { DEFAULT_STAGE_FONT, stageFontFamily } from "../../lib/stageFonts";

const GOLD = "#e8c97a";

function sameRoster(a: RosterPayload, b: RosterPayload) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export default function RosterEditPanel({
  item,
  itemPicker,
  cues,
  liveIndex,
  stage,
  onShowCue,
  onRefresh,
  onDirtyChange,
  handleRef,
}: EditPanelProps) {
  const saved = useMemo(() => normalizeRoster(item.payload), [item.payload]);
  const [draft, setDraft] = useState<RosterPayload>(saved);
  const dirty = !sameRoster(draft, saved);

  useEffect(() => {
    setDraft((prev) => (sameRoster(prev, saved) ? prev : saved));
    // Only follow the saved roster while there are no local edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  useEffect(() => {
    onDirtyChange(dirty ? 1 : 0);
  }, [dirty, onDirtyChange]);

  useImperativeHandle(handleRef, () => ({
    save: async () => {
      const next: RosterPayload = {
        heading: draft.heading.trim() || "Next Week",
        date: draft.date,
        roles: draft.roles
          .map((row) => ({ role: row.role.trim(), name: row.name.trim() }))
          .filter((row) => row.role),
      };
      await updateSetlistItem(item.setlist_id, item.id, {
        title: next.heading,
        subtitle: formatRosterDate(next.date),
        payload: next,
      });
      await onRefresh();
      setDraft(normalizeRoster(next));
    },
    discard: () => setDraft(saved),
  }));

  const patchRole = (index: number, patch: Partial<RosterPayload["roles"][number]>) =>
    setDraft((prev) => ({
      ...prev,
      roles: prev.roles.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
  const addRole = () =>
    setDraft((prev) => ({ ...prev, roles: [...prev.roles, { role: "New role", name: "" }] }));
  const removeRole = (index: number) =>
    setDraft((prev) => ({ ...prev, roles: prev.roles.filter((_, i) => i !== index) }));

  const showIndex = cues.findIndex((cue) => cue.itemId === item.id);
  const darkText = stageUsesDarkText(stage.stageBg);
  const shadow = darkText ? "none" : "0 6px 24px rgba(0,0,0,0.7)";
  const field =
    "bg-transparent border-0 outline-none focus:ring-0 p-0 rounded-md focus:bg-white/5 hover:bg-white/5";

  return (
    <EditPanelShell
      itemPicker={itemPicker}
      heading="Assignments · click any text on the slide to change it"
      showIndex={showIndex}
      liveIndex={liveIndex}
      dirty={dirty}
      onShowCue={onShowCue}
      list={
        <SlideRow
          label={draft.heading || "Assignments"}
          text={formatRosterDate(draft.date)}
          selected
          live={cues[liveIndex]?.itemId === item.id}
          dirty={dirty}
          onClick={() => undefined}
        />
      }
      tools={<ToolButton icon="person_add" label="Add role" onClick={addRole} />}
    >
      <ScaledStage stageBg={stage.stageBg} highlight>
        <div
          className="h-full w-full overflow-y-auto custom-scrollbar flex flex-col items-center justify-center px-[160px] py-[60px]"
          style={{ fontFamily: stageFontFamily(DEFAULT_STAGE_FONT) }}
        >
          <input
            value={draft.heading}
            onChange={(event) => setDraft((prev) => ({ ...prev, heading: event.target.value }))}
            placeholder="NEXT WEEK"
            className={`${field} w-full text-center font-semibold uppercase`}
            style={{
              color: darkText ? "#8a6a12" : GOLD,
              fontSize: 34,
              letterSpacing: "0.42em",
              textShadow: shadow,
            }}
            aria-label="Heading"
          />
          <h2
            className={`text-center font-semibold mt-6 ${darkText ? "text-black" : "text-white"}`}
            style={{ fontSize: 86, lineHeight: 1.1, letterSpacing: "-0.02em", textShadow: shadow }}
          >
            {formatRosterDate(draft.date)}
          </h2>
          <div
            className="mt-10 mb-14 shrink-0"
            style={{ width: 116, height: 2, background: GOLD, opacity: 0.85 }}
          />
          <div className="w-full max-w-[1420px] space-y-6">
            {draft.roles.map((row, index) => (
              <div
                key={index}
                className="group relative flex items-baseline gap-6"
                style={{ fontSize: 43, lineHeight: 1.2, textShadow: shadow }}
              >
                <input
                  value={row.role}
                  onChange={(event) => patchRole(index, { role: event.target.value })}
                  placeholder="Role"
                  className={`${field} shrink-0 ${darkText ? "font-bold" : "font-medium"}`}
                  style={{ color: darkText ? "#000" : GOLD, width: "38%" }}
                  aria-label={`Role ${index + 1}`}
                />
                <span
                  className="flex-1 min-w-[48px]"
                  style={{
                    borderBottom: `2px dotted ${darkText ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.28)"}`,
                    transform: "translateY(-10px)",
                  }}
                  aria-hidden
                />
                <input
                  value={row.name}
                  onChange={(event) => patchRole(index, { name: event.target.value })}
                  placeholder="—"
                  className={`${field} shrink-0 text-right font-semibold ${
                    darkText ? "text-[#111] placeholder:text-black/35" : "text-white placeholder:text-white/40"
                  }`}
                  style={{ width: "30%" }}
                  aria-label={`Name for ${row.role || `role ${index + 1}`}`}
                />
                <button
                  type="button"
                  onClick={() => removeRole(index)}
                  className="absolute -right-[90px] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus:opacity-100 w-[64px] h-[64px] rounded-full bg-black/50 text-white flex items-center justify-center"
                  aria-label={`Remove ${row.role || "role"}`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 40 }}>
                    close
                  </span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </ScaledStage>

      <div className="grid gap-4 md:grid-cols-2">
        <ControlCard title="Date">
          <input
            type="date"
            value={draft.date}
            onChange={(event) => {
              const date = event.target.value;
              if (date) setDraft((prev) => ({ ...prev, date }));
            }}
            className="w-full bg-surface-container-low border border-white/10 rounded-lg px-3 h-9 text-sm"
          />
        </ControlCard>
        <ControlCard title="Roles">
          <button
            type="button"
            onClick={addRole}
            className="inline-flex items-center gap-1 px-3 h-8 rounded-lg border border-white/10 hover:bg-white/5 text-[11px] font-semibold"
          >
            <span className="material-symbols-outlined text-[16px]">person_add</span>
            Add role
          </button>
          <p className="text-[11px] text-on-surface-variant">
            Hover a row on the slide and press × to remove it. Empty roles are dropped when you save.
          </p>
        </ControlCard>
      </div>
    </EditPanelShell>
  );
}
