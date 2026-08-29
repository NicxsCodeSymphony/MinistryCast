import { createClient } from "npm:@supabase/supabase-js@2";
import { cors, json, brandedEmail, sendResendEmail } from "../_shared/mail.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return json(500, { error: "Auth service is not configured." });
    }

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: profile, error: profileError } = await caller.rpc(
      "get_session_profile",
    );
    if (profileError) return json(401, { error: "Not signed in." });
    const role = (profile as { user?: { role?: string; status?: string } })?.user;
    if (role?.role !== "superadmin" || role.status !== "active") {
      return json(403, { error: "Only a superadmin can send review emails." });
    }

    const body = (await req.json()) as {
      churchId?: string;
      action?: string;
    };
    const churchId = body.churchId ?? "";
    const action = (body.action ?? "").toLowerCase();
    if (!churchId || (action !== "approve" && action !== "reject")) {
      return json(400, { error: "Invalid review payload." });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: church } = await admin
      .from("churches")
      .select("id, name, status")
      .eq("id", churchId)
      .maybeSingle();
    const { data: applicant } = await admin
      .from("users")
      .select("name, email")
      .eq("church_id", churchId)
      .eq("role", "admin")
      .maybeSingle();

    if (!church || !applicant?.email) {
      return json(400, { error: "Could not find that ministry." });
    }

    const approved = action === "approve";
    await sendResendEmail({
      to: applicant.email,
      subject: approved
        ? `${church.name} is approved on MinistryCast`
        : `${church.name} was not approved`,
      html: brandedEmail(
        approved ? "Your ministry is approved" : "Your ministry request was declined",
        approved
          ? `Hi ${applicant.name}, ${church.name} is active. Sign in and finish setup to start producing.`
          : `Hi ${applicant.name}, we could not approve ${church.name} at this time. Reply if you think this was a mistake.`,
        approved
          ? { href: "https://ministrycast.com/", label: "Open MinistryCast" }
          : undefined,
      ),
    });

    return json(200, { ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not send the email.";
    return json(500, { error: message });
  }
});
