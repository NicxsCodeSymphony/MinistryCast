import { supabase } from "./supabase";

/** Thrown when the chord-assist function has no AI key configured (or isn't deployed). */
export class ChordAssistUnavailable extends Error {}

/** Thrown when the AI says it doesn't know the song. */
export class AiSongUnknown extends Error {}

export type ChordChart = { key: string; sheet: string };
export type RecalledSong = { title: string; artist: string; lyrics: string };

const UNAVAILABLE = "This feature isn't available right now.";

/** Server messages are written for people; anything else (status codes, provider errors) is not. */
function friendlyServerMessage(message: string | undefined, fallback: string) {
  const text = (message ?? "").trim();
  if (!text || /edge function|non-2xx|fetch|status code|gemini|groq|openai|api key|quota|rate.?limit|\bjson\b|http/i.test(text)) {
    return fallback;
  }
  return text;
}

async function askAssist<T>(body: Record<string, string>, task: string): Promise<T> {
  const fallback = `Sorry, there was a problem ${task}. Please try again in a moment.`;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("You're offline. Connect to the internet and try again.");
  }
  let result: Awaited<ReturnType<typeof supabase.functions.invoke<T & { error?: string }>>>;
  try {
    result = await supabase.functions.invoke<T & { error?: string }>("chord-assist", { body });
  } catch {
    throw new Error(fallback);
  }
  const { data, error } = result;
  if (error) {
    let message = "";
    let code = "";
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const reply = (await context.json().catch(() => null)) as {
        error?: string;
        code?: string;
      } | null;
      message = reply?.error ?? "";
      code = reply?.code ?? "";
      if (context.status === 404 && !code) throw new ChordAssistUnavailable(UNAVAILABLE);
    } else {
      throw new Error("Couldn't reach the server. Check your internet connection and try again.");
    }
    if (code === "not_configured") throw new ChordAssistUnavailable(UNAVAILABLE);
    if (code === "not_found") throw new AiSongUnknown(friendlyServerMessage(message, fallback));
    throw new Error(friendlyServerMessage(message, fallback));
  }
  if (!data) throw new Error(fallback);
  return data;
}

export async function generateChordChart(input: {
  title: string;
  artist: string;
  key: string;
  lyrics: string;
}): Promise<ChordChart> {
  const data = await askAssist<ChordChart>({ mode: "chords", ...input }, "creating the chords");
  if (!data.sheet?.trim()) {
    throw new Error("Sorry, there was a problem creating the chords. Please try again in a moment.");
  }
  return { key: data.key ?? "", sheet: data.sheet };
}

export type AiSongMusic = { key: string; bpm: string; signature: string };

/** Ask the AI (with web search) for the original recording's key, BPM and time signature. */
export async function lookupMusicWithAi(input: { title: string; artist: string }) {
  const data = await askAssist<AiSongMusic>({ mode: "music", ...input }, "finding the key and tempo");
  return { key: data.key ?? "", bpm: data.bpm ?? "", signature: data.signature ?? "" };
}

/** Ask the AI for a song's lyrics when the public catalogs don't have them. */
export async function recallSongLyrics(input: {
  title: string;
  artist: string;
}): Promise<RecalledSong> {
  const data = await askAssist<RecalledSong>({ mode: "lyrics", ...input }, "creating the lyrics");
  if (!data.lyrics?.trim()) {
    throw new AiSongUnknown("We couldn't find the lyrics for this song. You can paste or type them instead.");
  }
  return {
    title: data.title?.trim() || input.title,
    artist: data.artist?.trim() || input.artist,
    lyrics: data.lyrics,
  };
}
