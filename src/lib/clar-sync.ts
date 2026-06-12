import { supabase } from "@/integrations/supabase/client";
import type { DayLog, Settings } from "./clar-storage";

const MIGRATION_FLAG = "clar.tracker.migrated.v1";

export type RemoteStore = {
  logs: Record<string, DayLog>;
  settings: Settings | null;
};

/** Lädt alle Logs + Settings des Users aus Supabase. */
export async function loadFromSupabase(userId: string): Promise<RemoteStore> {
  const [logsRes, settingsRes] = await Promise.all([
    supabase
      .from("tracker_logs")
      .select("date, data")
      .eq("user_id", userId),
    supabase
      .from("tracker_settings")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (logsRes.error) throw logsRes.error;
  if (settingsRes.error) throw settingsRes.error;

  const logs: Record<string, DayLog> = {};
  for (const row of logsRes.data ?? []) {
    const d = row.data as DayLog;
    logs[row.date] = { ...d, date: row.date };
  }

  return {
    logs,
    settings: (settingsRes.data?.data as Settings | undefined) ?? null,
  };
}

export async function upsertLogToSupabase(
  userId: string,
  log: DayLog,
): Promise<void> {
  const { error } = await supabase
    .from("tracker_logs")
    .upsert(
      {
        user_id: userId,
        date: log.date,
        data: log,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,date" },
    );
  if (error) console.warn("[clar-sync] upsert log failed:", error.message);
}

export async function upsertSettingsToSupabase(
  userId: string,
  settings: Settings,
): Promise<void> {
  const { error } = await supabase.from("tracker_settings").upsert(
    {
      user_id: userId,
      data: settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) console.warn("[clar-sync] upsert settings failed:", error.message);
}

/** Einmalige Migration localStorage → Supabase. Idempotent über Flag. */
export async function migrateLocalToSupabase(
  userId: string,
  local: { logs: Record<string, DayLog>; settings: Settings },
): Promise<void> {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(MIGRATION_FLAG) === "1") return;

  const logRows = Object.values(local.logs).map((l) => ({
    user_id: userId,
    date: l.date,
    data: l,
    updated_at: new Date(l.updatedAt ?? Date.now()).toISOString(),
  }));

  if (logRows.length > 0) {
    const { error } = await supabase
      .from("tracker_logs")
      .upsert(logRows, { onConflict: "user_id,date", ignoreDuplicates: true });
    if (error) {
      console.warn("[clar-sync] migration logs failed:", error.message);
      return; // Flag NICHT setzen, beim nächsten Login retry
    }
  }

  const { error: sErr } = await supabase.from("tracker_settings").upsert(
    {
      user_id: userId,
      data: local.settings,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id", ignoreDuplicates: true },
  );
  if (sErr) {
    console.warn("[clar-sync] migration settings failed:", sErr.message);
    return;
  }

  localStorage.setItem(MIGRATION_FLAG, "1");
}

/** DSGVO: Alle Daten des Users löschen (Supabase + lokal). */
export async function deleteAllUserData(userId: string): Promise<void> {
  await Promise.all([
    supabase.from("tracker_logs").delete().eq("user_id", userId),
    supabase.from("tracker_settings").delete().eq("user_id", userId),
  ]);
  if (typeof window !== "undefined") {
    localStorage.removeItem("clar.tracker.v1");
    localStorage.removeItem(MIGRATION_FLAG);
  }
}

export function clearMigrationFlag(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(MIGRATION_FLAG);
}