import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import CueStage from "../../components/CueStage";
import StageBackdrop from "../../components/StageBackdrop";
import VerseOverlay from "../../components/VerseOverlay";
import {
  buildCues,
  cueIndexFor,
  getActivePresentation,
  getChurchSettings,
  getPresentation,
  getSetlist,
  subscribePresentation,
} from "../../lib/api";
import { setlistFingerprint, subscribeContent } from "../../lib/offline/live";
import { asStageFont, DEFAULT_STAGE_FONT } from "../../lib/stageFonts";
import { asStageBackground, stageUsesDarkText, type StageBackgroundId } from "../../lib/stageBackgrounds";
import {
  parseLyricTextStyle,
  type LyricTextStyle,
} from "../../lib/lyricTextStyle";
import {
  asStageTransition,
  lyricTransitionClass,
  type StageTransition,
} from "../../lib/stageTransition";
import type { LiveCue, Presentation, Setlist } from "../../lib/types";

export default function Output() {
  const [params] = useSearchParams();
  const requestedId = params.get("presentation");
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [setlist, setSetlist] = useState<Setlist | null>(null);
  const [font, setFont] = useState(DEFAULT_STAGE_FONT);
  const [lyricSize, setLyricSize] = useState("48");
  const [stageBg, setStageBg] = useState<StageBackgroundId>("sanctuary");
  const [lyricStyle, setLyricStyle] = useState<LyricTextStyle>({
    bold: false,
    italic: false,
    underline: false,
  });
  const [transitionStyle, setTransitionStyle] = useState<StageTransition>("dissolve");
  const [error, setError] = useState("");
  const setlistFp = useRef("");

  const applySetlist = (next: Setlist) => {
    const fp = setlistFingerprint(next);
    if (fp === setlistFp.current) return;
    setlistFp.current = fp;
    setSetlist(next);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const row = requestedId
          ? await getPresentation(requestedId)
          : await getActivePresentation();
        if (cancelled || !row) return;
        setPresentation(row);
        applySetlist(await getSetlist(row.setlist_id));
        const settings = await getChurchSettings();
        if (!cancelled) {
          setFont(asStageFont(settings?.default_font));
          setLyricSize(settings?.lyrics_text_size || "48");
          setLyricStyle(parseLyricTextStyle(settings?.lyrics_text_style));
          setStageBg(asStageBackground(settings?.stage_background));
          setTransitionStyle(asStageTransition(settings?.default_transition));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Output is unavailable.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestedId]);

  useEffect(() => {
    if (!presentation?.id) return;
    return subscribePresentation(presentation.id, setPresentation);
  }, [presentation?.id]);

  useEffect(() => {
    const setlistId = presentation?.setlist_id;
    if (!setlistId) return;
    const reload = () => {
      void getSetlist(setlistId).then(applySetlist).catch(() => undefined);
      void getChurchSettings()
        .then((settings) => {
          setFont(asStageFont(settings?.default_font));
          setLyricSize(settings?.lyrics_text_size || "48");
          setLyricStyle(parseLyricTextStyle(settings?.lyrics_text_style));
          setStageBg(asStageBackground(settings?.stage_background));
          setTransitionStyle(asStageTransition(settings?.default_transition));
        })
        .catch(() => undefined);
    };
    const unsub = subscribeContent(reload);
    reload();
    const timer = window.setInterval(reload, 1500);
    return () => {
      unsub();
      window.clearInterval(timer);
    };
  }, [presentation?.setlist_id]);

  const cues = useMemo(() => (setlist ? buildCues(setlist) : []), [setlist]);
  const index = presentation ? cueIndexFor(presentation, cues) : 0;
  const cue: LiveCue | undefined = cues[index];
  const ms = presentation?.transition_ms ?? 400;
  const darkText = stageUsesDarkText(stageBg);

  useEffect(() => {
    const block = (event: KeyboardEvent) => {
      const key = event.key;
      const shortcut =
        key === "Escape" ||
        key === " " ||
        key === "Spacebar" ||
        key === "ArrowLeft" ||
        key === "ArrowRight" ||
        key === "ArrowUp" ||
        key === "ArrowDown" ||
        key === "Enter" ||
        key === "F11" ||
        key.toLowerCase() === "b";
      if (!shortcut && event.code !== "Space") return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener("keydown", block, true);
    window.addEventListener("keyup", block, true);
    return () => {
      window.removeEventListener("keydown", block, true);
      window.removeEventListener("keyup", block, true);
    };
  }, []);

  if (error) {
    return (
      <div className="h-full w-full bg-black text-white/50 flex items-center justify-center text-sm">
        {error}
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full overflow-hidden select-none ${darkText ? "bg-white" : "bg-black"}`}>
      <StageBackdrop id={stageBg} />

      {presentation?.is_blackout ? (
        <div className="absolute inset-0 bg-black z-20" />
      ) : null}

      {presentation?.show_logo && !presentation.is_blackout ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
            <span className="material-symbols-outlined filled text-on-primary text-6xl">
              church
            </span>
          </div>
        </div>
      ) : null}

      {!presentation?.show_logo && !presentation?.is_blackout ? (
        <div
          key={cue?.id ?? "empty"}
          className={`absolute inset-0 z-10 ${lyricTransitionClass(transitionStyle, ms)}`}
          style={{ animationDuration: `${ms}ms` }}
        >
          <CueStage
            cue={cue}
            font={font}
            lyricSize={lyricSize}
            darkText={darkText}
            lyricStyle={lyricStyle}
          />
        </div>
      ) : null}

      {presentation?.verse_overlay_ref && !presentation.is_blackout ? (
        <VerseOverlay
          reference={presentation.verse_overlay_ref}
          translation={presentation.verse_overlay_translation || "ceb"}
          font={font}
          textSize={
            cue?.kind === "lyric" ? lyricSize : cue?.textSize || "md"
          }
          page={presentation.verse_overlay_page ?? 0}
          pageSize={presentation.verse_overlay_take || 5}
          darkText={darkText}
        />
      ) : null}
    </div>
  );
}
