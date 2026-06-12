import { createFileRoute } from "@tanstack/react-router";
import { ReportView } from "@/components/clar/ReportView";
import { useStore } from "@/lib/clar-storage";

export const Route = createFileRoute("/_authenticated/bericht")({
  head: () => ({
    meta: [
      { title: "Bericht — clar.tracker" },
      {
        name: "description",
        content:
          "Klare Einblicke in Dosis, Wirkung und Stimmung — bereit für den nächsten Arzttermin.",
      },
    ],
  }),
  component: BerichtRoute,
});

function BerichtRoute() {
  const { store } = useStore();
  return <ReportView logs={store.logs} />;
}