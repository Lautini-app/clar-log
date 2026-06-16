import { useEffect, useMemo, useState } from "react";

import { SectionCard } from "./SectionCard";
import type { DayLog, ObserverObservation, Settings, WellbeingAnswer } from "@/lib/clar-storage";
import { SLOT_LABELS, TIME_SLOTS, WELLBEING_CATALOG, getActivePeriod } from "@/lib/clar-storage";
import { listObserverObservations } from "@/lib/clar-observers";

type Props = {
  logs: Record<string, DayLog>;
  settings: Settings;
  ownerId?: string | null;
};

const FILTERS = [7, 14, 30] as const;

function asNumber(answer?: WellbeingAnswer) {
  return typeof answer?.value === "number" ? answer.value : undefined;
}

function asTime(answer?: WellbeingAnswer) {
  const raw = answer?.time ?? (typeof answer?.value === "string" ? answer.value : undefined);
  if (!raw || !raw.includes(":")) return undefined;
  const [h, m] = raw.split(":").map(Number);
  return h + (m || 0) / 60;
}

function collectAnswer(log: DayLog, itemId: string) {
  for (const slot of TIME_SLOTS) {
    const answer = log.slots[slot].answers[itemId];
    if (answer) return answer;
  }
  return undefined;
}

function dayTone(value?: number, inverse = false) {
  if (value == null) return "bg-primary/10 text-primary";
  const score = inverse ? 6 - value : value;
  if (score >= 4) return "bg-primary text-primary-foreground";
  if (score >= 3) return "bg-[#D6A833] text-[#1C2E1C]";
  return "bg-[#B94A3A] text-[#F5F3EE]";
}

function dateLabel(date: string) {
  return new Date(date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function ChartFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

export function ReportView({ logs, settings, ownerId }: Props) {
  const [range, setRange] = useState<(typeof FILTERS)[number]>(14);
  const [observations, setObservations] = useState<ObserverObservation[]>([]);
  const period = getActivePeriod(settings);

  useEffect(() => {
    if (!ownerId || !period) {
      setObservations([]);
      return;
    }
    listObserverObservations(ownerId, period.id)
      .then(setObservations)
      .catch((err) => console.warn("[clar] Beobachtungen laden fehlgeschlagen:", err));
  }, [ownerId, period?.id]);

  const days = useMemo(
    () =>
      Object.values(logs)
        .filter((log) => !period || !log.periodId || log.periodId === period.id)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-range),
    [logs, period, range],
  );

  const sleep = days.map((day) => ({
    date: day.date,
    value: asNumber(collectAnswer(day, "sleep_recovery")) ?? asNumber(collectAnswer(day, "sleep_latency")),
  }));
  const mood = days.map((day) => ({ date: day.date, value: asNumber(collectAnswer(day, "base_mood")) }));
  const rebounds = days.map((day) => ({
    date: day.date,
    x: asTime(collectAnswer(day, "rebound_time")),
    y: asNumber(collectAnswer(day, "rebound_intensity")),
  }));

  return (
    <div className="space-y-4 pb-32">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Verlauf</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Entwicklung sehen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {period?.name ?? "Keine aktive Periode"} · {days.length} Tage
        </p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setRange(filter)}
            className={`rounded-full py-2 text-sm font-semibold ${
              range === filter ? "bg-primary text-primary-foreground" : "bg-card text-primary"
            }`}
          >
            {filter} Tage
          </button>
        ))}
      </div>

      <SectionCard title="Day-Cards" subtitle="Top-3 Ampel aus Schlaf, Stimmung und Rebound.">
        <div className="space-y-3">
          {days.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Tageslogs in dieser Periode.</p>
          )}
          {days.map((day) => {
            const sleepValue = asNumber(collectAnswer(day, "sleep_recovery"));
            const moodValue = asNumber(collectAnswer(day, "base_mood"));
            const reboundValue = asNumber(collectAnswer(day, "rebound_intensity"));
            return (
              <div key={day.date} className="rounded-3xl border border-border bg-background p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">{dateLabel(day.date)}</h2>
                  <span className="text-xs text-muted-foreground">
                    {TIME_SLOTS.filter((slot) => day.slots[slot].status === "done").length}/3 fertig
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <span className={`rounded-2xl p-2 text-center text-xs font-semibold ${dayTone(sleepValue)}`}>
                    Schlaf {sleepValue ?? "–"}
                  </span>
                  <span className={`rounded-2xl p-2 text-center text-xs font-semibold ${dayTone(moodValue)}`}>
                    Stimmung {moodValue ?? "–"}
                  </span>
                  <span className={`rounded-2xl p-2 text-center text-xs font-semibold ${dayTone(reboundValue, true)}`}>
                    Rebound {reboundValue ?? "–"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {observations.length > 0 && (
        <SectionCard title="Perspektivenvergleich" subtitle="Eigene Einträge neben Fremdbeobachtungen (Eltern, Lehrperson).">
          <div className="space-y-3">
            {observations
              .filter((entry) => days.some((day) => day.date === entry.date))
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((entry) => {
                const day = days.find((d) => d.date === entry.date);
                const moodValue = day ? asNumber(collectAnswer(day, "base_mood")) : undefined;
                return (
                  <div key={entry.id} className="rounded-3xl border border-border bg-background p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{dateLabel(entry.date)}</h3>
                      <span className="text-xs text-muted-foreground">{entry.observerName ?? "Beobachter"}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-2xl bg-primary/10 p-2 text-center">
                        <p className="text-muted-foreground">Eigene Stimmung</p>
                        <p className="font-semibold text-primary">{moodValue ?? "–"}</p>
                      </div>
                      <div className="rounded-2xl bg-primary/10 p-2 text-center">
                        <p className="text-muted-foreground">Fremdeinschätzung</p>
                        <p className="font-semibold text-primary">{entry.mood ?? "–"}</p>
                      </div>
                    </div>
                    {entry.note && <p className="mt-2 text-xs text-muted-foreground">„{entry.note}“</p>}
                  </div>
                );
              })}
          </div>
        </SectionCard>
      )}

      <ChartFrame title="Schlaf-Balken">
        <div className="flex h-32 items-end gap-2">
          {sleep.map((entry) => (
            <div key={entry.date} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-24 w-full items-end rounded-full bg-primary/10">
                <div
                  className="w-full rounded-full bg-primary"
                  style={{ height: `${((entry.value ?? 0) / 5) * 100}%` }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{dateLabel(entry.date).slice(0, 2)}</span>
            </div>
          ))}
        </div>
      </ChartFrame>

      <ChartFrame title="Stimmungs-Linie">
        <svg viewBox="0 0 300 120" className="h-32 w-full">
          <polyline
            fill="none"
            stroke="var(--color-primary)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={mood
              .map((entry, index) => {
                const x = mood.length <= 1 ? 150 : (index / (mood.length - 1)) * 280 + 10;
                const y = 110 - ((entry.value ?? 0) / 5) * 90;
                return `${x},${y}`;
              })
              .join(" ")}
          />
          {mood.map((entry, index) => {
            const x = mood.length <= 1 ? 150 : (index / (mood.length - 1)) * 280 + 10;
            const y = 110 - ((entry.value ?? 0) / 5) * 90;
            return <circle key={entry.date} cx={x} cy={y} r="4" fill="var(--color-primary)" />;
          })}
        </svg>
      </ChartFrame>

      <ChartFrame title="Rebound-Scatter">
        <div className="relative h-36 rounded-3xl bg-primary/10">
          {rebounds.map((entry) => {
            if (entry.x == null || entry.y == null) return null;
            return (
              <span
                key={entry.date}
                className="absolute h-3 w-3 rounded-full bg-primary"
                title={entry.date}
                style={{
                  left: `${Math.min(95, Math.max(3, ((entry.x - 6) / 18) * 100))}%`,
                  bottom: `${Math.min(92, Math.max(6, (entry.y / 5) * 100))}%`,
                }}
              />
            );
          })}
          <span className="absolute bottom-2 left-3 text-[10px] text-muted-foreground">06:00</span>
          <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">24:00</span>
        </div>
      </ChartFrame>

      <SectionCard title="Ausgewählter Katalog">
        <div className="flex flex-wrap gap-2">
          {(period?.selectedWellbeingIds ?? []).map((itemId) => {
            const item = WELLBEING_CATALOG.find((entry) => entry.id === itemId);
            if (!item) return null;
            return (
              <span key={itemId} className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
                {item.label} · {(period?.wellbeingSlots[itemId] ?? TIME_SLOTS).map((slot) => SLOT_LABELS[slot]).join("/")}
              </span>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
