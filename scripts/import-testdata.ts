/**
 * Importiert clar-log-testdata.json → Supabase tracker_logs (Schema clar_log).
 *
 * Benötigt: SUPABASE_SERVICE_ROLE_KEY als Umgebungsvariable.
 * Den Key findest du unter: Supabase Dashboard → Project Settings → API → service_role
 *
 * Ausführen:
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... npx tsx scripts/import-testdata.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = "https://cgwpzpnklxphqxlixtva.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("❌  SUPABASE_SERVICE_ROLE_KEY fehlt.");
  console.error("    Setze ihn als Env-Variable:");
  console.error("    SUPABASE_SERVICE_ROLE_KEY=eyJ... npx tsx scripts/import-testdata.ts");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  db: { schema: "clar_log" },
  auth: { persistSession: false },
});

const testdata = JSON.parse(
  readFileSync(join(__dirname, "../clar-log-testdata.json"), "utf-8"),
);

async function getUserId(): Promise<string> {
  // Ersten User aus tracker_settings nehmen (service role bypassed RLS)
  const { data, error } = await supabase
    .from("tracker_settings")
    .select("user_id")
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`tracker_settings Abfrage fehlgeschlagen: ${error.message}`);
  if (!data?.user_id) throw new Error("Kein User in tracker_settings gefunden. Zuerst einloggen.");
  return data.user_id as string;
}

async function main() {
  console.log("🔍  Suche User-ID in tracker_settings …");
  const userId = await getUserId();
  console.log(`✓   User-ID: ${userId}`);

  const logs: any[] = testdata.logs;
  console.log(`📦  ${logs.length} Tage werden importiert …`);

  const rows = logs.map((log: any) => ({
    user_id: userId,
    date: log.date,
    data: log,
    updated_at: new Date(log.updatedAt ?? Date.now()).toISOString(),
  }));

  const { error } = await supabase
    .from("tracker_logs")
    .upsert(rows, { onConflict: "user_id,date" });

  if (error) {
    console.error("❌  Import fehlgeschlagen:", error.message);
    process.exit(1);
  }

  console.log(`✅  ${rows.length} Logs erfolgreich importiert.`);
  console.log("    Daten:");
  rows.forEach((r) =>
    console.log(`    ${r.date}  (${(r.data as any).dayOfWeek})`),
  );
}

main().catch((err) => {
  console.error("❌ ", err.message);
  process.exit(1);
});
