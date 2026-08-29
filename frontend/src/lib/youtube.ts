const ID = /^[\w-]{11}$/;

export function youtubeVideoId(url: string | null | undefined) {
  if (!url) return null;
  const trimmed = url.trim();
  if (ID.test(trimmed)) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
      return ID.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "music.youtube.com") {
      const fromQuery = parsed.searchParams.get("v");
      if (fromQuery && ID.test(fromQuery)) return fromQuery;
      const parts = parsed.pathname.split("/").filter(Boolean);
      const kind = parts.findIndex((part) =>
        ["embed", "shorts", "live", "v"].includes(part),
      );
      const next = kind >= 0 ? parts[kind + 1] ?? "" : "";
      return ID.test(next) ? next : null;
    }
  } catch {
    return null;
  }
  return null;
}

export function youtubeWatchUrl(url: string | null | undefined) {
  const id = youtubeVideoId(url);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function youtubeEmbedUrl(
  url: string | null | undefined,
  autoplay = false,
) {
  const id = youtubeVideoId(url);
  if (!id) return null;
  const params = new URLSearchParams({
    rel: "0",
    modestbranding: "1",
    playsinline: "1",
  });
  if (autoplay) params.set("autoplay", "1");
  params.set("fs", "0");
  return `https://www.youtube.com/embed/${id}?${params.toString()}`;
}

export function youtubeThumbUrl(
  url: string | null | undefined,
  quality: "mq" | "hq" | "sd" = "hq",
) {
  const id = youtubeVideoId(url);
  if (!id) return null;
  const file =
    quality === "sd"
      ? "sddefault.jpg"
      : quality === "mq"
        ? "mqdefault.jpg"
        : "hqdefault.jpg";
  return `https://i.ytimg.com/vi/${id}/${file}`;
}

export type YoutubeClipInfo = {
  videoId: string;
  title: string | null;
  author: string | null;
  durationSeconds: number | null;
};

export async function loadYoutubeApi() {
  if (window.YT?.Player) return;
  if (!document.querySelector("script[src='https://www.youtube.com/iframe_api']")) {
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  }
  await new Promise<void>((resolve, reject) => {
    const started = Date.now();
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const tick = window.setInterval(() => {
      if (window.YT?.Player) {
        window.clearInterval(tick);
        resolve();
        return;
      }
      if (Date.now() - started > 10000) {
        window.clearInterval(tick);
        reject(new Error("YouTube player did not load."));
      }
    }, 50);
  });
}

export async function lookupYoutubeClip(
  url: string,
  signal?: AbortSignal,
): Promise<YoutubeClipInfo> {
  const videoId = youtubeVideoId(url);
  if (!videoId) throw new Error("That is not a valid YouTube link.");
  const watch = youtubeWatchUrl(url)!;
  let title: string | null = null;
  let author: string | null = null;
  const endpoints = [
    `https://noembed.com/embed?url=${encodeURIComponent(watch)}`,
    `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
  ];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, { signal });
      if (!response.ok) continue;
      const data = (await response.json()) as {
        title?: string;
        author_name?: string;
      };
      title = data.title?.trim() || title;
      author = data.author_name?.trim() || author;
      if (title) break;
    } catch {
      /* try the next source */
    }
  }
  const durationSeconds = await probeYoutubeDuration(videoId);
  return { videoId, title, author, durationSeconds };
}

export async function probeYoutubeDuration(videoId: string) {
  try {
    await loadYoutubeApi();
  } catch {
    return null;
  }
  return new Promise<number | null>((resolve) => {
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
    document.body.appendChild(host);
    let settled = false;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        player.destroy();
      } catch {
        /* already gone */
      }
      host.remove();
      resolve(value && value > 0 ? Math.round(value) : null);
    };
    const timer = window.setTimeout(() => finish(null), 8000);
    const player = new window.YT!.Player(host, {
      videoId,
      width: 1,
      height: 1,
      playerVars: { autoplay: 0, controls: 0, origin: window.location.origin },
      events: {
        onReady: (event) => finish(event.target.getDuration()),
        onError: () => finish(null),
      },
    });
  });
}

export async function openYoutubeInBrowser(url: string) {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
