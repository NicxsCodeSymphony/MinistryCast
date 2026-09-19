/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type YoutubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
};

type YoutubePlayerEvent = { target: YoutubePlayer };

interface Window {
  YT?: {
    Player: new (
      element: HTMLElement | string,
      options: {
        videoId?: string;
        width?: string | number;
        height?: string | number;
        playerVars?: Record<string, string | number>;
        events?: {
          onReady?: (event: YoutubePlayerEvent) => void;
          onStateChange?: (event: YoutubePlayerEvent & { data: number }) => void;
          onError?: () => void;
        };
      },
    ) => YoutubePlayer;
    PlayerState?: { PLAYING: number; PAUSED: number; ENDED: number };
  };
  onYouTubeIframeAPIReady?: () => void;
}
