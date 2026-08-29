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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
    };
    const address = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      return json(400, { error: "Enter a valid email address." });
    }
    if (password.length < 6) {
      return json(400, { error: "Password must be at least 6 characters." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceKey) {
      return json(500, { error: "Auth service is not configured." });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const created = await admin.auth.admin.createUser({
      email: address,
      password,
      email_confirm: true,
    });

    if (created.error) {
      if (/already|registered|exists/i.test(created.error.message)) {
        return json(400, { error: "An account with that email already exists." });
      }
      return json(400, { error: created.error.message });
    }

    return json(200, { ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not create the account.";
    return json(500, { error: message });
  }
});
