import { useEffect, useId, useRef, useState } from "react";
import SongThumb from "../SongThumb";
import { listCategories } from "../../lib/api";
import { lookupSongMusic } from "../../lib/lookupSongMusic";
import { lookupSongLyrics } from "../../lib/lyricsLookup";
import { formatDuration } from "../../lib/helpers";
import type { Category } from "../../lib/types";
import { lookupYoutubeClip, youtubeVideoId } from "../../lib/youtube";
import { useUnsavedDraft } from "../../lib/useUnsavedDraft";
import Modal from "./Modal";

export type SongFormValues = {
  title: string;
  artist: string;
  key: string;
  bpm: string;
  signature: string;
  categoryId: string;
  lyrics: string;
  youtubeUrl: string;
  audioName: string;
  duration: string;
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
  categoryId: "",
  lyrics: "",
  youtubeUrl: "",
  audioName: "",
  duration: "",
};

type SongFormModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: SongFormValues) => void | Promise<void>;
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
  const [lyricsOrigin, setLyricsOrigin] = useState<"manual" | "auto">("manual");
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const [lyricsHint, setLyricsHint] = useState("");
  const [lyricsEditorOpen, setLyricsEditorOpen] = useState(false);
  const lyricsEditorRef = useRef<HTMLTextAreaElement>(null);
  const lyricsFieldRef = useRef<HTMLTextAreaElement>(null);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicHint, setMusicHint] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const lastLookupKey = useRef("");
  const lyricsRequest = useRef(0);
  const lastYoutube = useRef("");
  const originKey = useRef("");
  const musicDirty = useRef({ key: false, bpm: false, signature: false, duration: false });

  useEffect(() => {
    if (!open) return;
    const next = { ...emptyValues, ...initialValues };
    setValues(next);
    originKey.current = JSON.stringify(next);
    setShowYoutube(Boolean(next.youtubeUrl));
    setLyricsOrigin("manual");
    setLyricsBusy(false);
    setLyricsHint("");
    setLyricsEditorOpen(false);
    setMusicBusy(false);
    setMusicHint("");
    lastYoutube.current = "";
    lyricsRequest.current += 1;
    musicDirty.current = {
      key: Boolean(initialValues?.key),
      bpm: Boolean(initialValues?.bpm),
      signature: Boolean(initialValues?.signature),
      duration: Boolean(initialValues?.duration),
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only when opened

  useEffect(() => {
    if (!lyricsEditorOpen) return;
    const id = window.setTimeout(() => lyricsEditorRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [lyricsEditorOpen]);

  useEffect(() => {
    const el = lyricsFieldRef.current;
    if (!el || lyricsEditorOpen) return;
    el.style.height = "0px";
    el.style.height = `${Math.max(320, el.scrollHeight)}px`;
  }, [lyricsEditorOpen, open, values.lyrics]);

  useEffect(() => {
    if (!open) return;
    void listCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [open]);

  const isEdit = mode === "edit";
  const persistSave = useRef(onSubmit);
  persistSave.current = onSubmit;
  const persistValues = useRef(values);
  persistValues.current = values;
  const dirty = open && JSON.stringify(values) !== originKey.current;
  const draft = useUnsavedDraft(dirty, {
    enabled: open,
    title: isEdit ? "Unsaved song" : "Unsaved song draft",
    description:
      "This song is not saved. Save it before you leave, or you’ll lose what you typed.",
    onSave: async () => {
      if (!persistValues.current.title.trim()) return false;
      await persistSave.current(persistValues.current);
    },
  });

  const closeForm = () => {
    draft.guard(() => {
      setLyricsEditorOpen(false);
      onClose();
    });
  };

  const patch = (key: keyof SongFormValues, value: string) => {
    if (key === "lyrics") setLyricsOrigin("manual");
    if (key === "key" || key === "bpm" || key === "signature" || key === "duration") {
      musicDirty.current[key] = true;
    }
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const fillFromCatalog = async (
    force: { lyrics?: boolean; music?: boolean },
    signal?: AbortSignal,
  ) => {
    const title = values.title.trim();
    const artist = values.artist.trim();
    if (!title || !artist) {
      setLyricsHint("Add a title and artist first.");
      return;
    }
    const lookupKey = `${title.toLowerCase()}|${artist.toLowerCase()}`;
    if (!force.lyrics && !force.music && lookupKey === lastLookupKey.current) return;
    const requestId = ++lyricsRequest.current;
    const fillLyrics =
      Boolean(force.lyrics) || !values.lyrics.trim() || lyricsOrigin === "auto";
    const fillKey = Boolean(force.music) || !musicDirty.current.key;
    const fillBpm = Boolean(force.music) || !musicDirty.current.bpm;
    const fillSig = Boolean(force.music) || !musicDirty.current.signature;
    if (!fillLyrics && !fillKey && !fillBpm && !fillSig) return;
    if (fillLyrics) {
      setLyricsBusy(true);
      setLyricsHint("");
    }
    if (fillKey || fillBpm || fillSig) {
      setMusicBusy(true);
      setMusicHint("");
    }
    try {
      const [lyricsResult, musicResult] = await Promise.allSettled([
        fillLyrics ? lookupSongLyrics(title, artist, signal) : Promise.resolve(null),
        fillKey || fillBpm || fillSig
          ? lookupSongMusic(title, artist, signal)
          : Promise.resolve(null),
      ]);
      if (requestId !== lyricsRequest.current) return;
      lastLookupKey.current = lookupKey;

      let nextLyrics: string | null = null;
      if (fillLyrics) {
        if (lyricsResult.status === "fulfilled" && lyricsResult.value) {
          nextLyrics = lyricsResult.value;
          setLyricsOrigin("auto");
          setLyricsHint("Lyrics filled from a public catalog. Review before saving.");
        } else if (lyricsResult.status === "rejected") {
          const err = lyricsResult.reason;
          if (!(err instanceof DOMException && err.name === "AbortError")) {
            setLyricsHint(
              err instanceof Error ? err.message : "Could not look up lyrics.",
            );
          }
        }
      }

      let nextKey: string | null = null;
      let nextBpm: string | null = null;
      let nextSig: string | null = null;
      if (musicResult.status === "fulfilled" && musicResult.value) {
        const music = musicResult.value;
        nextKey = fillKey ? music.key : null;
        nextBpm = fillBpm ? music.bpm : null;
        nextSig = fillSig ? music.signature : null;
        const filled = [
          nextKey ? `key ${nextKey}` : null,
          nextBpm ? `${nextBpm} BPM` : null,
          nextSig ? nextSig : null,
        ].filter(Boolean);
        setMusicHint(
          filled.length
            ? `Filled ${filled.join(", ")} from public catalogs.`
            : "Found the song, but no extra BPM / key / beat to fill.",
        );
      } else if (musicResult.status === "rejected" && (fillKey || fillBpm || fillSig)) {
        const err = musicResult.reason;
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setMusicHint(
            err instanceof Error ? err.message : "Could not look up BPM or key.",
          );
        }
      }

      if (nextLyrics || nextKey || nextBpm || nextSig) {
        setValues((prev) => ({
          ...prev,
          lyrics: nextLyrics ?? prev.lyrics,
          key: nextKey ?? prev.key,
          bpm: nextBpm ?? prev.bpm,
          signature: nextSig ?? prev.signature,
        }));
      }
    } finally {
      if (requestId === lyricsRequest.current) {
        setLyricsBusy(false);
        setMusicBusy(false);
      }
    }
  };

  useEffect(() => {
    if (!open) return;
    const title = values.title.trim();
    const artist = values.artist.trim();
    if (title.length < 2 || artist.length < 2) return;
    const key = `${title.toLowerCase()}|${artist.toLowerCase()}`;
    if (key === lastLookupKey.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fillFromCatalog({}, controller.signal);
    }, 850);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, values.title, values.artist]); // eslint-disable-line react-hooks/exhaustive-deps -- lookup when title and artist settle

  useEffect(() => {
    if (!open) return;
    const url = values.youtubeUrl.trim();
    const videoId = youtubeVideoId(url);
    if (!videoId || lastYoutube.current === videoId) return;
    lastYoutube.current = videoId;
    const controller = new AbortController();
    void lookupYoutubeClip(url, controller.signal)
      .then((clip) => {
        setValues((prev) => ({
          ...prev,
          title: prev.title.trim() ? prev.title : clip.title ?? prev.title,
          artist: prev.artist.trim() ? prev.artist : clip.author ?? prev.artist,
          duration:
            musicDirty.current.duration || prev.duration.trim()
              ? prev.duration
              : clip.durationSeconds
                ? formatDuration(clip.durationSeconds)
                : prev.duration,
        }));
        if (clip.title || clip.author) {
          setMusicHint("Filled details from the YouTube link.");
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [open, values.youtubeUrl]);

  return (
    <>
    {draft.dialog}
    <Modal
      open={open}
      onClose={closeForm}
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
          onClick={closeForm}
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

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-[11px] uppercase tracking-wider text-on-surface-variant opacity-70">
                Key, BPM & beat
              </p>
              {musicBusy ? (
                <span className="material-symbols-outlined text-[16px] text-primary animate-spin">
                  progress_activity
                </span>
              ) : null}
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
                htmlFor="song-length"
                className="block text-xs font-medium text-primary/80 uppercase tracking-wider group-focus-within:text-primary"
              >
                Length
              </label>
              <input
                id="song-length"
                value={values.duration}
                onChange={(event) => patch("duration", event.target.value)}
                className={fieldClass}
                placeholder="04:32"
              />
            </div>
            <div className="space-y-2 group">
              <label
                htmlFor="song-category"
                className="block text-xs font-medium text-primary/80 uppercase tracking-wider group-focus-within:text-primary"
              >
                Category
              </label>
              <select
                id="song-category"
                value={values.categoryId}
                onChange={(event) => patch("categoryId", event.target.value)}
                className={fieldClass}
              >
                <option value="">Uncategorized</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            {musicHint ? (
              <p className="text-xs text-on-surface-variant col-span-2 md:col-span-4">
                {musicHint}
              </p>
            ) : null}
            </div>
          </div>

          <div className="space-y-2 group">
            <div className="flex justify-between items-center">
              <p className="text-xs font-medium text-primary/80 uppercase tracking-wider">
                Lyrics & Chord Pro
              </p>
              <span className="text-on-surface-variant text-[10px] font-medium bg-white/5 px-2 py-1 rounded">
                Markdown Supported
              </span>
            </div>
            <div className="relative">
              <textarea
                ref={lyricsFieldRef}
                id="song-lyrics"
                value={values.lyrics}
                onChange={(event) => patch("lyrics", event.target.value)}
                className={`${fieldClass} min-h-[20rem] px-6 py-4 pr-14 font-mono text-sm leading-relaxed overflow-hidden resize-none`}
                placeholder={`[Verse 1]\nYou are here, moving in our midst...\nI worship You, I worship You...`}
                rows={16}
              />
              <button
                type="button"
                onClick={() => setLyricsEditorOpen(true)}
                className="absolute top-3 right-3 w-9 h-9 rounded-lg bg-white/5 text-on-surface-variant hover:bg-white/10 hover:text-on-surface border border-white/10 flex items-center justify-center transition-all"
                title="Open wide editor"
                aria-label="Open wide editor"
              >
                <span className="material-symbols-outlined text-[18px]">
                  open_in_full
                </span>
              </button>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={lyricsBusy || !values.title.trim() || !values.artist.trim()}
                onClick={() => void fillFromCatalog({ lyrics: true })}
                className="w-9 h-9 shrink-0 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20 flex items-center justify-center transition-all disabled:opacity-40 disabled:hover:bg-primary/15"
                title="Fill lyrics from title and artist"
                aria-label="Fill lyrics from title and artist"
              >
                <span
                  className={`material-symbols-outlined filled text-[20px] ${
                    lyricsBusy ? "animate-spin" : ""
                  }`}
                >
                  {lyricsBusy ? "progress_activity" : "auto_awesome"}
                </span>
              </button>
            </div>
            {lyricsHint ? (
              <p
                className={`text-xs ${
                  lyricsHint.startsWith("Lyrics filled")
                    ? "text-primary"
                    : "text-on-surface-variant"
                }`}
              >
                {lyricsHint}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowYoutube((prev) => !prev)}
                className="w-full flex items-center gap-3 bg-white/5 p-4 rounded-xl border border-white/5 hover:border-primary/30 transition-all text-left"
              >
                {youtubeVideoId(values.youtubeUrl) ? (
                  <SongThumb
                    youtubeUrl={values.youtubeUrl}
                    title={values.title || "YouTube"}
                    size="sm"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 shrink-0">
                    <span className="material-symbols-outlined">play_circle</span>
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium text-on-surface">
                    YouTube Link
                  </div>
                  <div className="text-sm text-on-surface-variant opacity-60 truncate">
                    {youtubeVideoId(values.youtubeUrl)
                      ? "Thumbnail ready"
                      : "Attach reference video"}
                  </div>
                </div>
              </button>
              {showYoutube ? (
                <div className="space-y-3">
                  <input
                    value={values.youtubeUrl}
                    onChange={(event) => patch("youtubeUrl", event.target.value)}
                    className={fieldClass}
                    placeholder="https://youtube.com/watch?v=..."
                    type="url"
                  />
                  {youtubeVideoId(values.youtubeUrl) ? (
                    <SongThumb
                      youtubeUrl={values.youtubeUrl}
                      title={values.title || "YouTube"}
                      size="lg"
                    />
                  ) : null}
                </div>
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
            onClick={closeForm}
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

    <Modal
      open={open && lyricsEditorOpen}
      onClose={() => setLyricsEditorOpen(false)}
      labelledBy="lyrics-editor-title"
      panelClassName="w-[min(960px,94vw)] h-[min(88vh,860px)] flex flex-col rounded-2xl"
      backdropClassName="bg-black/75 backdrop-blur-md"
      rootClassName="z-[110]"
      bare
    >
      <div className="flex flex-col h-full min-h-0 bg-surface-container-lowest rounded-2xl border border-white/10 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
          <div>
            <p
              id="lyrics-editor-title"
              className="text-[12px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant"
            >
              Lyrics & chords
            </p>
            <p className="text-sm text-on-surface-variant/80">
              Type here, then Done or Esc.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={lyricsBusy || !values.title.trim() || !values.artist.trim()}
              onClick={() => void fillFromCatalog({ lyrics: true })}
              className="px-3 py-2 rounded-lg text-xs font-medium text-primary hover:bg-primary/10 flex items-center gap-1 disabled:opacity-40"
            >
              <span
                className={`material-symbols-outlined filled text-[16px] ${
                  lyricsBusy ? "animate-spin" : ""
                }`}
              >
                {lyricsBusy ? "progress_activity" : "auto_awesome"}
              </span>
              Fill
            </button>
            <button
              type="button"
              onClick={() => setLyricsEditorOpen(false)}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-semibold"
            >
              Done
            </button>
          </div>
        </div>
        <textarea
          ref={lyricsEditorRef}
          value={values.lyrics}
          onChange={(event) => patch("lyrics", event.target.value)}
          className="flex-1 min-h-0 w-full bg-transparent px-6 py-5 font-mono text-base sm:text-lg leading-relaxed text-on-surface resize-none focus:outline-none placeholder:text-on-surface-variant/30 custom-scrollbar"
          placeholder={`[Verse 1]\nYou are here, moving in our midst...\nI worship You, I worship You...`}
        />
      </div>
    </Modal>
    </>
  );
}
