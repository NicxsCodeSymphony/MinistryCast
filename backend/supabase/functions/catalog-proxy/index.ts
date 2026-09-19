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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return json(401, { error: "Sign in required." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !anonKey) {
      return json(500, { error: "Catalog proxy is not configured." });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return json(401, { error: "Sign in required." });
    }

    const body = (await req.json()) as {
      url?: string;
      headers?: Record<string, string>;
    };
    const target = (body.url ?? "").trim();
    if (!/^https:\/\//i.test(target)) {
      return json(400, { error: "Invalid catalog URL." });
    }

    const allowed = [
      "https://lrclib.net/",
      "https://api.lyrics.ovh/",
      "https://www.theaudiodb.com/",
      "https://musicbrainz.org/",
      "https://acousticbrainz.org/",
      "https://noembed.com/",
      "https://www.youtube.com/oembed",
    ];
    if (!allowed.some((prefix) => target.startsWith(prefix))) {
      return json(400, { error: "URL is not allowed." });
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "MinistryCast/1.0 (catalog-proxy)",
      ...(body.headers ?? {}),
    };

    const upstream = await fetch(target, { headers });
    const text = await upstream.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      /* keep text */
    }
    return json(upstream.status, {
      ok: upstream.ok,
      status: upstream.status,
      data: payload,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Catalog lookup failed.";
    return json(500, { error: message });
  }
});
