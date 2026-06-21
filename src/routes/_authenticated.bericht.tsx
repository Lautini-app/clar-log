import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { DossierView } from "@/components/clar/DossierView";
import { listFamilyMembers } from "@/lib/family.functions";
import { loadFromSupabase } from "@/lib/clar-sync";
import { getActivePeriod, useStore } from "@/lib/clar-storage";
import type { DayLog } from "@/lib/clar-storage";

export const Route = createFileRoute("/_authenticated/bericht")({
  head: () => ({ meta: [{ title: "Verlauf — clar.log" }] }),
  component: BerichtRoute,
});

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
      .then(({ members }) => {
        console.log("[bericht] family members:", members.length, members.map(m => m.member_user_id));
        const teen = members.find(m => m.role === "teen") ?? members[0];
        if (!teen) {
          console.warn("[bericht] no teen member found");
          return;
        }
        console.log("[bericht] loading logs for teen:", teen.member_user_id);
        return loadFromSupabase(teen.member_user_id).then((remote) => {
          const count = Object.keys(remote.logs).length;
          console.log("[bericht] teen logs loaded:", count, "dates:", Object.keys(remote.logs).slice(0, 5));
          teenLogsRef.current = remote.logs;
          setTeenLogsLoaded(true);
        });
      })
      .catch((err) => {
        console.error("[bericht] teen log load failed:", err);
      });
  }, [isTeenSelf, userId]);

  if (!userId) return null;

  // Use ref so logs survive store re-renders (which can flip isTeenSelf via settings hydration).
  const logs = Object.values(teenLogsRef.current ?? (store.logs ?? {}));

  console.log("[bericht] logs passed to DossierView:", logs.length, "source:", teenLogsRef.current ? "teenRef" : "store");

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 1rem 4rem" }}>
      <DossierView settings={store.settings} logs={logs} ownerId={userId} />
    </div>
  );
}
