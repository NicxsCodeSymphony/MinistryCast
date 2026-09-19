import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function cleanEnv(value: unknown) {
  let next = String(value ?? "").trim();
  // Secrets/UI often paste with wrapping quotes — those break supabase-js URL checks.
  if (
    (next.startsWith('"') && next.endsWith('"')) ||
    (next.startsWith("'") && next.endsWith("'"))
  ) {
    next = next.slice(1, -1).trim();
  }
  return next;
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const url = cleanEnv(import.meta.env.VITE_SUPABASE_URL);
const anonKey = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

/** True when production build is missing usable Supabase config. */
export const missingSupabaseEnv = !url || !anonKey || !isHttpUrl(url);

let client: SupabaseClient | null = null;

export function getSupabase() {
  if (missingSupabaseEnv) {
    throw new Error(
      "Invalid or missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Use a full https://….supabase.co URL (no quotes) in GitHub Actions secrets, then rebuild.",
    );
  }
  if (!client) {
    client = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

/** Back-compat: most call sites import `supabase` directly. */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getSupabase() as object, prop, receiver);
    return typeof value === "function" ? value.bind(getSupabase()) : value;
  },
});
