import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, json, brandedEmail, sendResendEmail } from "../_shared/mail.ts";

function allowedRedirect(raw: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname;
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host === "tauri.localhost") return true;
    if (host === "ministrycast.com") return true;
    if (host.endsWith(".ministrycast.com")) return true;
    if (host.endsWith(".vercel.app")) return true;
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

    const preferredRedirect = redirectTo;
    const fallbackRedirect = "http://localhost:1420/reset-password";

    let linkError = null as { message: string } | null;
    let data: {
      properties?: { action_link?: string };
    } | null = null;

    {
      const first = await admin.auth.admin.generateLink({
        type: "recovery",
        email: address,
        options: { redirectTo: preferredRedirect },
      });
      data = first.data;
      linkError = first.error;
      if (linkError && /invalid redirect url/i.test(linkError.message)) {
        const second = await admin.auth.admin.generateLink({
          type: "recovery",
          email: address,
          options: { redirectTo: fallbackRedirect },
        });
        data = second.data;
        linkError = second.error;
      }
    }

    if (!linkError) {
      const link = data?.properties?.action_link;
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
    } else if (/invalid redirect url/i.test(linkError.message)) {
      return json(400, {
        error:
          "Auth Site URL is invalid. Set Site URL to exactly http://localhost:1420 (no /**). Wildcards belong under Redirect URLs only.",
      });
    }

    return json(200, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send the reset email.";
    return json(500, { error: message });
  }
});
