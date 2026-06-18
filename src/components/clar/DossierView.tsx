import { useEffect, useMemo, useState } from "react";
import type { DayLog, Settings, WellbeingAnswer } from "@/lib/clar-storage";
import { listObserverObservations } from "@/lib/clar-observers";

type Props = { settings: Settings; logs: DayLog[]; ownerId: string; };
const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const EMOTIONS_NEG = new Set(["Verzweifelt","Traurig","Melancholisch","Ängstlich","Wütend","Aufgewühlt"]);

function getWeekDays(offset: number): string[] {
  const now = new Date();
  const day = now.getDay() || 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - day + 1 + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function collectVal(log: DayLog | undefined, id: string): number | undefined {
  if (!log) return undefined;
  for (const slot of Object.values(log.slots ?? {})) {
    const ans = (slot as any).answers?.[id] as WellbeingAnswer | undefined;
    if (ans?.value !== undefined) return ans.value as number;
  }
  return undefined;
}

function collectAnswer(log: DayLog | undefined, id: string): unknown {
  if (!log) return undefined;
  for (const slot of Object.values(log.slots ?? {})) {
    const ans = (slot as any).answers?.[id] as WellbeingAnswer | undefined;
    if (ans?.value !== undefined) return ans.value;
  }
  return undefined;
}

function collectEmotions(log: DayLog | undefined): Record<string, number> | undefined {
  if (!log) return undefined;
  for (const slot of Object.values(log.slots ?? {})) {
    const ans = (slot as any).answers?.["emotions"] as WellbeingAnswer | undefined;
    if (ans?.value && typeof ans.value === "object" && !Array.isArray(ans.value)) return ans.value as unknown as Record<string, number>;
  }
  return undefined;
}

function moodScore(log: DayLog | undefined): number | undefined {
  const emo = collectEmotions(log);
  if (!emo) return collectVal(log, "base_mood");
  const entries = Object.entries(emo);
  if (!entries.length) return undefined;
  const scored = entries.map(([k, v]) => EMOTIONS_NEG.has(k) ? 5 - v : v);
  const s = scored.reduce((a, b) => a + b, 0) / scored.length;
  return Math.round(s * 10) / 10;
}

function heatBg(val: number | undefined, invert = false) {
  if (val === undefined) return "var(--color-background-secondary)";
  if (invert) {
    return val >= 3.5 ? "#FCEBEB" : val >= 2.5 ? "#FAEEDA" : "#E1F5EE";
  }
  return val >= 3.5 ? "#E1F5EE" : val >= 2.5 ? "#FAEEDA" : "#FCEBEB";
}

function heatColor(val: number | undefined, invert = false) {
  if (val === undefined) return "var(--color-text-tertiary)";
  if (invert) {
    return val >= 3.5 ? "#A32D2D" : val >= 2.5 ? "#854F0B" : "#0F6E56";
  }
  return val >= 3.5 ? "#0F6E56" : val >= 2.5 ? "#854F0B" : "#A32D2D";
}

function avg(vals: (number | undefined)[]): number | undefined {
  const v = vals.filter((x): x is number => x !== undefined);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : undefined;
}

function CellBtn({ val, invert = false, label, onClick }: { val?: number; invert?: boolean; label?: string; onClick?: () => void }) {
  const bg = heatBg(val, invert);
  const color = heatColor(val, invert);
  const text = val === undefined ? "—"
    : invert
      ? (val >= 3.5 ? "hoch" : val >= 2.5 ? "mid" : "tief")
      : (val >= 3.5 ? "gut" : val >= 2.5 ? "mid" : "tief");
  return (
    <div onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 30, height: 26, borderRadius: 4, background: bg, color,
      fontSize: 10, fontWeight: 500, cursor: onClick ? "pointer" : "default",
      outline: onClick ? "none" : undefined,
    }} title={label}>
      {text}
    </div>
  );
}

type DetailPanel = {
  title: string;
  days: string[];
  dayLogs: (DayLog | undefined)[];
  type: "emotions" | "focus_detail" | "school" | "body" | "food" | "rebound" | "sleep" | "energy";
};

function DetailView({ panel, onClose }: { panel: DetailPanel; onClose: () => void }) {
  const EMOTION_LABELS: Record<string, string> = {
    "Verzweifelt": "😰", "Traurig": "😢", "Melancholisch": "😔", "Ängstlich": "😟",
    "Wütend": "😡", "Ich fühle gar nichts": "😶",
    "Ruhig und okay": "😌", "Ausgeglichen": "😊", "Froh / glücklich": "😄",
    "Aufgeregt": "🤩", "Euphorisch": "🥳",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "flex-end" }}
      onClick={onClose}>
      <div style={{ background: "var(--color-background-primary)", borderRadius: "16px 16px 0 0", padding: "1.25rem", width: "100%", maxHeight: "80vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{panel.title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-secondary)" }}>×</button>
        </div>

        {panel.type === "emotions" && (
          <div>
            {panel.days.map((day, di) => {
              const emo = collectEmotions(panel.dayLogs[di]);
              if (!emo || !panel.dayLogs[di]) return null;
              return (
                <div key={day} style={{ marginBottom: "1rem" }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 6 }}>{DAYS[di]} {new Date(day).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {Object.entries(emo).map(([emotion, val]) => {
                      const isNeg = EMOTIONS_NEG.has(emotion);
                      const intensity = val as number;
                      if (intensity <= 1) return null;
                      const bg = isNeg ? (intensity >= 3 ? "#FCEBEB" : "#FAEEDA") : (intensity >= 3 ? "#E1F5EE" : "#FAEEDA");
                      const color = isNeg ? (intensity >= 3 ? "#A32D2D" : "#854F0B") : (intensity >= 3 ? "#0F6E56" : "#854F0B");
                      return (
                        <div key={emotion} style={{ background: bg, color, borderRadius: 20, padding: "4px 10px", fontSize: 12, fontWeight: 500 }}>
                          {EMOTION_LABELS[emotion] ?? ""} {emotion} {intensity}/4
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {panel.type === "focus_detail" && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 0", color: "var(--color-text-secondary)", fontSize: 11 }}>Tag</th>
                <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Fokus</th>
                <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Ablenkung</th>
                <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Impuls.</th>
                <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Gedanken</th>
              </tr>
            </thead>
            <tbody>
              {panel.days.map((day, di) => {
                const log = panel.dayLogs[di];
                return (
                  <tr key={day} style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                    <td style={{ padding: "6px 0", color: "var(--color-text-secondary)", fontSize: 12 }}>{DAYS[di]}</td>
                    <td style={{ textAlign: "center" }}><CellBtn val={collectVal(log, "focus")} /></td>
                    <td style={{ textAlign: "center" }}><CellBtn val={collectVal(log, "distractibility")} invert /></td>
                    <td style={{ textAlign: "center" }}><CellBtn val={collectVal(log, "impulsivity")} invert /></td>
                    <td style={{ textAlign: "center" }}><CellBtn val={collectVal(log, "thought_racing")} invert /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {panel.type === "school" && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 0", color: "var(--color-text-secondary)", fontSize: 11 }}>Tag</th>
                <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Leistung</th>
                <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Soziales</th>
                <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Schule ok?</th>
              </tr>
            </thead>
            <tbody>
              {panel.days.map((day, di) => {
                const log = panel.dayLogs[di];
                return (
                  <tr key={day} style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                    <td style={{ padding: "6px 0", color: "var(--color-text-secondary)", fontSize: 12 }}>{DAYS[di]}</td>
                    <td style={{ textAlign: "center" }}><CellBtn val={collectVal(log, "school_performance")} /></td>
                    <td style={{ textAlign: "center" }}><CellBtn val={collectVal(log, "school_social")} /></td>
                    <td style={{ textAlign: "center" }}>
                      {collectVal(log, "school_check") !== undefined
                        ? <span style={{ fontSize: 12, color: collectVal(log, "school_check") === 1 ? "#0F6E56" : "#A32D2D" }}>{collectVal(log, "school_check") === 1 ? "✓" : "—"}</span>
                        : <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {panel.type === "food" && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 0", color: "var(--color-text-secondary)", fontSize: 11 }}>Tag</th>
                <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Hunger</th>
                <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Appetit</th>
                <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Gegessen</th>
                <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Gefrühstückt</th>
              </tr>
            </thead>
            <tbody>
              {panel.days.map((day, di) => {
                const log = panel.dayLogs[di];
                return (
                  <tr key={day} style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                    <td style={{ padding: "6px 0", color: "var(--color-text-secondary)", fontSize: 12 }}>{DAYS[di]}</td>
                    <td style={{ textAlign: "center" }}><CellBtn val={collectVal(log, "hunger")} /></td>
                    <td style={{ textAlign: "center" }}><CellBtn val={collectVal(log, "appetite")} /></td>
                    <td style={{ textAlign: "center" }}><CellBtn val={collectVal(log, "meal_amount")} /></td>
                    <td style={{ textAlign: "center" }}>
                      {collectVal(log, "had_breakfast") !== undefined
                        ? <span style={{ fontSize: 12, color: collectVal(log, "had_breakfast") === 1 ? "#0F6E56" : "#A32D2D" }}>{collectVal(log, "had_breakfast") === 1 ? "ja" : "nein"}</span>
                        : <span style={{ color: "var(--color-text-tertiary)", fontSize: 12 }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {panel.type === "body" && (
          <div>
            {(["headache","stomachache","tension","chest_tightness","dry_mouth","tics"] as const).map(id => {
              const label: Record<string, string> = {
                headache: "Kopfschmerzen", stomachache: "Bauchschmerzen", tension: "Verspannungen",
                chest_tightness: "Engegefühl", dry_mouth: "Mundtrockenheit", tics: "Tics"
              };
              const vals = panel.dayLogs.map(l => collectVal(l, id));
              const count = vals.filter(v => v === 1).length;
              const total = vals.filter(v => v !== undefined).length;
              if (total === 0) return null;
              const color = count === 0 ? "#0F6E56" : count <= 1 ? "#854F0B" : "#A32D2D";
              return (
                <div key={id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <span style={{ fontSize: 13 }}>{label[id]}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {panel.days.map((_, di) => {
                      const v = vals[di];
                      return (
                        <div key={di} style={{ width: 28, height: 24, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                          background: v === undefined ? "var(--color-background-secondary)" : v === 1 ? "#FCEBEB" : "#E1F5EE",
                          fontSize: 10, color: v === undefined ? "var(--color-text-tertiary)" : v === 1 ? "#A32D2D" : "#0F6E56"
                        }}>
                          {v === undefined ? "—" : v === 1 ? "ja" : "nein"}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {panel.type === "energy" && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th style={{ textAlign: "left", padding: "4px 0", color: "var(--color-text-secondary)", fontSize: 11 }}>Tag</th>
              <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Energie</th>
            </tr></thead>
            <tbody>
              {panel.days.map((day, di) => {
                const log = panel.dayLogs[di];
                return (
                  <tr key={day} style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                    <td style={{ padding: "6px 0", color: "var(--color-text-secondary)", fontSize: 12 }}>{DAYS[di]}</td>
                    <td style={{ textAlign: "center" }}><CellBtn val={collectVal(log, "energy_level")} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {panel.type === "rebound" && (
          <div>
            {panel.days.map((day, di) => {
              const log = panel.dayLogs[di];
              const had = collectVal(log, "rebound_today");
              if (had !== 1) return null;
              const timeA = collectAnswer(log, "rebound_time");
              const typeA = collectAnswer(log, "rebound_type");
              const intA = collectVal(log, "rebound_intensity");
              const timeStr = typeof timeA === "object" && timeA !== null ? String((timeA as any).value ?? "") : String(timeA ?? "");
              const typeStr = typeof typeA === "object" && typeA !== null ? String((typeA as any).value ?? "") : String(typeA ?? "");
              return (
                <div key={day} style={{ marginBottom: "1rem", padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: 4 }}>{DAYS[di]} {new Date(day).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12 }}>
                    {timeStr && <span style={{ background: "#FAEEDA", color: "#854F0B", borderRadius: 20, padding: "3px 10px" }}>⏰ {timeStr}</span>}
                    {typeStr && <span style={{ background: "#FCEBEB", color: "#A32D2D", borderRadius: 20, padding: "3px 10px" }}>{typeStr}</span>}
                    {intA !== undefined && <span style={{ background: intA >= 3 ? "#FCEBEB" : "#FAEEDA", color: intA >= 3 ? "#A32D2D" : "#854F0B", borderRadius: 20, padding: "3px 10px" }}>Stärke {intA}/4</span>}
                  </div>
                </div>
              );
            })}
            {panel.dayLogs.every(l => collectVal(l, "rebound_today") !== 1) && (
              <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Kein Rebound in dieser Woche.</p>
            )}
          </div>
        )}

        {panel.type === "sleep" && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>
              <th style={{ textAlign: "left", padding: "4px 0", color: "var(--color-text-secondary)", fontSize: 11 }}>Tag</th>
              <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Dauer</th>
              <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Qualität</th>
              <th style={{ textAlign: "center", fontSize: 11, color: "var(--color-text-secondary)" }}>Einschlaf.</th>
            </tr></thead>
            <tbody>
              {panel.days.map((day, di) => {
                const log = panel.dayLogs[di];
                const dur = collectVal(log, "sleep_duration");
                const qual = collectVal(log, "sleep_recovery");
                const einschl = collectVal(log, "sleep_latency");
                return (
                  <tr key={day} style={{ borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                    <td style={{ padding: "6px 0", color: "var(--color-text-secondary)", fontSize: 12 }}>{DAYS[di]}</td>
                    <td style={{ textAlign: "center", fontWeight: 500, color: dur !== undefined ? (dur >= 7 ? "#0F6E56" : dur >= 6 ? "#854F0B" : "#A32D2D") : "var(--color-text-tertiary)" }}>{dur !== undefined ? dur + "h" : "—"}</td>
                    <td style={{ textAlign: "center" }}><CellBtn val={qual} /></td>
                    <td style={{ textAlign: "center", fontWeight: 500, color: einschl !== undefined ? (einschl <= 20 ? "#0F6E56" : einschl <= 40 ? "#854F0B" : "#A32D2D") : "var(--color-text-tertiary)" }}>{einschl !== undefined ? einschl + "min" : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export function DossierView({ settings, logs, ownerId }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [observations, setObservations] = useState<any[]>([]);
  const [teacherReports, setTeacherReports] = useState<any[]>([]);
  const [detail, setDetail] = useState<DetailPanel | null>(null);
  const period = settings?.periods?.[0];

  const days = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const weekLabel = `${new Date(days[0]).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${new Date(days[6]).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  const dayLogs = useMemo(() => days.map(d => logs.find(l => l.date === d)), [days, logs]);

  useEffect(() => {
    if (!ownerId || !period?.id) return;
    listObserverObservations(ownerId, period.id)
      .then(setObservations).catch(() => {});
    // Teacher reports aus logs (importiert)
    const tr = (logs as any[]).filter(l => l.__teacherReport);
    if (tr.length) setTeacherReports(tr);
  }, [ownerId, period?.id, logs]);

  // Auch importierte Beobachter/Lehrer aus settings laden
  useEffect(() => {
    const imported = (settings as any)?._imported;
    if (imported?.observer_observations) setObservations(imported.observer_observations);
    if (imported?.teacher_reports) setTeacherReports(imported.teacher_reports);
  }, [settings]);

  const weekObs = observations.filter(o => days.includes(o.date));
  const weekTeacher = teacherReports.filter(r => {
    const rDate = r.date ?? r.week;
    return days.some(d => d >= days[0] && d <= days[6]);
  });

  const moodVals = dayLogs.map(moodScore);
  const focusVals = dayLogs.map(l => collectVal(l, "focus"));
  const distractVals = dayLogs.map(l => collectVal(l, "distractibility"));
  const impVals = dayLogs.map(l => collectVal(l, "impulsivity"));
  const hyperfocusVals = dayLogs.map(l => collectVal(l, "hyperfocus"));
  const energyVals = dayLogs.map(l => collectVal(l, "energy_level"));
  const sleepVals = dayLogs.map(l => collectVal(l, "sleep_duration"));
  const reboundDays = dayLogs.map(l => collectVal(l, "rebound_today") === 1);
  const reboundCount = reboundDays.filter(Boolean).length;

  const mappedWeekObs = weekObs.map(o => ({
    ...o,
    mood: o.mood ?? o.answers?.home_mood,
    behavior: o.behavior ?? o.answers?.home_cooperation,
    concentration: o.concentration ?? o.answers?.home_focus_homework,
  }));

  const SL = ({ children }: { children: string }) => (
    <td style={{ textAlign: "left", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6, whiteSpace: "nowrap", cursor: "default" }}>{children}</td>
  );

  const clickableRow = (title: string, type: DetailPanel["type"]) => ({
    style: { cursor: "pointer" },
    onClick: () => setDetail({ title, days, dayLogs, type }),
  });

  const HmRow = ({ label, vals, invert = false, detailType }: { label: string; vals: (number|undefined)[]; invert?: boolean; detailType?: DetailPanel["type"] }) => (
    <tr onClick={detailType ? () => setDetail({ title: label, days, dayLogs, type: detailType }) : undefined}
      style={{ cursor: detailType ? "pointer" : "default", background: "transparent" }}
      onMouseEnter={detailType ? (e) => { e.currentTarget.style.background = "var(--color-background-secondary)"; } : undefined}
      onMouseLeave={detailType ? (e) => { e.currentTarget.style.background = "transparent"; } : undefined}>
      <td style={{ textAlign: "left", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6, whiteSpace: "nowrap" }}>
        {label}{detailType && <span style={{ fontSize: 10, marginLeft: 4, color: "var(--color-text-tertiary)" }}>›</span>}
      </td>
      {vals.map((v, i) => (
        <td key={i} style={{ textAlign: "center", padding: "2px 1px" }}>
          <CellBtn val={v} invert={invert} />
        </td>
      ))}
    </tr>
  );

  return (
    <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--color-text-primary)", padding: "1rem 0" }}>
      {detail && <DetailView panel={detail} onClose={() => setDetail(null)} />}

      <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 2 }}>{period?.name ?? "Beobachtungsperiode"}</p>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1.25rem" }}>
        {period?.medications?.map(m => `${m.name} ${m.mg}mg ${m.duration === "long" ? "Retard" : "Kurz"}`).join(" · ") ?? "Kein Medikament"} · Dossier
      </p>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <button onClick={() => setWeekOffset(w => w - 1)}
          style={{ background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, padding: "4px 12px", fontSize: 13, cursor: "pointer", color: "var(--color-text-primary)" }}>
          ← zurück
        </button>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{weekLabel}</span>
        <button onClick={() => setWeekOffset(w => Math.min(0, w + 1))} disabled={weekOffset >= 0}
          style={{ background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, padding: "4px 12px", fontSize: 13, cursor: weekOffset >= 0 ? "default" : "pointer", color: "var(--color-text-primary)", opacity: weekOffset >= 0 ? 0.4 : 1 }}>
          vor →
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: "1.25rem" }}>
        {[
          { val: avg(focusVals), label: "Fokus (Ø)", suf: "/4", col: avg(focusVals) && (avg(focusVals) ?? 0) >= 3 ? "#0F6E56" : "#854F0B" },
          { val: avg(moodVals), label: "Stimmung (Ø)", suf: "/4", col: avg(moodVals) && (avg(moodVals) ?? 0) >= 3 ? "#0F6E56" : "#854F0B" },
          { val: reboundCount, label: "Rebound (Woche)", suf: "×", col: reboundCount === 0 ? "#0F6E56" : reboundCount <= 2 ? "#854F0B" : "#A32D2D" },
          { val: avg(sleepVals), label: "Schlaf (Ø)", suf: "h", col: (avg(sleepVals) ?? 0) >= 7 ? "#0F6E56" : "#854F0B" },
        ].map(({ val, label, suf, col }) => (
          <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 22, fontWeight: 500, color: col }}>{val ?? "—"}<span style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>{suf}</span></div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Heatmap — klickbar */}
      <div style={{ marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
          Tagesverlauf <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none" }}>— tippen für Details</span>
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr><th style={{ width: 90 }} />{DAYS.map(d => <th key={d} style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", textAlign: "center", padding: "3px 1px", minWidth: 36 }}>{d}</th>)}</tr>
          </thead>
          <tbody>
            <HmRow label="Energie" vals={energyVals} detailType="energy" />
            <HmRow label="Stimmung" vals={moodVals} detailType="emotions" />
            <HmRow label="Fokus" vals={focusVals} detailType="focus_detail" />
            <HmRow label="Ablenkung" vals={distractVals} invert detailType="focus_detail" />
            <HmRow label="Impulsivität" vals={impVals} invert detailType="focus_detail" />
            <tr>
              <td style={{ textAlign: "left", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6, whiteSpace: "nowrap" }}>
                Hyperfokus
              </td>
              {hyperfocusVals.map((v, i) => (
                <td key={i} style={{ textAlign: "center", padding: "2px 1px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 26, borderRadius: 4,
                    background: v === 1 ? "#E8DFFF" : "var(--color-background-secondary)",
                    fontSize: 9, fontWeight: 500, color: v === 1 ? "#6B21A8" : "var(--color-text-tertiary)" }}>
                    {v === 1 ? "ja" : "—"}
                  </div>
                </td>
              ))}
            </tr>
            <tr>
              <td style={{ textAlign: "left", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6, cursor: "pointer" }} onClick={() => setDetail({ title: "Rebound", days, dayLogs, type: "rebound" })}>Rebound ▸</td>
              {reboundDays.map((v, i) => (
                <td key={i} style={{ textAlign: "center", padding: "2px 1px" }}>
                  <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 26, borderRadius: 4,
                    background: v ? "#FCEBEB" : "var(--color-background-secondary)",
                    fontSize: 9, fontWeight: 500, color: v ? "#A32D2D" : "var(--color-text-tertiary)" }}>
                    {v ? "Reb." : "—"}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Medikamenten-Einnahme */}
      <div style={{ marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>Medikamenten-Einnahme</p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr><th style={{ width: 90 }} />{DAYS.map(d => <th key={d} style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", textAlign: "center", padding: "3px 1px", minWidth: 36 }}>{d}</th>)}</tr>
          </thead>
          <tbody>
            {period?.medications?.map(med => (
              <tr key={med.id}>
                <td style={{ textAlign: "left", fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6 }}>
                  {med.name}<br /><span style={{ fontSize: 10, fontWeight: 400 }}>{med.duration === "long" ? "Retard" : "Kurz"}</span>
                </td>
                {dayLogs.map((log, i) => {
                  const slotData = log?.slots?.[med.intakeSlot] as any;
                  const taken = slotData?.medsTaken?.[med.id] ?? false;
                  const time = slotData?.medicationTime;
                  const dose = slotData?.medsDose?.[med.id];
                  return (
                    <td key={i} style={{ textAlign: "center", padding: "2px 1px" }}>
                      {taken
                        ? <div style={{ fontSize: 10, fontWeight: 500, color: "#0F6E56", lineHeight: 1.3 }}>
                            {time ?? "✓"}
                            {dose && <div style={{ fontSize: 9, color: "var(--color-text-secondary)" }}>{dose}mg</div>}
                          </div>
                        : <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Schlaf */}
      <div style={{ marginBottom: "1.25rem" }}>
        <p onClick={() => setDetail({ title: "Schlaf", days, dayLogs, type: "sleep" })} style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8, cursor: "pointer" }}>Schlaf ▸</p>
        {sleepVals.map((val, i) => val !== undefined ? (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", width: 22 }}>{DAYS[i]}</span>
            <div style={{ flex: 1, background: "var(--color-background-secondary)", borderRadius: 3, height: 12, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: "#378ADD", width: `${Math.min(100, val / 10 * 100)}%` }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, width: 28, textAlign: "right", color: val >= 7 ? "#0F6E56" : val >= 6 ? "#854F0B" : "#A32D2D" }}>{val}h</span>
          </div>
        ) : null)}
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Essen — klickbar */}
      <div style={{ marginBottom: "1.25rem", cursor: "pointer" }}
        onClick={() => setDetail({ title: "Essen & Appetit", days, dayLogs, type: "food" })}>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
          Essen <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none" }}>›</span>
        </p>
        {[
          { label: "Appetit reduziert", id: "appetite", invert: true },
          { label: "Wenig gegessen", id: "meal_amount", invert: true },
        ].map(({ label, id, invert }) => {
          const count = dayLogs.filter(l => { const v = collectVal(l, id); return v !== undefined && v <= 1.5; }).length;
          const total = dayLogs.filter(l => collectVal(l, id) !== undefined).length;
          const color = count === 0 ? "#0F6E56" : count <= 1 ? "#854F0B" : "#A32D2D";
          return (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              <span style={{ fontSize: 13 }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color }}>{count} / {total} Tagen</span>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Körper — klickbar */}
      <div style={{ marginBottom: "1.25rem", cursor: "pointer" }}
        onClick={() => setDetail({ title: "Körperliche Beschwerden", days, dayLogs, type: "body" })}>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
          Körper & Nebenwirkungen <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none" }}>›</span>
        </p>
        {(["headache", "stomachache", "tension", "heart_racing", "dry_mouth"] as const).map(id => {
          const label: Record<string, string> = { headache: "Kopfschmerzen", stomachache: "Bauchschmerzen", tension: "Verspannungen", heart_racing: "Herzrasen", dry_mouth: "Mundtrockenheit" };
          const count = dayLogs.filter(l => collectVal(l, id) === 1).length;
          const total = dayLogs.filter(l => collectVal(l, id) !== undefined).length;
          const color = count === 0 ? "#0F6E56" : count <= 1 ? "#854F0B" : "#A32D2D";
          return (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              <span style={{ fontSize: 13 }}>{label[id]}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color }}>{count} / {total} Tagen</span>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Schule — klickbar */}
      <div style={{ marginBottom: "1.25rem", cursor: "pointer" }}
        onClick={() => setDetail({ title: "Schule / Arbeit", days, dayLogs, type: "school" })}>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
          Schule / Arbeit <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none" }}>›</span>
        </p>
        {[
          { label: "Leistung", id: "school_performance" },
          { label: "Soziales", id: "school_social" },
        ].map(({ label, id }) => {
          const v = avg(dayLogs.map(l => collectVal(l, id)));
          return (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              <span style={{ fontSize: 13 }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: v ? heatColor(v) : "var(--color-text-secondary)" }}>{v ? `${v}/4` : "—"}</span>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Beobachter */}
      <div style={{ marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>Rückmeldung Beobachter</p>
        {mappedWeekObs.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Keine Beobachtungen diese Woche.</p>
        ) : mappedWeekObs.map((o, i) => (
          <div key={i} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>
              {o.observerName ?? (o.role === "parent" ? "Elternteil" : "Beobachter")} · {new Date(o.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
            </div>
            {(o.mood || o.behavior || o.concentration) && (
              <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                {o.mood && <span style={{ fontSize: 12, background: "var(--color-background-primary)", borderRadius: 6, padding: "2px 8px" }}>Stimmung {o.mood}/5</span>}
                {o.behavior && <span style={{ fontSize: 12, background: "var(--color-background-primary)", borderRadius: 6, padding: "2px 8px" }}>Verhalten {o.behavior}/5</span>}
                {o.concentration && <span style={{ fontSize: 12, background: "var(--color-background-primary)", borderRadius: 6, padding: "2px 8px" }}>Konzentration {o.concentration}/5</span>}
              </div>
            )}
            {o.note && <div style={{ fontSize: 13, lineHeight: 1.5 }}>{o.note}</div>}
          </div>
        ))}
      </div>

      {/* Fachpersonen */}
      {(weekTeacher.length > 0 || teacherReports.length > 0) && (
        <>
          <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />
          <div>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>Rückmeldung Fachpersonen</p>
            {(weekTeacher.length > 0 ? weekTeacher : teacherReports.slice(-2)).map((r: any, i: number) => (
              <div key={i} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                  {r.teacherName ?? "Fachperson"} · {r.week ?? r.date ?? ""}
                </div>
                {(r.focus_morning || r.focus_afternoon) && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                    {r.focus_morning && <span style={{ fontSize: 12, background: "var(--color-background-primary)", borderRadius: 6, padding: "2px 8px" }}>Fokus Vm. {r.focus_morning}/4</span>}
                    {r.focus_afternoon && <span style={{ fontSize: 12, background: "var(--color-background-primary)", borderRadius: 6, padding: "2px 8px" }}>Fokus Nm. {r.focus_afternoon}/4</span>}
                    {r.social && <span style={{ fontSize: 12, background: "var(--color-background-primary)", borderRadius: 6, padding: "2px 8px" }}>Soziales {r.social}/4</span>}
                  </div>
                )}
                {r.note && <div style={{ fontSize: 13, lineHeight: 1.5 }}>{r.note}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
