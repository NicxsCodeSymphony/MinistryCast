import { useEffect, useState } from "react";
import CueStage from "./CueStage";
import StageBackdrop from "./StageBackdrop";
import { getChurchSettings } from "../lib/api";
import { asStageBackground, type StageBackgroundId } from "../lib/stageBackgrounds";
import type { LiveCue } from "../lib/types";

type SermonStagePreviewProps = {
  cue?: LiveCue | null;
  className?: string;
};

export default function SermonStagePreview({
  cue,
  className = "",
}: SermonStagePreviewProps) {
  const [stageBg, setStageBg] = useState<StageBackgroundId>("sanctuary");

  useEffect(() => {
    void getChurchSettings()
      .then((settings) => setStageBg(asStageBackground(settings?.stage_background)))
      .catch(() => undefined);
  }, []);

  return (
    <div
      className={`relative w-full aspect-video overflow-hidden rounded-xl bg-black ${className}`}
    >
      <StageBackdrop id={stageBg} />
      <div className="absolute inset-0">
        <CueStage cue={cue} />
      </div>
    </div>
  );
}
