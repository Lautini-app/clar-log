// TEMPORÄR: reine Zeilenzählung zur Fehlersuche (keine Daten, keine IDs).
// Nach der Diagnose wieder entfernen.
import { createClient } from "@supabase/supabase-js";

export default async function handler(_req: any, res: any) {
  const url = process.env.EXT_SUPABASE_URL;
  const serviceKey = process.env.EXT_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(500).json({ error: "not configured" });
    return;
  }
  const out: Record<string, string> = {};
  for (const schema of ["clar_log", "public"]) {
    const db = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema },
    });
    for (const t of ["tracker_logs", "daily_logs", "tracker_settings", "observation_periods", "observer_links", "teen_tokens", "doctor_links"]) {
      const r = await db.from(t).select("*", { count: "exact", head: true });
      out[`${schema}.${t}`] = r.error ? "err:" + (r.error.code || r.error.message) : String(r.count ?? 0);
    }
  }
  // Spaltennamen von tracker_logs (nur Feldnamen, keine Werte)
  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "clar_log" },
  });
  const probe = await db.from("tracker_logs").select("*").limit(1);
  const row: any = (probe.data ?? [])[0] ?? null;
  out["tracker_logs.spalten"] = row ? Object.keys(row).join(",") : "keine Zeile";
  out["tracker_logs.data_keys"] = row && row.data && typeof row.data === "object"
    ? Object.keys(row.data).join(",")
    : "kein data-Objekt";

  const withDate = await db.from("tracker_logs").select("date").limit(1);
  out["tracker_logs.select_date"] = withDate.error ? "err:" + withDate.error.message : "ok";

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json(out);
}
