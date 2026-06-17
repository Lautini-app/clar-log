import { useEffect, useMemo, useState } from "react";
import type { DayLog, ObservationPeriod, Settings, WellbeingAnswer } from "@/lib/clar-storage";
import { WELLBEING_CATALOG } from "@/lib/clar-storage";
import { listObserverObservations } from "@/lib/clar-observers";

type Props = {
  settings: Settings;
  logs: DayLog[];
  ownerId: string;
};

const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function getWeekDays(weekOffset: number): string[] {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1 + weekOffset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function collectVal(log: DayLog | undefined, itemId: string): number | undefined {
  if (!log) return undefined;
  for (const slot of Object.values(log.slots ?? {})) {
    const ans = (slot as any).answers?.[itemId] as WellbeingAnswer | undefined;
    if (ans?.value !== undefined) return ans.value as number;
  }
  return undefined;
}

function collectMeds(log: DayLog | undefined): Array<{ name: string; time?: string; dose?: number; short: boolean }> {
  if (!log) return [];
  const result: Array<{ name: string; time?: string; dose?: number; short: boolean }> = [];
  for (const slot of Object.values(log.slots ?? {})) {
    const s = slot as any;
    if (!s.medsTaken) continue;
    for (const [medId, taken] of Object.entries(s.medsTaken ?? {})) {
      if (!taken) continue;
      const period = undefined as any;
      result.push({
        name: medId,
        time: s.medicationTime,
        dose: s.medsDose?.[medId],
        short: false,
      });
    }
  }
  return result;
}

function heatColor(val: number | undefined, invert = false): string {
  if (val === undefined) return "#f1efe8";
  const v = invert ? 5 - val : val;
  if (v >= 3.5) return "#9FE1CB";
  if (v >= 2.5) return "#FAC775";
  return "#F0997B";
}

function avg(vals: (number | undefined)[]): number | undefined {
  const v = vals.filter((x): x is number => x !== undefined);
  return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : undefined;
}

export function DossierView({ settings, logs, ownerId }: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [observations, setObservations] = useState<any[]>([]);
  const period = settings.periods?.[0];

  const days = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const weekLabel = `${new Date(days[0]).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${new Date(days[6]).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

  const dayLogs = useMemo(() => days.map(d => logs.find(l => l.date === d)), [days, logs]);

  useEffect(() => {
    if (!ownerId || !period?.id) return;
    listObserverObservations(ownerId, period.id).then(setObservations).catch(() => {});
  }, [ownerId, period?.id]);

  const weekObs = observations.filter(o => days.includes(o.date));

  const focusVals = dayLogs.map(l => collectVal(l, "focus"));
  const moodVals = dayLogs.map(l => collectVal(l, "base_mood"));
  const impVals = dayLogs.map(l => collectVal(l, "impulsivity"));
  const sleepVals = dayLogs.map(l => collectVal(l, "sleep_duration"));
  const energyVals = dayLogs.map(l => collectVal(l, "energy_level"));
  const reboundDays = dayLogs.map(l => collectVal(l, "rebound_today") === 1);
  const appetiteVals = dayLogs.map(l => collectVal(l, "appetite"));
  const headacheVals = dayLogs.map(l => collectVal(l, "headache"));
  const stomachVals = dayLogs.map(l => collectVal(l, "stomachache"));
  const tensionVals = dayLogs.map(l => collectVal(l, "tension"));

  const reboundCount = reboundDays.filter(Boolean).length;
  const avgFocus = avg(focusVals);
  const avgMood = avg(moodVals);
  const avgSleep = avg(sleepVals);

  const Cell = ({ val, invert = false }: { val?: number; invert?: boolean }) => (
    <div style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 30, height: 26, borderRadius: 4,
      background: val === undefined ? "var(--color-background-secondary)" : heatColor(val, invert),
      fontSize: 10, fontWeight: 500,
      color: val === undefined ? "var(--color-text-tertiary)" : "#1a1a1a",
    }}>
      {val === undefined ? "—" : val >= 3.5 ? "gut" : val >= 2.5 ? "mid" : "tief"}
    </div>
  );

  const ReboundCell = ({ active }: { active: boolean }) => (
    <div style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 30, height: 26, borderRadius: 4,
      background: active ? "#FCEBEB" : "var(--color-background-secondary)",
      fontSize: 9, fontWeight: 500,
      color: active ? "#A32D2D" : "var(--color-text-tertiary)",
    }}>
      {active ? "Reb." : "—"}
    </div>
  );

  const SideLabel = ({ children }: { children: string }) => (
    <td style={{ textAlign: "left", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6, whiteSpace: "nowrap" }}>
      {children}
    </td>
  );

  const NwRow = ({ label, vals, invert = false }: { label: string; vals: (number | undefined)[]; invert?: boolean }) => {
    const count = vals.filter(v => v !== undefined && (invert ? v <= 1.5 : v <= 1.5)).length;
    const total = vals.filter(v => v !== undefined).length;
    const color = count === 0 ? "#0F6E56" : count <= 1 ? "#854F0B" : "#A32D2D";
    return (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
        <span style={{ fontSize: 13 }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 500, color }}>{count === 0 ? `0 / ${total} Tagen` : `${count} / ${total} Tagen`}</span>
      </div>
    );
  };

  return (
    <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--color-text-primary)", padding: "1rem 0" }}>
      <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 2 }}>
        {period?.name ?? "Beobachtungsperiode"}
      </p>
      <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: "1.25rem" }}>
        {period?.medications?.map(m => `${m.name} ${m.mg}mg ${m.duration === "long" ? "Retard" : "Kurz"}`).join(" · ") ?? "Kein Medikament"} · Dossier
      </p>

      {/* Woche Navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <button onClick={() => setWeekOffset(w => w - 1)}
          style={{ background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", padding: "4px 12px", fontSize: 13, cursor: "pointer", color: "var(--color-text-primary)" }}>
          ← zurück
        </button>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{weekLabel}</span>
        <button onClick={() => setWeekOffset(w => Math.min(0, w + 1))}
          disabled={weekOffset >= 0}
          style={{ background: "none", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)", padding: "4px 12px", fontSize: 13, cursor: weekOffset >= 0 ? "default" : "pointer", color: "var(--color-text-primary)", opacity: weekOffset >= 0 ? 0.4 : 1 }}>
          vor →
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: "1.25rem" }}>
        {[
          { val: avgFocus, label: "Fokus (Ø)", color: avgFocus && avgFocus >= 3 ? "#0F6E56" : "#854F0B" },
          { val: avgMood, label: "Stimmung (Ø)", color: avgMood && avgMood >= 3 ? "#0F6E56" : "#854F0B" },
          { val: reboundCount, label: "Rebound (Woche)", color: reboundCount === 0 ? "#0F6E56" : reboundCount <= 2 ? "#854F0B" : "#A32D2D", suffix: "×" },
          { val: avgSleep, label: "Schlaf (Ø)", color: avgSleep && avgSleep >= 7 ? "#0F6E56" : "#854F0B", suffix: "h" },
        ].map(({ val, label, color, suffix }) => (
          <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "10px 12px" }}>
            <div style={{ fontSize: 22, fontWeight: 500, color }}>{val ?? "—"}{suffix ?? "/4"}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Heatmap */}
      <div style={{ marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 8 }}>Tagesverlauf</p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ width: 86 }} />
              {DAYS.map(d => <th key={d} style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textAlign: "center", padding: "3px 1px" }}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr><SideLabel>Fokus</SideLabel>{focusVals.map((v, i) => <td key={i} style={{ textAlign: "center", padding: "2px 1px" }}><Cell val={v} /></td>)}</tr>
            <tr><SideLabel>Stimmung</SideLabel>{moodVals.map((v, i) => <td key={i} style={{ textAlign: "center", padding: "2px 1px" }}><Cell val={v} /></td>)}</tr>
            <tr><SideLabel>Impulsivität</SideLabel>{impVals.map((v, i) => <td key={i} style={{ textAlign: "center", padding: "2px 1px" }}><Cell val={v} invert /></td>)}</tr>
            <tr><SideLabel>Rebound</SideLabel>{reboundDays.map((v, i) => <td key={i} style={{ textAlign: "center", padding: "2px 1px" }}><ReboundCell active={v} /></td>)}</tr>
          </tbody>
        </table>
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Medikamenten-Einnahme */}
      <div style={{ marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 8 }}>Medikamenten-Einnahme</p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ width: 86 }} />
              {DAYS.map(d => <th key={d} style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-secondary)", textAlign: "center", padding: "3px 1px" }}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {period?.medications?.map(med => (
              <tr key={med.id}>
                <td style={{ textAlign: "left", fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6 }}>
                  {med.name}<br/><span style={{ fontSize: 10, fontWeight: 400 }}>{med.duration === "long" ? "Retard" : "Kurz"}</span>
                </td>
                {dayLogs.map((log, i) => {
                  const slot = log ? Object.values(log.slots ?? {}).find((s: any) => (s.medsTaken ?? {})[med.id]) as any : null;
                  const time = slot?.medicationTime ?? slot?.medsDose?.[med.id] ? slot?.medicationTime : undefined;
                  const dose = slot?.medsDose?.[med.id];
                  return (
                    <td key={i} style={{ textAlign: "center", padding: "2px 1px" }}>
                      {slot ? (
                        <div style={{ fontSize: 10, fontWeight: 500, color: "#0F6E56", lineHeight: 1.3 }}>
                          {time ?? "✓"}{dose ? <><br/>{dose}mg</> : null}
                        </div>
                      ) : <span style={{ fontSize: 11, color: "var(--color-text-tertiary)" }}>—</span>}
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
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 8 }}>Schlaf</p>
        {sleepVals.map((val, i) => val !== undefined ? (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", width: 22 }}>{DAYS[i]}</span>
            <div style={{ flex: 1, background: "var(--color-background-secondary)", borderRadius: 3, height: 12, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: "#378ADD", width: `${Math.min(100, (val / 10) * 100)}%` }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, width: 28, textAlign: "right", color: val >= 7 ? "#0F6E56" : val >= 6 ? "#854F0B" : "#A32D2D" }}>{val}h</span>
          </div>
        ) : null)}
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Essen & Körper */}
      <div style={{ marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 8 }}>Essen & körperliche Beschwerden</p>
        {[
          { label: "Appetit reduziert", vals: appetiteVals, invert: true },
          { label: "Kopfschmerzen", vals: headacheVals, invert: false },
          { label: "Bauchschmerzen", vals: stomachVals, invert: false },
          { label: "Verspannungen", vals: tensionVals, invert: false },
        ].map(({ label, vals, invert }) => {
          const reported = vals.filter(v => v === 1).length;
          const total = vals.filter(v => v !== undefined).length;
          const color = reported === 0 ? "#0F6E56" : reported <= 1 ? "#854F0B" : "#A32D2D";
          return (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              <span style={{ fontSize: 13 }}>{label}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color }}>{reported} / {total} Tagen</span>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Beobachter */}
      <div style={{ marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, letterSpacing: ".04em", textTransform: "uppercase", marginBottom: 8 }}>Rückmeldung Beobachter</p>
        {weekObs.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Keine Beobachtungen diese Woche.</p>
        ) : weekObs.map(o => (
          <div key={o.id} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "10px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 4 }}>
              {o.observerName ?? "Beobachter"} · {new Date(o.date).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: o.note ? 8 : 0 }}>
              {o.mood !== undefined && <span style={{ fontSize: 12 }}>Stimmung: <strong>{o.mood}/4</strong></span>}
              {o.behavior !== undefined && <span style={{ fontSize: 12 }}>Verhalten: <strong>{o.behavior}/4</strong></span>}
              {o.concentration !== undefined && <span style={{ fontSize: 12 }}>Konzentration: <strong>{o.concentration}/4</strong></span>}
            </div>
            {o.note && <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>{o.note}</div>}
          </div>
        ))}
      </div>

    </div>
  );
}
