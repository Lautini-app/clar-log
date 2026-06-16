import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { accessToken, reportId, doctorEmail } = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
    const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;

    const userClient = createClient(SUPABASE_URL, Deno.env.get("ANON_KEY")!, { auth: { persistSession: false } });
    const { data: userData } = await userClient.auth.getUser(accessToken);
    if (!userData?.user) throw new Error("Unauthorized");

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: report } = await admin.schema("clar_log").from("word_reports")
      .select("*").eq("id", reportId).eq("user_id", userData.user.id).single();
    if (!report) throw new Error("Bericht nicht gefunden");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "clar.log <bericht@lautini.ch>",
        to: [doctorEmail],
        subject: "clar.log — Wortbericht",
        text: (report as any).content,
      }),
    });
    if (!res.ok) throw new Error(`Mail fehlgeschlagen: ${await res.text()}`);

    await admin.schema("clar_log").from("word_reports")
      .update({ sent_to_doctor_at: new Date().toISOString() }).eq("id", reportId);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
