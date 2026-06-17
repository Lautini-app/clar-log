import { createFileRoute } from "@tanstack/react-router";
import { DossierView } from "@/components/clar/DossierView";
import { useStore } from "@/lib/clar-storage";
import { useClarAuth } from "@/lib/clar-auth";

export const Route = createFileRoute("/_authenticated/bericht")({
  head: () => ({ meta: [{ title: "Verlauf — clar.log" }] }),
  component: BerichtRoute,
});

function BerichtRoute() {
  const { store } = useStore();
  const { userId } = useClarAuth();

  if (!userId) return null;

  const logs = Object.values(store.logs ?? {});

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 1rem 4rem" }}>
      <DossierView settings={store.settings} logs={logs} ownerId={userId} />
    </div>
  );
}
