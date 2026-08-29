import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, json, brandedEmail, sendResendEmail } from "../_shared/mail.ts";

function allowedRedirect(raw: string) {
  try {
    const url = new URL(raw);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return true;
    if (url.hostname === "ministrycast.com") return true;
    if (url.hostname.endsWith(".ministrycast.com")) return true;
    if (url.hostname.endsWith(".vercel.app")) return true;
    return false;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const body = (await req.json()) as { email?: string; redirectTo?: string };
    const address = body.email?.trim().toLowerCase() ?? "";
    const redirectTo = (body.redirectTo ?? "").trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      return json(400, { error: "Enter a valid email address." });
    }
    if (!redirectTo || !allowedRedirect(redirectTo)) {
      return json(400, { error: "Invalid redirect URL." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceKey) {
      return json(500, { error: "Auth service is not configured." });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: address,
      options: { redirectTo },
    });

    if (!error) {
      const link = data.properties?.action_link;
      if (link) {
        await sendResendEmail({
          to: address,
          subject: "Reset your MinistryCast password",
          html: brandedEmail(
            "Reset your password",
            "Use this link to choose a new password. If you did not ask for this, you can ignore the email.",
            { href: link, label: "Choose a new password" },
          ),
        });
      }
    }

    return json(200, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send the reset email.";
    return json(500, { error: message });
  }
});
