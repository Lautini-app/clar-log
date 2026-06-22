import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TodayView } from "@/components/clar/TodayView";
import { useStore, todayKey, emptyLog, getActivePeriod } from "@/lib/clar-storage";

export const Route = createFileRoute("/_authenticated/heute")({
  head: () => ({
    meta: [
      { title: "Heute — clar.log" },
      {
        name: "description",
        content:
          "Erfasse heute Dosis, Stimmung, Schlaf und Nebenwirkungen — ruhig und reibungslos.",
      },
    ],
  }),
  component: HeuteRoute,
});

function offsetDate(base: string, delta: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

function HeuteRoute() {
  const { store, hydrated, upsertLog, updateSettings, userId } = useStore();
  const today = todayKey();
  const activePeriod = getActivePeriod(store.settings);
  const [selectedDate, setSelectedDate] = useState(today);

  const isToday = selectedDate === today;
  const log = store.logs[selectedDate] ?? emptyLog(selectedDate, activePeriod?.id);

  const canGoBack = activePeriod
    ? selectedDate > activePeriod.startDate
    : selectedDate > offsetDate(today, -30);
  const canGoForward = selectedDate < today;

  if (!hydrated) return null;

  return (
    <div>
      {/* Datumsnavigation */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 16px",
        borderBottom: "0.5px solid var(--color-border-tertiary)",
      }}>
        <button
          type="button"
          onClick={() => setSelectedDate(offsetDate(selectedDate, -1))}
          disabled={!canGoBack}
          style={{
            opacity: canGoBack ? 1 : 0.3,
            padding: 6, borderRadius: 8,
            border: "none", background: "transparent",
            cursor: canGoBack ? "pointer" : "default",
          }}
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          onClick={() => setSelectedDate(today)}
          style={{
            fontSize: 13,
            fontWeight: isToday ? 600 : 400,
            color: isToday ? "var(--color-primary)" : "var(--color-text-secondary)",
            border: "none", background: "transparent",
            cursor: "pointer", padding: "2px 8px",
          }}
        >
          {isToday
            ? "Heute"
            : new Date(selectedDate + "T12:00:00").toLocaleDateString("de-DE", {
                weekday: "long", day: "2-digit", month: "long",
              })}
        </button>
        <button
          type="button"
          onClick={() => setSelectedDate(offsetDate(selectedDate, +1))}
          disabled={!canGoForward}
          style={{
            opacity: canGoForward ? 1 : 0.3,
            padding: 6, borderRadius: 8,
            border: "none", background: "transparent",
            cursor: canGoForward ? "pointer" : "default",
          }}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <TodayView
        log={log}
        settings={store.settings}
        onChange={(patch) => upsertLog(selectedDate, patch)}
        onSettingsChange={updateSettings}
        userId={userId ?? undefined}
      />
    </div>
  );
}
