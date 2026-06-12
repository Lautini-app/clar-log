import { useMemo, useState } from "react";
import type { DayLog } from "@/lib/clar-storage";
import { SectionCard } from "./SectionCard";
import { Download, FileText, CalendarRange } from "lucide-react";
import { CurveInsights } from "./CurveInsights";

function timeToMin(t?: string) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function freq(items: string[]) {
  const m = new Map<string, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function isoNDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function fmtDateDE(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type Preset = "7" | "14" | "30" | "all" | "custom";

export function ReportView({ logs }: { logs: Record<string, DayLog> }) {
  const allDays = useMemo(
    () => Object.values(logs).sort((a, b) => (a.date < b.date ? 1 : -1)),
    [logs],
  );

  const [preset, setPreset] = useState<Preset>("7");
  const [customFrom, setCustomFrom] = useState<string>(isoNDaysAgo(7));
  const [customTo, setCustomTo] = useState<string>(todayISO());

  const { from, to } = useMemo(() => {
    if (preset === "all") {
      const dates = allDays.map((d) => d.date);
      return {
        from: dates.length ? dates[dates.length - 1] : todayISO(),
        to: dates.length ? dates[0] : todayISO(),
      };
    }
    if (preset === "custom") return { from: customFrom, to: customTo };
    const n = Number(preset);
    return { from: isoNDaysAgo(n - 1), to: todayISO() };
  }, [preset, customFrom, customTo, allDays]);

  const days = useMemo(
    () => allDays.filter((d) => d.date >= from && d.date <= to),
    [allDays, from, to],
  );

  const rangeDays =
    Math.round(
      (new Date(to).getTime() - new Date(from).getTime()) / 86400000,
    ) + 1;

  const stats = useMemo(() => {
    const tracked = days.length;
    const totalDoses = days.reduce((s, d) => s + d.doses.length, 0);
    const sleepVals = days.map((d) => d.sleepQuality).filter((x): x is number => !!x);
    const avgSleep = sleepVals.length
      ? (sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length).toFixed(1)
      : "—";
    const moodFreq = freq(days.flatMap((d) => d.moods)).slice(0, 5);
    const sideFreq = freq(days.flatMap((d) => d.sideEffects)).slice(0, 5);

    const onsetMins = days
      .map((d) => timeToMin(d.effect.onset))
      .filter((x): x is number => x != null);
    const durationMins = days
      .map((d) => {
        const o = timeToMin(d.effect.onset);
        const w = timeToMin(d.effect.wornOff);
        return o != null && w != null && w > o ? w - o : null;
      })
      .filter((x): x is number => x != null);
    const avgOnset =
      onsetMins.length
        ? (() => {
            const m = Math.round(onsetMins.reduce((a, b) => a + b, 0) / onsetMins.length);
            return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
          })()
        : "—";
    const avgDuration = durationMins.length
      ? `${(durationMins.reduce((a, b) => a + b, 0) / durationMins.length / 60).toFixed(1)}h`
      : "—";

    const reboundDays = days.filter((d) => d.effect.rebound).length;

    return { tracked, totalDoses, avgSleep, moodFreq, sideFreq, avgOnset, avgDuration, reboundDays };
  }, [days]);

  const exportText = () => {
    const lines = [
      `clar.tracker — Bericht`,
      `Erstellt am ${new Date().toLocaleString("de-DE")}`,
      `Zeitraum: ${fmtDateDE(from)} – ${fmtDateDE(to)} (${rangeDays} Tage)`,
      ``,
      `Erfasste Tage: ${stats.tracked}`,
      `Dosen insgesamt: ${stats.totalDoses}`,
      `Ø Schlafqualität: ${stats.avgSleep}/5`,
      `Ø Wirkungseintritt: ${stats.avgOnset}`,
      `Ø Wirkungsdauer: ${stats.avgDuration}`,
      `Rebound-Tage: ${stats.reboundDays}`,
      ``,
      `Häufigste Stimmungen: ${stats.moodFreq.map(([k, v]) => `${k} (${v})`).join(", ")}`,
      `Häufigste Nebenwirkungen: ${stats.sideFreq.map(([k, v]) => `${k} (${v})`).join(", ")}`,
      ``,
      `--- Tageslog ---`,
      ...days.map(
        (d) =>
          `${d.date} | Dosen ${d.doses.length} | Schlaf ${d.sleepQuality ?? "-"}/5 | Bewertung ${d.rating ?? "-"}/10${d.note ? ` | "${d.note}"` : ""}`,
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clar-tracker-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 pb-32">
      <header className="pt-2 animate-fade-up">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Für deine Ärztin / deinen Arzt</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Bericht</h1>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarRange className="h-3.5 w-3.5" />
          {fmtDateDE(from)} – {fmtDateDE(to)} · {rangeDays} Tage · {days.length} erfasst
        </p>
      </header>

      <SectionCard title="Trackingzeitraum">
        <div className="flex flex-wrap gap-2">
          {([
            ["7", "7 Tage"],
            ["14", "14 Tage"],
            ["30", "30 Tage"],
            ["all", "Gesamt"],
            ["custom", "Eigener"],
          ] as [Preset, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPreset(id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                preset === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-secondary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs text-muted-foreground">
              Von
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Bis
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={todayISO()}
                onChange={(e) => setCustomTo(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground"
              />
            </label>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Erfasste Tage" value={stats.tracked} />
        <Stat label="Dosen erfasst" value={stats.totalDoses} />
        <Stat label="Ø Schlaf" value={`${stats.avgSleep}/5`} />
        <Stat label="Rebound-Tage" value={stats.reboundDays} />
        <Stat label="Ø Wirkungseintritt" value={stats.avgOnset} />
        <Stat label="Ø Wirkungsdauer" value={stats.avgDuration} />
      </div>

      <SectionCard title="Häufigste Stimmungen">
        <FreqList items={stats.moodFreq} empty="Noch keine Stimmungen erfasst." />
      </SectionCard>

      <SectionCard title="Häufigste Nebenwirkungen">
        <FreqList items={stats.sideFreq} empty="Keine gemeldet." />
      </SectionCard>

      <SectionCard title="Auswertung pro Tag">
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Tage erfasst.</p>
        ) : (
          <div className="space-y-5">
            {days.map((d) => (
              <div key={d.date} className="border-b border-border pb-4 last:border-0 last:pb-0">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {new Date(d.date).toLocaleDateString("de-DE", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <CurveInsights log={d} />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Tag-für-Tag-Log">
        {days.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Tage erfasst.</p>
        ) : (
          <ul className="divide-y divide-border">
            {days.map((d) => (
              <li key={d.date} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {new Date(d.date).toLocaleDateString("de-DE", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {d.doses.length} {d.doses.length === 1 ? "Dosis" : "Dosen"} · Schlaf{" "}
                    {d.sleepQuality ?? "-"}/5 · Bewertung {d.rating ?? "-"}/10
                  </span>
                </div>
                {d.moods.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">{d.moods.join(" · ")}</p>
                )}
                {d.sideEffects.length > 0 && (
                  <p className="mt-0.5 text-xs text-warning/90">⚠ {d.sideEffects.join(", ")}</p>
                )}
                {d.note && (
                  <p className="mt-1 text-xs italic text-foreground/80">"{d.note}"</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <button
        onClick={exportText}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary-soft/40 py-3.5 text-sm font-medium text-primary transition-colors hover:bg-primary-soft active:scale-[0.98]"
      >
        <Download className="h-4 w-4" /> Bericht exportieren (.txt)
      </button>
      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <FileText className="h-3 w-3" /> Oder mach einen Screenshot für den Termin.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 animate-fade-up">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function FreqList({ items, empty }: { items: [string, number][]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const max = items[0][1];
  return (
    <ul className="space-y-2">
      {items.map(([k, v]) => (
        <li key={k} className="flex items-center gap-3">
          <span className="w-28 shrink-0 text-sm capitalize text-foreground">{k}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${(v / max) * 100}%` }}
            />
          </div>
          <span className="w-6 text-right text-xs text-muted-foreground">{v}</span>
        </li>
      ))}
    </ul>
  );
}