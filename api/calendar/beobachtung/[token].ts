// Kalenderfeed für Beobachter:innen: /api/calendar/beobachtung/{token}.ics
// Der Token ist derselbe wie im Erfassungslink /beobachtung/{token}.
import { createClient } from "@supabase/supabase-js";
import { buildPeriodICal, icsResponseHeaders, type PeriodData } from "../../_lib/ics";

export default async function handler(req: any, res: any) {
  const raw = String(req.query?.token ?? "");
  const token = raw.replace(/\.ics$/i, "").trim();
  if (!token || token.length < 8) {
    res.status(400).send("Invalid token");
    return;
  }

  const url = process.env.EXT_SUPABASE_URL;
  const serviceKey = process.env.EXT_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(500).send("Calendar not configured");
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "clar_log" },
  });

  const { data: link, error } = await supabase
    .from("observer_links")
    .select("id, period_id, name, active, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    res.status(500).send(`Error: ${error.message}`);
    return;
  }
  if (!link || !link.active || (link.expires_at && new Date(link.expires_at) < new Date())) {
    res.status(404).send("Link nicht gefunden oder abgelaufen");
    return;
  }

  const { data: periodRow, error: pErr } = await supabase
    .from("observation_periods")
    .select("id, data")
    .eq("id", link.period_id)
    .maybeSingle();

  if (pErr || !periodRow?.data) {
    res.status(404).send("Beobachtungsperiode nicht gefunden");
    return;
  }

  const period = periodRow.data as PeriodData;
  const entryUrl = `https://clar.log.lautini.ch/beobachtung/${token}`;
  const ics = buildPeriodICal({
    period,
    entryUrl,
    calName: "clar · log Beobachtung",
    who: link.name,
  });

  const headers = icsResponseHeaders(`clar-log-beobachtung.ics`);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.status(200).send(ics);
}
