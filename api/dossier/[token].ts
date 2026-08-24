// Dossier-Daten für den Arzt-Link.
// Der Arzt ist NICHT eingeloggt — direkte Tabellen-Selects liefern wegen RLS
// nichts zurück. Diese Function prüft den Token serverseitig und liest die
// Daten mit dem Service-Key.
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  const raw = String(req.query?.token ?? "");
  const token = raw.replace(/\.json$/i, "").trim();
  if (!token || token.length < 8) {
    res.status(400).json({ error: "Invalid token" });
    return;
  }

  const url = process.env.EXT_SUPABASE_URL;
  const serviceKey = process.env.EXT_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(500).json({ error: "Dossier not configured" });
    return;
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "clar_log" },
  });

  const { data: link, error: linkErr } = await db
    .from("doctor_links")
    .select("owner_id, period_id, active, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (linkErr) {
    res.status(500).json({ error: linkErr.message });
    return;
  }
  if (!link || link.active === false || (link.expires_at && new Date(link.expires_at) < new Date())) {
    res.status(404).json({ error: "Link ungültig oder abgelaufen" });
    return;
  }

  const ownerId = String(link.owner_id);

  // Tageseinträge: je nach Sync-Stand in tracker_logs oder daily_logs.
  const [trackerRes, dailyRes, settingsRes] = await Promise.all([
    db.from("tracker_logs").select("date, data").eq("user_id", ownerId).order("date", { ascending: false }).limit(120),
    db.from("daily_logs").select("date, data").eq("user_id", ownerId).order("date", { ascending: false }).limit(120),
    db.from("tracker_settings").select("data").eq("user_id", ownerId).maybeSingle(),
  ]);

  const byDate = new Map<string, any>();
  for (const row of (dailyRes.data ?? []) as any[]) {
    const d = String(row.date);
    byDate.set(d, { ...(row.data ?? {}), date: d });
  }
  // tracker_logs gewinnt: dort schreibt die App die laufenden Einträge.
  for (const row of (trackerRes.data ?? []) as any[]) {
    const d = String(row.date);
    byDate.set(d, { ...(row.data ?? {}), date: d });
  }

  const logs = [...byDate.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ownerId,
    periodId: link.period_id ?? null,
    settings: settingsRes.data?.data ?? null,
    logs,
  });
}
