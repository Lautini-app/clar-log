import { createFileRoute } from "@tanstack/react-router";
import { TodayView } from "@/components/clar/TodayView";
import { useStore, todayKey, emptyLog, getActivePeriod } from "@/lib/clar-storage";

export const Route = createFileRoute("/_authenticated/heute")({
  head: () => ({
    meta: [
      { title: "Heute — clar.tracker" },
      {
        name: "description",
        content:
          "Erfasse heute Dosis, Stimmung, Schlaf und Nebenwirkungen — ruhig und reibungslos.",
      },
    ],
  }),
  component: HeuteRoute,
});

function HeuteRoute() {
  const { store, upsertLog, updateSettings } = useStore();
  const today = todayKey();
  const activePeriod = getActivePeriod(store.settings);
  const log = store.logs[today] ?? emptyLog(today, activePeriod?.id);
  return (
    <TodayView
      log={log}
      settings={store.settings}
      onChange={(patch) => upsertLog(today, patch)}
      onSettingsChange={updateSettings}
    />
  );
}