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

  // Tageseinträge: je nach Sync-Stand in tracker_logs oder daily_logs,
  // Spaltennamen unterscheiden sich historisch — deshalb select("*") und
  // das Datum flexibel bestimmen.
  const diag: Record<string, string> = {};

  async function readLogs(table: string) {
    const r = await db.from(table).select("*").eq("user_id", ownerId).limit(400);
    if (r.error) {
      diag[table] = "err: " + r.error.message;
      return [] as any[];
    }
    const rows = (r.data ?? []) as any[];
    diag[table] = String(rows.length);
    return rows;
  }

  const [trackerRows, dailyRows, settingsRes] = await Promise.all([
    readLogs("tracker_logs"),
    readLogs("daily_logs"),
    db.from("tracker_settings").select("data").eq("user_id", ownerId).maybeSingle(),
  ]);
  diag["tracker_settings"] = settingsRes.error ? "err: " + settingsRes.error.message : (settingsRes.data ? "hit" : "miss");

  function normalize(rows: any[]) {
    const out: any[] = [];
    for (const row of rows) {
      const payload = row?.data && typeof row.data === "object" ? row.data : row;
      const date =
        row?.date ?? payload?.date ?? row?.day ?? row?.log_date ?? row?.entry_date ?? null;
      if (!date) continue;
      out.push({ ...payload, date: String(date).slice(0, 10) });
    }
    return out;
  }

  const byDate = new Map<string, any>();
  for (const l of normalize(dailyRows)) byDate.set(l.date, l);
  // tracker_logs gewinnt: dort schreibt die App die laufenden Einträge.
  for (const l of normalize(trackerRows)) byDate.set(l.date, l);

  const logs = [...byDate.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  diag["logs_normalisiert"] = String(logs.length);

  // Eintraege der Jugendlichen (Tagebuch-Link) liegen in teen_logs und sind
  // fuer den nicht eingeloggten Arzt sonst nicht lesbar.
  const teenRes = await db
    .from("teen_logs")
    .select("teen_name, date, data")
    .eq("owner_id", ownerId)
    .order("date", { ascending: false })
    .limit(400);
  diag["teen_logs"] = teenRes.error ? "err: " + teenRes.error.message : String((teenRes.data ?? []).length);
  const teenLogs = ((teenRes.data ?? []) as any[]).map((row) => ({
    teenName: String(row.teen_name ?? "Tagebuch"),
    date: String(row.date).slice(0, 10),
    log: { ...(row.data ?? {}), date: String(row.date).slice(0, 10) },
  }));

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    ownerId,
    periodId: link.period_id ?? null,
    settings: settingsRes.data?.data ?? null,
    logs,
    teenLogs,
    diag,
  });
}
