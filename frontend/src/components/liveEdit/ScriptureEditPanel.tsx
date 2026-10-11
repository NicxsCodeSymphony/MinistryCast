import { useEffect, useImperativeHandle, useMemo, useState } from "react";
import ScriptureStyleControls, {
  scriptureColorIsAuto,
  type ScriptureStylePatch,
} from "../ScriptureStyleControls";
import { AutoGrowText, ScaledStage, SlideRow } from "../StageEditor";
import { ControlCard, EditPanelShell, type EditPanelProps } from "./shared";
import { updateScripturePassage, updateSetlistItem } from "../../lib/api";
import { sermonSizePx } from "../../lib/helpers";
import { DEFAULT_STAGE_TEXT_SIZE, parseLyricTextStyle } from "../../lib/lyricTextStyle";
import { asScripturePayload } from "../../lib/scripturePayload";
import { stageUsesDarkText } from "../../lib/stageBackgrounds";
import { stageFontFamily } from "../../lib/stageFonts";
import { useToast } from "../../lib/ToastContext";

const PASSAGE_KEY = "passage";

export default function ScriptureEditPanel({
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
  const toast = useToast();
  const passage = item.passage!;
  const payload = useMemo(() => asScripturePayload(item.payload), [item.payload]);
  const hasVerses = Boolean(payload?.verses.length);
  const perVerse = Boolean(payload?.perVerse && hasVerses);
  const reference = passage.reference || item.title;

  const [verseDrafts, setVerseDrafts] = useState<Record<number, string>>({});
  const [passageDraft, setPassageDraft] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState(PASSAGE_KEY);
  const [busy, setBusy] = useState(false);

  const dirtyCount = Object.keys(verseDrafts).length + (passageDraft === null ? 0 : 1);

  useEffect(() => {
    onDirtyChange(dirtyCount);
  }, [dirtyCount, onDirtyChange]);

  useEffect(() => {
    if (perVerse) {
      setSelectedKey((key) =>
        payload!.verses.some((v) => String(v.verse) === key) ? key : String(payload!.verses[0].verse),
      );
    } else {
      setSelectedKey(PASSAGE_KEY);
    }
  }, [perVerse, payload]);

  useImperativeHandle(handleRef, () => ({
    save: async () => {
      if (payload && Object.keys(verseDrafts).length) {
        await updateSetlistItem(item.setlist_id, item.id, {
          payload: {
            ...payload,
            verses: payload.verses.map((v) =>
              v.verse in verseDrafts ? { ...v, text: verseDrafts[v.verse].trim() } : v,
            ),
          },
        });
      }
      if (passageDraft !== null) {
        await updateScripturePassage(passage.id, { text: passageDraft.trim() });
      }
      await onRefresh();
      setVerseDrafts({});
      setPassageDraft(null);
    },
    discard: () => {
      setVerseDrafts({});
      setPassageDraft(null);
    },
  }));

  const applyNow = async (task: () => Promise<unknown>, failure: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const patchStyle = (patch: ScriptureStylePatch) =>
    void applyNow(() => updateScripturePassage(passage.id, patch), "Could not update the scripture style.");

  const togglePerVerse = () => {
    if (!payload) return;
    void applyNow(
      () => updateSetlistItem(item.setlist_id, item.id, { payload: { ...payload, perVerse: !perVerse } }),
      "Could not change how verses are shown.",
    );
  };

  const verseText = (verse: number, saved: string) => verseDrafts[verse] ?? saved;
  const setVerseText = (verse: number, saved: string, next: string) =>
    setVerseDrafts((prev) => {
      const rest = { ...prev };
      if (next === saved) delete rest[verse];
      else rest[verse] = next;
      return rest;
    });

  const selectedVerse = perVerse ? payload!.verses.find((v) => String(v.verse) === selectedKey) : undefined;
  const savedText = selectedVerse ? selectedVerse.text : passage.text || item.subtitle || "";
  const text = selectedVerse ? verseText(selectedVerse.verse, selectedVerse.text) : passageDraft ?? savedText;
  const onText = (next: string) => {
    if (selectedVerse) setVerseText(selectedVerse.verse, selectedVerse.text, next);
    else setPassageDraft(next === savedText ? null : next);
  };

  const liveCue = cues[liveIndex];
  const verseCueId = (verse: number) => `scripture-verse:${item.id}:${verse}`;
  const showIndex = selectedVerse
    ? cues.findIndex((cue) => cue.lyricId === verseCueId(selectedVerse.verse))
    : cues.findIndex((cue) => cue.itemId === item.id);
  const liveHere = liveCue?.itemId === item.id;

  const darkText = stageUsesDarkText(stage.stageBg);
  const look = parseLyricTextStyle(passage.text_style);
  const color = scriptureColorIsAuto(passage.color) ? undefined : passage.color!;
  const px = Math.min(sermonSizePx(passage.text_size || DEFAULT_STAGE_TEXT_SIZE), 96);
  const family = stageFontFamily(passage.font);
  const ink = darkText
    ? "text-black caret-black placeholder:text-black/25"
    : "text-white caret-white placeholder:text-white/25 drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)]";

  return (
    <EditPanelShell
      itemPicker={itemPicker}
      heading={
        selectedVerse ? `Verse ${selectedVerse.verse} · click the slide to type` : `${reference} · click the slide to type`
      }
      showIndex={showIndex}
      liveIndex={liveIndex}
      dirty={dirtyCount > 0}
      onShowCue={onShowCue}
      list={
        perVerse ? (
          payload!.verses.map((v) => (
            <SlideRow
              key={v.verse}
              label={`Verse ${v.verse}`}
              text={verseText(v.verse, v.text) || "Empty verse"}
              selected={selectedKey === String(v.verse)}
              live={liveHere && liveCue?.lyricId === verseCueId(v.verse)}
              dirty={v.verse in verseDrafts}
              onClick={() => setSelectedKey(String(v.verse))}
            />
          ))
        ) : (
          <SlideRow
            label={reference}
            text={(passageDraft ?? savedText).slice(0, 120) || "No text"}
            selected
            live={liveHere}
            dirty={passageDraft !== null}
            onClick={() => setSelectedKey(PASSAGE_KEY)}
          />
        )
      }
    >
      <ScaledStage stageBg={stage.stageBg} highlight>
        <div className="h-full w-full flex flex-col px-[7%] py-[5%]">
          <p
            className={`shrink-0 text-center font-semibold tracking-[0.12em] uppercase ${
              darkText ? "text-neutral-700" : "text-white/70"
            }`}
            style={{ fontSize: 34, fontFamily: family }}
          >
            {cues[showIndex]?.heading || reference}
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex items-center justify-center">
            <AutoGrowText
              key={selectedKey}
              value={text}
              onChange={onText}
              placeholder="Verse text"
              className={`w-full text-center leading-[1.25] ${ink}`}
              style={{
                fontSize: `${px}px`,
                fontFamily: family,
                fontWeight: look.bold ? 700 : undefined,
                fontStyle: look.italic ? "italic" : undefined,
                textDecoration: look.underline ? "underline" : undefined,
                color,
              }}
            />
          </div>
        </div>
      </ScaledStage>
      <p className="text-[11px] text-on-surface-variant">
        Text edits show on screen after you press Save. Style changes below apply right away.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <ControlCard title="Scripture text · applies right away">
          <ScriptureStyleControls passage={passage} onChange={patchStyle} />
        </ControlCard>
        <ControlCard title="Slides">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={perVerse}
              disabled={!hasVerses || busy}
              onChange={togglePerVerse}
              className="mt-0.5 accent-primary"
            />
            <span className="space-y-0.5">
              <span className="block text-sm text-on-surface">One verse per slide</span>
              <span className="block text-[11px] text-on-surface-variant">
                {hasVerses
                  ? `${payload!.verses.length} verses. Turn off to show the whole passage on one slide.`
                  : "Re-add this scripture from the setlist to split it into one verse per slide."}
              </span>
            </span>
          </label>
        </ControlCard>
      </div>
    </EditPanelShell>
  );
}
