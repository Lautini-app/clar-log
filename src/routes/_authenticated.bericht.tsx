import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { DossierView } from "@/components/clar/DossierView";
import { listFamilyMembers } from "@/lib/family.functions";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/lib/clar-storage";
import type { DayLog } from "@/lib/clar-storage";

export const Route = createFileRoute("/_authenticated/bericht")({
  head: () => ({ meta: [{ title: "Verlauf — clar.log" }] }),
  component: BerichtRoute,
});

async function loadTeenLogs(teenId: string): Promise<Record<string, DayLog>> {
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
  // useState (not useRef) so React re-renders when teen logs arrive.
  // Null = not yet checked; {} = admin has no teen or teen has no logs.
  const [teenLogs, setTeenLogs] = useState<Record<string, DayLog> | null>(null);

  useEffect(() => {
    if (!userId) return;
    // listFamilyMembers queries WHERE admin_user_id = userId, so only admins get results.
    // For the teen's own /bericht view, this returns empty and store.logs is shown instead.
    listFamilyMembers()
      .then(async ({ members }) => {
        const teen = members.find((m) => m.role === "teen");
        if (!teen) return; // Not an admin with a teen — show own logs
        const logs = await loadTeenLogs(teen.member_user_id);
        setTeenLogs(logs);
      })
      .catch(() => {});
  }, [userId]);

  if (!userId) return null;

  // When admin has a teen: show teen logs. Otherwise show own logs.
  const logs = Object.values(teenLogs ?? store.logs ?? {});

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 1rem 4rem" }}>
      <DossierView settings={store.settings} logs={logs} ownerId={userId} />
    </div>
  );
}
