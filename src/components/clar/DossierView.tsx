import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DayLog, Medication, Settings, WellbeingAnswer } from "@/lib/clar-storage";
import { listObserverObservations } from "@/lib/clar-observers";

type Props = {
  settings: Settings;
  logs: DayLog[];
  ownerId: string;
  teenLogGroups?: Map<string, DayLog[]>;
};
const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const EMOTIONS_NEG = new Set(["Verzweifelt","Traurig","Melancholisch","Ängstlich","Wütend","Aufgewühlt"]);
const SLOT_LABELS: Record<string, string> = { morning: "Morgen", midday: "Mittag", evening: "Abend" };

// ─── helpers ────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekDays(offset: number): string[] {
  const now = new Date();
  const day = now.getDay() || 7;
  const mon = new Date(now);
  mon.setDate(now.getDate() - day + 1 + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return localDateStr(d);
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

function slotVal(log: DayLog | undefined, id: string, slotName: "morning" | "midday" | "evening"): number | undefined {
  if (!log) return undefined;
  const s = (log.slots as any)?.[slotName];
  const ans = s?.answers?.[id] as WellbeingAnswer | undefined;
  return ans?.value !== undefined ? (ans.value as number) : undefined;
}

function slotAnswer(log: DayLog | undefined, id: string, slotName: "morning" | "midday" | "evening"): unknown {
  if (!log) return undefined;
  const s = (log.slots as any)?.[slotName];
  const ans = s?.answers?.[id] as WellbeingAnswer | undefined;
  return ans?.value;
}

function collectEmotions(log: DayLog | undefined): Record<string, number> | undefined {
  if (!log) return undefined;
  for (const slot of Object.values(log.slots ?? {})) {
    const ans = (slot as any).answers?.["emotions"] as WellbeingAnswer | undefined;
    if (ans?.value && typeof ans.value === "object" && !Array.isArray(ans.value))
      return ans.value as unknown as Record<string, number>;
  }
  return undefined;
}

function moodScore(log: DayLog | undefined): number | undefined {
  const emo = collectEmotions(log);
  if (!emo) return collectVal(log, "base_mood");
  const entries = Object.entries(emo);
  if (!entries.length) return undefined;
  const scored = entries.map(([k, v]) => EMOTIONS_NEG.has(k) ? 5 - v : v);
  return Math.round(scored.reduce((a, b) => a + b, 0) / scored.length * 10) / 10;
}

function heatBg(val: number | undefined, invert = false) {
  if (val === undefined) return "var(--color-background-secondary)";
  if (invert) return val >= 3.5 ? "#FCEBEB" : val >= 2.5 ? "#FAEEDA" : "#E1F5EE";
  return val >= 3.5 ? "#E1F5EE" : val >= 2.5 ? "#FAEEDA" : "#FCEBEB";
}

function heatColor(val: number | undefined, invert = false) {
  if (val === undefined) return "var(--color-text-tertiary)";
  if (invert) return val >= 3.5 ? "#A32D2D" : val >= 2.5 ? "#854F0B" : "#0F6E56";
  return val >= 3.5 ? "#0F6E56" : val >= 2.5 ? "#854F0B" : "#A32D2D";
}

function avg(vals: (number | undefined)[]): number | undefined {
  const v = vals.filter((x): x is number => x !== undefined);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : undefined;
}

function energyStyle(val: unknown): { bg: string; color: string; label: string } | null {
  if (val === undefined || val === null) return null;
  if (val === "high") return { bg: "#E1F5EE", color: "#0F6E56", label: "hoch" };
  if (val === "mid")  return { bg: "#FAEEDA", color: "#854F0B", label: "mittel" };
  if (val === "low")  return { bg: "#FCEBEB", color: "#A32D2D", label: "tief" };
  const n = typeof val === "number" ? val : parseFloat(String(val));
  if (isNaN(n)) return null;
  const bg    = n >= 3.5 ? "#E1F5EE" : n >= 2.5 ? "#FAEEDA" : "#FCEBEB";
  const color = n >= 3.5 ? "#0F6E56" : n >= 2.5 ? "#854F0B" : "#A32D2D";
  return { bg, color, label: String(n) };
}

const isTruthy = (v: unknown) => v === true || v === 1;

function obsAvg(o: any): number | undefined {
  const vals: number[] = [];
  const ans = ((o?.answers) ?? {}) as Record<string, unknown>;
  [ans.home_mood, ans.home_cooperation, ans.home_emotional_regulation, ans.home_focus_homework, ans.home_bedtime_routine]
    .forEach(v => { if (v !== undefined && v !== null) vals.push(Number(v)); });
  if (!vals.length)
    [o?.mood, o?.behavior, o?.concentration]
      .forEach(v => { if (v !== undefined && v !== null) vals.push(Number(v)); });
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : undefined;
}

// ─── shared UI atoms ─────────────────────────────────────────────────────────

function CellBtn({ val, invert = false, label, onClick }: { val?: number; invert?: boolean; label?: string; onClick?: () => void }) {
  const bg    = heatBg(val, invert);
  const color = heatColor(val, invert);
  const text  = val === undefined ? "—"
    : invert ? (val >= 3.5 ? "hoch" : val >= 2.5 ? "mid" : "tief")
             : (val >= 3.5 ? "gut"  : val >= 2.5 ? "mid" : "tief");
  return (
    <div onClick={onClick} title={label} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: 30, height: 26, borderRadius: 4, background: bg, color,
      fontSize: 10, fontWeight: 500, cursor: onClick ? "pointer" : "default",
    }}>
      {text}
    </div>
  );
}

function Bdg({ label, sub, bg, color }: { label: string; sub?: string; bg: string; color: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "baseline", gap: 3,
      background: bg, color, borderRadius: 20, padding: "5px 11px",
      fontSize: 13, fontWeight: 600, lineHeight: 1.2, whiteSpace: "nowrap",
    }}>
      {label}
      {sub && <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.75 }}>{sub}</span>}
    </span>
  );
}

function DayHdr({ day, di }: { day: string; di: number }) {
  return (
    <div style={{ fontSize: 11, color: "#6B7280", fontWeight: 600, letterSpacing: ".02em", marginBottom: 8 }}>
      {DAYS[di]} · {new Date(day).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
    </div>
  );
}

function numBdg(val: number | undefined, invert = false, suffix = "") {
  if (val === undefined) return null;
  return <Bdg label={`${val}${suffix}`} bg={heatBg(val, invert)} color={heatColor(val, invert)} />;
}

// ─── types ───────────────────────────────────────────────────────────────────

type DetailPanel = {
  title: string;
  days: string[];
  dayLogs: (DayLog | undefined)[];
  type:
    | "emotions"
    | "focus_detail"
    | "distract_detail"
    | "hyperfocus_detail"
    | "medication_detail"
    | "school"
    | "body"
    | "food"
    | "rebound"
    | "sleep"
    | "energy"
    | "observer_detail"
    | "teacher_detail";
  medications?: Medication[];
  observerObs?: any[];
};

// ─── DetailView ───────────────────────────────────────────────────────────────

function DetailView({ panel, onClose }: { panel: DetailPanel; onClose: () => void }) {
  const EMOTION_LABELS: Record<string, string> = {
    "Verzweifelt": "😰", "Traurig": "😢", "Melancholisch": "😔", "Ängstlich": "😟",
    "Wütend": "😡", "Ich fühle gar nichts": "😶",
    "Ruhig und okay": "😌", "Ausgeglichen": "😊", "Froh / glücklich": "😄",
    "Aufgeregt": "🤩", "Euphorisch": "🥳",
  };

  const dayRow = (content: ReactNode, day: string, di: number) => (
    <div key={day} style={{ padding: "12px 0", borderBottom: "1px solid #F0F0F0" }}>
      <DayHdr day={day} di={di} />
      {content ?? <span style={{ fontSize: 13, color: "#9CA3AF" }}>Keine Daten</span>}
    </div>
  );

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "flex-end" }}
      onClick={onClose}
    >
      <div
        style={{
          position: "relative", background: "#FFFFFF",
          borderRadius: "20px 20px 0 0", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)",
          width: "100%", minHeight: "50vh", maxHeight: "85vh", overflowY: "auto",
          padding: "1.25rem",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Grip */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ height: 4, width: 40, background: "#D1D5DB", borderRadius: 2 }} />
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6B7280", lineHeight: 1, padding: 4 }}
        >×</button>

        {/* Title */}
        <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, paddingRight: 40, color: "#111827" }}>
          {panel.title}
        </p>

        {/* ── emotions ── */}
        {panel.type === "emotions" && (
          <div>
            {panel.days.map((day, di) => {
              const emo = collectEmotions(panel.dayLogs[di]);
              const entries = emo ? Object.entries(emo).filter(([, v]) => (v as number) > 1) : [];
              return dayRow(
                entries.length > 0
                  ? <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {entries.map(([emotion, val]) => {
                        const isNeg = EMOTIONS_NEG.has(emotion);
                        const intensity = val as number;
                        const bg    = isNeg ? (intensity >= 3 ? "#FCEBEB" : "#FAEEDA") : (intensity >= 3 ? "#E1F5EE" : "#FAEEDA");
                        const color = isNeg ? (intensity >= 3 ? "#A32D2D" : "#854F0B") : (intensity >= 3 ? "#0F6E56" : "#854F0B");
                        return <Bdg key={emotion} label={`${EMOTION_LABELS[emotion] ?? ""} ${emotion}`} sub={`${intensity}/4`} bg={bg} color={color} />;
                      })}
                    </div>
                  : null,
                day, di,
              );
            })}
          </div>
        )}

        {/* ── focus_detail ── */}
        {panel.type === "focus_detail" && (
          <div>
            {panel.days.map((day, di) => {
              const log = panel.dayLogs[di];
              const rows: ReactNode[] = [];
              (["morning", "midday"] as const).forEach(s => {
                const fokus = slotVal(log, "focus", s);
                const imp   = slotVal(log, "impulsivity", s);
                if (fokus === undefined && imp === undefined) return;
                rows.push(
                  <div key={s} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "#9CA3AF", minWidth: 44 }}>{SLOT_LABELS[s]}</span>
                    {fokus !== undefined && <><span style={{ fontSize: 11, color: "#6B7280" }}>Fokus</span>{numBdg(fokus)}</>}
                    {imp   !== undefined && <><span style={{ fontSize: 11, color: "#6B7280" }}>Impuls.</span>{numBdg(imp, true)}</>}
                  </div>
                );
              });
              const thought = collectVal(log, "thought_racing");
              if (thought !== undefined)
                rows.push(
                  <div key="thought" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: "#9CA3AF", minWidth: 44 }}>Gedanken</span>
                    {numBdg(thought, true)}
                  </div>
                );
              return dayRow(rows.length > 0 ? <div>{rows}</div> : null, day, di);
            })}
          </div>
        )}

        {/* ── distract_detail ── */}
        {panel.type === "distract_detail" && (
          <div>
            {panel.days.map((day, di) => {
              const log = panel.dayLogs[di];
              const morV = slotVal(log, "distractibility", "morning");
              const midV = slotVal(log, "distractibility", "midday");
              const hasData = morV !== undefined || midV !== undefined;
              return dayRow(
                hasData
                  ? <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {morV !== undefined && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "#9CA3AF", minWidth: 44 }}>Morgen</span>
                          {numBdg(morV, true)}
                        </div>
                      )}
                      {midV !== undefined && (
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: "#9CA3AF", minWidth: 44 }}>Mittag</span>
                          {numBdg(midV, true)}
                        </div>
                      )}
                    </div>
                  : null,
                day, di,
              );
            })}
          </div>
        )}

        {/* ── hyperfocus_detail ── */}
        {panel.type === "hyperfocus_detail" && (() => {
          const anyFocus = panel.dayLogs.some(log =>
            (["morning","midday","evening"] as const).some(s => isTruthy(slotAnswer(log, "hyperfocus", s)))
          );
          if (!anyFocus)
            return <p style={{ fontSize: 14, color: "#6B7280" }}>Kein Hyperfokus in dieser Woche.</p>;
          return (
            <div>
              {panel.days.map((day, di) => {
                const log = panel.dayLogs[di];
                const slots = (["morning","midday","evening"] as const).filter(s => isTruthy(slotAnswer(log, "hyperfocus", s)));
                if (slots.length === 0) return null;
                return (
                  <div key={day} style={{ padding: "12px 0", borderBottom: "1px solid #F0F0F0" }}>
                    <DayHdr day={day} di={di} />
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {slots.map(s => <Bdg key={s} label="Hyperfokus" sub={SLOT_LABELS[s]} bg="#E8DFFF" color="#6B21A8" />)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── medication_detail ── */}
        {panel.type === "medication_detail" && (
          <div>
            {panel.days.map((day, di) => {
              const log = panel.dayLogs[di];
              return (
                <div key={day} style={{ padding: "12px 0", borderBottom: "1px solid #F0F0F0" }}>
                  <DayHdr day={day} di={di} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(panel.medications ?? []).map(med => {
                      const slotData = (log?.slots as any)?.[med.intakeSlot ?? "morning"];
                      const taken = slotData?.medsTaken?.[med.id] ?? false;
                      const time  = slotData?.medicationTime as string | undefined;
                      const dose  = slotData?.medsDose?.[med.id] as number | undefined;
                      return (
                        <div key={med.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 12, color: "#6B7280", minWidth: 88 }}>
                            {med.name} {med.duration === "long" ? "Retard" : "Kurz"}
                          </span>
                          {taken
                            ? <Bdg label={time ?? "✓"} sub={dose ? `${dose}mg` : undefined} bg="#E1F5EE" color="#0F6E56" />
                            : <Bdg label="nicht genommen" bg="#FCEBEB" color="#A32D2D" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── school ── */}
        {panel.type === "school" && (
          <div>
            {panel.days.map((day, di) => {
              const log = panel.dayLogs[di];
              const perf     = collectVal(log, "school_performance");
              const social   = collectVal(log, "school_social");
              const conflict = collectAnswer(log, "school_conflicts");
              if (perf === undefined && social === undefined) return null;
              return dayRow(
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {perf   !== undefined && <><span style={{ fontSize: 11, color: "#6B7280", alignSelf: "center" }}>Leistung</span>{numBdg(perf)}</>}
                  {social !== undefined && <><span style={{ fontSize: 11, color: "#6B7280", alignSelf: "center" }}>Soziales</span>{numBdg(social)}</>}
                  {isTruthy(conflict) && <Bdg label="Konflikt" bg="#FCEBEB" color="#A32D2D" />}
                </div>,
                day, di,
              );
            })}
          </div>
        )}

        {/* ── body ── */}
        {panel.type === "body" && (
          <div>
            {(["headache","stomachache","tension","heart_racing","chest_tightness","dry_mouth","tics"] as const).map(id => {
              const labelMap: Record<string, string> = {
                headache: "Kopfschmerzen", stomachache: "Bauchschmerzen", tension: "Verspannungen",
                heart_racing: "Herzrasen", chest_tightness: "Engegefühl", dry_mouth: "Mundtrockenheit", tics: "Tics",
              };
              const vals  = panel.dayLogs.map(l => collectAnswer(l, id));
              const total = vals.filter(v => v !== undefined).length;
              if (total === 0) return null;
              const count = vals.filter(isTruthy).length;
              const summaryColor = count === 0 ? "#0F6E56" : count <= 1 ? "#854F0B" : "#A32D2D";
              return (
                <div key={id} style={{ padding: "10px 0", borderBottom: "1px solid #F0F0F0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>{labelMap[id]}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: summaryColor }}>{count}/{total} Tagen</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {panel.days.map((_, dj) => {
                      const v = vals[dj];
                      const active = isTruthy(v);
                      return (
                        <span key={dj} style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 30, height: 24, borderRadius: 4, fontSize: 10, fontWeight: 500,
                          background: v === undefined ? "#F3F4F6" : active ? "#FCEBEB" : "#E1F5EE",
                          color:      v === undefined ? "#9CA3AF"  : active ? "#A32D2D" : "#0F6E56",
                        }}>
                          {v === undefined ? "—" : active ? "ja" : "nein"}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── food ── */}
        {panel.type === "food" && (
          <div>
            {panel.days.map((day, di) => {
              const log       = panel.dayLogs[di];
              const hunger    = slotVal(log, "meal_hunger", "midday");
              const appetite  = slotVal(log, "meal_appetite", "morning") ?? slotVal(log, "meal_appetite", "midday");
              const meals     = slotVal(log, "meals_today", "evening");
              const brkfast   = slotAnswer(log, "ate", "morning");
              const hasData   = [hunger, appetite, meals].some(v => v !== undefined) || brkfast !== undefined;
              return dayRow(
                hasData
                  ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {hunger   !== undefined && <><span style={{ fontSize: 11, color: "#6B7280" }}>Hunger</span>{numBdg(hunger, true)}</>}
                      {appetite !== undefined && <><span style={{ fontSize: 11, color: "#6B7280" }}>Appetit</span>{numBdg(appetite, true)}</>}
                      {meals    !== undefined && (
                        <><span style={{ fontSize: 11, color: "#6B7280" }}>Mahlzeiten</span>
                        <Bdg
                          label={`${meals}`}
                          bg={meals >= 3 ? "#E1F5EE" : meals >= 2 ? "#FAEEDA" : "#FCEBEB"}
                          color={meals >= 3 ? "#0F6E56" : meals >= 2 ? "#854F0B" : "#A32D2D"}
                        /></>
                      )}
                      {brkfast !== undefined && (
                        <Bdg
                          label={isTruthy(brkfast) ? "gefrühstückt" : "kein Frühstück"}
                          bg={isTruthy(brkfast) ? "#E1F5EE" : "#FCEBEB"}
                          color={isTruthy(brkfast) ? "#0F6E56" : "#A32D2D"}
                        />
                      )}
                    </div>
                  : null,
                day, di,
              );
            })}
          </div>
        )}

        {/* ── rebound ── */}
        {panel.type === "rebound" && (() => {
          const anyRebound = panel.dayLogs.some(l => isTruthy(collectAnswer(l, "rebound_today")));
          if (!anyRebound)
            return <p style={{ fontSize: 14, color: "#6B7280" }}>Kein Rebound in dieser Woche.</p>;
          return (
            <div>
              {panel.days.map((day, di) => {
                const log = panel.dayLogs[di];
                if (!isTruthy(collectAnswer(log, "rebound_today"))) return null;
                const timeStr = String(collectAnswer(log, "rebound_time") ?? "");
                const typeStr = String(collectAnswer(log, "rebound_type") ?? "");
                const intA    = collectVal(log, "rebound_intensity");
                const durA    = collectVal(log, "rebound_duration");
                return (
                  <div key={day} style={{ padding: "12px 0", borderBottom: "1px solid #F0F0F0" }}>
                    <DayHdr day={day} di={di} />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {timeStr && <Bdg label={`⏰ ${timeStr}`} bg="#FAEEDA" color="#854F0B" />}
                      {typeStr && <Bdg label={typeStr} bg="#FCEBEB" color="#A32D2D" />}
                      {intA !== undefined && (
                        <Bdg label={`Stärke ${intA}/5`} bg={intA >= 3 ? "#FCEBEB" : "#FAEEDA"} color={intA >= 3 ? "#A32D2D" : "#854F0B"} />
                      )}
                      {durA !== undefined && <Bdg label={`${durA} min`} bg="#F3F4F6" color="#374151" />}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── sleep ── */}
        {panel.type === "sleep" && (
          <div>
            {panel.days.map((day, di) => {
              const log      = panel.dayLogs[di];
              const dur      = collectVal(log, "sleep_duration");
              const latency  = collectVal(log, "sleep_latency");
              const through  = slotAnswer(log, "sleep_through", "morning");
              const recovery = collectVal(log, "sleep_recovery");
              const hasData  = [dur, latency, recovery].some(v => v !== undefined) || through !== undefined;
              return dayRow(
                hasData
                  ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      {dur !== undefined && (
                        <Bdg
                          label={`${dur}h`} sub="Dauer"
                          bg={dur >= 8 ? "#E1F5EE" : dur >= 6.5 ? "#FAEEDA" : "#FCEBEB"}
                          color={dur >= 8 ? "#0F6E56" : dur >= 6.5 ? "#854F0B" : "#A32D2D"}
                        />
                      )}
                      {latency !== undefined && (
                        <Bdg
                          label={`${latency}min`} sub="Einschlafen"
                          bg={latency <= 20 ? "#E1F5EE" : latency <= 40 ? "#FAEEDA" : "#FCEBEB"}
                          color={latency <= 20 ? "#0F6E56" : latency <= 40 ? "#854F0B" : "#A32D2D"}
                        />
                      )}
                      {through !== undefined && (
                        <Bdg
                          label={isTruthy(through) ? "durchgeschlafen" : "aufgewacht"}
                          bg={isTruthy(through) ? "#E1F5EE" : "#FAEEDA"}
                          color={isTruthy(through) ? "#0F6E56" : "#854F0B"}
                        />
                      )}
                      {recovery !== undefined && numBdg(recovery)}
                    </div>
                  : null,
                day, di,
              );
            })}
          </div>
        )}

        {/* ── energy ── */}
        {panel.type === "energy" && (
          <div>
            {panel.days.map((day, di) => {
              const log = panel.dayLogs[di];
              const badges = (["morning","midday","evening"] as const)
                .map(s => ({ s, style: energyStyle(slotAnswer(log, "energy_level", s)) }))
                .filter(x => x.style !== null) as { s: string; style: { bg: string; color: string; label: string } }[];
              return dayRow(
                badges.length > 0
                  ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {badges.map(({ s, style }) => (
                        <Bdg key={s} label={style.label} sub={SLOT_LABELS[s]} bg={style.bg} color={style.color} />
                      ))}
                    </div>
                  : null,
                day, di,
              );
            })}
          </div>
        )}

        {/* ── observer_detail ── */}
        {panel.type === "observer_detail" && (
          <div>
            {panel.days.map((day, di) => {
              const o = (panel.observerObs ?? []).find((x: any) => x.date === day);
              const ans = ((o?.answers) ?? {}) as Record<string, unknown>;
              const fields: { label: string; val: number | undefined }[] = [
                { label: "Stimmung",           val: ans.home_mood                !== undefined ? Number(ans.home_mood)                : o?.mood },
                { label: "Kooperation",        val: ans.home_cooperation         !== undefined ? Number(ans.home_cooperation)         : o?.behavior },
                { label: "Emotionsregulation", val: ans.home_emotional_regulation !== undefined ? Number(ans.home_emotional_regulation) : undefined },
                { label: "Fokus / Hausaufg.",  val: ans.home_focus_homework      !== undefined ? Number(ans.home_focus_homework)      : o?.concentration },
                { label: "Abendroutine",       val: ans.home_bedtime_routine     !== undefined ? Number(ans.home_bedtime_routine)     : undefined },
              ];
              const hasRebound = ans.home_rebound_observed !== undefined;
              const reboundVal = ans.home_rebound_observed === true || ans.home_rebound_observed === "true";
              const note = o?.note ?? (typeof ans.note === "string" ? ans.note : undefined);
              const hasData = fields.some(f => f.val !== undefined) || hasRebound;
              return dayRow(
                hasData
                  ? <div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {fields.filter(f => f.val !== undefined).map(f => (
                          <Bdg key={f.label} label={`${f.val}/5`} sub={f.label} bg={heatBg(f.val)} color={heatColor(f.val)} />
                        ))}
                        {hasRebound && (
                          <Bdg
                            label={reboundVal ? "Rebound: Ja" : "Rebound: Nein"}
                            bg={reboundVal ? "#FCEBEB" : "#E1F5EE"}
                            color={reboundVal ? "#A32D2D" : "#0F6E56"}
                          />
                        )}
                      </div>
                      {note && <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.5, marginTop: 8 }}>{note}</p>}
                    </div>
                  : null,
                day, di,
              );
            })}
          </div>
        )}

        {/* ── teacher_detail ── */}
        {panel.type === "teacher_detail" && (
          <div>
            {(panel.observerObs ?? []).map((r: any, i: number) => {
              const mood          = r.mood          ?? r.answers?.mood;
              const behavior      = r.behavior      ?? r.answers?.behavior;
              const concentration = r.concentration ?? r.answers?.concentration;
              const note          = r.note          ?? r.answers?.note;
              const dateStr       = r.date ?? r.createdAt;
              return (
                <div key={i} style={{ padding: "12px 0", borderBottom: "1px solid #F0F0F0" }}>
                  <div style={{ fontSize: 11, color: "#6B7280", marginBottom: 8, fontWeight: 600 }}>
                    {r.observerName ?? r.teacherName ?? r.name ?? "Fachperson"}
                    {dateStr ? ` · ${new Date(dateStr).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "2-digit" })}` : ""}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {mood         !== undefined && <Bdg label={`${mood}/5`}         sub="Stimmung"     bg={heatBg(mood)}         color={heatColor(mood)} />}
                    {behavior     !== undefined && <Bdg label={`${behavior}/5`}     sub="Verhalten"    bg={heatBg(behavior)}     color={heatColor(behavior)} />}
                    {concentration !== undefined && <Bdg label={`${concentration}/5`} sub="Konzentration" bg={heatBg(concentration)} color={heatColor(concentration)} />}
                    {r.focus_morning   && <Bdg label={`${r.focus_morning}/4`}   sub="Fokus Vm."  bg={heatBg(r.focus_morning * 1.25)}   color={heatColor(r.focus_morning * 1.25)} />}
                    {r.focus_afternoon && <Bdg label={`${r.focus_afternoon}/4`} sub="Fokus Nm."  bg={heatBg(r.focus_afternoon * 1.25)} color={heatColor(r.focus_afternoon * 1.25)} />}
                    {r.social          && <Bdg label={`${r.social}/4`}          sub="Soziales"   bg={heatBg(r.social * 1.25)}          color={heatColor(r.social * 1.25)} />}
                  </div>
                  {note && <p style={{ fontSize: 13, color: "#374151", lineHeight: 1.5, marginTop: 8 }}>{note}</p>}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

// ─── DossierView ──────────────────────────────────────────────────────────────

export function DossierView({ settings, logs, ownerId, teenLogGroups }: Props) {
  const [weekOffset, setWeekOffset]     = useState(0);
  const [observations, setObservations] = useState<any[]>([]);
  const [teacherReports, setTeacherReports] = useState<any[]>([]);
  const [detail, setDetail]             = useState<DetailPanel | null>(null);
  const period = settings?.periods?.find(p => p.id === settings?.activePeriodId) ?? settings?.periods?.[0];

  const days     = useMemo(() => getWeekDays(weekOffset), [weekOffset]);
  const weekLabel = `${new Date(days[0]).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${new Date(days[6]).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  const dayLogs  = useMemo(() => days.map(d => logs.find(l => l.date === d)), [days, logs]);

  useEffect(() => {
    if (!ownerId || !period?.id) return;
    listObserverObservations(ownerId, period.id).then(setObservations).catch(() => {});
    const tr = (logs as any[]).filter(l => l.__teacherReport);
    if (tr.length) setTeacherReports(tr);
  }, [ownerId, period?.id, logs]);

  useEffect(() => {
    const imported = (settings as any)?._imported;
    if (imported?.observer_observations) setObservations(imported.observer_observations);
    if (imported?.teacher_reports) setTeacherReports(imported.teacher_reports);
  }, [settings]);

  const weekObs      = observations.filter(o => days.includes(o.date));
  const weekTeacher  = teacherReports.filter(() => days.some(d => d >= days[0] && d <= days[6]));
  // Home observations: either answers JSONB has home_* keys, or the row has direct home_* columns.
  const isHomeObs = (o: any) => {
    const ans = o?.answers ?? {};
    return (
      Object.keys(ans as Record<string, unknown>).some((k: string) => k.startsWith("home_")) ||
      o?.home_mood !== undefined ||
      o?.home_cooperation !== undefined
    );
  };
  const partnerWeekObs = weekObs.filter(isHomeObs);
  const teacherWeekObs = weekObs.filter((o: any) => !isHomeObs(o));
  const partnerGroups  = new Map<string, any[]>();
  partnerWeekObs.forEach(o => {
    const k = String(o.observerName ?? o.observerUserId ?? "Beobachter");
    if (!partnerGroups.has(k)) partnerGroups.set(k, []);
    partnerGroups.get(k)!.push(o);
  });
  const allTeacherEntries = [
    ...teacherWeekObs,
    ...(weekTeacher.length > 0 ? weekTeacher : teacherReports),
  ];
  const teacherGroups = new Map<string, any[]>();
  allTeacherEntries.forEach(r => {
    const k = String(r.observerName ?? r.teacherName ?? r.name ?? "Lehrperson");
    if (!teacherGroups.has(k)) teacherGroups.set(k, []);
    teacherGroups.get(k)!.push(r);
  });

  const moodVals      = dayLogs.map(moodScore);
  const focusVals     = dayLogs.map(l => collectVal(l, "focus"));
  const distractVals  = dayLogs.map(l => collectVal(l, "distractibility"));
  const impVals       = dayLogs.map(l => collectVal(l, "impulsivity"));
  const hyperfocusVals = dayLogs.map(l => collectVal(l, "hyperfocus"));
  const energyVals    = dayLogs.map(l => collectVal(l, "energy_level"));
  const sleepVals     = dayLogs.map(l => collectVal(l, "sleep_duration"));
  const reboundDays   = dayLogs.map(l => isTruthy(collectAnswer(l, "rebound_today")));
  const reboundCount  = reboundDays.filter(Boolean).length;

  const open = (title: string, type: DetailPanel["type"], extra?: Partial<Pick<DetailPanel, "medications" | "observerObs">>) =>
    setDetail({ title, days, dayLogs, type, ...extra });

  const HmRow = ({ label, vals, invert = false, detailType }: {
    label: string; vals: (number|undefined)[]; invert?: boolean; detailType?: DetailPanel["type"];
  }) => (
    <tr
      onClick={detailType ? () => open(label, detailType) : undefined}
      style={{ cursor: detailType ? "pointer" : "default", background: "transparent" }}
      onMouseEnter={detailType ? e => { e.currentTarget.style.background = "var(--color-background-secondary)"; } : undefined}
      onMouseLeave={detailType ? e => { e.currentTarget.style.background = "transparent"; } : undefined}
    >
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

      {/* Week navigation */}
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
          { val: avg(focusVals),  label: "Fokus (Ø)",       suf: "/5", col: (avg(focusVals) ?? 0) >= 3 ? "#0F6E56" : "#854F0B" },
          { val: avg(moodVals),   label: "Stimmung (Ø)",    suf: "/5", col: (avg(moodVals)  ?? 0) >= 3 ? "#0F6E56" : "#854F0B" },
          { val: reboundCount,    label: "Rebound (Woche)", suf: "×",  col: reboundCount === 0 ? "#0F6E56" : reboundCount <= 2 ? "#854F0B" : "#A32D2D" },
          { val: avg(sleepVals),  label: "Schlaf (Ø)",      suf: "h",  col: (avg(sleepVals) ?? 0) >= 7 ? "#0F6E56" : "#854F0B" },
        ].map(({ val, label, suf, col }) => (
          <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: 8, padding: "10px 12px" }}>
            <div style={{ fontSize: 22, fontWeight: 500, color: col }}>{val ?? "—"}<span style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>{suf}</span></div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Heatmap */}
      <div style={{ marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
          Tagesverlauf <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none" }}>— tippen für Details</span>
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ width: 90 }} />
              {DAYS.map(d => <th key={d} style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", textAlign: "center", padding: "3px 1px", minWidth: 36 }}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            <HmRow label="Energie"     vals={energyVals}   detailType="energy" />
            <HmRow label="Stimmung"    vals={moodVals}      detailType="emotions" />
            <HmRow label="Fokus"       vals={focusVals}     detailType="focus_detail" />
            <HmRow label="Ablenkung"   vals={distractVals}  invert detailType="distract_detail" />
            <HmRow label="Impulsivität" vals={impVals}      invert detailType="focus_detail" />

            {/* Hyperfokus row — klickbar */}
            <tr
              style={{ cursor: "pointer", background: "transparent" }}
              onClick={() => open("Hyperfokus", "hyperfocus_detail")}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--color-background-secondary)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <td style={{ textAlign: "left", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6, whiteSpace: "nowrap" }}>
                Hyperfokus <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>›</span>
              </td>
              {hyperfocusVals.map((v, i) => (
                <td key={i} style={{ textAlign: "center", padding: "2px 1px" }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 30, height: 26, borderRadius: 4,
                    background: isTruthy(v) ? "#E8DFFF" : "var(--color-background-secondary)",
                    fontSize: 9, fontWeight: 500,
                    color: isTruthy(v) ? "#6B21A8" : "var(--color-text-tertiary)",
                  }}>
                    {isTruthy(v) ? "ja" : "—"}
                  </div>
                </td>
              ))}
            </tr>

            {/* Rebound row */}
            <tr
              style={{ cursor: "pointer", background: "transparent" }}
              onClick={() => open("Rebound", "rebound")}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--color-background-secondary)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <td style={{ textAlign: "left", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6, whiteSpace: "nowrap" }}>
                Rebound <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>›</span>
              </td>
              {reboundDays.map((v, i) => (
                <td key={i} style={{ textAlign: "center", padding: "2px 1px" }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    width: 30, height: 26, borderRadius: 4,
                    background: v ? "#FCEBEB" : "var(--color-background-secondary)",
                    fontSize: 9, fontWeight: 500,
                    color: v ? "#A32D2D" : "var(--color-text-tertiary)",
                  }}>
                    {v ? "Reb." : "—"}
                  </div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Medikamenten-Einnahme — klickbar */}
      <div style={{ marginBottom: "1.25rem" }}>
        <p
          onClick={() => open("Medikamente", "medication_detail", { medications: period?.medications })}
          style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8, cursor: "pointer" }}
        >
          Medikamenten-Einnahme <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none" }}>›</span>
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ width: 90 }} />
              {DAYS.map(d => <th key={d} style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", textAlign: "center", padding: "3px 1px", minWidth: 36 }}>{d}</th>)}
            </tr>
          </thead>
          <tbody>
            {period?.medications?.map(med => (
              <tr key={med.id}>
                <td style={{ textAlign: "left", fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6 }}>
                  {med.name}<br /><span style={{ fontSize: 10, fontWeight: 400 }}>{med.duration === "long" ? "Retard" : "Kurz"}</span>
                </td>
                {dayLogs.map((log, i) => {
                  const slotData = (log?.slots as any)?.[med.intakeSlot ?? "morning"];
                  const taken = slotData?.medsTaken?.[med.id] ?? false;
                  const time  = slotData?.medicationTime as string | undefined;
                  const dose  = slotData?.medsDose?.[med.id] as number | undefined;
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
        <p
          onClick={() => open("Schlaf", "sleep")}
          style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8, cursor: "pointer" }}
        >
          Schlaf <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none" }}>›</span>
        </p>
        {sleepVals.map((val, i) => val !== undefined ? (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", width: 22 }}>{DAYS[i]}</span>
            <div style={{ flex: 1, background: "var(--color-background-secondary)", borderRadius: 3, height: 12, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: "#378ADD", width: `${Math.min(100, val / 10 * 100)}%` }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, width: 28, textAlign: "right", color: val >= 8 ? "#0F6E56" : val >= 6.5 ? "#854F0B" : "#A32D2D" }}>{val}h</span>
          </div>
        ) : null)}
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Rückmeldung Beobachter — Mini-Heatmap */}
      <div style={{ marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
          Rückmeldung Beobachter
        </p>
        {partnerGroups.size === 0
          ? <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Keine Beobachtungen diese Woche.</p>
          : <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ width: 90 }} />
                  {DAYS.map(d => <th key={d} style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", textAlign: "center", padding: "3px 1px", minWidth: 36 }}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {Array.from(partnerGroups.entries()).map(([name, obs]) => {
                  const dayMap: Record<string, any> = {};
                  obs.forEach(o => { dayMap[o.date] = o; });
                  return (
                    <tr key={name}
                      style={{ cursor: "pointer", background: "transparent" }}
                      onClick={() => open(name, "observer_detail", { observerObs: obs })}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--color-background-secondary)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ textAlign: "left", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6, whiteSpace: "nowrap" }}>
                        {name} <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>›</span>
                      </td>
                      {days.map((day, di) => {
                        const o = dayMap[day];
                        return (
                          <td key={di} style={{ textAlign: "center", padding: "2px 1px" }}>
                            <CellBtn val={o ? obsAvg(o) : undefined} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
        }
      </div>

      {/* Rückmeldung Fachpersonen — Mini-Heatmap + Legacy */}
      {(teacherGroups.size > 0) && (
        <>
          <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />
          <div style={{ marginBottom: "1.25rem" }}>
            <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
              Rückmeldung Fachpersonen
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ width: 90 }} />
                  {DAYS.map(d => <th key={d} style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", textAlign: "center", padding: "3px 1px", minWidth: 36 }}>{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {Array.from(teacherGroups.entries()).map(([name, entries]) => {
                  const dayMap: Record<string, any> = {};
                  entries.forEach(r => { if (r.date) dayMap[r.date] = r; });
                  return (
                    <tr key={name}
                      style={{ cursor: "pointer", background: "transparent" }}
                      onClick={() => open(name, "teacher_detail", { observerObs: entries })}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--color-background-secondary)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <td style={{ textAlign: "left", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6, whiteSpace: "nowrap" }}>
                        {name} <span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>›</span>
                      </td>
                      {days.map((day, di) => {
                        const r = dayMap[day];
                        return (
                          <td key={di} style={{ textAlign: "center", padding: "2px 1px" }}>
                            <CellBtn val={r ? obsAvg(r) : undefined} />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Essen */}
      <div style={{ marginBottom: "1.25rem", cursor: "pointer" }} onClick={() => open("Essen & Appetit", "food")}>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
          Essen <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none" }}>›</span>
        </p>
        {[
          { label: "Appetit reduziert", id: "meal_appetite" },
          { label: "Wenig gegessen",    id: "meals_today" },
        ].map(({ label, id }) => {
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

      {/* Körper */}
      <div style={{ marginBottom: "1.25rem", cursor: "pointer" }} onClick={() => open("Körperliche Beschwerden", "body")}>
        <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
          Körper & Nebenwirkungen <span style={{ fontSize: 10, fontWeight: 400, textTransform: "none" }}>›</span>
        </p>
        {(["headache","stomachache","tension","heart_racing","dry_mouth"] as const).map(id => {
          const labelMap: Record<string, string> = { headache: "Kopfschmerzen", stomachache: "Bauchschmerzen", tension: "Verspannungen", heart_racing: "Herzrasen", dry_mouth: "Mundtrockenheit" };
          const count = dayLogs.filter(l => isTruthy(collectAnswer(l, id))).length;
          const total = dayLogs.filter(l => collectAnswer(l, id) !== undefined).length;
          const color = count === 0 ? "#0F6E56" : count <= 1 ? "#854F0B" : "#A32D2D";
          return (
            <div key={id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
              <span style={{ fontSize: 13 }}>{labelMap[id]}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color }}>{count} / {total} Tagen</span>
            </div>
          );
        })}
      </div>

      <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />

      {/* Schule */}
      <div style={{ marginBottom: "1.25rem", cursor: "pointer" }} onClick={() => open("Schule / Arbeit", "school")}>
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
              <span style={{ fontSize: 12, fontWeight: 500, color: v ? heatColor(v) : "var(--color-text-secondary)" }}>{v ? `${v}/5` : "—"}</span>
            </div>
          );
        })}
      </div>

      {/* Teen-Tagebücher — eine Sektion pro Jugendliche/m */}
      {teenLogGroups && teenLogGroups.size > 0 && Array.from(teenLogGroups.entries()).map(([teenName, teenDayLogs]) => {
        const teenDayLogsForWeek = days.map(d => teenDayLogs.find(l => l.date === d));
        const teenMoodVals   = teenDayLogsForWeek.map(moodScore);
        // Teen energy is stored as string enum; convert to 1/3/5 for heatmap.
        const teenEnergyVals = teenDayLogsForWeek.map(l => {
          const raw = collectAnswer(l, "energy_level");
          if (raw === "high") return 5;
          if (raw === "mid")  return 3;
          if (raw === "low")  return 1;
          const n = collectVal(l, "energy_level");
          return n;
        });
        const hasSomeData    = [...teenMoodVals, ...teenEnergyVals].some(v => v !== undefined);
        if (!hasSomeData) return null;
        return (
          <div key={teenName}>
            <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", margin: "1.25rem 0" }} />
            <div style={{ marginBottom: "1.25rem" }}>
              <p style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, textTransform: "uppercase", letterSpacing: ".04em", marginBottom: 8 }}>
                Tagebuch {teenName}
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ width: 90 }} />
                    {DAYS.map(d => <th key={d} style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-secondary)", textAlign: "center", padding: "3px 1px", minWidth: 36 }}>{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ textAlign: "left", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6, whiteSpace: "nowrap" }}>Energie</td>
                    {teenEnergyVals.map((v, i) => (
                      <td key={i} style={{ textAlign: "center", padding: "2px 1px" }}><CellBtn val={v} /></td>
                    ))}
                  </tr>
                  <tr>
                    <td style={{ textAlign: "left", fontSize: 12, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6, whiteSpace: "nowrap" }}>Stimmung</td>
                    {teenMoodVals.map((v, i) => (
                      <td key={i} style={{ textAlign: "center", padding: "2px 1px" }}><CellBtn val={v} /></td>
                    ))}
                  </tr>
                  {period?.medications?.map(med => {
                    const takenVals = teenDayLogsForWeek.map(log => {
                      const slotData = (log?.slots as any)?.[med.intakeSlot ?? "morning"];
                      return slotData?.medsTaken?.[med.id] as boolean | undefined;
                    });
                    const hasMedData = takenVals.some(v => v !== undefined);
                    if (!hasMedData) return null;
                    return (
                      <tr key={med.id}>
                        <td style={{ textAlign: "left", fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, paddingRight: 6, whiteSpace: "nowrap" }}>
                          {med.name}
                        </td>
                        {takenVals.map((taken, i) => (
                          <td key={i} style={{ textAlign: "center", padding: "2px 1px" }}>
                            <div style={{
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              width: 30, height: 26, borderRadius: 4, fontSize: 10, fontWeight: 500,
                              background: taken === undefined ? "var(--color-background-secondary)" : taken ? "#E1F5EE" : "#FCEBEB",
                              color: taken === undefined ? "var(--color-text-tertiary)" : taken ? "#0F6E56" : "#A32D2D",
                            }}>
                              {taken === undefined ? "—" : taken ? "✓" : "✗"}
                            </div>
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

    </div>
  );
}
