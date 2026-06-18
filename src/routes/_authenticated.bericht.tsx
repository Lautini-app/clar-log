import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

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
  const [teenLogs, setTeenLogs] = useState<Record<string, DayLog> | null>(null);

  const activePeriod = getActivePeriod(store.settings);
  const isTeenSelf = activePeriod?.profile === "teen_self";

  useEffect(() => {
    if (!isTeenSelf || !userId) return;
    listFamilyMembers()
      .then(({ members }) => {
        const teen = members[0];
        if (!teen) return;
        return loadFromSupabase(teen.member_user_id).then((remote) => {
          setTeenLogs(remote.logs);
        });
      })
      .catch(() => {});
  }, [isTeenSelf, userId]);

  if (!userId) return null;

  const logs = Object.values(isTeenSelf && teenLogs ? teenLogs : (store.logs ?? {}));

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 1rem 4rem" }}>
      <DossierView settings={store.settings} logs={logs} ownerId={userId} />
    </div>
  );
}
