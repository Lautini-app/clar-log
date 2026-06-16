import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, name, role, token } = await req.json();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const APP_URL = Deno.env.get("APP_URL") ?? "https://clar.log.lautini.ch";
    const inviteUrl = `${APP_URL}/einladung/${token}`;

    const roleLabels: Record<string, string> = {
      member: "Familienmitglied / Partner",
      teen: "Jugendliche/r (12–17)",
      child: "Kind",
    };
    const roleText = roleLabels[role] ?? role;
    const displayName = name ? ` (${name})` : "";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "clar.log <einladung@lautini.ch>",
        to: [email],
        subject: "Einladung zu clar.log",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
            <div style="margin-bottom: 24px;">
              <span style="font-size: 20px; font-weight: 600; color: #085041;">clar.log</span>
            </div>
            <p style="font-size: 16px; margin-bottom: 16px;">
              Du wurdest als <strong>${roleText}${displayName}</strong> eingeladen, clar.log zu nutzen.
            </p>
            <p style="font-size: 14px; color: #666; margin-bottom: 24px;">
              clar.log ist ein Stimulanzien-Tagebuch für Menschen mit ADHS. Du kannst tägliche Beobachtungen erfassen, die der Familie helfen, die Wirkung der Medikation besser zu verstehen.
            </p>
            <a href="${inviteUrl}" style="display: inline-block; background: #085041; color: #fff; font-size: 15px; font-weight: 600; padding: 14px 28px; border-radius: 12px; text-decoration: none; margin-bottom: 24px;">
              Einladung annehmen →
            </a>
            <p style="font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 16px;">
              Dieser Link ist 7 Tage gültig und enthält keine personenbezogenen Daten.<br>
              Falls du diese Einladung nicht erwartet hast, kannst du sie ignorieren.
            </p>
          </div>
        `,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend error: ${body}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
