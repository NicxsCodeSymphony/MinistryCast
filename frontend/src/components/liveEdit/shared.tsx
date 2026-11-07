import type { MutableRefObject, ReactNode } from "react";
import type { ChordDisplay } from "../../lib/chordDisplay";
import type { LyricTextStyle } from "../../lib/lyricTextStyle";
import type { StageBackgroundId } from "../../lib/stageBackgrounds";
import type { LiveCue, SetlistItem } from "../../lib/types";
import Icon from "../Icon";

/** What the edit-mode header calls to save or throw away a panel's unsaved edits. */
export type EditPanelHandle = {
  save: () => Promise<void>;
  discard: () => void;
};

export type StageLook = {
  font: string;
  lyricSize: string;
  lyricStyle: LyricTextStyle;
  chords?: ChordDisplay | null;
  stageBg: StageBackgroundId;
};

/** Live settings that apply to the projector immediately (not part of Save). */
export type StageActions = {
  onFontChange?: (font: string) => void;
  onLyricSizeChange?: (size: string) => void;
  onLyricStyleChange?: (style: LyricTextStyle) => void;
  onChordsChange?: (patch: Partial<ChordDisplay>) => void;
};

export type EditPanelProps = {
  item: SetlistItem;
  itemPicker: ReactNode;
  cues: LiveCue[];
  liveIndex: number;
  stage: StageLook;
  actions: StageActions;
  onShowCue: (index: number) => void;
  onRefresh: () => Promise<void>;
  onDirtyChange: (count: number) => void;
  handleRef: MutableRefObject<EditPanelHandle | null>;
};

/** Left slide list + main editing column shared by every edit panel. */
export function EditPanelShell({
  itemPicker,
  list,
  tools,
  heading,
  showIndex,
  liveIndex,
  dirty,
  onShowCue,
  children,
}: {
  itemPicker: ReactNode;
  list: ReactNode;
  tools?: ReactNode;
  heading: string;
  showIndex: number;
  liveIndex: number;
  dirty: boolean;
  onShowCue: (index: number) => void;
  children: ReactNode;
}) {
  return (
    <>
      <aside className="w-64 shrink-0 border-r border-white/10 flex flex-col min-h-0 bg-surface-container-lowest">
        <div className="p-3 border-b border-white/10">{itemPicker}</div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-2 space-y-1">{list}</div>
        {tools ? (
          <div className="shrink-0 p-2 border-t border-white/10 grid grid-cols-4 gap-1">{tools}</div>
        ) : null}
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
              {heading}
            </p>
            <button
              type="button"
              disabled={showIndex < 0 || showIndex === liveIndex}
              onClick={() => onShowCue(showIndex)}
              title={dirty ? "Shows the last saved version. Save first to show your edits." : undefined}
              className="inline-flex items-center gap-1 px-3 h-8 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 text-[11px] font-semibold disabled:opacity-40"
            >
              <Icon name="cast" className="text-[16px]" />
              {showIndex >= 0 && showIndex === liveIndex ? "On screen now" : "Show on screen"}
            </button>
          </div>
          {children}
        </div>
      </main>
    </>
  );
}

export function ControlCard({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-surface-container-low/60 p-4 space-y-3">
      {title ? (
        <p className="text-[11px] font-semibold tracking-[0.05em] uppercase text-on-surface-variant">
          {title}
        </p>
      ) : null}
      {children}
    </div>
  );
}
