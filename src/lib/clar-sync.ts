import { supabase } from "@/integrations/supabase/client";
import { defaultSettings, getActivePeriod } from "./clar-storage";
import type { DayLog, ObservationPeriod, Settings } from "./clar-storage";

const MIGRATION_FLAG = "clar.tracker.migrated.v1";

export type RemoteStore = {
  logs: Record<string, DayLog>;
  settings: Settings | null;
};

/** Lädt alle Logs + Settings des Users aus Supabase. */
export async function loadFromSupabase(userId: string): Promise<RemoteStore> {
  const [periodsRes, dailyLogsRes] = await Promise.all([
    supabase.from("observation_periods").select("*").eq("user_id", userId),
    supabase.from("daily_logs").select("*").eq("user_id", userId),
  ]);

  if (!periodsRes.error && !dailyLogsRes.error) {
    const periods = ((periodsRes.data ?? []) as Array<Record<string, unknown>>)
      .map((row) => ((row.data as ObservationPeriod | undefined) ?? row) as ObservationPeriod)
      .filter((period) => typeof period?.id === "string");
    const logs: Record<string, DayLog> = {};
    for (const row of (dailyLogsRes.data ?? []) as Array<Record<string, unknown>>) {
      const date = String(row.date ?? "");
      if (!date) continue;
      const data = ((row.data as DayLog | undefined) ?? row) as DayLog;
      logs[date] = { ...data, date };
    }
    return {
      logs,
      settings:
        periods.length > 0
          ? {
              ...defaultSettings,
              periods,
              activePeriodId: periods.find((p: Record<string,unknown>) => p.active !== false)?.id,
            }
          : null,
    };
  }

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
  const activePeriod = getActivePeriod(settings);
  if (activePeriod) {
    const { error: periodError } = await supabase.from("observation_periods").upsert(
      {
        id: activePeriod.id,
        user_id: userId,
        data: activePeriod,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (!periodError) return;
  }

  const settingsData = settings.activePeriodId
    ? settings
    : { ...settings, activePeriodId: null };
  const { error } = await supabase.from("tracker_settings").upsert(
    {
      user_id: userId,
      data: settingsData,
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
    const dailyRows = Object.values(local.logs).map((l) => ({
      user_id: userId,
      date: l.date,
      period_id: l.periodId,
      data: l,
      updated_at: new Date(l.updatedAt ?? Date.now()).toISOString(),
    }));
    const { error: dailyError } = await supabase
      .from("daily_logs")
      .upsert(dailyRows, { onConflict: "user_id,date", ignoreDuplicates: true });
    const { error } = dailyError
      ? await supabase
          .from("tracker_logs")
          .upsert(logRows, { onConflict: "user_id,date", ignoreDuplicates: true })
      : { error: null };
    if (error) {
      console.warn("[clar-sync] migration logs failed:", error.message);
      return; // Flag NICHT setzen, beim nächsten Login retry
    }
  }

  const activePeriod = getActivePeriod(local.settings);
  const { error: periodError } = activePeriod
    ? await supabase.from("observation_periods").upsert(
        {
          id: activePeriod.id,
          user_id: userId,
          data: activePeriod,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id", ignoreDuplicates: true },
      )
    : { error: new Error("no active period") };
  const { error: sErr } = periodError
    ? await supabase.from("tracker_settings").upsert(
        {
          user_id: userId,
          data: local.settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id", ignoreDuplicates: true },
      )
    : { error: null };
  if (sErr) {
    console.warn("[clar-sync] migration settings failed:", sErr.message);
    return;
  }

  localStorage.setItem(MIGRATION_FLAG, "1");
}

/** Löscht alle Daten einer einzelnen Periode (Logs, Beobachtungen, Links). */
export async function deletePeriodData(userId: string, periodId: string): Promise<void> {
  await Promise.all([
    supabase.from("daily_logs").delete().eq("user_id", userId).eq("period_id", periodId),
    supabase.from("observation_periods").delete().eq("id", periodId).eq("user_id", userId),
    supabase.from("observer_observations").delete().eq("owner_id", userId).eq("period_id", periodId),
    supabase.schema("clar_log").from("observer_links").update({ active: false }).eq("owner_id", userId).eq("period_id", periodId),
    supabase.schema("clar_log").from("teacher_links").update({ active: false }).eq("owner_id", userId).eq("period_id", periodId),
  ]);
}

/** DSGVO: Alle Daten des Users löschen (Supabase + lokal). */
export async function deleteAllUserData(userId: string): Promise<void> {
  await Promise.all([
    supabase.from("daily_logs").delete().eq("user_id", userId),
    supabase.from("observation_periods").delete().eq("user_id", userId),
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
