import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

/** True when the production build was shipped without Supabase env (causes a blank window if unhandled). */
export const missingSupabaseEnv = !url || !anonKey;

let client: SupabaseClient | null = null;

export function getSupabase() {
  if (missingSupabaseEnv) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Rebuild the desktop app with those GitHub Actions secrets set.",
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
