import { useEffect, useId, useRef, useState } from "react";
import Modal from "./Modal";

export type SongFormValues = {
  title: string;
  artist: string;
  key: string;
  bpm: string;
  signature: string;
  tags: string;
  lyrics: string;
  youtubeUrl: string;
  audioName: string;
};

const KEYS = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

const TIME_SIGNATURES = ["4/4", "3/4", "6/8", "2/4", "5/4"];

const emptyValues: SongFormValues = {
  title: "",
  artist: "",
  key: "C",
  bpm: "",
  signature: "4/4",
  tags: "",
  lyrics: "",
  youtubeUrl: "",
  audioName: "",
};

type SongFormModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: SongFormValues) => void;
  initialValues?: Partial<SongFormValues>;
  mode?: "create" | "edit";
};

const fieldClass =
  "w-full bg-surface-container-lowest border border-white/10 rounded-lg px-4 py-3 text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all";

export default function SongFormModal({
  open,
  onClose,
  onSubmit,
  initialValues,
  mode = "create",
}: SongFormModalProps) {
  const titleId = useId();
  const descId = useId();
  const audioRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<SongFormValues>(emptyValues);
  const [showYoutube, setShowYoutube] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = { ...emptyValues, ...initialValues };
    setValues(next);
    setShowYoutube(Boolean(next.youtubeUrl));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when opened

  const isEdit = mode === "edit";

  const patch = (key: keyof SongFormValues, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={descId}
      panelClassName="w-full max-w-4xl max-h-[90vh] rounded-2xl flex flex-col"
      backdropClassName="bg-black/60 backdrop-blur-sm"
    >
      <div className="px-8 py-6 border-b border-white/10 flex justify-between items-center bg-white/5 shrink-0">
        <div>
          <h2 id={titleId} className="text-2xl font-semibold text-on-surface">
            {isEdit ? "Edit Song" : "Add New Song"}
          </h2>
          <p id={descId} className="text-sm text-on-surface-variant">
            Configure details and lyrics for the production queue.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-on-surface-variant hover:text-on-surface transition-colors"
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-3xl">close</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar min-h-0">
        <form
          id="song-form"
          className="space-y-8"
          onSubmit={(event) => {
            event.preventDefault();
            if (!values.title.trim()) return;
            onSubmit(values);
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 group">
              <label
                htmlFor="song-title"
                className="block text-xs font-medium text-primary/80 uppercase tracking-wider group-focus-within:text-primary"
              >
                Song Title
              </label>
              <input
                id="song-title"
                value={values.title}
                onChange={(event) => patch("title", event.target.value)}
                className={fieldClass}
                placeholder="e.g. Way Maker"
                type="text"
                autoFocus
              />
            </div>
            <div className="space-y-2 group">
              <label
                htmlFor="song-artist"
                className="block text-xs font-medium text-primary/80 uppercase tracking-wider group-focus-within:text-primary"
              >
                Artist / Composer
              </label>
              <input
                id="song-artist"
                value={values.artist}
                onChange={(event) => patch("artist", event.target.value)}
                className={fieldClass}
                placeholder="e.g. Sinach"
                type="text"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2 group">
              <label
                htmlFor="song-key"
                className="block text-xs font-medium text-primary/80 uppercase tracking-wider group-focus-within:text-primary"
              >
                Key
              </label>
              <select
                id="song-key"
                value={values.key}
                onChange={(event) => patch("key", event.target.value)}
                className={fieldClass}
              >
                {KEYS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 group">
              <label
                htmlFor="song-bpm"
                className="block text-xs font-medium text-primary/80 uppercase tracking-wider group-focus-within:text-primary"
              >
                BPM
              </label>
              <input
                id="song-bpm"
                value={values.bpm}
                onChange={(event) => patch("bpm", event.target.value)}
                className={fieldClass}
                placeholder="120"
                type="number"
                min={1}
              />
            </div>
            <div className="space-y-2 group">
              <label
                htmlFor="song-signature"
                className="block text-xs font-medium text-primary/80 uppercase tracking-wider group-focus-within:text-primary"
              >
                Time Sig
              </label>
              <select
                id="song-signature"
                value={values.signature}
                onChange={(event) => patch("signature", event.target.value)}
                className={fieldClass}
              >
                {TIME_SIGNATURES.map((sig) => (
                  <option key={sig} value={sig}>
                    {sig}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2 group">
              <label
                htmlFor="song-tags"
                className="block text-xs font-medium text-primary/80 uppercase tracking-wider group-focus-within:text-primary"
              >
                Tags
              </label>
              <input
                id="song-tags"
                value={values.tags}
                onChange={(event) => patch("tags", event.target.value)}
                className={fieldClass}
                placeholder="Worship, Fast"
                type="text"
              />
            </div>
          </div>

          <div className="space-y-2 group">
            <div className="flex justify-between items-center">
              <label
                htmlFor="song-lyrics"
                className="text-xs font-medium text-primary/80 uppercase tracking-wider group-focus-within:text-primary"
              >
                Lyrics & Chord Pro
              </label>
              <span className="text-on-surface-variant text-[10px] font-medium bg-white/5 px-2 py-1 rounded">
                Markdown Supported
              </span>
            </div>
            <textarea
              id="song-lyrics"
              value={values.lyrics}
              onChange={(event) => patch("lyrics", event.target.value)}
              className={`${fieldClass} px-6 py-4 text-sm leading-relaxed custom-scrollbar`}
              placeholder={`[Verse 1]\nYou are here, moving in our midst...\nI worship You, I worship You...`}
              rows={10}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowYoutube((prev) => !prev)}
                className="w-full flex items-center gap-3 bg-white/5 p-4 rounded-xl border border-white/5 hover:border-primary/30 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                  <span className="material-symbols-outlined">play_circle</span>
                </div>
                <div>
                  <div className="text-xs font-medium text-on-surface">
                    YouTube Link
                  </div>
                  <div className="text-sm text-on-surface-variant opacity-60">
                    Attach reference video
                  </div>
                </div>
              </button>
              {showYoutube ? (
                <input
                  value={values.youtubeUrl}
                  onChange={(event) => patch("youtubeUrl", event.target.value)}
                  className={fieldClass}
                  placeholder="https://youtube.com/watch?v=..."
                  type="url"
                />
              ) : null}
            </div>

            <div>
              <button
                type="button"
                onClick={() => audioRef.current?.click()}
                className="w-full flex items-center gap-3 bg-white/5 p-4 rounded-xl border border-white/5 hover:border-primary/30 transition-all text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400 shrink-0">
                  <span className="material-symbols-outlined">audio_file</span>
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-medium text-on-surface">
                    Audio Track
                  </div>
                  <div className="text-sm text-on-surface-variant opacity-60 truncate">
                    {values.audioName || "Upload rehearsal mp3"}
                  </div>
                </div>
              </button>
              <input
                ref={audioRef}
                className="hidden"
                type="file"
                accept="audio/*"
                onChange={(event) =>
                  patch("audioName", event.target.files?.[0]?.name ?? "")
                }
              />
            </div>
          </div>
        </form>
      </div>

      <div className="px-8 py-6 border-t border-white/10 bg-white/5 flex flex-col md:flex-row justify-between items-center gap-4 shrink-0">
        <div className="flex items-center gap-2 text-on-surface-variant text-sm">
          <span className="material-symbols-outlined filled text-primary">
            info
          </span>
          <span>Song will be synced to all connected production stations.</span>
        </div>
        <div className="flex items-center gap-4 w-full md:w-auto">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 md:flex-none px-8 py-3 rounded-full text-xs font-medium text-on-surface border border-white/10 hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            form="song-form"
            type="submit"
            className="flex-1 md:flex-none px-10 py-3 rounded-full text-xs font-medium bg-secondary-container text-on-secondary-container hover:shadow-[0_0_20px_rgba(121,0,205,0.4)] transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">
              check_circle
            </span>
            {isEdit ? "Save Changes" : "Save Song"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
