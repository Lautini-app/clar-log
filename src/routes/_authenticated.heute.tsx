import { createFileRoute } from "@tanstack/react-router";
import { TodayView } from "@/components/clar/TodayView";
import { NotificationBanner } from "@/components/clar/Notification";
import { useStore, todayKey, emptyLog } from "@/lib/clar-storage";

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
  const { store, upsertLog } = useStore();
  const today = todayKey();
  const log = store.logs[today] ?? emptyLog(today);
  return (
    <>
      <NotificationBanner
        morningTime={store.settings.morningTime}
        eveningTime={store.settings.eveningTime}
        weeklyFocus={store.settings.weeklyFocus}
        onAct={() => {}}
      />
      <TodayView
        log={log}
        settings={store.settings}
        onChange={(patch) => upsertLog(today, patch)}
      />
    </>
  );
}