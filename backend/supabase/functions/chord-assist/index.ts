import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const MAX_LYRICS = 8000;

const CHORD_INSTRUCTIONS = `You are a music director writing a chord chart for a band.
Use the chords of the original recording by the given artist as closely as you know them.
You get the song's lyric lines, numbered and grouped by section. A line number that appears again is the same line sung again, with the same chords.
Every word is prefixed with its word number in parentheses, e.g. "4: (1)Walk (2)on (3)down, (4)walk (5)on (6)down".
Do not repeat the lyrics. Reply with JSON only:
{"key": "<key of the chart, e.g. Eb or Em>", "lines": {"<line number>": "<chords>"}}
Rules for each "<chords>" value:
- Chord symbols separated by spaces, each followed by @ and the word number shown in parentheses before the word where that chord is played, e.g. "G@1 C@4 D@6". Use the printed numbers; do not count words yourself.
- Put each chord on the exact word (syllable) where the chord change is sung on the recording.
- A chord held over from the previous line does not need repeating.
- Leave out lines where no chord starts.
- Chord symbols only (e.g. G, D/F#, Em7, Csus2). No notes, capo, or commentary.`;

const LYRICS_INSTRUCTIONS = `You help a church worship team prepare song slides.
Given a song title (and maybe the artist), write the song's lyrics as sung on the best-known recording.
Reply with JSON only: {"found": true|false, "title": "<song title>", "artist": "<main artist>", "lyrics": "<lyrics>"}.
Rules:
- If you can search the web, search for the song's lyrics first (the song may be English, Tagalog, Cebuano/Bisaya, Ilocano or another language). Keep the original language; do not translate.
- Only answer if you found or actually know this song's words. If you are not sure which song it is, reply {"found": false}.
- Never invent or guess lines. Do not write a new song.
- Label every part of the song with a heading on its own line, using the part's real role: [Intro], [Verse 1], [Verse 2], [Pre-Chorus], [Chorus], [Post-Chorus], [Bridge], [Interlude], [Tag], [Outro]. Do not call everything a verse; the repeated hook is the [Chorus], the build-up right before it is the [Pre-Chorus], and the contrasting section near the end is the [Bridge].
- Separate parts with a blank line. Write each part only once: when a chorus, pre-chorus, bridge or tag comes back with the same words, do not write it again. Only write a part again if its words change.
- One sung line per line. No chords, notes, or commentary.`;

const MUSIC_INSTRUCTIONS = `You help a church band set up a song.
Given a song title and artist, find the original recording's musical key, tempo, and time signature.
If you can search the web, check song databases (e.g. SongBPM, Tunebat, GetSongBPM, Musicnotes, Ultimate Guitar) before answering.
Reply with JSON only: {"found": true|false, "key": "<root with b or #, plus m if minor, e.g. Eb, F#m, C>", "bpm": <whole number>, "signature": "<4/4, 3/4, 6/8, 2/4 or 5/4>"}.
- Use the key the recording is actually played in (not a capo shape).
- Use the tempo a band would count in (e.g. 72, not 144, for a slow ballad felt in half time).
- If you aren't sure about one value, use null for it. If you don't know the song, reply {"found": false}.`;

type Provider = { kind: "gemini" | "groq" | "openai"; apiKey: string };
type AskOptions = { search?: boolean; fast?: boolean };

/** Every provider with a key, in the order to try them. */
function configuredProviders(): Provider[] {
  const keys: [Provider["kind"], string][] = [
    ["gemini", "GEMINI_API_KEY"],
    ["groq", "GROQ_API_KEY"],
    ["openai", "OPENAI_API_KEY"],
  ];
  return keys.flatMap(([kind, name]) => {
    const apiKey = (Deno.env.get(name) ?? "").trim();
    return apiKey ? [{ kind, apiKey }] : [];
  });
}

/** Set once the model rejects `thinkingConfig`, so later requests skip it. */
let thinkingUnsupported = false;
/** Set once Google refuses search grounding (it isn't included on the free tier for Gemini 3). */
let searchUnavailable = /^(off|false|0)$/i.test(Deno.env.get("GEMINI_SEARCH") ?? "");

async function askGemini(apiKey: string, instructions: string, prompt: string, options: AskOptions = {}) {
  const model = Deno.env.get("GEMINI_MODEL") || Deno.env.get("CHORD_AI_MODEL") || "gemini-3.8-flash";
  const send = async (withSearch: boolean, withThinking: boolean) => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instructions }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          ...(withSearch ? { tools: [{ google_search: {} }] } : {}),
          generationConfig: {
            temperature: 0.2,
            ...(withSearch ? {} : { responseMimeType: "application/json" }),
            ...(withThinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
          },
        }),
      },
    );
    const data = await response.json().catch(() => null);
    return { response, data, message: String(data?.error?.message ?? "") };
  };

  let withSearch = Boolean(options.search) && !searchUnavailable;
  let withThinking = Boolean(options.fast) && !thinkingUnsupported;
  let reply = await send(withSearch, withThinking);
  for (let retry = 0; retry < 2 && !reply.response.ok; retry += 1) {
    if (withThinking && /thinking/i.test(reply.message)) {
      thinkingUnsupported = true;
      withThinking = false;
    } else if (
      withSearch &&
      reply.response.status !== 429 &&
      reply.response.status < 500
    ) {
      console.warn("Search grounding refused, continuing without it:", reply.message);
      searchUnavailable = true;
      withSearch = false;
    } else {
      break;
    }
    reply = await send(withSearch, withThinking);
  }
  if (!reply.response.ok) {
    throw new Error(reply.message || `Gemini request failed (${reply.response.status}).`);
  }
  const candidate = reply.data?.candidates?.[0];
  if (candidate?.finishReason === "RECITATION") return "";
  return (candidate?.content?.parts ?? [])
    .map((part: { text?: string }) => part.text ?? "")
    .join("");
}

/** OpenAI-compatible chat API (OpenAI itself, or Groq). */
async function askChat(provider: Provider, instructions: string, prompt: string, options: AskOptions) {
  const groq = provider.kind === "groq";
  const url = groq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.openai.com/v1/chat/completions";
  const model = groq
    ? Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-120b"
    : Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      ...(groq && options.fast && model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: instructions },
        { role: "user", content: prompt },
      ],
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const name = groq ? "Groq" : "OpenAI";
    throw new Error(data?.error?.message || `${name} request failed (${response.status}).`);
  }
  return data?.choices?.[0]?.message?.content ?? "";
}

function askOne(provider: Provider, instructions: string, prompt: string, options: AskOptions) {
  return provider.kind === "gemini"
    ? askGemini(provider.apiKey, instructions, prompt, options)
    : askChat(provider, instructions, prompt, options);
}

/**
 * Try each provider in turn until one gives an answer `accept` likes. Rate limits, outages,
 * refusals and unreadable replies all move on to the next provider.
 */
async function askAny<T>(
  providers: Provider[],
  instructions: string,
  prompt: string,
  options: AskOptions,
  accept: (parsed: Record<string, unknown>) => T | null,
): Promise<{ answer: T | null; error: string; answered: boolean }> {
  let error = "";
  let answered = false;
  for (const provider of providers) {
    try {
      const parsed = parseJson(await askOne(provider, instructions, prompt, options));
      if (parsed) answered = true;
      const answer = parsed ? accept(parsed) : null;
      if (answer) return { answer, error: "", answered };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.warn(`${provider.kind} failed:`, error);
    }
  }
  return { answer: null, error, answered };
}

function parseJson(raw: string): Record<string, unknown> | null {
  const unfenced = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim();
  const first = unfenced.indexOf("{");
  const last = unfenced.lastIndexOf("}");
  if (first === -1 || last <= first) return null;
  try {
    const parsed = JSON.parse(unfenced.slice(first, last + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

async function chords(providers: Provider[], body: Record<string, unknown>) {
  const input = {
    title: text(body.title).slice(0, 200),
    artist: text(body.artist).slice(0, 200),
    key: text(body.key).slice(0, 8),
    lyrics: text(body.lyrics).slice(0, MAX_LYRICS),
  };
  if (!input.title || !input.lyrics) {
    return json(400, { error: "Add the song title and lyrics first." });
  }
  const song = numberLyricLines(input.lyrics);
  if (!song.unique.length) {
    return json(400, { error: "Add the song title and lyrics first." });
  }
  const prompt = [
    `Song: ${input.title}`,
    `Artist: ${input.artist || "unknown"}`,
    input.key
      ? `Write the chart in the key of ${input.key}.`
      : "Write the chart in the original key of the recording.",
    "",
    "Lyric lines:",
    song.outline,
  ].join("\n");

  const { answer, error } = await askAny(
    [...providers, providers[0]],
    CHORD_INSTRUCTIONS,
    prompt,
    { fast: true },
    (parsed) => {
      const sheet = buildSheet(song, parsed.lines);
      return sheet ? { key: text(parsed.key), sheet } : null;
    },
  );
  if (!answer) {
    if (error) console.error("chords failed on every provider:", error);
    return json(502, {
      error: "Sorry, there was a problem creating the chords. Please try again in a moment.",
    });
  }
  return json(200, answer);
}

const HEADING_LINE = /^\s*\[[^\]]+\]\s*$/;

function lineKey(line: string) {
  return line.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/** Number each distinct sung line once; repeats reuse the first number. */
function numberLyricLines(lyrics: string) {
  const lines = lyrics.replace(/\r\n?/g, "\n").split("\n");
  const numberOf = new Map<string, number>();
  const unique: string[] = [];
  const lineNumbers: (number | null)[] = [];
  const outline: string[] = [];
  for (const line of lines) {
    const key = lineKey(line);
    if (!key || HEADING_LINE.test(line)) {
      lineNumbers.push(null);
      if (HEADING_LINE.test(line)) outline.push(line.trim());
      else if (outline.length && outline[outline.length - 1] !== "") outline.push("");
      continue;
    }
    let number = numberOf.get(key);
    if (number === undefined) {
      unique.push(line.trim());
      number = unique.length;
      numberOf.set(key, number);
      const words = line.trim().split(/\s+/).map((word, i) => `(${i + 1})${word}`);
      outline.push(`${number}: ${words.join(" ")}`);
    } else {
      outline.push(`${number}: (same as line ${number})`);
    }
    lineNumbers.push(number);
  }
  return { lines, unique, lineNumbers, outline: outline.join("\n").trim() };
}

const CHORD_SYMBOL = /^[A-G](?:#|b)?[A-Za-z0-9#b+°ø()-]*(?:\/[A-G](?:#|b)?)?$/;

/** Turn {"3": "Eb@1 Fm7@3"} into chord lines sitting above the right words. */
function buildSheet(song: ReturnType<typeof numberLyricLines>, raw: unknown) {
  if (!raw || typeof raw !== "object") return "";
  const chordsFor = new Map<number, { chord: string; word: number }[]>();
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const number = Number.parseInt(key, 10);
    if (!Number.isFinite(number) || typeof value !== "string") continue;
    const marks = value
      .split(/\s+/)
      .map((token) => {
        const match = token.match(/^(.+?)@(\d+)$/);
        const chord = (match ? match[1] : token).replace(/♯/g, "#").replace(/♭/g, "b");
        return CHORD_SYMBOL.test(chord) ? { chord, word: match ? Number(match[2]) : 1 } : null;
      })
      .filter((mark): mark is { chord: string; word: number } => Boolean(mark));
    if (marks.length) chordsFor.set(number, marks);
  }
  if (!chordsFor.size) return "";

  const out: string[] = [];
  song.lines.forEach((line, index) => {
    const number = song.lineNumbers[index];
    const marks = number ? chordsFor.get(number) : undefined;
    if (marks) {
      const starts = [...line.matchAll(/\S+/g)].map((match) => match.index ?? 0);
      let chordLine = "";
      for (const { chord, word } of marks) {
        const wanted = starts[Math.min(Math.max(word, 1), starts.length) - 1] ?? line.length;
        const col = Math.max(wanted, chordLine.length ? chordLine.length + 1 : 0);
        chordLine = chordLine.padEnd(col, " ") + chord;
      }
      out.push(chordLine);
    }
    out.push(line);
  });
  return out.join("\n");
}

async function music(providers: Provider[], body: Record<string, unknown>) {
  const title = text(body.title).slice(0, 200);
  const artist = text(body.artist).slice(0, 200);
  if (!title) return json(400, { error: "Add the song title first." });
  const prompt = [`Song: ${title}`, `Artist: ${artist || "not given"}`].join("\n");
  const { answer, error, answered } = await askAny(
    providers,
    MUSIC_INSTRUCTIONS,
    prompt,
    { search: true, fast: true },
    (parsed) => {
      const key = text(parsed.key);
      const bpm =
        typeof parsed.bpm === "number" || typeof parsed.bpm === "string" ? String(parsed.bpm) : "";
      const signature = text(parsed.signature);
      if (parsed.found === false || (!key && !bpm && !signature)) return null;
      return { key, bpm, signature };
    },
  );
  if (answer) return json(200, answer);
  if (!answered && error) {
    console.error("music failed on every provider:", error);
    return json(502, {
      error: "Sorry, there was a problem finding the key and tempo. Please try again in a moment.",
    });
  }
  return json(404, { error: "We couldn't find the key or tempo for this song.", code: "not_found" });
}

async function lyrics(providers: Provider[], body: Record<string, unknown>) {
  const title = text(body.title).slice(0, 200);
  const artist = text(body.artist).slice(0, 200);
  if (!title) return json(400, { error: "Add the song title first." });
  const prompt = [`Song: ${title}`, artist ? `Artist: ${artist}` : "Artist: not given"].join("\n");
  const { answer, error, answered } = await askAny(
    providers,
    LYRICS_INSTRUCTIONS,
    prompt,
    { search: true },
    (parsed) => {
      const words = text(parsed.lyrics).slice(0, MAX_LYRICS);
      if (parsed.found === false || !words) return null;
      return {
        title: text(parsed.title) || title,
        artist: text(parsed.artist) || artist,
        lyrics: words,
      };
    },
  );
  if (answer) return json(200, answer);
  if (!answered && error) {
    console.error("lyrics failed on every provider:", error);
    return json(502, {
      error: "Sorry, there was a problem creating the lyrics. Please try again in a moment.",
    });
  }
  return json(404, {
    error: "We couldn't find the lyrics for this song. You can paste or type them instead.",
    code: "not_found",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return json(401, { error: "Please sign in again to use this feature." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !anonKey) {
      console.error("SUPABASE_URL or SUPABASE_ANON_KEY is missing");
      return json(500, { error: "Sorry, something went wrong. Please try again in a moment." });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json(401, { error: "Please sign in again to use this feature." });
    }

    const providers = configuredProviders();
    if (!providers.length) {
      console.error("No AI key set: add GEMINI_API_KEY, GROQ_API_KEY or OPENAI_API_KEY");
      return json(503, {
        error: "This feature isn't available yet.",
        code: "not_configured",
      });
    }

    const body = ((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    if (body.mode === "lyrics") return await lyrics(providers, body);
    if (body.mode === "music") return await music(providers, body);
    return await chords(providers, body);
  } catch (err) {
    console.error("chord-assist crashed:", err);
    return json(500, { error: "Sorry, something went wrong. Please try again in a moment." });
  }
});
