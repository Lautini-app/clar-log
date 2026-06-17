import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_REPORTS_PER_MONTH = 2;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { accessToken, periodId, rangeDays = 30 } = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
    const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

    const userClient = createClient(SUPABASE_URL, Deno.env.get("ANON_KEY")!, {
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser(accessToken);
    if (!userData?.user) throw new Error("Unauthorized");
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Monatslimit prÃ¼fen
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const { count } = await admin.schema("clar_log").from("word_reports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart.toISOString());
    if ((count ?? 0) >= MAX_REPORTS_PER_MONTH) throw new Error(`Limit erreicht: maximal ${MAX_REPORTS_PER_MONTH} Berichte pro Monat`);

    // Logs holen
    const { data: logRows } = await admin.schema("clar_log").from("tracker_logs")
      .select("date, data").eq("user_id", userId).eq("period_id", periodId);

    // Aggregieren
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - rangeDays);
    const recent = (logRows ?? []).filter((r: any) => new Date(r.date) >= cutoff);
    const byCategory: Record<string, number[]> = {};
    for (const row of recent) {
      const slots = (row.data as any)?.slots ?? {};
      for (const slot of Object.values(slots) as any[]) {
        for (const [itemId, answer] of Object.entries(slot.answers ?? {})) {
          if (typeof (answer as any).value === "number") {
            byCategory[itemId] = byCategory[itemId] ?? [];
            byCategory[itemId].push((answer as any).value);
          }
        }
      }
    }
    const averages: Record<string, number> = {};
    for (const [id, vals] of Object.entries(byCategory)) {
      averages[id] = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    }

    // Claude API
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 1024,
        system: "Du fasst anonymisierte ADHS-Symptom-Tracking-Daten in einem kurzen, sachlichen deutschen Wortbericht zusammen (max. 200 WÃ¶rter), der einem Arzt vorgelegt werden kann. Keine Namen, kein Geburtsdatum. Beschreibe Tendenzen neutral, ohne Diagnose zu stellen.",
        messages: [{
          role: "user",
          content: `Anonymisierte Zusammenfassung (${recent.length} erfasste Tage, letzte ${rangeDays} Tage):\n${JSON.stringify(averages, null, 2)}`,
        }],
      }),
    });
    const anthropicData = await anthropicRes.json();
    const content = anthropicData.content?.[0]?.text ?? "";

    // Speichern
    const { data: inserted } = await admin.schema("clar_log").from("word_reports")
      .insert({ user_id: userId, period_id: /^[0-9a-f-]{36}$/.test(periodId) ? periodId : null, content, range_days: rangeDays })
      .select("*").single();

    return new Response(JSON.stringify(inserted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
