import { useEffect, useState } from "react";
import {
  openYoutubeInBrowser,
  youtubeEmbedUrl,
  youtubeThumbUrl,
  youtubeVideoId,
  youtubeWatchUrl,
} from "../lib/youtube";

type SongThumbProps = {
  youtubeUrl?: string | null;
  title: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
};

const frame: Record<NonNullable<SongThumbProps["size"]>, string> = {
  sm: "w-11 h-11 rounded-lg",
  md: "w-14 h-14 rounded-xl",
  lg: "w-full aspect-video rounded-xl",
};

export default function SongThumb({
  youtubeUrl,
  title,
  size = "sm",
  className = "",
  playing,
  onPlayingChange,
}: SongThumbProps) {
  const preferred = size === "lg" ? "hq" : "mq";
  const [src, setSrc] = useState(() => youtubeThumbUrl(youtubeUrl, preferred));
  const [usedFallback, setUsedFallback] = useState(false);
  const [internalPlay, setInternalPlay] = useState(false);
  const watchUrl = youtubeWatchUrl(youtubeUrl);
  const canPlay = size === "lg" && Boolean(youtubeVideoId(youtubeUrl));
  const isPlaying = canPlay && (playing ?? internalPlay);
  const embed = youtubeEmbedUrl(youtubeUrl, true);

  useEffect(() => {
    setUsedFallback(false);
    setSrc(youtubeThumbUrl(youtubeUrl, preferred));
    setInternalPlay(false);
  }, [youtubeUrl, preferred]);

  const start = () => {
    if (!canPlay) return;
    onPlayingChange?.(true);
    if (playing === undefined) setInternalPlay(true);
  };

  return (
    <div
      className={`relative shrink-0 overflow-hidden bg-black ${frame[size]} ${className}`}
    >
      {isPlaying && embed ? (
        <iframe
          src={embed}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
          className="h-full w-full border-0"
        />
      ) : (
        <>
          {src ? (
            <img
              src={src}
              alt=""
              className="h-full w-full object-cover"
              onError={() => {
                if (!usedFallback && preferred !== "mq") {
                  setUsedFallback(true);
                  setSrc(youtubeThumbUrl(youtubeUrl, "mq"));
                  return;
                }
                setSrc(null);
              }}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-secondary/20">
              <span
                className={`material-symbols-outlined text-on-surface-variant ${
                  size === "lg" ? "text-5xl" : "text-[20px]"
                }`}
              >
                music_note
              </span>
            </div>
          )}
          {src && size === "lg" ? (
            <button
              type="button"
              onClick={start}
              className="absolute inset-0 flex items-center justify-center bg-black/25 hover:bg-black/35"
              aria-label={`Play ${title}`}
            >
              <span className="material-symbols-outlined filled text-white text-5xl drop-shadow">
                play_circle
              </span>
            </button>
          ) : null}
          {src && size !== "lg" ? (
            <span className="pointer-events-none absolute bottom-0.5 right-0.5 material-symbols-outlined filled text-white text-[12px] drop-shadow">
              play_arrow
            </span>
          ) : null}
        </>
      )}
      {canPlay && watchUrl ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void openYoutubeInBrowser(watchUrl);
          }}
          title="Open in browser"
          aria-label="Open in browser"
          className="absolute top-2 right-2 z-20 w-10 h-10 rounded-lg bg-black/65 text-white hover:bg-black/80 flex items-center justify-center"
        >
          <span className="material-symbols-outlined text-[22px]">link</span>
        </button>
      ) : null}
      <span className="sr-only">{title} thumbnail</span>
    </div>
  );
}
