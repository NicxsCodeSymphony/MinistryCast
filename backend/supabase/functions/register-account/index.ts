import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Prefer a concrete allowlisted URL — never a wildcard. */
function safeRedirect(raw: string | undefined) {
  const fallback = "http://localhost:1420";
  const value = (raw ?? "").trim() || fallback;
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "tauri.localhost" ||
      host === "ministrycast.com" ||
      host.endsWith(".ministrycast.com") ||
      host.endsWith(".vercel.app")
    ) {
      // Strip path/query — Site/redirect base only.
      return `${url.protocol}//${url.host}`;
    }
  } catch {
    // fall through
  }
  return fallback;
}

function redirectConfigHint() {
  return (
    "Auth Site URL is invalid. In Supabase Dashboard → Authentication → URL Configuration: " +
    "set Site URL to exactly http://localhost:1420 (no /**). " +
    "Put wildcards only under Redirect URLs, e.g. http://localhost:1420/** and https://tauri.localhost/**."
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      redirectTo?: string;
    };
    const address = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const redirectTo = safeRedirect(body.redirectTo);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      return json(400, { error: "Enter a valid email address." });
    }
    if (password.length < 6) {
      return json(400, { error: "Password must be at least 6 characters." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    if (!supabaseUrl || !serviceKey) {
      return json(500, { error: "Auth service is not configured." });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Primary path: confirmed user, no confirmation email / redirect needed.
    const created = await admin.auth.admin.createUser({
      email: address,
      password,
      email_confirm: true,
    });

    if (!created.error) {
      return json(200, { ok: true });
    }

    const message = created.error.message || "Could not create the account.";
    if (/already|registered|exists/i.test(message)) {
      return json(400, { error: "An account with that email already exists." });
    }

    // Fallback when hosted Site URL / redirect allowlist rejects createUser.
    if (/invalid redirect url/i.test(message) && anonKey) {
      const anon = createClient(supabaseUrl, anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const signedUp = await anon.auth.signUp({
        email: address,
        password,
        options: { emailRedirectTo: redirectTo },
      });

      if (!signedUp.error && signedUp.data.user?.id) {
        // Force-confirm so the user can sign in immediately (no email click).
        await admin.auth.admin.updateUserById(signedUp.data.user.id, {
          email_confirm: true,
        });
        return json(200, { ok: true });
      }

      const fallbackMsg = signedUp.error?.message || message;
      if (/invalid redirect url/i.test(fallbackMsg)) {
        return json(400, { error: redirectConfigHint() });
      }
      if (/already|registered|exists/i.test(fallbackMsg)) {
        return json(400, { error: "An account with that email already exists." });
      }
      return json(400, { error: fallbackMsg });
    }

    if (/invalid redirect url/i.test(message)) {
      return json(400, { error: redirectConfigHint() });
    }

    return json(400, { error: message });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not create the account.";
    return json(500, { error: message });
  }
});
