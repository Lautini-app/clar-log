import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { DossierView } from "@/components/clar/DossierView";
import { listFamilyMembers } from "@/lib/family.functions";
import { supabase } from "@/integrations/supabase/client";
import { getActivePeriod, useStore } from "@/lib/clar-storage";
import type { DayLog } from "@/lib/clar-storage";

export const Route = createFileRoute("/_authenticated/bericht")({
  head: () => ({ meta: [{ title: "Verlauf — clar.log" }] }),
  component: BerichtRoute,
});

async function loadTeenLogs(teenId: string): Promise<Record<string, DayLog>> {
  // Query tracker_logs directly — RLS policy "family admin read logs" lives here.
  // loadFromSupabase tries daily_logs first and returns early with 0 rows if the
  // teen's data is only in tracker_logs, never reaching the RLS-protected table.
  const { data, error } = await supabase
    .from("tracker_logs")
    .select("date, data")
    .eq("user_id", teenId)
    .order("date", { ascending: false });

  if (error) {
    console.warn("[bericht] tracker_logs load failed:", error.message, error.code);
    return {};
  }

  const logs: Record<string, DayLog> = {};
  for (const row of data ?? []) {
    const d = row.data as DayLog;
    if (d && row.date) logs[row.date] = { ...d, date: row.date };
  }
  return logs;
}

function BerichtRoute() {
  const { store, userId } = useStore();
  // useRef so teen logs survive React re-renders triggered by store updates
  const teenLogsRef = useRef<Record<string, DayLog> | null>(null);
  const [teenLogsLoaded, setTeenLogsLoaded] = useState(false);

  const activePeriod = getActivePeriod(store.settings);
  const isTeenSelf = activePeriod?.profile === "teen_self";

  useEffect(() => {
    if (!isTeenSelf || !userId) return;
    listFamilyMembers()
      .then(async ({ members }) => {
        const teen = members.find(m => m.role === "teen") ?? members[0];
        if (!teen) return;
        const logs = await loadTeenLogs(teen.member_user_id);
        teenLogsRef.current = logs;
        setTeenLogsLoaded(true);
      })
      .catch(() => {});
  }, [isTeenSelf, userId]);

  if (!userId) return null;

  // Ref survives store re-renders that may temporarily flip isTeenSelf via settings hydration.
  const logs = Object.values(teenLogsRef.current ?? (store.logs ?? {}));

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 1rem 4rem" }}>
      <DossierView settings={store.settings} logs={logs} ownerId={userId} />
    </div>
  );
}
