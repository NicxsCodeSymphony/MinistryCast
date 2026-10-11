import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
} from "react";
import ChordLyricPreview from "../ChordLyricPreview";
import ChordPicker from "../ChordPicker";
import SongThumb from "../SongThumb";
import { listCategories } from "../../lib/api";
import { cleanMusicMeta, lookupSongMusic, type SongMusicMeta } from "../../lib/lookupSongMusic";
import {
  formatFetchedLyrics,
  lookupSongLyrics,
  suggestSongArtists,
  type SingerSuggestion,
} from "../../lib/lyricsLookup";
import { wrapLyricMark } from "../../lib/lyricTextStyle";
import {
  applyChordChart,
  chordProToSheet,
  detectChordKey,
  keyNameForChord,
  keySemitoneDelta,
  looksLikeChordSheet,
  sameKeySignature,
  stripChordLines,
  tidyChordSheet,
  transposeChordProText,
} from "../../lib/chords";
import {
  AiSongUnknown,
  ChordAssistUnavailable,
  generateChordChart,
  lookupMusicWithAi,
  recallSongLyrics,
} from "../../lib/chordAssist";
import {
  formatDuration,
  openExternalUrl,
  textToLyricSections,
} from "../../lib/helpers";
import type { Category } from "../../lib/types";
import { lookupYoutubeClip, youtubeVideoId } from "../../lib/youtube";
import { categoryTone, categoryVisual } from "../../lib/categoryColor";
import { useUnsavedDraft } from "../../lib/useUnsavedDraft";
import Modal from "./Modal";
import { useToast } from "../../lib/ToastContext";

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

const MAJOR_KEYS = [
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

const KEYS = MAJOR_KEYS.flatMap((key) => [key, `${key}m`]);

/** Set once the server says AI isn't configured, so we stop trying automatically. */
let aiAssistOff = false;

const CATALOG_LYRICS_HINT = "Lyrics filled from a public catalog. Review before saving.";
const AI_LYRICS_HINT =
  "Lyrics written by AI because the catalogs didn't have them. Check every line before saving.";

/** Show the error's own words only when they're written for people, never codes or service names. */
function friendlyError(err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message.trim() : "";
  const technical =
    /edge function|non-2xx|failed to fetch|networkerror|load failed|status code|gemini|groq|openai|quota|rate.?limit|\bjson\b|https?:|catalog lookup|proxy|abort/i;
  return !message || technical.test(message) ? fallback : message;
}

function hasChordLines(text: string) {
  return stripChordLines(text) !== text.replace(/\r\n?/g, "\n");
}

/** Public catalogs first; only when they have nothing does the AI fill in the lyrics. */
async function lyricsWithAiFallback(
  title: string,
  artist: string,
  signal?: AbortSignal,
  onAskingAi?: () => void,
) {
  try {
    return { text: await lookupSongLyrics(title, artist, signal), ai: false };
  } catch (catalogErr) {
    if (catalogErr instanceof DOMException && catalogErr.name === "AbortError") throw catalogErr;
    if (aiAssistOff) throw catalogErr;
    onAskingAi?.();
    try {
      const song = await recallSongLyrics({ title, artist });
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const text = formatFetchedLyrics(song.lyrics, title);
      if (!text) throw catalogErr;
      return { text, ai: true };
    } catch (aiErr) {
      if (aiErr instanceof ChordAssistUnavailable) {
        aiAssistOff = true;
        throw new Error("We couldn't find the lyrics for this song. You can paste or type them instead.");
      }
      if (aiErr instanceof AiSongUnknown) {
        throw new Error("We couldn't find the lyrics for this song. You can paste or type them instead.");
      }
      throw aiErr;
    }
  }
}

/**
 * AI (with web search) and the public catalogs race; the AI's answer wins, and the catalogs
 * only fill whatever it couldn't find.
 */
async function musicWithAiFirst(title: string, artist: string, signal?: AbortSignal) {
  const catalog = lookupSongMusic(title, artist, signal);
  catalog.catch(() => undefined);
  let ai: SongMusicMeta | null = null;
  if (!aiAssistOff) {
    try {
      ai = cleanMusicMeta(await lookupMusicWithAi({ title, artist }));
    } catch (err) {
      if (err instanceof ChordAssistUnavailable) aiAssistOff = true;
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (ai?.key && ai.bpm && ai.signature) return { ...ai, ai: true };
  }
  try {
    const found = await catalog;
    return {
      key: ai?.key || found.key,
      bpm: ai?.bpm || found.bpm,
      signature: ai?.signature || found.signature,
      ai: Boolean(ai?.key || ai?.bpm || ai?.signature),
    };
  } catch (err) {
    if (ai && (ai.key || ai.bpm || ai.signature)) return { ...ai, ai: true };
    throw err;
  }
}

const TIME_SIGNATURES = ["4/4", "3/4", "6/8", "2/4", "5/4"];

const LYRIC_SECTIONS = [
  "Intro",
  "Verse 1",
  "Pre-Chorus",
  "Chorus",
  "Bridge",
  "Outro",
] as const;

const LYRICS_PLACEHOLDER = `[Intro]
C          G         Am        F

[Verse 1]
C                 G
You are here, moving in our midst
Am             F
I worship You, I worship You

[Chorus]
C              G
I worship You, I worship You`;

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
  const toast = useToast();
  const titleId = useId();
  const descId = useId();
  const audioRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<SongFormValues>(emptyValues);
  const [showYoutube, setShowYoutube] = useState(false);
  const [lyricsOrigin, setLyricsOrigin] = useState<"manual" | "auto">("manual");
  const [lyricsBusy, setLyricsBusy] = useState(false);
  const [lyricsStage, setLyricsStage] = useState<"catalog" | "ai">("catalog");
  const [lyricsHint, setLyricsHint] = useState("");
  const [lyricsEditorOpen, setLyricsEditorOpen] = useState(false);
  const lyricsEditorRef = useRef<HTMLTextAreaElement>(null);
  const lyricsFieldRef = useRef<HTMLTextAreaElement>(null);
  const [musicBusy, setMusicBusy] = useState(false);
  const [musicHint, setMusicHint] = useState("");
  const [singers, setSingers] = useState<SingerSuggestion[]>([]);
  const [singersFor, setSingersFor] = useState("");
  const [singersBusy, setSingersBusy] = useState(false);
  const [singersError, setSingersError] = useState("");
  const [singersNonce, setSingersNonce] = useState(0);
  const [chordsBusy, setChordsBusy] = useState(false);
  const [aiSongBusy, setAiSongBusy] = useState(false);
  const aiTriedFor = useRef("");
  const chordRequest = useRef(0);
  const autoChordsFor = useRef("");
  const catalogKey = useRef("");
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const lastLookupKey = useRef("");
  const lyricsRequest = useRef(0);
  const lastYoutube = useRef("");
  const originKey = useRef("");
  const musicDirty = useRef({
    key: false,
    bpm: false,
    signature: false,
    duration: false,
  });

  useEffect(() => {
    if (!open) return;
    const next = { ...emptyValues, ...initialValues };
    next.lyrics = chordProToSheet(next.lyrics);
    setValues(next);
    originKey.current = JSON.stringify(next);
    setShowYoutube(Boolean(next.youtubeUrl));
    setLyricsOrigin("manual");
    setLyricsBusy(false);
    setLyricsStage("catalog");
    setLyricsHint("");
    setLyricsEditorOpen(false);
    setMusicBusy(false);
    setMusicHint("");
    setSingers([]);
    setSingersFor("");
    setSingersBusy(false);
    setSingersError("");
    setChordsBusy(false);
    setAiSongBusy(false);
    aiTriedFor.current = "";
    aiAssistOff = false;
    chordRequest.current += 1;
    autoChordsFor.current = "";
    catalogKey.current = "";
    setSaving(false);
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
      if (!persistValues.current.title.trim() || saving) return false;
      setSaving(true);
      try {
        await persistSave.current(persistValues.current);
      } finally {
        setSaving(false);
      }
    },
  });

  const closeForm = () => {
    if (saving) return;
    draft.guard(() => {
      setLyricsEditorOpen(false);
      onClose();
    });
  };

  const submitSong = async () => {
    if (!values.title.trim() || saving) return;
    setSaving(true);
    try {
      await onSubmit(values);
    } finally {
      setSaving(false);
    }
  };

  const applyLyricMark = (tag: "b" | "i" | "u") => {
    const field = lyricsEditorOpen
      ? lyricsEditorRef.current
      : lyricsFieldRef.current;
    setLyricsOrigin("manual");
    setValues((prev) => {
      const start = field?.selectionStart ?? prev.lyrics.length;
      const end = field?.selectionEnd ?? prev.lyrics.length;
      const wrapped = wrapLyricMark(prev.lyrics, start, end, tag);
      requestAnimationFrame(() => {
        field?.focus();
        field?.setSelectionRange(wrapped.start, wrapped.end);
      });
      return { ...prev, lyrics: wrapped.next };
    });
  };

  const insertLyricSection = (label: string) => {
    const heading = `[${label}]`;
    const field = lyricsEditorOpen
      ? lyricsEditorRef.current
      : lyricsFieldRef.current;
    setLyricsOrigin("manual");
    setValues((prev) => {
      const lyrics = prev.lyrics;
      const start = field?.selectionStart ?? lyrics.length;
      const end = field?.selectionEnd ?? lyrics.length;
      const before = lyrics.slice(0, start);
      const after = lyrics.slice(end);
      const prefix =
        !before || before.endsWith("\n\n")
          ? ""
          : before.endsWith("\n")
            ? "\n"
            : "\n\n";
      const suffix = after.startsWith("\n") ? "" : "\n";
      const next = `${before}${prefix}${heading}${suffix}${after}`;
      requestAnimationFrame(() => {
        const cursor = (before + prefix + heading + suffix).length;
        field?.focus();
        field?.setSelectionRange(cursor, cursor);
      });
      return { ...prev, lyrics: next };
    });
  };

  const pasteLyrics = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData("text/plain");
    if (!pasted || !looksLikeChordSheet(pasted)) return;
    event.preventDefault();
    const field = event.currentTarget;
    const start = field.selectionStart ?? values.lyrics.length;
    const end = field.selectionEnd ?? values.lyrics.length;
    const converted = tidyChordSheet(pasted);
    const keyChosen = musicDirty.current.key;
    const sourceKey = converted.key;
    const delta = keyChosen && sourceKey ? keySemitoneDelta(sourceKey, values.key) : 0;
    const body = transposeChordProText(converted.text, delta);

    setLyricsOrigin("manual");
    if (!keyChosen && sourceKey) musicDirty.current.key = true;
    setValues((prev) => {
      const lyrics = `${prev.lyrics.slice(0, start)}${body}${prev.lyrics.slice(end)}`;
      requestAnimationFrame(() => {
        const cursor = start + body.length;
        field.focus();
        field.setSelectionRange(cursor, cursor);
      });
      return {
        ...prev,
        lyrics,
        key: !keyChosen && sourceKey ? sourceKey : prev.key,
      };
    });
    setLyricsHint(
      delta && sourceKey
        ? `Pasted chord sheet and transposed ${sourceKey} → ${values.key}.`
        : !keyChosen && sourceKey
          ? `Pasted chord sheet. Key set to ${sourceKey} — change Key to transpose.`
          : "Pasted chord sheet.",
    );
  };

  const patch = (key: keyof SongFormValues, value: string) => {
    if (key === "lyrics") setLyricsOrigin("manual");
    if (key === "title" && !isEdit && value.trim() !== values.title.trim() && values.artist) {
      lyricsRequest.current += 1;
      lastLookupKey.current = "";
      setLyricsBusy(false);
      setMusicBusy(false);
    }
    if (
      key === "key" ||
      key === "bpm" ||
      key === "signature" ||
      key === "duration"
    ) {
      musicDirty.current[key] = true;
    }
    setValues((prev) => {
      if (key === "title" && !isEdit && value.trim() !== prev.title.trim() && prev.artist) {
        return { ...prev, title: value, artist: "" };
      }
      if (key === "key" && value !== prev.key && prev.lyrics.trim()) {
        const sheetKey = detectChordKey(prev.lyrics);
        const fromKey = sheetKey && !sameKeySignature(sheetKey, prev.key) ? sheetKey : prev.key;
        const delta = sameKeySignature(fromKey, value) ? 0 : keySemitoneDelta(fromKey, value);
        if (delta) {
          return {
            ...prev,
            key: value,
            lyrics: transposeChordProText(prev.lyrics, delta),
          };
        }
      }
      return { ...prev, [key]: value };
    });
  };

  const fillFromCatalog = async (
    force: {
      lyrics?: boolean;
      music?: boolean;
      skipLyrics?: boolean;
      refresh?: boolean;
    },
    signal?: AbortSignal,
    song?: { title: string; artist: string },
  ) => {
    const title = (song?.title ?? values.title).trim();
    const artist = (song?.artist ?? values.artist).trim();
    if (!title || !artist) {
      setLyricsHint("Add a title and artist first.");
      return;
    }
    const lookupKey = `${title.toLowerCase()}|${artist.toLowerCase()}`;
    if (
      !force.lyrics &&
      !force.music &&
      !force.refresh &&
      lookupKey === lastLookupKey.current
    )
      return;
    const requestId = ++lyricsRequest.current;
    const fillLyrics =
      !force.skipLyrics &&
      (Boolean(force.lyrics) || !values.lyrics.trim() || lyricsOrigin === "auto");
    const fillKey = Boolean(force.music) || !musicDirty.current.key;
    const fillBpm = Boolean(force.music) || !musicDirty.current.bpm;
    const fillSig = Boolean(force.music) || !musicDirty.current.signature;
    if (!fillLyrics && !fillKey && !fillBpm && !fillSig) return;
    const fillMusic = fillKey || fillBpm || fillSig;
    setLyricsBusy(fillLyrics);
    setMusicBusy(fillMusic);
    setLyricsStage("catalog");
    if (fillKey) catalogKey.current = "";
    if (fillLyrics) setLyricsHint("");
    if (fillMusic) setMusicHint("");
    const musicTask = fillMusic
      ? musicWithAiFirst(title, artist, signal).finally(() => {
          if (requestId === lyricsRequest.current) setMusicBusy(false);
        })
      : Promise.resolve(null);
    const lyricsTask = fillLyrics
      ? lyricsWithAiFallback(title, artist, signal, () => {
          if (requestId === lyricsRequest.current) setLyricsStage("ai");
        }).finally(() => {
          if (requestId === lyricsRequest.current) setLyricsBusy(false);
        })
      : Promise.resolve(null);
    const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";
    const current = () => requestId === lyricsRequest.current;

    const lyricsDone = lyricsTask.then(
      (result) => {
        if (!current() || !result) return;
        setLyricsOrigin("auto");
        setLyricsHint(result.ai ? AI_LYRICS_HINT : CATALOG_LYRICS_HINT);
        setValues((prev) => ({ ...prev, lyrics: result.text }));
        if (result.ai) toast.warning("Lyrics written by AI. Check every line before saving.");
        else toast.success("Lyrics filled from a public catalog.");
      },
      (err: unknown) => {
        if (!current() || isAbort(err)) return;
        setLyricsHint(
          friendlyError(err, "Sorry, there was a problem finding the lyrics. Please try again in a moment."),
        );
      },
    );

    const musicDone = musicTask.then(
      (music) => {
        if (!current() || !music) return;
        const nextKey = fillKey ? music.key : null;
        if (nextKey) catalogKey.current = nextKey;
        const nextBpm = fillBpm ? music.bpm : null;
        const nextSig = fillSig ? music.signature : null;
        const filled = [
          nextKey ? `key ${nextKey}` : null,
          nextBpm ? `${nextBpm} BPM` : null,
          nextSig ? nextSig : null,
        ].filter(Boolean);
        const source = music.ai ? "AI web search" : "public catalogs";
        setMusicHint(
          filled.length
            ? `Filled ${filled.join(", ")} from ${source}. Check against the recording.`
            : "Found the song, but no extra BPM / key / beat to fill.",
        );
        if (!nextKey && !nextBpm && !nextSig) return;
        toast.info(`Filled ${filled.join(", ")} from ${source}.`);
        setValues((prev) => {
          const sheetKey = detectChordKey(prev.lyrics) ?? prev.key;
          const keyDelta =
            nextKey && hasChordLines(prev.lyrics) && !sameKeySignature(sheetKey, nextKey)
              ? keySemitoneDelta(sheetKey, nextKey)
              : 0;
          return {
            ...prev,
            lyrics: keyDelta ? transposeChordProText(prev.lyrics, keyDelta) : prev.lyrics,
            key: nextKey ?? prev.key,
            bpm: nextBpm ?? prev.bpm,
            signature: nextSig ?? prev.signature,
          };
        });
      },
      (err: unknown) => {
        if (!current() || isAbort(err)) return;
        setMusicHint(
          friendlyError(err, "We couldn't find the key and tempo. You can set them yourself."),
        );
      },
    );

    await Promise.all([lyricsDone, musicDone]);
    if (current()) lastLookupKey.current = lookupKey;
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
    const title = values.title.trim();
    if (values.artist.trim() || title.length < 2) {
      setSingers([]);
      setSingersBusy(false);
      setSingersError("");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSingersBusy(true);
      setSingersError("");
      void suggestSongArtists(title, controller.signal)
        .then((rows) => {
          if (controller.signal.aborted) return;
          setSingers(rows);
          setSingersFor(title);
          if (!rows.length) {
            setSingersError("No singers found for that title. Type the artist instead.");
            if (!aiAssistOff && !valuesRef.current.lyrics.trim() && aiTriedFor.current !== title) {
              aiTriedFor.current = title;
              void askAiForSong();
            }
          }
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setSingers([]);
          setSingersError(
            friendlyError(err, "We couldn't look up singers right now. Type the singer's name instead."),
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setSingersBusy(false);
        });
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, values.title, values.artist, singersNonce]);

  const pickSinger = (singer: SingerSuggestion) => {
    const song = {
      title: singer.title.trim() || values.title.trim(),
      artist: singer.artist.trim(),
    };
    const fillLyrics =
      Boolean(singer.lyrics) && (!values.lyrics.trim() || lyricsOrigin === "auto");
    setSingers([]);
    setValues((prev) => ({
      ...prev,
      title: song.title,
      artist: song.artist,
      lyrics: fillLyrics ? singer.lyrics : prev.lyrics,
    }));
    if (fillLyrics) {
      setLyricsOrigin("auto");
      toast.success(`Lyrics filled for ${song.title} by ${song.artist}.`);
    }
    setLyricsHint(
      fillLyrics ? CATALOG_LYRICS_HINT : "",
    );
    lastLookupKey.current = `${song.title.toLowerCase()}|${song.artist.toLowerCase()}`;
    void fillFromCatalog({ refresh: true, skipLyrics: fillLyrics }, undefined, song);
  };

  const askAiForSong = async () => {
    const current = valuesRef.current;
    const title = current.title.trim();
    if (!title || aiSongBusy) return;
    setAiSongBusy(true);
    try {
      const song = await recallSongLyrics({ title, artist: current.artist.trim() });
      const lyrics = formatFetchedLyrics(song.lyrics, song.title || title);
      const latest = valuesRef.current;
      if (latest.title.trim() !== title) return;
      const fill = Boolean(lyrics) && !latest.lyrics.trim();
      const next = { title: song.title || title, artist: song.artist || latest.artist };
      setValues((prev) => ({
        ...prev,
        title: next.title,
        artist: next.artist,
        lyrics: fill ? lyrics : prev.lyrics,
      }));
      if (fill) {
        setLyricsOrigin("auto");
        setLyricsHint(AI_LYRICS_HINT);
        toast.warning("Lyrics written by AI. Check every line before saving.");
      }
      if (next.artist.trim()) {
        lastLookupKey.current = `${next.title.toLowerCase()}|${next.artist.toLowerCase()}`;
        void fillFromCatalog({ refresh: true, skipLyrics: fill }, undefined, next);
      }
    } catch (err) {
      if (err instanceof ChordAssistUnavailable) aiAssistOff = true;
      setSingersError(
        err instanceof AiSongUnknown || err instanceof ChordAssistUnavailable
          ? "We couldn't find this song. Type the singer's name or paste the lyrics instead."
          : friendlyError(err, "Sorry, there was a problem creating the lyrics. Please try again in a moment."),
      );
    } finally {
      setAiSongBusy(false);
    }
  };

  const requestLyrics = () => {
    if (values.artist.trim()) {
      void fillFromCatalog({ lyrics: true });
      return;
    }
    if (!values.title.trim()) {
      setLyricsHint("Type the song title first.");
      return;
    }
    setLyricsEditorOpen(false);
    setLyricsHint("Pick who sings it (under the title) to fill the lyrics.");
    setSingersNonce((n) => n + 1);
    document.getElementById("song-title")?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const addChords = async (auto = false) => {
    const current = valuesRef.current;
    const title = current.title.trim();
    const source = current.lyrics;
    if (!title || !stripChordLines(source).trim()) {
      if (!auto) setLyricsHint("Add the song title and lyrics first.");
      return;
    }
    const requestId = ++chordRequest.current;
    setChordsBusy(true);
    if (!auto) setLyricsHint("");
    try {
      const chart = await generateChordChart({
        title,
        artist: current.artist.trim(),
        key: musicDirty.current.key ? current.key : catalogKey.current,
        lyrics: stripChordLines(source).trim(),
      });
      if (requestId !== chordRequest.current) return;
      const tidy = tidyChordSheet(chart.sheet);
      const chartKey = keyNameForChord(chart.key) ?? tidy.key;
      const { text, matched } = applyChordChart(source, tidy.text);
      if (!matched) {
        throw new Error("Sorry, there was a problem creating the chords. Please try again in a moment.");
      }
      const latest = valuesRef.current;
      if (latest.lyrics !== source) {
        setLyricsHint("Lyrics changed while chords were loading, so they weren't added.");
        return;
      }
      const sheetKey = detectChordKey(text) ?? chartKey;
      const keepKey = musicDirty.current.key && Boolean(latest.key);
      const delta =
        keepKey && sheetKey && !sameKeySignature(sheetKey, latest.key)
          ? keySemitoneDelta(sheetKey, latest.key)
          : 0;
      const finalKey = keepKey ? latest.key : sheetKey || latest.key;
      setValues((prev) => ({
        ...prev,
        lyrics: delta ? transposeChordProText(text, delta) : text,
        key: finalKey,
      }));
      setLyricsHint(
        `Chords added by AI${finalKey ? ` in ${finalKey}` : ""}. They're a best guess, so check them against the recording.`,
      );
      toast.success(`Chords added${finalKey ? ` in ${finalKey}` : ""}.`);
    } catch (err) {
      if (requestId !== chordRequest.current) return;
      if (err instanceof ChordAssistUnavailable) {
        aiAssistOff = true;
        if (!auto) setLyricsHint(err.message);
        return;
      }
      const message = friendlyError(
        err,
        "Sorry, there was a problem creating the chords. Please try again in a moment.",
      );
      setLyricsHint(message);
      toast.error(message);
    } finally {
      if (requestId === chordRequest.current) setChordsBusy(false);
    }
  };

  useEffect(() => {
    if (!open || aiAssistOff || lyricsOrigin !== "auto") return;
    if (lyricsBusy || chordsBusy) return;
    const lyrics = values.lyrics;
    if (!lyrics.trim() || hasChordLines(lyrics) || autoChordsFor.current === lyrics) return;
    const timer = window.setTimeout(() => {
      autoChordsFor.current = lyrics;
      void addChords(true);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [open, lyricsOrigin, lyricsBusy, chordsBusy, values.lyrics]); // eslint-disable-line react-hooks/exhaustive-deps -- add chords once auto-filled lyrics settle

  useEffect(() => {
    if (!open || musicDirty.current.key) return;
    const sheetKey = detectChordKey(values.lyrics);
    if (!sheetKey || sameKeySignature(sheetKey, values.key)) return;
    setValues((prev) => (prev.lyrics === values.lyrics ? { ...prev, key: sheetKey } : prev));
  }, [open, values.lyrics, values.key]);

  const songLabel = values.title.trim() ? `“${values.title.trim()}”` : "this song";
  const busyTasks: Record<string, string | null> = {
    "song-singers": open && singersBusy ? `Finding who sings ${songLabel}…` : null,
    "song-lyrics":
      open && lyricsBusy
        ? lyricsStage === "ai"
          ? `Not in the catalogs. Asking AI for the lyrics of ${songLabel}…`
          : `Searching lyrics catalogs for ${songLabel}…`
        : null,
    "song-ai-lyrics":
      open && aiSongBusy && !lyricsBusy ? `Asking AI for the lyrics of ${songLabel}…` : null,
    "song-music":
      open && musicBusy
        ? aiAssistOff
          ? `Looking up key, BPM & beat for ${songLabel}…`
          : `AI is searching the key, BPM & beat of ${songLabel}…`
        : null,
    "song-chords": open && chordsBusy ? `AI is writing the chords for ${songLabel}…` : null,
  };
  const busyKey = JSON.stringify(busyTasks);

  useEffect(() => {
    for (const [id, message] of Object.entries(busyTasks)) toast.progress(id, message);
  }, [busyKey]); // eslint-disable-line react-hooks/exhaustive-deps -- busyKey captures busyTasks

  useEffect(
    () => () => {
      for (const id of ["song-singers", "song-lyrics", "song-ai-lyrics", "song-music", "song-chords"]) {
        toast.progress(id, null);
      }
    },
    [toast],
  );

  const findChordsOnline = () => {
    const query = `${values.title} ${values.artist}`.trim();
    if (!query) return;
    void openExternalUrl(
      `https://www.ultimate-guitar.com/search.php?search_type=title&value=${encodeURIComponent(query)}`,
    );
  };

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
          title: prev.title.trim() ? prev.title : (clip.title ?? prev.title),
          artist: prev.artist.trim()
            ? prev.artist
            : (clip.author ?? prev.artist),
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
              void submitSong();
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
                  placeholder="e.g. Goodness of God"
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
                  placeholder="e.g. Jen Johnson"
                  type="text"
                />
              </div>
            </div>

            {!values.artist.trim() && (singersBusy || singers.length || singersError) ? (
              <div className="-mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined filled text-primary text-[18px]">
                    auto_awesome
                  </span>
                  <p className="text-xs font-semibold text-on-surface">
                    Who sings “{singersFor || values.title.trim()}”? Pick one to fill the lyrics.
                  </p>
                  {singersBusy ? (
                    <span className="material-symbols-outlined text-[16px] text-primary animate-spin ml-auto">
                      progress_activity
                    </span>
                  ) : null}
                </div>
                {singers.length ? (
                  <div className="flex flex-wrap gap-2">
                    {singers.map((singer) => (
                      <button
                        key={`${singer.artist}|${singer.title}`}
                        type="button"
                        onClick={() => pickSinger(singer)}
                        className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-surface-container-high border border-white/10 hover:border-primary/50 hover:bg-primary/10 text-left transition-colors"
                        title={`${singer.title} — ${singer.artist}`}
                      >
                        {singer.cover ? (
                          <img
                            src={singer.cover}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <span className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[16px] text-primary">
                              person
                            </span>
                          </span>
                        )}
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-on-surface truncate max-w-[12rem]">
                            {singer.artist}
                          </span>
                          <span className="block text-[10px] text-on-surface-variant">
                            {singer.lyrics ? "Lyrics ready" : "Will search lyrics"}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : aiSongBusy ? (
                  <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-primary animate-spin">
                      progress_activity
                    </span>
                    Not in the catalogs. Asking AI for the lyrics…
                  </p>
                ) : singersError ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-on-surface-variant">{singersError}</p>
                    {!aiAssistOff ? (
                      <button
                        type="button"
                        onClick={() => void askAiForSong()}
                        className="inline-flex items-center gap-1 px-3 h-7 rounded-full bg-primary/15 text-primary hover:bg-primary/25 text-[11px] font-semibold"
                      >
                        <span className="material-symbols-outlined filled text-[14px]">auto_awesome</span>
                        Ask AI
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-variant">Looking for singers…</p>
                )}
                <p className="text-[10px] text-on-surface-variant/80">
                  Not listed? Type the artist above and the lyrics fill in automatically.
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-[11px] uppercase tracking-wider text-on-surface-variant opacity-70">
                  Key, BPM & beat
                </p>
                {musicBusy ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-primary">
                    <span className="material-symbols-outlined text-[16px] animate-spin">
                      progress_activity
                    </span>
                    Looking up key, BPM & beat…
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
                    title="Changing key auto-transposes the chords in the lyrics"
                  >
                    {KEYS.map((key) => (
                      <option key={key} value={key}>
                        {key.endsWith("m")
                          ? `${key.slice(0, -1)} minor`
                          : `${key} major`}
                      </option>
                    ))}
                    {values.key && !KEYS.includes(values.key) ? (
                      <option value={values.key}>{values.key}</option>
                    ) : null}
                  </select>
                  <p className="text-[10px] text-on-surface-variant">
                    Change key to auto-transpose the chords.
                  </p>
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
                {musicHint ? (
                  <p className="text-xs text-on-surface-variant col-span-2 md:col-span-4">
                    {musicHint}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2 pt-2">
                <p className="text-xs font-medium text-primary/80 uppercase tracking-wider">
                  Category
                </p>
                <div
                  className="flex flex-wrap gap-2"
                  role="listbox"
                  aria-label="Category"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={!values.categoryId}
                    onClick={() => patch("categoryId", "")}
                    className={`h-8 px-3 rounded-full text-xs font-medium border transition-all ${
                      !values.categoryId
                        ? "bg-white/15 text-on-surface border-white/30"
                        : "bg-white/5 text-on-surface-variant border-white/10 hover:bg-white/10"
                    }`}
                  >
                    None
                  </button>
                  {categories.map((category) => {
                    const visual = categoryVisual[categoryTone(category.color)];
                    const selected = values.categoryId === category.id;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => patch("categoryId", category.id)}
                        className={`h-8 px-3 rounded-full text-xs font-medium border inline-flex items-center gap-1.5 transition-all ${
                          selected
                            ? `${visual.chip} ring-1 ring-offset-1 ring-offset-[#13131b]`
                            : "bg-white/5 text-on-surface-variant border-white/10 hover:bg-white/10"
                        }`}
                      >
                        <span className="material-symbols-outlined text-[14px] leading-none">
                          {category.icon || "label"}
                        </span>
                        {category.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-2 group">
              <div className="flex justify-between items-center">
                <p className="text-xs font-medium text-primary/80 uppercase tracking-wider">
                  Lyrics & chords
                  <span className="ml-2 text-[10px] font-normal normal-case tracking-normal text-on-surface-variant">
                    Highlight a word to add a chord above it, or type chords on their own line
                  </span>
                </p>
                <span className="text-on-surface-variant text-[10px] font-medium bg-white/5 px-2 py-1 rounded">
                  Markdown Supported
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(["b", "i", "u"] as const).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => applyLyricMark(tag)}
                    title={
                      tag === "b" ? "Bold" : tag === "i" ? "Italic" : "Underline"
                    }
                    className={`h-7 w-8 rounded-md text-xs bg-white/5 text-on-surface-variant border border-white/10 hover:bg-primary/15 hover:text-primary hover:border-primary/30 transition-all ${
                      tag === "b" ? "font-bold" : tag === "i" ? "italic" : "underline"
                    }`}
                  >
                    {tag.toUpperCase()}
                  </button>
                ))}
                {LYRIC_SECTIONS.map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => insertLyricSection(label)}
                    className="h-7 px-2.5 rounded-full text-[11px] font-medium bg-white/5 text-on-surface-variant border border-white/10 hover:bg-primary/15 hover:text-primary hover:border-primary/30 transition-all"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <textarea
                  ref={lyricsFieldRef}
                  id="song-lyrics"
                  value={values.lyrics}
                  onChange={(event) => patch("lyrics", event.target.value)}
                  onPaste={pasteLyrics}
                  className={`${fieldClass} min-h-[20rem] px-6 py-4 pr-14 font-mono text-sm leading-relaxed overflow-hidden resize-none`}
                  placeholder={LYRICS_PLACEHOLDER}
                  rows={16}
                />
                <ChordPicker
                  fieldRef={lyricsFieldRef}
                  value={values.lyrics}
                  songKey={values.key}
                  enabled={open && !lyricsEditorOpen}
                  onChange={(next) => patch("lyrics", next)}
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
              {values.lyrics.trim() ? (
                <div className="rounded-xl border border-white/10 bg-surface-container-low/80 p-4 space-y-3">
                  <p className="text-[11px] uppercase tracking-wider text-primary font-semibold">
                    Chords preview
                  </p>
                  <div className="space-y-3 max-h-56 overflow-y-auto custom-scrollbar">
                    {textToLyricSections(values.lyrics).map((block, index) => (
                      <div key={`${block.section}-${index}`}>
                        <p className="text-[10px] uppercase tracking-widest text-on-surface-variant/70 mb-1">
                          {block.section}
                        </p>
                        <ChordLyricPreview content={block.content} />
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={!values.title.trim()}
                  onClick={findChordsOnline}
                  className="h-9 px-3 rounded-lg border border-white/10 text-on-surface-variant hover:text-on-surface hover:bg-white/5 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                  title="Search Ultimate Guitar for the original chord chart, then paste it here"
                >
                  <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                  Find chords
                </button>
                <button
                  type="button"
                  disabled={chordsBusy || lyricsBusy || !values.title.trim() || !values.lyrics.trim()}
                  onClick={() => void addChords()}
                  className="h-9 px-3 rounded-lg bg-secondary/15 text-secondary hover:bg-secondary/25 border border-secondary/20 text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
                  title="Let AI write chords above the lyrics"
                >
                  <span
                    className={`material-symbols-outlined text-[16px] ${chordsBusy ? "animate-spin" : ""}`}
                  >
                    {chordsBusy ? "progress_activity" : "music_note"}
                  </span>
                  {chordsBusy
                    ? "Adding chords…"
                    : hasChordLines(values.lyrics)
                      ? "Redo chords"
                      : "Add chords"}
                </button>
                <button
                  type="button"
                  disabled={lyricsBusy || !values.title.trim()}
                  onClick={requestLyrics}
                  className="w-9 h-9 shrink-0 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 border border-primary/20 flex items-center justify-center transition-all disabled:opacity-40 disabled:hover:bg-primary/15"
                  title="Fill lyrics from the song title"
                  aria-label="Fill lyrics from the song title"
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
                    lyricsHint === AI_LYRICS_HINT
                      ? "text-amber-300"
                      : lyricsHint.startsWith("Lyrics filled") ||
                          lyricsHint.startsWith("Chords added")
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
                      <span className="material-symbols-outlined">
                        play_circle
                      </span>
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
                      onChange={(event) =>
                        patch("youtubeUrl", event.target.value)
                      }
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
                    <span className="material-symbols-outlined">
                      audio_file
                    </span>
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
            <span>
              Song will be synced to all connected production stations.
            </span>
          </div>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="flex-1 md:flex-none px-8 py-3 rounded-full text-xs font-medium text-on-surface border border-white/10 hover:bg-white/5 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              form="song-form"
              type="submit"
              disabled={saving || !values.title.trim()}
              className="flex-1 md:flex-none px-10 py-3 rounded-full text-xs font-semibold bg-gradient-to-r from-primary-container to-secondary-container text-white hover:opacity-90 hover:shadow-[0_0_20px_rgba(121,0,205,0.45)] transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-60 disabled:hover:shadow-none disabled:hover:opacity-60 disabled:active:scale-100"
            >
              {saving ? (
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <span className="material-symbols-outlined text-sm">
                  check_circle
                </span>
              )}
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Save Song"}
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
                disabled={lyricsBusy || !values.title.trim()}
                onClick={requestLyrics}
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
                disabled={chordsBusy || lyricsBusy || !values.title.trim() || !values.lyrics.trim()}
                onClick={() => void addChords()}
                className="px-3 py-2 rounded-lg text-xs font-medium text-secondary hover:bg-secondary/10 flex items-center gap-1 disabled:opacity-40"
              >
                <span
                  className={`material-symbols-outlined text-[16px] ${chordsBusy ? "animate-spin" : ""}`}
                >
                  {chordsBusy ? "progress_activity" : "music_note"}
                </span>
                {hasChordLines(values.lyrics) ? "Redo chords" : "Chords"}
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
          <div className="flex flex-wrap items-center gap-1.5 px-5 py-3 border-b border-white/10">
            {(["b", "i", "u"] as const).map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => applyLyricMark(tag)}
                title={
                  tag === "b" ? "Bold" : tag === "i" ? "Italic" : "Underline"
                }
                className={`h-7 w-8 rounded-md text-xs bg-white/5 text-on-surface-variant border border-white/10 hover:bg-primary/15 hover:text-primary hover:border-primary/30 ${
                  tag === "b" ? "font-bold" : tag === "i" ? "italic" : "underline"
                }`}
              >
                {tag.toUpperCase()}
              </button>
            ))}
            {LYRIC_SECTIONS.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => insertLyricSection(label)}
                className="h-7 px-2.5 rounded-full text-[11px] font-medium bg-white/5 text-on-surface-variant border border-white/10 hover:bg-primary/15 hover:text-primary hover:border-primary/30 transition-all"
              >
                {label}
              </button>
            ))}
          </div>
          <textarea
            ref={lyricsEditorRef}
            value={values.lyrics}
            onChange={(event) => patch("lyrics", event.target.value)}
            onPaste={pasteLyrics}
            className="flex-1 min-h-0 w-full bg-transparent px-6 py-5 font-mono text-base sm:text-lg leading-relaxed text-on-surface resize-none focus:outline-none placeholder:text-on-surface-variant/30 custom-scrollbar"
            placeholder={LYRICS_PLACEHOLDER}
          />
          <ChordPicker
            fieldRef={lyricsEditorRef}
            value={values.lyrics}
            songKey={values.key}
            enabled={open && lyricsEditorOpen}
            onChange={(next) => patch("lyrics", next)}
          />
        </div>
      </Modal>
    </>
  );
}
