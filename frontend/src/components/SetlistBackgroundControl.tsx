import { useEffect, useState } from "react";
import { getChurchSettings, updateSetlistBackground } from "../lib/api";
import {
  asStageBackground,
  stageBackgroundDef,
  type StageBackgroundId,
} from "../lib/stageBackgrounds";
import type { Setlist } from "../lib/types";
import { useToast } from "../lib/ToastContext";
import Icon from "./Icon";
import Sheet from "./modals/Sheet";
import { StageBackgroundThumb } from "./StageBackdrop";
import StageBackgroundPicker from "./StageBackgroundPicker";

type Props = {
  setlist: Setlist;
  onChange?: (next: Setlist) => void;
  canEdit: boolean;
};

/**
 * "Background" row for a setlist: the stage background the deck and projector
 * use when this setlist is presented. Empty = the church default.
 */
export default function SetlistBackgroundControl({ setlist, onChange, canEdit }: Props) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [churchDefault, setChurchDefault] = useState<StageBackgroundId>("sanctuary");
  const own = setlist.stage_background ? asStageBackground(setlist.stage_background) : null;
  const effective = own ?? churchDefault;

  useEffect(() => {
    void getChurchSettings()
      .then((settings) => setChurchDefault(asStageBackground(settings?.stage_background)))
      .catch(() => undefined);
  }, []);

  const save = async (next: StageBackgroundId | null) => {
    try {
      const updated = await updateSetlistBackground(setlist.id, next);
      if (updated) onChange?.(updated);
      toast.success(next ? "Setlist background updated." : "Using the church default background.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the background.");
    }
  };

  const label = own ? stageBackgroundDef(own).label : `Church default · ${stageBackgroundDef(churchDefault).label}`;

  return (
    <>
      <div className="flex items-center gap-3">
        <StageBackgroundThumb
          id={effective}
          className="w-14 aspect-video rounded-md border border-white/10 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-on-surface-variant">Stage background</p>
          <p className="text-[13px] text-on-surface truncate" data-testid="setlist-background-label">
            {label}
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ui-btn ui-btn-secondary ui-btn-sm"
            aria-label="Change setlist background"
          >
            <Icon name="palette" className="text-[14px]" />
            Change
          </button>
        ) : null}
      </div>

      <Sheet open={open} onClose={() => setOpen(false)} labelledBy="setlist-bg-title" widthClassName="w-full max-w-md">
        <div className="flex items-center justify-between px-5 h-14 border-b border-white/5">
          <h2 id="setlist-bg-title" className="text-[15px] font-semibold text-on-surface">
            Background for “{setlist.name}”
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ui-icon-btn"
            aria-label="Close"
          >
            <Icon name="close" className="text-[16px]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <p className="text-[13px] text-on-surface-variant">
            Shown behind lyrics and slides on the deck and projector whenever this setlist is
            presented.
          </p>
          <button
            type="button"
            onClick={() => void save(null)}
            aria-pressed={!own}
            className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-colors ${
              !own ? "border-primary/60 bg-primary/10" : "border-white/10 hover:bg-white/5"
            }`}
          >
            <StageBackgroundThumb
              id={churchDefault}
              className="w-14 aspect-video rounded-md border border-white/10 shrink-0"
            />
            <span className="text-[13px] text-on-surface">
              Use church default
              <span className="block text-[12px] text-on-surface-variant">
                {stageBackgroundDef(churchDefault).label} (set in Settings)
              </span>
            </span>
          </button>
          <StageBackgroundPicker
            value={own ?? ("" as StageBackgroundId)}
            onChange={(next) => void save(next)}
            compact
          />
        </div>
      </Sheet>
    </>
  );
}
