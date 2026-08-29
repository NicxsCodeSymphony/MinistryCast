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
    const { email } = (await req.json()) as { email?: string };
    const address = email?.trim().toLowerCase() ?? "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      return json(400, { error: "Enter a valid email address." });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const from =
      Deno.env.get("RESEND_FROM") ?? "MinistryCast <noreply@ministrycast.com>";

    if (!supabaseUrl || !serviceKey) {
      return json(500, { error: "Auth service is not configured." });
    }
    if (!resendKey) {
      return json(500, {
        error: "Email is not configured. Set RESEND_API_KEY on the project.",
      });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: address,
    });
    if (error) return json(400, { error: error.message });

    const otp = data.properties?.email_otp;
    if (!otp) return json(500, { error: "Could not create a login code." });

    const sent = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [address],
        subject: "Your MinistryCast code",
        html: `<html><body style="margin:0;padding:24px;background:#0B0B14;font-family:Inter,Arial,sans-serif;color:#E2E8F0;">
          <p style="letter-spacing:0.2em;font-size:11px;color:#4FACFE;font-weight:700;">MINISTRYCAST</p>
          <h1 style="font-size:22px;margin:16px 0 8px;">Your 6-digit code</h1>
          <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;">Enter this code in MinistryCast. You do not need to click any link.</p>
          <p style="font-size:36px;letter-spacing:12px;font-weight:700;margin:0;">${otp}</p>
        </body></html>`,
      }),
    });

    if (!sent.ok) {
      const payload = (await sent.json().catch(() => ({}))) as {
        message?: string;
      };
      return json(502, {
        error:
          payload.message ||
          "Resend could not deliver the email. Verify the sender domain or send only to your Resend account email while testing.",
      });
    }

    return json(200, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send the code.";
    return json(500, { error: message });
  }
});
