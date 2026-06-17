xx TEST_MARKERimport { useEffect, useMemo, useState } from "react";
import { Download, Loader2, Mail, Sparkles } from "lucide-react";

import { SectionCard } from "./SectionCard";
import type { DayLog, ObservationPeriod, ObserverObservation, Settings, WellbeingAnswer } from "@/lib/clar-storage";
import { SLOT_LABELS, TIME_SLOTS, WELLBEING_CATALOG, getActivePeriod } from "@/lib/clar-storage";
import { listObserverObservations } from "@/lib/clar-observers";
import { supabase } from "@/integrations/supabase/client";
import { generateWordReport, listWordReports, sendReportToDoctor } from "@/lib/report.functions";

type WordReport = { id: string; content: string; created_at: string; sent_to_doctor_at: string | null };

function WordReportSection({ period }: { period: ObservationPeriod }) {
  const [reports, setReports] = useState<WordReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await listWordReports({ periodId: period.id });
      setReports(result as WordReport[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [period.id]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await generateWordReport({ periodId: period.id, rangeDays: 30 });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generierung fehlgeschlagen");
    } finally {
      setGenerating(false);
    }
  };

  const handleSend = async (reportId: string) => {
    if (!period.doctorEmail) { setError("Keine Arzt-E-Mail hinterlegt."); return; }
    setSendingId(reportId);
    setError(null);
    try {
      await sendReportToDoctor({ reportId, doctorEmail: period.doctorEmail });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Versand fehlgeschlagen");
    } finally { setSendingId(null); }
  };

  const handleExportPdf = async (report: WordReport) => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("clar.log â Wortbericht", 14, 18);
    doc.setFontSize(10);
    doc.text(new Date(report.created_at).toLocaleDateString("de-DE"), 14, 25);
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(report.content, 180);
    doc.text(lines, 14, 35);
    doc.save(`clar-wortbericht-${report.created_at.slice(0, 10)}.pdf`);
  };

  const reportsThisMonth = reports.filter((r) => {
    const created = new Date(r.created_at);
    const now = new Date();
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;

  return (
    <SectionCard title="Wortbericht" subtitle="Anonymisierte Zusammenfassung â max. 2Ã pro Monat.">
      <div className="space-y-3">
        <button type="button" onClick={handleGenerate}
          disabled={generating || reportsThisMonth >= 2}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {reportsThisMonth >= 2 ? "Limit erreicht (2/Monat)" : "Wortbericht generieren"}
        </button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
          <div className="space-y-3">
            {reports.length === 0 && <p className="text-sm text-muted-foreground">Noch kein Bericht erstellt.</p>}
            {reports.map((report) => (
              <div key={report.id} className="rounded-2xl border border-border bg-background p-4">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{new Date(report.created_at).toLocaleDateString("de-DE")}</span>
                  {report.sent_to_doctor_at && <span>An Arzt gesendet</span>}
                </div>
                <p className="text-sm">{report.content}</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => handleExportPdf(report)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-primary">
                    <Download className="h-3.5 w-3.5" /> PDF
                  </button>
                  <button type="button" onClick={() => handleSend(report.id)} disabled={sendingId === report.id}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs font-semibold text-primary disabled:opacity-40">
                    <Mail className="h-3.5 w-3.5" /> An Arzt senden
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

type Props = { logs: Record<string, DayLog>; settings: Settings; ownerId?: string | null };
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
function collectAnswer(log: DayLog, itemId: string, slot?: string) {
  if (slot) return log.slots[slot as keyof typeof log.slots]?.answers[itemId];
  for (const s of TIME_SLOTS) {
    const answer = log.slots[s].answers[itemId];
    if (answer) return answer;
  }
  return undefined;
}

const NEGATIVE_EMOTIONS = new Set(["Verzweifelt", "Traurig", "Melancholisch", "Ãngstlich", "WÃ¼tend", "Stumpf/Taub"]);

function moodScore(log: DayLog): number | undefined {
  const values = collectAnswer(log, "emotions")?.value as Record<string, number> | undefined;
  if (!values) return undefined;
  const entries = Object.entries(values);
  if (entries.length === 0) return undefined;
  const scored = entries.map(([emotion, value]) => (NEGATIVE_EMOTIONS.has(emotion) ? 5 - value : value));
  return scored.reduce((sum, v) => sum + v, 0) / scored.length;
}

function energyScore(log: DayLog): number | undefined {
  const morning = asNumber(collectAnswer(log, "energy_level", "morning"));
  const midday = asNumber(collectAnswer(log, "energy_level", "midday"));
  const evening = asNumber(collectAnswer(log, "energy_level", "evening"));
  const vals = [morning, midday, evening].filter((v): v is number => v !== undefined);
  if (vals.length === 0) return undefined;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function appetiteScore(log: DayLog): number | undefined {
  const slots = ["morning", "midday", "evening"] as const;
  const vals: number[] = [];
  for (const s of slots) {
    const v = asNumber(collectAnswer(log, "appetite", s)) ?? asNumber(collectAnswer(log, "meal_appetite", s));
    if (v !== undefined) vals.push(v);
  }
  if (vals.length === 0) return undefined;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function bodyScore(log: DayLog): number | undefined {
  const boolItems = ["headache", "stomachache", "chest_tightness", "heart_racing", "dry_mouth", "tics"];
  const boolCount = boolItems.filter(id => collectAnswer(log, id)?.value === true).length;
  if (boolCount === 0) return 4;
  return Math.max(1, 4 - (boolCount / boolItems.length) * 3);
}

function tone(value?: number, inverse = false): { bg: string; text: string } {
  if (value == null) return { bg: "#f1efe8", text: "#888780" };
  const score = inverse ? 5 - value : value;
  if (score >= 3.5) return { bg: "#E1F5EE", text: "#085041" };
  if (score >= 2.5) return { bg: "#FAEEDA", text: "#633806" };
  return { bg: "#FCEBEB", text: "#A32D2D" };
}

function dateLabel(date: string) {
  return new Date(date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function MiniBar({ value, max = 4, color }: { value?: number; max?: number; color: string }) {
  const pct = value != null ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ height: 6, borderRadius: 3, background: "#e5e7eb", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width .3s" }} />
    </div>
  );
}

export function ReportView({ logs, settings, ownerId }: Props) {
  const [range, setRange] = useState<(typeof FILTERS)[number]>(14);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [observations, setObservations] = useState<ObserverObservation[]>([]);
  const period = getActivePeriod(settings);

  useEffect(() => {
    if (!ownerId || !period) { setObservations([]); return; }
    listObserverObservations(ownerId, period.id)
      .then(setObservations)
      .catch((err) => console.warn("[clar] Beobachtungen laden fehlgeschlagen:", err));
  }, [ownerId, period?.id]);

  const days = useMemo(
    () => Object.values(logs)
      .filter((log) => {
        if (!period) return true;
        if (!log.periodId || log.periodId === period.id) return true;
        // Auch Tage zaehlen, die datumsmaessig in die aktive Periode fallen
        // (z.B. wenn eine neue Periode gestartet wurde, der Tag aber noch eine alte periodId traegt)
        const start = period.startDate;
        const end = period.endDate;
        if (start && log.date < start) return false;
        if (end && log.date > end) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-range),
    [logs, period, range],
  );

  // Aggregierte Daten
  const chartData = days.map((day) => ({
    date: day.date,
    label: dateLabel(day.date),
    mood: moodScore(day),
    energy: energyScore(day),
    focus: asNumber(collectAnswer(day, "focus")),
    sleep: asNumber(collectAnswer(day, "sleep_recovery")),
    rebound: asNumber(collectAnswer(day, "rebound_intensity")),
    reboundTime: asTime(collectAnswer(day, "rebound_time")),
    hasRebound: collectAnswer(day, "rebound_today")?.value === true,
    appetite: appetiteScore(day),
    body: bodyScore(day),
    slots: TIME_SLOTS.filter((s) => day.slots[s].status === "done").length,
    day,
  }));

  const avg = (key: keyof typeof chartData[0]) => {
    const vals = chartData.map((d) => d[key] as number | undefined).filter((v): v is number => v !== undefined);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
  };

  const reboundDays = chartData.filter((d) => d.hasRebound).length;
  const maxWidth = Math.max(1, chartData.length);

  return (
    <div className="space-y-4 pb-32">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Dossier</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">{period?.name ?? "Kein Profil"}</h1>
        {period && (
          <p className="mt-1 text-sm text-muted-foreground">
            {period.medications.map((m) => `${m.name} ${m.mg}mg`).join(" Â· ")}
            {period.medications.length > 0 ? " Â· " : ""}
            {days.length} {days.length === 1 ? "Tag" : "Tage"} erfasst
          </p>
        )}
      </header>

      {/* Zeitraum-Filter */}
      <div className="grid grid-cols-3 gap-2">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setRange(f)}
            className={`rounded-full py-2 text-sm font-semibold ${range === f ? "bg-primary text-primary-foreground" : "bg-card text-primary"}`}>
            {f} Tage
          </button>
        ))}
      </div>

      {/* Kennzahlen */}
      {days.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Stimmung", value: avg("mood"), color: "#1D9E75" },
            { label: "Energie", value: avg("energy"), color: "#BA7517" },
            { label: "Fokus", value: avg("focus"), color: "#534AB7" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: "#f1efe8", borderRadius: 12, padding: "10px 12px" }}>
              <p style={{ fontSize: 10, color: "#888780", marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: 20, fontWeight: 500, color }}>
                {value != null ? value.toFixed(1) : "â"}
              </p>
              <p style={{ fontSize: 10, color: "#888780" }}>von 4</p>
            </div>
          ))}
        </div>
      )}
      {reboundDays > 0 && (
        <div style={{ background: "#FCEBEB", borderRadius: 12, padding: "10px 14px" }}>
          <p style={{ fontSize: 12, color: "#A32D2D", fontWeight: 500 }}>
            Rebound: {reboundDays} von {days.length} Tagen ({Math.round((reboundDays / days.length) * 100)}%)
          </p>
        </div>
      )}

      {/* Tagesstreifen-Chart */}
      {days.length > 0 && (
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 16, padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Tagesverlauf</h3>
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 80 }}>
            {chartData.map((d) => {
              const score = d.mood ?? d.energy ?? d.focus;
              const { bg, text } = tone(score);
              const reboundMark = d.hasRebound;
              return (
                <div key={d.date} onClick={() => setExpanded(expanded === d.date ? null : d.date)}
                  style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "pointer" }}>
                  {reboundMark && <div style={{ width: 4, height: 4, borderRadius: 2, background: "#E24B4A" }} />}
                  <div style={{
                    width: "100%", borderRadius: 4,
                    background: bg, border: expanded === d.date ? "2px solid #085041" : "1px solid transparent",
                    height: score != null ? `${Math.round((score / 4) * 60) + 20}px` : "20px",
                    transition: "height .3s",
                  }} />
                  <span style={{ fontSize: 8, color: "#888780", textAlign: "center", lineHeight: 1.2 }}>
                    {d.label.slice(0, 2)}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 12, fontSize: 10, color: "#888780" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#E1F5EE", border: "1px solid #9FE1CB", display: "inline-block" }} /> gut
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#FAEEDA", border: "1px solid #FAC775", display: "inline-block" }} /> mittel
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: "#FCEBEB", border: "1px solid #F7C1C1", display: "inline-block" }} /> schwach
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 4, height: 4, borderRadius: 2, background: "#E24B4A", display: "inline-block" }} /> Rebound
            </span>
          </div>
        </div>
      )}

      {/* Verlaufslinien */}
      {days.length > 1 && (
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 16, padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Verlauf</h3>
          <svg viewBox={`0 0 ${Math.max(300, chartData.length * 20)} 120`} style={{ width: "100%", height: 120 }}>
            {(["mood", "energy", "focus", "appetite", "body"] as const).map((key, ki) => {
              const colors = ["#1D9E75", "#BA7517", "#534AB7", "#E8850A", "#7A6C5D"];
              const points = chartData.map((d, i) => {
                const v = d[key] as number | undefined;
                if (v == null) return null;
                const x = chartData.length <= 1 ? 150 : (i / (chartData.length - 1)) * (Math.max(300, chartData.length * 20) - 20) + 10;
                const y = 110 - (v / 4) * 90;
                return `${x},${y}`;
              }).filter(Boolean);
              if (points.length < 2) return null;
              return (
                <polyline key={key} fill="none" stroke={colors[ki]} strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round" points={points.join(" ")} opacity="0.8" />
              );
            })}
          </svg>
          <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#888780", marginTop: 4 }}>
            <span style={{ color: "#1D9E75" }}>— Stimmung</span>
            <span style={{ color: "#BA7517" }}>— Energie</span>
            <span style={{ color: "#534AB7" }}>— Fokus</span>
            <span style={{ color: "#E8850A" }}>— Appetit</span>
            <span style={{ color: "#7A6C5D" }}>— Körper</span>
          </div>
        </div>
      )}

      {/* Tages-Detail wenn aufgeklappt */}
      {expanded && (() => {
        const d = chartData.find((x) => x.date === expanded);
        if (!d) return null;
        return (
          <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 16, padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>{d.label} â Detail</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Stimmung", value: d.mood, color: "#1D9E75" },
                { label: "Energie", value: d.energy, color: "#BA7517" },
                { label: "Fokus", value: d.focus, color: "#534AB7" },
                { label: "Schlaf", value: d.sleep, color: "#378ADD" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ padding: "8px 10px", background: "#f1efe8", borderRadius: 10 }}>
                  <p style={{ fontSize: 10, color: "#888780" }}>{label}</p>
                  <p style={{ fontSize: 18, fontWeight: 500, color }}>{value != null ? value.toFixed(1) : "â"}</p>
                  <MiniBar value={value} color={color} />
                </div>
              ))}
            </div>
            {d.hasRebound && (
              <div style={{ marginTop: 8, padding: "8px 10px", background: "#FCEBEB", borderRadius: 10 }}>
                <p style={{ fontSize: 11, color: "#A32D2D", fontWeight: 500 }}>
                  Rebound {d.reboundTime != null ? `um ${Math.floor(d.reboundTime)}:${String(Math.round((d.reboundTime % 1) * 60)).padStart(2, "0")}` : ""}
                  {d.rebound != null ? ` Â· StÃ¤rke ${d.rebound}/4` : ""}
                </p>
              </div>
            )}
            <p style={{ fontSize: 11, color: "#888780", marginTop: 8 }}>{d.slots}/3 Slots ausgefÃ¼llt</p>
          </div>
        );
      })()}

      {/* Beobachter-Vergleich */}
      {observations.length > 0 && (
        <SectionCard title="Fremdperspektive" subtitle="Eltern, Lehrperson, andere Beobachter.">
          <div className="space-y-3">
            {observations
              .filter((o) => days.some((d) => d.date === o.date))
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((entry) => {
                const day = chartData.find((d) => d.date === entry.date);
                return (
                  <div key={entry.id} className="rounded-2xl border border-border bg-background p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{dateLabel(entry.date)}</h3>
                      <span className="text-xs text-muted-foreground">{entry.observerName ?? "Beobachter"}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-primary/10 p-2 text-center">
                        <p className="text-muted-foreground">Eigene Stimmung</p>
                        <p className="font-semibold text-primary">{day?.mood != null ? day.mood.toFixed(1) : "â"}</p>
                      </div>
                      <div className="rounded-xl bg-primary/10 p-2 text-center">
                        <p className="text-muted-foreground">FremdeinschÃ¤tzung</p>
                        <p className="font-semibold text-primary">{entry.mood ?? "â"}</p>
                      </div>
                    </div>
                    {entry.note && <p className="mt-2 text-xs text-muted-foreground">â{entry.note}â</p>}
                  </div>
                );
              })}
          </div>
        </SectionCard>
      )}

      {/* Schlaf-Detail */}
      {days.length > 0 && (
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 16, padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Schlaf</h3>
          <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 60 }}>
            {chartData.map((d) => (
              <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{
                  width: "100%", borderRadius: 3, background: "#378ADD",
                  height: d.sleep != null ? `${Math.round((d.sleep / 4) * 50) + 8}px` : "4px",
                  opacity: d.sleep != null ? 1 : 0.2,
                }} />
                <span style={{ fontSize: 8, color: "#888780" }}>{d.label.slice(0, 2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailkurven je Item — Arzt-PDF */}
      {days.length > 1 && (
        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: 16, padding: 16 }}>
          <h3 style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Detailkurven</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {([
              { key: "mood" as const, label: "Stimmung", color: "#1D9E75" },
              { key: "energy" as const, label: "Energie", color: "#BA7517" },
              { key: "focus" as const, label: "Fokus", color: "#534AB7" },
              { key: "appetite" as const, label: "Appetit", color: "#E8850A" },
              { key: "body" as const, label: "Körper", color: "#7A6C5D" },
              { key: "sleep" as const, label: "Schlaf", color: "#378ADD" },
            ]).map(({ key, label, color }) => {
              const W = Math.max(chartData.length, 2);
              const pts = chartData.map((d, i) => {
                const v = d[key] as number | undefined;
                if (v == null) return null;
                const x = (i / (W - 1)) * 100;
                const y = 30 - ((v - 1) / 3) * 28;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              }).filter((p): p is string => p !== null);
              const nums = chartData.map(d => d[key] as number | undefined).filter((v): v is number => v != null);
              const avgVal = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;
              return (
                <div key={key} style={{ background: "#f9f8f4", borderRadius: 10, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <p style={{ fontSize: 10, color: "#888780" }}>{label}</p>
                    <p style={{ fontSize: 14, fontWeight: 500, color }}>{avgVal != null ? avgVal.toFixed(1) : "–"}</p>
                  </div>
                  <svg viewBox="0 0 100 32" style={{ width: "100%", height: 32, overflow: "visible" }}>
                    {pts.length >= 2 && (
                      <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        points={pts.join(" ")} opacity="0.85" />
                    )}
                    {pts.map((p, pi) => (
                      <circle key={pi} cx={Number(p.split(",")[0])} cy={Number(p.split(",")[1])} r="2.5" fill={color} opacity="0.7" />
                    ))}
                  </svg>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {period && ownerId && <WordReportSection period={period} />}
    </div>
  );
}
