import { useMemo, useState } from "react";
import { Pill, Plus, X, Moon, Utensils, Activity, Smile, Zap, Clock, Heart, Briefcase } from "lucide-react";
import { Chip } from "./Chip";
import { SectionCard } from "./SectionCard";
import { EffectCurve } from "./EffectCurve";
import { CurveInsights } from "./CurveInsights";
import type { ActivityEntry, DayLog, Dose, Medication, MoodEntry, Settings } from "@/lib/clar-storage";
import { todayKey } from "@/lib/clar-storage";

const MOODS = [
  { id: "focused", label: "Fokussiert", emoji: "🎯" },
  { id: "calm", label: "Ruhig", emoji: "🌿" },
  { id: "energized", label: "Energiegeladen", emoji: "⚡" },
  { id: "anxious", label: "Ängstlich", emoji: "😰" },
  { id: "irritable", label: "Gereizt", emoji: "😤" },
  { id: "flat", label: "Flach", emoji: "😐" },
  { id: "overwhelmed", label: "Überfordert", emoji: "🌀" },
  { id: "sad", label: "Traurig", emoji: "🌧️" },
];

const SIDE_EFFECTS = [
  "Kopfschmerzen",
  "Herzrasen",
  "Mundtrockenheit",
  "Schwindel",
  "Stimmungstief",
  "Schlafprobleme",
  "Kribbeln",
];

const ACTIVITIES = [
  { id: "work", label: "Arbeit", emoji: "💼" },
  { id: "study", label: "Lernen", emoji: "📚" },
  { id: "sport", label: "Sport", emoji: "🏃" },
  { id: "meal", label: "Essen", emoji: "🍽️" },
  { id: "social", label: "Sozial", emoji: "👥" },
  { id: "rest", label: "Pause", emoji: "🛋️" },
  { id: "creative", label: "Kreativ", emoji: "🎨" },
  { id: "errand", label: "Erledigung", emoji: "📦" },
];

const APPETITE: DayLog["appetite"][] = ["none", "little", "normal", "much"];
const APPETITE_LABEL: Record<NonNullable<DayLog["appetite"]>, string> = {
  none: "keiner",
  little: "wenig",
  normal: "normal",
  much: "viel",
};

function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function TodayView({
  log,
  settings,
  onChange,
}: {
  log: DayLog;
  settings: Settings;
  onChange: (patch: Partial<DayLog>) => void;
}) {
  const today = todayKey();
  const isToday = log.date === today;
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Guten Morgen";
    if (h < 18) return "Guten Tag";
    return "Guten Abend";
  }, []);

  const addDoseFromMed = (med: Medication) => {
    const dose: Dose = {
      id: crypto.randomUUID(),
      name: med.name,
      mg: med.mg,
      time: nowHM(),
      type: med.type,
      medId: med.id,
    };
    onChange({ doses: [...log.doses, dose] });
  };

  const removeDose = (id: string) => {
    onChange({ doses: log.doses.filter((d) => d.id !== id) });
  };

  const updateDose = (id: string, patch: Partial<Dose>) => {
    onChange({
      doses: log.doses.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    });
  };

  const moodEntries = log.moodEntries ?? [];
  const addMood = (moodId: string) => {
    const entry: MoodEntry = {
      id: crypto.randomUUID(),
      time: nowHM(),
      mood: moodId,
    };
    onChange({ moodEntries: [...moodEntries, entry] });
  };
  const updateMood = (id: string, patch: Partial<MoodEntry>) => {
    onChange({
      moodEntries: moodEntries.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    });
  };
  const removeMood = (id: string) => {
    onChange({ moodEntries: moodEntries.filter((m) => m.id !== id) });
  };
  const moodById = (id: string) => MOODS.find((m) => m.id === id);

  const activityEntries = log.activityEntries ?? [];
  const addActivity = (actId: string) => {
    const entry: ActivityEntry = {
      id: crypto.randomUUID(),
      time: nowHM(),
      activity: actId,
    };
    onChange({ activityEntries: [...activityEntries, entry] });
  };
  const updateActivity = (id: string, patch: Partial<ActivityEntry>) => {
    onChange({
      activityEntries: activityEntries.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      ),
    });
  };
  const removeActivity = (id: string) => {
    onChange({ activityEntries: activityEntries.filter((a) => a.id !== id) });
  };
  const activityById = (id: string) => ACTIVITIES.find((a) => a.id === id);

  const toggleSide = (s: string) => {
    const has = log.sideEffects.includes(s);
    onChange({
      sideEffects: has ? log.sideEffects.filter((x) => x !== s) : [...log.sideEffects, s],
    });
  };

  return (
    <div className="space-y-4 pb-32">
      {/* Header */}
      <header className="pt-2 animate-fade-up">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {new Date(log.date).toLocaleDateString("de-DE", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          {isToday ? greeting : "Tageslog"}
        </h1>
      </header>

      {/* Doses */}
      <SectionCard
        title="Heutige Dosen"
        subtitle={`${log.doses.length} ${log.doses.length === 1 ? "Dosis" : "Dosen"} erfasst`}
      >
        <div className="space-y-2">
          {log.doses.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-background/40 p-3"
            >
              {d.type === "instant" ? (
                <Zap className="h-4 w-4 text-primary" />
              ) : d.type === "retard" ? (
                <Clock className="h-4 w-4 text-primary" />
              ) : d.type === "antidepressant" ? (
                <Heart className="h-4 w-4 text-primary" />
              ) : (
                <Pill className="h-4 w-4 text-primary" />
              )}
              <input
                value={d.name}
                onChange={(e) => updateDose(d.id, { name: e.target.value })}
                className="flex-1 bg-transparent text-sm font-medium text-foreground outline-none"
              />
              <input
                type="number"
                value={d.mg}
                onChange={(e) => updateDose(d.id, { mg: Number(e.target.value) })}
                className="w-14 bg-transparent text-right text-sm text-muted-foreground outline-none"
              />
              <span className="text-xs text-muted-foreground">mg</span>
              <input
                type="time"
                value={d.time}
                onChange={(e) => updateDose(d.id, { time: e.target.value })}
                className="rounded-md bg-secondary px-2 py-1 text-xs text-foreground outline-none [color-scheme:dark]"
              />
              <button
                onClick={() => removeDose(d.id)}
                className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {settings.medications.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border py-3 text-center text-xs text-muted-foreground">
              Noch keine Medikamente hinterlegt — füge sie in den Einstellungen hinzu.
            </p>
          ) : (
            <div
              className={`grid gap-2 ${settings.medications.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
            >
              {settings.medications.map((med) => (
                <button
                  key={med.id}
                  onClick={() => addDoseFromMed(med)}
                  className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-border py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10 active:scale-[0.98]"
                >
                  <span className="flex items-center gap-1.5">
                    {med.type === "retard" ? (
                      <Clock className="h-4 w-4" />
                    ) : med.type === "instant" ? (
                      <Zap className="h-4 w-4" />
                    ) : (
                      <Heart className="h-4 w-4" />
                    )}
                    <Plus className="h-3 w-3" />
                  </span>
                  <span className="text-xs">
                    {med.name} · {med.mg} mg
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {med.type === "retard"
                      ? "Retard"
                      : med.type === "instant"
                        ? "Bei Bedarf"
                        : "Sonstige"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      {/* Wirkungsfenster */}
      <>
          <SectionCard
            title="Wirkungsfenster"
            subtitle="Ziehe Start, Peak und Ende über den Tagesverlauf."
          >
            <EffectCurve
              onset={log.effect.onset}
              peak={log.effect.peak}
              wornOff={log.effect.wornOff}
              points={log.effect.points}
              doses={log.doses}
              moods={moodEntries.map((e) => ({
                id: e.id,
                time: e.time,
                emoji: moodById(e.mood)?.emoji ?? "•",
                label: moodById(e.mood)?.label ?? e.mood,
              }))}
              activities={activityEntries.map((e) => ({
                id: e.id,
                time: e.time,
                emoji: activityById(e.activity)?.emoji ?? "•",
                label: activityById(e.activity)?.label ?? e.activity,
              }))}
              onChange={(next) =>
                onChange({ effect: { ...log.effect, ...next } })
              }
            />
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rebound?</span>
              <Chip
                active={log.effect.rebound === true}
                onClick={() => onChange({ effect: { ...log.effect, rebound: true } })}
              >
                Ja
              </Chip>
              <Chip
                active={log.effect.rebound === false}
                onClick={() => onChange({ effect: { ...log.effect, rebound: false } })}
              >
                Nein
              </Chip>
            </div>
          </SectionCard>

          {/* Auswertung */}
          <SectionCard
            title="Auswertung"
            subtitle="Was deine Einträge heute zeigen — automatisch abgeleitet."
          >
            <CurveInsights log={log} />
          </SectionCard>

          {/* Stimmung */}
          <SectionCard
            title="Stimmung im Tagesverlauf"
            subtitle="Wann hast du wie was erlebt? Tippe eine Stimmung — sie wird mit der aktuellen Uhrzeit erfasst."
          >
            {moodEntries.length > 0 && (
              <ul className="mb-3 space-y-2">
                {[...moodEntries]
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((e) => {
                    const m = moodById(e.mood);
                    return (
                      <li
                        key={e.id}
                        className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
                      >
                        <input
                          type="time"
                          value={e.time}
                          onChange={(ev) => updateMood(e.id, { time: ev.target.value })}
                          className="rounded-md bg-background/40 px-2 py-1 text-xs text-foreground outline-none"
                        />
                        <span className="text-base">{m?.emoji ?? "•"}</span>
                        <span className="flex-1 text-sm text-foreground">
                          {m?.label ?? e.mood}
                        </span>
                        <button
                          onClick={() => removeMood(e.id)}
                          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                          aria-label="Entfernen"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m) => (
                <Chip key={m.id} onClick={() => addMood(m.id)}>
                  <span>{m.emoji}</span>
                  <span>{m.label}</span>
                </Chip>
              ))}
            </div>
          </SectionCard>

          {/* Tätigkeiten */}
          <SectionCard
            title="Tätigkeiten im Tagesverlauf"
            subtitle="Was hast du wann getan? Wird über der Kurve markiert."
          >
            {activityEntries.length > 0 && (
              <ul className="mb-3 space-y-2">
                {[...activityEntries]
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((e) => {
                    const a = activityById(e.activity);
                    return (
                      <li
                        key={e.id}
                        className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2"
                      >
                        <input
                          type="time"
                          value={e.time}
                          onChange={(ev) =>
                            updateActivity(e.id, { time: ev.target.value })
                          }
                          className="rounded-md bg-background/40 px-2 py-1 text-xs text-foreground outline-none"
                        />
                        <span className="text-base">{a?.emoji ?? "•"}</span>
                        <span className="flex-1 text-sm text-foreground">
                          {a?.label ?? e.activity}
                        </span>
                        <button
                          onClick={() => removeActivity(e.id)}
                          className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                          aria-label="Entfernen"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Briefcase className="h-4 w-4" />
              <span className="text-xs">Hinzufügen</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ACTIVITIES.map((a) => (
                <Chip key={a.id} onClick={() => addActivity(a.id)}>
                  <span>{a.emoji}</span>
                  <span>{a.label}</span>
                </Chip>
              ))}
            </div>
          </SectionCard>

          {/* Schlaf */}
          <SectionCard
            title="Schlaf"
            subtitle="So habe ich letzte Nacht geschlafen."
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Moon className="h-4 w-4" />
              <span className="text-xs">Dauer</span>
            </div>
            <label className="mt-2 block">
              <input
                type="number"
                step="0.5"
                min="0"
                max="14"
                value={log.sleepHours ?? ""}
                onChange={(e) =>
                  onChange({ sleepHours: e.target.value ? Number(e.target.value) : undefined })
                }
                placeholder="Stunden, z. B. 7,5"
                className="w-full rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm text-foreground outline-none"
              />
            </label>

            <div className="mt-4 flex items-center gap-2 text-muted-foreground">
              <span className="text-xs">Qualität</span>
            </div>
            <div className="mt-2 flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => onChange({ sleepQuality: n })}
                  className={`flex-1 rounded-xl border py-3 text-sm font-semibold transition-all active:scale-95 ${
                    log.sleepQuality === n
                      ? "border-primary bg-primary-soft text-foreground"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 text-muted-foreground">
              <span className="text-xs">Wie oft aufgewacht</span>
            </div>
            <div className="mt-2 flex gap-2">
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => onChange({ sleepWakeups: n })}
                  className={`flex-1 rounded-xl border py-3 text-sm font-semibold transition-all active:scale-95 ${
                    log.sleepWakeups === n
                      ? "border-primary bg-primary-soft text-foreground"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {n === 4 ? "4+" : n}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Appetit */}
          <SectionCard title="Appetit">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Utensils className="h-4 w-4" />
              <span className="text-xs">Heute war eher…</span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {APPETITE.map((a) => a && (
                <button
                  key={a}
                  onClick={() => onChange({ appetite: a })}
                  className={`rounded-xl border py-2.5 text-xs font-medium transition-all active:scale-95 ${
                    log.appetite === a
                      ? "border-primary bg-primary-soft text-foreground"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {APPETITE_LABEL[a]}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* Nebenwirkungen */}
          <SectionCard title="Nebenwirkungen" subtitle="Alles, was heute spürbar war.">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Activity className="h-4 w-4" />
            </div>
            <div className="flex flex-wrap gap-2">
              {SIDE_EFFECTS.map((s) => (
                <Chip key={s} active={log.sideEffects.includes(s)} onClick={() => toggleSide(s)}>
                  {s}
                </Chip>
              ))}
            </div>
          </SectionCard>

          {/* Tagesbewertung */}
          <SectionCard title="Tag insgesamt">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Smile className="h-4 w-4" />
                <span className="text-xs">Bewertung 1–10</span>
              </div>
              <span className="text-2xl font-semibold text-primary">
                {log.rating ?? "—"}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={log.rating ?? 5}
              onChange={(e) => onChange({ rating: Number(e.target.value) })}
              className="mt-3 w-full accent-[var(--primary)]"
            />
          </SectionCard>

          {/* Notiz */}
          <SectionCard title="Notiz" subtitle="Alles, was du dir merken möchtest.">
            <textarea
              value={log.note ?? ""}
              onChange={(e) => onChange({ note: e.target.value })}
              rows={3}
              placeholder="Produktiver Morgen, aber gegen 16 Uhr ausgelaugt…"
              className="w-full resize-none rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none"
            />
          </SectionCard>
      </>
    </div>
  );
}