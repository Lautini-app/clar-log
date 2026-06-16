const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLE_LABELS: Record<string, string> = {
  member: "Familienmitglied / Partner",
  teen: "Jugendliche/r (12–17)",
  child: "Kind",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not configured" }, 500);

    const { toEmail, toName, role, token } = await req.json();
    if (!toEmail || !token) return json({ error: "Missing toEmail or token" }, 400);

    const APP_URL = Deno.env.get("APP_URL") ?? "https://clar.log.lautini.ch";
    const inviteUrl = `${APP_URL}/einladung/${token}`;
    const roleText = ROLE_LABELS[role] ?? role;
    const safeName = String(toName ?? "").trim();

    const html = `<!DOCTYPE html>
<html><body style="margin:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1a1a;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <h1 style="font-size:22px;font-weight:600;margin:0 0 16px;">
      ${safeName ? `Hallo ${escapeHtml(safeName)},` : "Hallo,"}
    </h1>
    <p style="font-size:15px;line-height:1.55;margin:0 0 16px;color:#333;">
      Du wurdest als <strong>${escapeHtml(roleText)}</strong> zu <strong>clar.log</strong> eingeladen —
      einem Stimulanzien-Tagebuch für Menschen mit ADHS.
    </p>
    <p style="font-size:15px;line-height:1.55;margin:0 0 24px;color:#333;">
      Du kannst tägliche Beobachtungen erfassen, die der Familie helfen, die Wirkung der Medikation besser zu verstehen.
    </p>
    <p style="margin:0 0 24px;">
      <a href="${inviteUrl}" style="display:inline-block;background:#085041;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:500;font-size:15px;">
        Einladung annehmen →
      </a>
    </p>
    <p style="font-size:13px;color:#888;line-height:1.5;margin:24px 0 0;">
      Oder öffne diesen Link:<br>
      <a href="${inviteUrl}" style="color:#555;word-break:break-all;">${inviteUrl}</a>
    </p>
    <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px;">
    <p style="font-size:12px;color:#aaa;margin:0;">
      Dieser Link ist 7 Tage gültig und enthält keine personenbezogenen Daten.
    </p>
  </div>
</body></html>`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "clar.log <einladung@lautini.ch>",
        to: [toEmail],
        subject: `Einladung zu clar.log`,
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) return json({ error: data }, 502);
    return json({ ok: true, id: data.id });
  } catch (err) {
    return json({ error: String((err as Error).message ?? err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
