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

  console.log("[bericht] tracker_logs response", { teenId, rows: data?.length ?? 0, error });

  if (error) {
    console.error("[bericht] tracker_logs error:", error.message, error.code, error.details);
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
  const renderCount = useRef(0);
  renderCount.current += 1;

  const activePeriod = getActivePeriod(store.settings);
  const isTeenSelf = activePeriod?.profile === "teen_self";

  console.log(`[bericht] render #${renderCount.current}`, {
    isTeenSelf,
    activePeriodId: store.settings?.activePeriodId,
    activePeriodProfile: activePeriod?.profile,
    userId,
    teenLogsLoaded,
    teenLogsCount: teenLogsRef.current ? Object.keys(teenLogsRef.current).length : null,
    storeLogs: Object.keys(store.logs ?? {}).length,
  });

  useEffect(() => {
    console.log("[bericht] effect triggered — isTeenSelf:", isTeenSelf, "userId:", userId);
    if (!isTeenSelf || !userId) return;
    listFamilyMembers()
      .then(async ({ members }) => {
        console.log("[bericht] family members:", members.length, members.map(m => ({ id: m.member_user_id, role: m.role })));
        const teen = members.find(m => m.role === "teen") ?? members[0];
        if (!teen) {
          console.warn("[bericht] no teen member found");
          return;
        }
        console.log("[bericht] loading tracker_logs for teen:", teen.member_user_id);
        const logs = await loadTeenLogs(teen.member_user_id);
        const count = Object.keys(logs).length;
        console.log("[bericht] teen logs loaded:", count, "dates:", Object.keys(logs).slice(0, 5));
        teenLogsRef.current = logs;
        setTeenLogsLoaded(true);
      })
      .catch((err) => {
        console.error("[bericht] teen log load failed:", err);
      });
  }, [isTeenSelf, userId]);

  if (!userId) return null;

  // Ref survives store re-renders that may temporarily flip isTeenSelf via settings hydration.
  const logs = Object.values(teenLogsRef.current ?? (store.logs ?? {}));

  console.log("[bericht] logs passed to DossierView:", logs.length, "source:", teenLogsRef.current ? "teenRef" : "store");

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 1rem 4rem" }}>
      <DossierView settings={store.settings} logs={logs} ownerId={userId} />
    </div>
  );
}
