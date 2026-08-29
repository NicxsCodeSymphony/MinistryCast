export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export async function sendResendEmail(args: {
  to: string;
  subject: string;
  html: string;
}) {
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from =
    Deno.env.get("RESEND_FROM") ?? "MinistryCast <noreply@ministrycast.com>";
  if (!resendKey) {
    throw new Error("Email is not configured. Set RESEND_API_KEY on the project.");
  }

  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
    }),
  });

  if (!sent.ok) {
    const payload = (await sent.json().catch(() => ({}))) as { message?: string };
    throw new Error(payload.message || "Could not send email.");
  }
}

export function brandedEmail(title: string, body: string, cta?: { href: string; label: string }) {
  const button = cta
    ? `<p><a href="${cta.href}" style="display:inline-block;background:#4F46E5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">${cta.label}</a></p>`
    : "";
  return `<html><body style="margin:0;padding:24px;background:#0B0B14;font-family:Inter,Arial,sans-serif;color:#E2E8F0;">
    <p style="letter-spacing:0.2em;font-size:11px;color:#4FACFE;font-weight:700;">MINISTRYCAST</p>
    <h1 style="font-size:22px;margin:16px 0 8px;">${title}</h1>
    <p style="color:#94a3b8;font-size:14px;margin:0 0 24px;line-height:1.6;">${body}</p>
    ${button}
  </body></html>`;
}
