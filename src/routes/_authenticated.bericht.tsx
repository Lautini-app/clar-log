import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { DossierView } from "@/components/clar/DossierView";
import { loadTeenLogsForOwner } from "@/lib/family.functions";
import type { TeenLogEntry } from "@/lib/family.functions";
import { useStore } from "@/lib/clar-storage";
import type { DayLog } from "@/lib/clar-storage";
import { getActivePeriod } from "@/lib/clar-storage";

export const Route = createFileRoute("/_authenticated/bericht")({
  head: () => ({ meta: [{ title: "Verlauf — clar.log" }] }),
  component: BerichtRoute,
});

function BerichtRoute() {
  const { store, userId } = useStore();
  const activePeriod = getActivePeriod(store.settings);

  // Teen logs keyed by teen name → DayLog array. useState (not useRef) for stable re-renders.
  const [teenEntries, setTeenEntries] = useState<TeenLogEntry[]>([]);

  useEffect(() => {
    if (!userId || !activePeriod?.id) return;
    loadTeenLogsForOwner(userId, activePeriod.id)
      .then(setTeenEntries)
      .catch(() => {});
  }, [userId, activePeriod?.id]);

  // Group teen entries by teen name → Map<string, DayLog[]>
  const teenLogGroups = useMemo(() => {
    const map = new Map<string, DayLog[]>();
    for (const entry of teenEntries) {
      if (!map.has(entry.teenName)) map.set(entry.teenName, []);
      map.get(entry.teenName)!.push(entry.log);
    }
    return map;
  }, [teenEntries]);

  if (!userId) return null;

  const logs = Object.values(store.logs ?? {});

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 1rem 4rem" }}>
      <DossierView
        settings={store.settings}
        logs={logs}
        ownerId={userId}
        teenLogGroups={teenLogGroups}
      />
    </div>
  );
}
