import { createFileRoute } from "@tanstack/react-router";
import { ReportView } from "@/components/clar/ReportView";
import { useStore } from "@/lib/clar-storage";

export const Route = createFileRoute("/_authenticated/bericht")({
  head: () => ({
    meta: [
      { title: "Verlauf — clar.log" },
      {
        name: "description",
        content: "7/14/30-Tage Verlauf mit Ampel-Karten und clar v2 Charts.",
      },
    ],
  }),
  component: BerichtRoute,
});

function BerichtRoute() {
  const { store } = useStore();
  return <ReportView logs={store.logs} settings={store.settings} />;
}