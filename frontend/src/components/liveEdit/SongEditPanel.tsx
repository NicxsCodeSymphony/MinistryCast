import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import ChordControls from "../ChordControls";
import ChordPicker from "../ChordPicker";
import TextSizePicker from "../TextSizePicker";
import TextStylePicker from "../TextStylePicker";
import ConfirmDialog from "../modals/ConfirmDialog";
import { MiniStage, ScaledStage, SlideRow, ToolButton } from "../StageEditor";
import { ControlCard, EditPanelShell, type EditPanelProps } from "./shared";
import { saveSongSections } from "../../lib/api";
import { DEFAULT_CHORD_DISPLAY } from "../../lib/chordDisplay";
import { chordSheetToInline, stripChordProMarkers } from "../../lib/chords";
import { formatSectionLabel, moveItem, splitLyricLines } from "../../lib/helpers";
import { stageUsesDarkText } from "../../lib/stageBackgrounds";
import { asStageFont, STAGE_FONTS } from "../../lib/stageFonts";
import { useToast } from "../../lib/ToastContext";
import type { LiveCue, SongLyricSection } from "../../lib/types";

type SectionDraft = { key: string; id: string | null; section: string; content: string };

const SECTION_SUGGESTIONS = [
  "Intro",
  "Verse 1",
  "Verse 2",
  "Verse 3",
  "Pre-Chorus",
  "Chorus",
  "Bridge",
  "Tag",
  "Outro",
];

function draftsOf(rows: SongLyricSection[] | undefined): SectionDraft[] {
  return [...(rows ?? [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((row) => ({ key: row.id, id: row.id, section: row.section, content: row.content }));
}

function previewLine(content: string) {
  return (
    splitLyricLines(chordSheetToInline(content))
      .map(stripChordProMarkers)
      .find((line) => line.trim()) ?? ""
  );
}

export default function SongEditPanel({
  item,
  itemPicker,
  cues,
  liveIndex,
  stage,
  actions,
  onShowCue,
  onRefresh,
  onDirtyChange,
  handleRef,
}: EditPanelProps) {
  const toast = useToast();
  const song = item.song!;
  const songTitle = song.title || item.title;
  const saved = useMemo(() => draftsOf(song.lyric_sections), [song.lyric_sections]);
  const [drafts, setDrafts] = useState<SectionDraft[]>(saved);
  const [selectedKey, setSelectedKey] = useState(saved[0]?.key ?? "");
  const [confirmDelete, setConfirmDelete] = useState<SectionDraft | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const resync = useRef(false);

  const dirtyCount = useMemo(() => {
    const byId = new Map(saved.map((row) => [row.id, row]));
    let count = 0;
    for (const draft of drafts) {
      const before = draft.id ? byId.get(draft.id) : undefined;
      if (!before || before.section !== draft.section || before.content !== draft.content) count += 1;
    }
    const kept = new Set(drafts.map((draft) => draft.id));
    count += saved.filter((row) => !kept.has(row.id)).length;
    const savedOrder = saved.map((row) => row.id).join();
    const draftOrder = drafts.filter((d) => d.id).map((d) => d.id).join();
    if (!count && savedOrder !== draftOrder) count = 1;
    return count;
  }, [drafts, saved]);

  useEffect(() => {
    if (!resync.current && dirtyCount) return;
    resync.current = false;
    setDrafts(saved);
    setSelectedKey((key) => (saved.some((row) => row.key === key) ? key : saved[0]?.key ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  useEffect(() => {
    onDirtyChange(dirtyCount);
  }, [dirtyCount, onDirtyChange]);

  useImperativeHandle(handleRef, () => ({
    save: async () => {
      const cleaned = drafts.filter((d) => d.content.trim() || d.id);
      resync.current = true;
      await saveSongSections(
        song.id,
        cleaned.map(({ id, section, content }) => ({
          id,
          section: section.trim() || "Verse",
          content,
        })),
      );
      await onRefresh();
    },
    discard: () => {
      setDrafts(saved);
      setSelectedKey((key) => (saved.some((row) => row.key === key) ? key : saved[0]?.key ?? ""));
    },
  }));

  const selectedIndex = drafts.findIndex((d) => d.key === selectedKey);
  const selected = selectedIndex >= 0 ? drafts[selectedIndex] : undefined;
  const liveCue = cues[liveIndex];
  const liveId = liveCue?.itemId === item.id ? liveCue.lyricId : undefined;
  const cueIndexOf = (draft?: SectionDraft) =>
    draft?.id ? cues.findIndex((cue) => cue.itemId === item.id && cue.lyricId === draft.id) : -1;

  const patchSelected = (patch: Partial<SectionDraft>) => {
    if (!selected) return;
    setDrafts((prev) => prev.map((d) => (d.key === selected.key ? { ...d, ...patch } : d)));
  };

  const addSection = () => {
    const key = `new-${Date.now()}`;
    const next: SectionDraft = { key, id: null, section: "Verse", content: "" };
    setDrafts((prev) => {
      const at = selectedIndex >= 0 ? selectedIndex + 1 : prev.length;
      return [...prev.slice(0, at), next, ...prev.slice(at)];
    });
    setSelectedKey(key);
    requestAnimationFrame(() => fieldRef.current?.focus());
  };

  const moveSection = (delta: number) => {
    const to = selectedIndex + delta;
    if (selectedIndex < 0 || to < 0 || to >= drafts.length) return;
    setDrafts((prev) => moveItem(prev, selectedIndex, to));
  };

  const removeSection = (draft: SectionDraft) => {
    const index = drafts.findIndex((d) => d.key === draft.key);
    const remaining = drafts.filter((d) => d.key !== draft.key);
    setDrafts(remaining);
    setSelectedKey(remaining[Math.min(index, remaining.length - 1)]?.key ?? "");
  };

  const draftCue: LiveCue | null = useMemo(() => {
    if (!selected) return null;
    const lines = splitLyricLines(chordSheetToInline(selected.content));
    const sectionLabel = formatSectionLabel(selected.section);
    return {
      id: `${selected.key}-draft`,
      itemId: item.id,
      kind: "lyric",
      label: sectionLabel.toUpperCase() || "SONG",
      tag: selected.section.slice(0, 3).toUpperCase(),
      title: songTitle,
      preview: previewLine(selected.content),
      lines: lines.length ? lines : [sectionLabel || songTitle],
      heading: songTitle,
      sectionLabel,
      songTitle,
      musicalKey: song.musical_key,
    };
  }, [selected, item.id, songTitle, song.musical_key]);

  const content = selected?.content ?? "";
  const lines = content.split("\n");
  const longest = Math.max(12, ...lines.map((line) => line.length));
  const editorPx = Math.max(26, Math.min(60, Math.floor(1700 / (longest * 0.62)), Math.floor(900 / (lines.length * 1.3))));
  const darkText = stageUsesDarkText(stage.stageBg);
  const chords = stage.chords ?? DEFAULT_CHORD_DISPLAY;
  const hasChords = drafts.some((d) => /\[[^\]]+\]/.test(chordSheetToInline(d.content)));

  return (
    <>
      <EditPanelShell
        itemPicker={itemPicker}
        heading={
          selected
            ? `${formatSectionLabel(selected.section) || "Section"} · type on the slide, highlight a word to add a chord`
            : "No sections yet"
        }
        showIndex={cueIndexOf(selected)}
        liveIndex={liveIndex}
        dirty={dirtyCount > 0}
        onShowCue={onShowCue}
        list={
          drafts.length ? (
            drafts.map((draft) => {
              const before = draft.id ? saved.find((row) => row.id === draft.id) : undefined;
              return (
                <SlideRow
                  key={draft.key}
                  label={formatSectionLabel(draft.section) || "Section"}
                  text={previewLine(draft.content) || "Empty section"}
                  selected={draft.key === selectedKey}
                  live={Boolean(draft.id && draft.id === liveId)}
                  dirty={!before || before.section !== draft.section || before.content !== draft.content}
                  onClick={() => setSelectedKey(draft.key)}
                />
              );
            })
          ) : (
            <p className="p-3 text-xs text-on-surface-variant">This song has no lyrics yet. Add a section.</p>
          )
        }
        tools={
          <>
            <ToolButton icon="add" label="Add section" onClick={addSection} />
            <ToolButton
              icon="arrow_upward"
              label="Move up"
              disabled={selectedIndex <= 0}
              onClick={() => moveSection(-1)}
            />
            <ToolButton
              icon="arrow_downward"
              label="Move down"
              disabled={selectedIndex < 0 || selectedIndex >= drafts.length - 1}
              onClick={() => moveSection(1)}
            />
            <ToolButton
              icon="delete"
              label={selected?.id && selected.id === liveId ? "Move off this section before deleting" : "Delete"}
              danger
              disabled={!selected || Boolean(selected.id && selected.id === liveId)}
              onClick={() => selected && setConfirmDelete(selected)}
            />
          </>
        }
      >
        {selected ? (
          <>
            <div className="relative">
              <ScaledStage stageBg={stage.stageBg} highlight>
                <textarea
                  ref={fieldRef}
                  value={content}
                  spellCheck={false}
                  placeholder={"G         C\nType the lyrics here"}
                  onChange={(event) => patchSelected({ content: event.target.value })}
                  className={`absolute inset-0 w-full h-full resize-none bg-transparent border-0 outline-none focus:ring-0 font-mono whitespace-pre overflow-auto custom-scrollbar ${
                    darkText
                      ? "text-black caret-black placeholder:text-black/25"
                      : "text-white caret-white placeholder:text-white/25 drop-shadow-[0_6px_24px_rgba(0,0,0,0.65)]"
                  }`}
                  style={{ fontSize: `${editorPx}px`, lineHeight: 1.3, padding: "5% 7%" }}
                />
              </ScaledStage>
              <ChordPicker
                fieldRef={fieldRef}
                value={content}
                songKey={song.musical_key ?? ""}
                onChange={(next) => patchSelected({ content: next })}
              />
            </div>
            <p className="text-[11px] text-on-surface-variant">
              Put chords on the line above the words, or highlight a word to pick one. The audience
              keeps seeing the saved version until you press Save.
            </p>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  How it will look
                </p>
                <MiniStage cue={draftCue} {...stage} />
              </div>
              <ControlCard title="Section">
                <input
                  value={selected.section}
                  list="live-edit-sections"
                  onChange={(event) => patchSelected({ section: event.target.value })}
                  placeholder="Verse 1"
                  className="w-full bg-surface-container-low border border-white/10 rounded-lg px-3 h-9 text-sm"
                  aria-label="Section name"
                />
                <datalist id="live-edit-sections">
                  {SECTION_SUGGESTIONS.map((label) => (
                    <option key={label} value={label} />
                  ))}
                </datalist>
                <div className="flex flex-wrap gap-1">
                  {SECTION_SUGGESTIONS.map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => patchSelected({ section: label })}
                      className={`px-2 h-7 rounded-md border text-[11px] ${
                        formatSectionLabel(selected.section) === label
                          ? "border-secondary/60 bg-secondary/10 text-secondary"
                          : "border-white/10 hover:bg-white/5 text-on-surface-variant"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </ControlCard>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={addSection}
            className="w-full rounded-xl border border-dashed border-white/15 p-8 text-sm text-on-surface-variant hover:bg-white/5"
          >
            Add the first section
          </button>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <ControlCard title="Lyrics text · applies right away">
            <select
              value={asStageFont(stage.font)}
              onChange={(event) => actions.onFontChange?.(asStageFont(event.target.value))}
              className="w-full bg-surface-container-low border border-white/10 rounded-lg px-3 py-2 text-sm"
              aria-label="Lyrics font"
            >
              {STAGE_FONTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap items-center gap-3">
              <TextSizePicker
                value={stage.lyricSize}
                onChange={(next) => actions.onLyricSizeChange?.(next)}
              />
              <TextStylePicker
                value={stage.lyricStyle}
                onChange={(next) => actions.onLyricStyleChange?.(next)}
              />
            </div>
          </ControlCard>
          <ControlCard title="Chords · applies right away">
            <ChordControls
              chords={chords}
              onChange={(patch) => actions.onChordsChange?.(patch)}
              itemId={item.id}
              songKey={song.musical_key}
              hasChords={hasChords}
              emptyHint="No chords yet. Highlight a word on the slide above to add one."
            />
          </ControlCard>
        </div>
      </EditPanelShell>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          const draft = confirmDelete;
          setConfirmDelete(null);
          if (draft) removeSection(draft);
          if (draft && !draft.id) toast.info("Section removed.");
        }}
        title="Remove this section?"
        description="It is removed when you press Save."
        highlight={confirmDelete ? previewLine(confirmDelete.content) || confirmDelete.section : undefined}
      />
    </>
  );
}
