import { useEffect, useMemo, useState } from "react";
import { ChildWizard } from "./ChildWizard";
import {
  Brain,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  GraduationCap,
  Heart,
  HeartPulse,
  Moon,
  Pill,
  Plus,
  Smile,
  Sparkles,
  Trash2,
  Users,
  Utensils,
  Volume2,
  Zap,
} from "lucide-react";

import { Chip } from "./Chip";
import { SectionCard } from "./SectionCard";
import { hasObservationToday, submitObserverObservation } from "@/lib/clar-observers";
import type {
  DayLog,
  IntakeTime,
  Medication,
  MedicationType,
  ObservationPeriod,
  ProfileType,
  Settings,
  TimeSlot,
  WellbeingAnswer,
  WellbeingItem,
} from "@/lib/clar-storage";
import {
  MEDICATION_TYPE_LABELS,
  PROFILE_LABELS,
  QUESTION_GROUPS,
  SLOT_LABELS,
  TIME_SLOTS,
  WELLBEING_CATALOG,
  availableWellbeingItems,
  createMedication,
  createPeriod,
  getActivePeriod,
} from "@/lib/clar-storage";

type Props = {
  log: DayLog;
  settings: Settings;
  onChange: (patch: Partial<DayLog>) => void;
  onSettingsChange: (patch: Partial<Settings>) => void;
  userId?: string;
  hasExistingLogs?: boolean;
};

const CATEGORY_LABEL: Record<WellbeingItem["category"], string> = {
  sleep: "Schlaf",
  mood: "Emotionales Befinden",
  rebound: "Rebound",
  concentration: "Konzentration & Kognition",
  appetite: "Appetit",
  body: "Körper & Nebenwirkungen",
  social: "Soziales & Stress",
  school: "Schule / Arbeit / Ausbildung",
  cycle: "Zyklus",
  custom: "Eigene",
  reflection: "Reflexion",
};

function makeIcs(period: ObservationPeriod) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//clar//Beobachtungsperiode//DE",
    "CALSCALE:GREGORIAN",
    ...TIME_SLOTS.flatMap((slot) => {
      const time = period.timeSlots[slot].replace(":", "");
      return [
        "BEGIN:VEVENT",
        `UID:${period.id}-${slot}@clar`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${period.startDate.replace(/-/g, "")}T${time}00`,
        `RRULE:FREQ=DAILY;UNTIL:${period.endDate.replace(/-/g, "")}T235900`,
        `SUMMARY:clar ${SLOT_LABELS[slot]} erfassen`,
        `DESCRIPTION:${period.name}`,
        "END:VEVENT",
      ];
    }),
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadIcs(period: ObservationPeriod) {
  const blob = new Blob([makeIcs(period)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${period.name || "clar-periode"}.ics`;
  link.click();
  URL.revokeObjectURL(url);
}

async function savePeriodWithInvite(
  settings: Settings,
  period: ObservationPeriod,
  onSettingsChange: Props["onSettingsChange"],
  userId?: string,
) {
  const periods = settings.periods.some((item) => item.id === period.id)
    ? settings.periods.map((item) => (item.id === period.id ? period : item))
    : [...settings.periods, period];
  onSettingsChange({ periods, activePeriodId: period.id });
  const childEmail = (period as any).childEmail;
  if (childEmail && userId && (period.profile === "child_both" || period.profile === "child_self" || period.profile === "teen_self")) {
    try {
      const { inviteObserver } = await import("@/lib/clar-observers");
      await inviteObserver(userId, childEmail, "child", period.name);
    } catch (e) {
      console.warn("[clar] Kind-Einladung fehlgeschlagen:", e);
    }
  }
}

function savePeriod(
  settings: Settings,
  period: ObservationPeriod,
  onSettingsChange: Props["onSettingsChange"],
) {
  const periods = settings.periods.some((item) => item.id === period.id)
    ? settings.periods.map((item) => (item.id === period.id ? period : item))
    : [...settings.periods, period];
  onSettingsChange({ periods, activePeriodId: period.id });
}

function statusLabel(status: string) {
  if (status === "done") return "fertig";
  if (status === "in_progress") return "in Arbeit";
  return "ausstehend";
}

export function MedicationEditor({
  medications,
  onChange,
}: {
  medications: Medication[];
  onChange: (next: Medication[]) => void;
}) {
  const update = (id: string, patch: Partial<Medication>) =>
    onChange(medications.map((med) => (med.id === id ? { ...med, ...patch } : med)));

  return (
    <div className="space-y-3">
      {medications.map((med) => (
        <div key={med.id} className="rounded-2xl border border-border bg-background p-3">
          <div className="flex items-center gap-2">
            <input
              value={med.name}
              onChange={(event) => update(med.id, { name: event.target.value })}
              className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
              aria-label="Medikamentenname"
            />
            <button
              type="button"
              onClick={() => onChange(medications.filter((item) => item.id !== med.id))}
              className="grid h-9 w-9 place-items-center rounded-full text-primary transition-colors hover:bg-primary/10"
              aria-label="Medikament entfernen"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {/* Zeile 1: Dosis + Wirkdauer */}
            <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3">
              <input
                type="number"
                value={med.mg}
                onChange={(e) => update(med.id, { mg: Number(e.target.value) })}
                className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm font-semibold outline-none"
                min={0}
                step={5}
              />
              <span className="text-sm text-muted-foreground">mg</span>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => update(med.id, { duration: "short" })}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${(med.duration ?? "short") === "short" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  Kurz
                </button>
                <button
                  type="button"
                  onClick={() => update(med.id, { duration: "long" })}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${med.duration === "long" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
                >
                  Retard
                </button>
              </div>
            </div>
            {/* Zeile 2: Einnahme */}
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Einnahme</p>
              <div className="flex flex-col divide-y divide-border">
                {(["morning", "midday", "evening", "asBraucht"] as const).map((slot) => {
                  const labels: Record<string, string> = { asBraucht: "Bei Bedarf", morning: "Morgens", midday: "Mittags", evening: "Abends" };
                  const times = med.intakeTimes ?? [{ slot: med.intakeSlot }];
                  const active = times.some((t) => t.slot === slot);
                  const entry = times.find((t) => t.slot === slot);
                  return (
                    <div key={slot} className="flex items-center gap-3 py-2">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => {
                          e.stopPropagation();
                          const current = med.intakeTimes ?? [{ slot: med.intakeSlot }];
                          const next = active ? current.filter((t) => t.slot !== slot) : [...current, { slot: slot as TimeSlot }];
                          const validSlots: TimeSlot[] = ["morning", "midday", "evening"];
                          const nextIntakeSlot = next.find((t) => validSlots.includes(t.slot as TimeSlot))?.slot as TimeSlot ?? "morning";
                          update(med.id, { intakeTimes: next as IntakeTime[], intakeSlot: nextIntakeSlot });
                        }}
                        className="h-4 w-4 rounded accent-primary"
                      />
                      <span className="flex-1 text-sm font-medium">{labels[slot]}</span>
                      {active && slot !== "asBraucht" && (
                        <input
                          type="time"
                          value={entry?.time ?? ""}
                          onChange={(e) => {
                            const current = med.intakeTimes ?? [{ slot: med.intakeSlot }];
                            const next = current.map((t) => t.slot === slot ? { ...t, time: e.target.value } : t);
                            update(med.id, { intakeTimes: next });
                          }}
                          className="rounded-lg border border-border bg-background px-2 py-1 text-sm outline-none w-28"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Erinnerungen */}
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Erinnerungen</p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={med.remindPush ?? false} onChange={(e) => update(med.id, { remindPush: e.target.checked })} className="rounded" />
                  Push-Benachrichtigung
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={med.remindCalendar ?? false} onChange={(e) => update(med.id, { remindCalendar: e.target.checked })} className="rounded" />
                  Kalender-Eintrag erstellen
                </label>
              </div>
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...medications, createMedication()])}
        className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        <Plus className="h-4 w-4" /> Medikament hinzufügen
      </button>
    </div>
  );
}

function Onboarding({ settings, onSettingsChange, userId }: Pick<Props, "settings" | "onSettingsChange" | "userId">) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ObservationPeriod>(() => createPeriod());
  const [childEmail, setChildEmail] = useState("");
  const catalog = WELLBEING_CATALOG.filter((item) => !item.module || draft.modules[item.module]);
  const categories = Array.from(new Set(catalog.map((item) => item.category)));

  const updateDraft = (patch: Partial<ObservationPeriod>) =>
    setDraft((current) => createPeriod({ ...current, ...patch, id: current.id }));

  const toggleItem = (itemId: string) => {
    const selected = draft.selectedWellbeingIds.includes(itemId);
    const selectedWellbeingIds = selected
      ? draft.selectedWellbeingIds.filter((id) => id !== itemId)
      : [...draft.selectedWellbeingIds, itemId];
    const wellbeingSlots = { ...draft.wellbeingSlots };
    if (selected) delete wellbeingSlots[itemId];
    else wellbeingSlots[itemId] = TIME_SLOTS;
    updateDraft({ selectedWellbeingIds, wellbeingSlots });
  };

  const toggleItemSlot = (itemId: string, slot: TimeSlot) => {
    const current = draft.wellbeingSlots[itemId] ?? [];
    const next = current.includes(slot)
      ? current.filter((item) => item !== slot)
      : [...current, slot];
    updateDraft({ wellbeingSlots: { ...draft.wellbeingSlots, [itemId]: next } });
  };

  // Alter berechnen
  const birthYear = draft.birthYear;
  const age = birthYear ? new Date().getFullYear() - birthYear : null;
  const isParentFlow = draft.profile === "child_parent" || draft.profile === "teen_self";
  const isTeenFlow = draft.profile === "teen_self";

  const steps = [
    {
      title: "Wer bist du?",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Wähle deine Rolle. Du kannst das später jederzeit anpassen.</p>
          {([
            ["self", "Ich selbst (ab 18)", "Ich führe das Tagebuch für mich."],
            ["child_parent", "Ich bin Elternteil", "Ich führe das Tagebuch für mein Kind."],
          ] as const).map(([key, label, desc]) => (
            <button
              key={key}
              type="button"
              onClick={() => updateDraft({ profile: key as ProfileType })}
              className={`w-full rounded-2xl border p-4 text-left ${
                draft.profile === key || (key === "child_parent" && isParentFlow)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground"
              }`}
            >
              <div className="text-sm font-semibold">{label}</div>
              <div className={`text-xs mt-1 ${draft.profile === key || (key === "child_parent" && isParentFlow) ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{desc}</div>
            </button>
          ))}
          {isParentFlow && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Wer füllt das Tagebuch aus?</p>
              {([
                ["child_parent", "Kind unter 12", "Du führst das Tagebuch. Das Kind kann mitmachen."],
                ["teen_self", "Jugendliche/r (12–17)", "Das Kind erhält eine Einladung und füllt auf eigenem Gerät aus."],
              ] as const).map(([key, label, desc]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateDraft({ profile: key as ProfileType })}
                  className={`w-full rounded-xl border p-3 text-left text-sm ${
                    draft.profile === key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-foreground"
                  }`}
                >
                  <div className="font-semibold">{label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      title: isParentFlow ? "Angaben zum Kind" : "Angaben zu dir",
      body: (
        <div className="space-y-3">
          <label className="block rounded-2xl border border-border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">
              {isParentFlow ? "Initialen des Kindes (z.B. L.M.)" : "Deine Initialen (z.B. R.B.)"}
            </span>
            <input
              value={draft.name.replace("Meine Periode", "")}
              placeholder={isParentFlow ? "z.B. L.M." : "z.B. R.B."}
              onChange={(event) => updateDraft({ name: event.target.value })}
              className="mt-1 w-full bg-transparent text-base font-semibold outline-none"
            />
          </label>
          <label className="block rounded-2xl border border-border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">
              {isParentFlow ? "Geburtsjahr des Kindes" : "Dein Geburtsjahr"}
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={1930}
              max={2025}
              placeholder={isParentFlow ? "z.B. 2015" : "z.B. 1990"}
              value={draft.birthYear ?? ""}
              onChange={(event) => {
                const raw = event.target.value;
                updateDraft({ birthYear: raw === "" ? undefined : Number(raw) });
              }}
              className="mt-1 w-full bg-transparent text-base font-semibold outline-none"
            />
          </label>
          <div className="rounded-2xl border border-border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">Geschlecht</span>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {([["male", "Männlich"], ["female", "Weiblich"], ["diverse", "Divers"]] as [string, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateDraft({ gender: key as any, cycleTracking: key === "female" || key === "diverse" })}
                  className={`rounded-xl border py-2 text-xs font-semibold ${
                    draft.gender === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">
              {isParentFlow ? "Lebenssituation des Kindes" : "Deine Lebenssituation"}
            </span>
            <p className="mt-1 text-xs text-muted-foreground">Mehrfachauswahl möglich</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(() => {
                const ageGroup: "child" | "teen" | "adult" =
                  !isParentFlow ? "adult"
                  : (isTeenFlow || (age !== null && age >= 12)) ? "teen"
                  : "child";
                const opts: [string, string][] =
                  ageGroup === "child" ? [
                    ["kindergarten",  "Kindergarten"],
                    ["primary",       "Primarschule"],
                    ["special_ed",    "Sonderpädagogisches Bildungsangebot"],
                  ] : ageGroup === "teen" ? [
                    ["primary",       "Primarschule"],
                    ["secondary",     "Sekundarschule"],
                    ["gymnasium",     "Gymnasium"],
                    ["special_ed",    "Sonderpädagogisches Bildungsangebot"],
                    ["apprentice",    "Ausbildung"],
                  ] : [
                    ["secondary",     "Sekundarschule"],
                    ["gymnasium",     "Gymnasium"],
                    ["apprentice",    "Ausbildung"],
                    ["student",       "Studium"],
                    ["employed",      "Berufstätig"],
                    ["special_ed",    "Sonderpädagogisches Bildungsangebot"],
                  ];
                const selected = draft.lifeContexts ?? [];
                const toggle = (key: string) => {
                  const next = selected.includes(key as any)
                    ? selected.filter(k => k !== key)
                    : [...selected, key as any];
                  updateDraft({ lifeContexts: next });
                };
                return opts.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    className={`rounded-xl border px-2 py-2 text-xs font-semibold text-left ${
                      selected.includes(key as any)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground"
                    }`}
                  >{label}</button>
                ));
              })()}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Medikamente",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Trage alle Stimulanzien ein, die {isParentFlow ? "dein Kind" : "du"} nimmt. Du kannst diese später jederzeit anpassen.
          </p>
          <MedicationEditor
            medications={draft.medications}
            onChange={(medications) => updateDraft({ medications })}
          />
        </div>
      ),
    },
    {
      title: "Zeitpunkte",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Wann soll {isParentFlow ? "dein Kind" : "du"} erinnert werden?</p>
          <div className="grid gap-3">
            {TIME_SLOTS.map((slot) => (
              <label key={slot} className="rounded-2xl border border-border bg-card p-4">
                <span className="text-sm font-semibold">{SLOT_LABELS[slot]}</span>
                <input
                  type="time"
                  value={draft.timeSlots[slot]}
                  onChange={(event) =>
                    updateDraft({ timeSlots: { ...draft.timeSlots, [slot]: event.target.value } })
                  }
                  className="mt-2 w-full bg-transparent text-lg font-semibold text-primary outline-none"
                />
              </label>
            ))}
          </div>
          {isParentFlow && (
            <div className="rounded-2xl border border-border bg-card p-3">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={draft.speechOutput ?? false}
                  onChange={(e) => updateDraft({ speechOutput: e.target.checked })}
                  className="h-4 w-4 rounded accent-primary"
                />
                <div>
                  <div className="font-semibold">Sprachausgabe fuer Kind</div>
                  <div className="text-xs text-muted-foreground">Alle Fragen werden laut vorgelesen</div>
                </div>
              </label>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Datenschutz & Bericht",
      body: (
        <div className="space-y-3">
          <div className="rounded-2xl border border-border bg-card p-3 text-sm text-muted-foreground space-y-2">
            <p>✓ Berichte jederzeit im Dossier abrufbar</p>
            <p>✓ PDF-Download oder Versand — du entscheidest</p>
            <p>✓ Daten werden anonymisiert verarbeitet</p>
            <p>✓ Kein Medizinprodukt — Wellness-Tool gemäss DSGVO</p>
          </div>
        </div>
      ),
    },
    ...(draft.profile === "teen_self" ? [{
      title: "Kind einladen",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Dein Kind erhält eine Einladungs-E-Mail und kann sich auf seinem eigenen Gerät einloggen. Es sieht nur seine eigene Ansicht.
          </p>
          <label className="block rounded-2xl border border-border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">E-Mail des Kindes</span>
            <input
              type="email"
              placeholder="kind@familie.ch"
              value={childEmail}
              onChange={(e) => setChildEmail(e.target.value)}
              className="mt-1 w-full bg-transparent text-sm font-semibold outline-none"
            />
          </label>
          <div className="rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground space-y-2">
            <p>Das Kind kann nur seine eigene Ansicht sehen</p>
            <p>Du als Elternteil siehst alle Daten</p>
            <p>Die Einladung kann jederzeit widerrufen werden</p>
          </div>
        </div>
      ),
    }] : []),
  ];

  return (
    <div className="space-y-4 pb-32">
      <header className="pt-2">

        
        <h1 className="mt-1 text-2xl font-semibold">Beobachtungsperiode einrichten</h1>
      </header>
      <SectionCard title={steps[step].title} subtitle={`Schritt ${step + 1} von ${steps.length}`}>
        {steps[step].body}
        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((value) => Math.max(0, value - 1))}
            className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-primary disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" /> Zurück
          </button>
          {step === steps.length - 1 ? (
            <button
              type="button"
              onClick={() => void savePeriodWithInvite(settings, { ...draft, childEmail } as any, onSettingsChange, userId)}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Check className="h-4 w-4" /> Periode starten
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}
              className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Weiter <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

const SCALE_LABELS: Record<string, { lo: string; hi: string; positive: boolean }> = {
  wellbeing:             { lo: "sehr schlecht",    hi: "sehr gut",          positive: true  },
  sleep_duration:        { lo: "sehr kurz",        hi: "sehr lang",         positive: true  },
  sleep_quality:         { lo: "sehr schlecht",    hi: "sehr gut",          positive: true  },
  base_mood:             { lo: "sehr schlecht",    hi: "sehr gut",          positive: true  },
  irritability:          { lo: "sehr reizbar",     hi: "ausgeglichen",      positive: false },
  drive:                 { lo: "kein Antrieb",     hi: "sehr motiviert",    positive: true  },
  inner_tension:         { lo: "sehr ruhig",       hi: "sehr unruhig",      positive: false },
  frustration_tolerance: { lo: "sehr niedrig",     hi: "sehr hoch",         positive: true  },
  focus:                 { lo: "gar nicht",        hi: "sehr gut",          positive: true  },
  distractibility:       { lo: "sehr fokussiert",  hi: "sehr ablenkbar",    positive: false },
  impulsivity:           { lo: "gut kontrolliert", hi: "sehr impulsiv",     positive: false },
  thought_racing:        { lo: "ruhig/klar",       hi: "starkes Rasen",     positive: false },
  rebound_intensity:     { lo: "kaum spürbar",     hi: "sehr stark",        positive: false },
  rebound_duration:      { lo: "sehr kurz",        hi: "sehr lang",         positive: false },
  hunger:                { lo: "kein Hunger",      hi: "normaler Hunger",   positive: true  },
  appetite:              { lo: "kein Appetit",     hi: "guter Appetit",     positive: true  },
  meal_amount:           { lo: "sehr wenig",       hi: "normal viel",       positive: true  },
  meals_today:           { lo: "keine",            hi: "viele",             positive: true  },
  stress_level:          { lo: "kein Stress",      hi: "sehr hoher Stress", positive: false },
  social_interactions:   { lo: "sehr schwierig",   hi: "sehr gut",          positive: true  },
  school_performance:    { lo: "sehr schlecht",    hi: "sehr gut",          positive: true  },
  school_social:         { lo: "sehr schwierig",   hi: "sehr gut",          positive: true  },
  heart_racing:          { lo: "gar nicht",        hi: "sehr stark",        positive: false },
  chest_tightness:       { lo: "gar nicht",        hi: "sehr stark",        positive: false },
  headache:              { lo: "gar nicht",        hi: "sehr stark",        positive: false },
  stomachache:           { lo: "gar nicht",        hi: "sehr stark",        positive: false },
  dry_mouth:             { lo: "gar nicht",        hi: "sehr stark",        positive: false },
};

const SCALE_STEPS = [
  { val: 1, label: "gar nicht" },
  { val: 2, label: "etwas" },
  { val: 3, label: "mittel" },
  { val: 4, label: "sehr/viel" },
];

// Items die für Kinder unter 12 nicht angezeigt werden (child_parent Profil)
const CHILD_EXCLUDED_ITEMS = new Set([
  "chest_tightness",   // Engegefühl in der Brust → nicht kindgerecht
  "dry_mouth",         // Mundtrockenheit → nicht relevant
  "inner_tension",     // Innere Unruhe → zu abstrakt (Eltern beobachten)
  "emotional_outbursts", // Emotionale Ausbrüche → Eltern beurteilen
  "drive",             // Antrieb → zu abstrakt
  "base_mood",         // Grundstimmung → abgedeckt durch Emotionen
  "racing_thoughts",   // (alias, nicht verwendet)
  "thought_racing",    // Gedankenrasen → zu abstrakt für Kind unter 12
  "tics",              // Tics → Eltern beurteilen, nicht Kind
  "tics_note",         // Tics Notiz → auch raus
]);

const CHILD_LABELS: Record<string, string> = {
  sleep_recovery:        "Bist du fit und gut erholt?",
  sleep_latency:         "Wie lange hast du zum Einschlafen gebraucht?",
  sleep_through:         "Hast du gut durchgeschlafen?",
  sleep_duration:        "Wie lange hast du geschlafen?",
  focus:                 "Kannst du dich gut konzentrieren?",
  distractibility:       "Wirst du schnell abgelenkt?",
  impulsivity:           "Machst du manchmal Dinge ohne nachzudenken?",
  inner_tension:         "Bist du innerlich ruhig oder unruhig?",
  frustration_tolerance: "Warst du heute schnell ungeduldig, wenn etwas nicht geklappt hat?",
  emotional_outbursts:   "Hast du heute geweint oder einen Wutausbruch gehabt?",
  drive:                 "Hast du Lust etwas zu tun?",
  base_mood:             "Wie geht es dir insgesamt?",
  hunger:                "Hast du Hunger?",
  appetite:              "Hast du Lust zu essen?",
  meal_hunger:           "Hast du Hunger?",
  meal_appetite:         "Hast du Lust zu essen?",
  meal_eaten:            "Hast du gegessen?",
  meal_amount:           "Wie viel hast du gegessen?",
  breakfast_eaten:       "Hast du gefrühstückt?",
  heart_racing:          "Spürst du dein Herz schnell klopfen?",
  chest_tightness:       "Hast du ein Engegefühl in der Brust?",
  headache:              "Hast du Kopfschmerzen?",
  stomachache:           "Hast du Bauchschmerzen?",
  dry_mouth:             "Ist dein Mund trocken?",
  tics:                  "Hattest du heute Tics?",
  rebound_today:         "Wurdest du nach dem Mittag schlechter gelaunt oder unruhiger?",
  rebound_intensity:     "Wie stark war das Gefühl?",
  school_work_today:     "Warst du heute in der Schule?",
  school_performance:    "Wie war die Schule heute?",
  school_social:         "Wie war es mit deinen Schulkameraden?",
  stress_level:          "Wie gestresst fühlst du dich?",
  social_interactions:   "Wie war es heute mit anderen Kindern?",
  energy_level:          "Wie viel Energie hast du?",
  emotions:              "Wie fühlst du dich gerade?",
};

// Kindgerechte Gruppen-Titel
const CHILD_GROUP_TITLES: Record<string, string> = {
  "Schlaf": "Schlaf",
  "Emotionen": "Gefühle",
  "Energie": "Energie",
  "Konzentration & Kognition": "Aufpassen & Denken",
  "Körper & Nebenwirkungen": "Körpergefühl",
  "Mahlzeit": "Essen",
  "Rebound": "Später am Tag",
  "Schule / Arbeit": "Schule",
  "Reflexion": "Rückblick",
};

// Kindgerechte Emotions-Namen (ersetzt Erwachsenen-Begriffe)
const CHILD_EMOTION_NAMES: Record<string, string> = {
  "Verzweifelt": "Ich weiss nicht mehr weiter",
  "Melancholisch": "Ein bisschen traurig ohne Grund",
  "Euphorisch": "Sehr sehr glücklich",
  "Neutral": "Weder gut noch schlecht",
  "Ausgeglichen": "Ruhig und okay",
  "Stärke": "Stärke",
};

function scaleStyle(val: number, positive: boolean, selected: boolean): React.CSSProperties {
  const pos = ["#f97316","#facc15","#86efac","#16a34a"];
  const neg = ["#16a34a","#86efac","#facc15","#f97316"];
  const posT = ["#7c2d12","#713f12","#14532d","#14532d"];
  const negT = ["#14532d","#14532d","#713f12","#7c2d12"];
  const colors = positive ? pos : neg;
  const texts = positive ? posT : negT;
  const i = val - 1;
  return selected
    ? { backgroundColor: colors[i], color: "#fff", borderColor: colors[i] }
    : { backgroundColor: colors[i] + "25", color: texts[i], borderColor: colors[i] + "60" };
}

function ScaleInput({ value, onChange, itemId }: { value?: number; onChange: (value: number) => void; itemId?: string }) {
  const meta = itemId ? SCALE_LABELS[itemId] : undefined;
  const positive = meta?.positive ?? true;
  return (
    <div className="space-y-2">
      {meta && (
        <div className="flex justify-between text-[10px] text-muted-foreground px-1">
          <span>{meta.lo}</span>
          <span>{meta.hi}</span>
        </div>
      )}
      <div className="grid grid-cols-4 gap-2">
        {SCALE_STEPS.map((step) => (
          <button
            key={step.val}
            type="button"
            onClick={() => onChange(step.val)}
            style={scaleStyle(step.val, positive, value === step.val)}
            className="rounded-2xl border py-4 text-xs font-semibold transition-all"
          >
            {step.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const EMOTION_GROUPS: { label: string; positive: boolean | null; emotions: string[] }[] = [
  { label: "Schwierig", positive: false, emotions: ["Verzweifelt", "Traurig", "Melancholisch", "Ängstlich", "Wütend", "Stumpf/Taub"] },
  { label: "Neutral",   positive: null,  emotions: ["Neutral", "Ausgeglichen"] },
  { label: "Positiv",   positive: true,  emotions: ["Freudig", "Aufgeregt", "Euphorisch"] },
];

const CATEGORY_ICONS: Record<WellbeingItem["category"], typeof Pill> = {
  sleep: Moon,
  mood: Smile,
  rebound: Zap,
  concentration: Brain,
  appetite: Utensils,
  body: HeartPulse,
  social: Users,
  school: GraduationCap,
  cycle: Heart,
  custom: Sparkles,
  reflection: Sparkles,
};

function QuestionIcon({ category }: { category: WellbeingItem["category"] }) {
  const Icon = CATEGORY_ICONS[category] ?? Sparkles;
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Icon className="h-4 w-4" />
    </span>
  );
}

function speak(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-DE";
  window.speechSynthesis.speak(utterance);
}

function SpeakButton({ text }: { text: string }) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return (
    <button
      type="button"
      onClick={() => speak(text)}
      aria-label="Frage vorlesen"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-primary"
    >
      <Volume2 className="h-4 w-4" />
    </button>
  );
}

const CHILD_FACES = [
  { value: 1, emoji: "🙁", color: "bg-orange-100 border-orange-300 text-orange-600" },
  { value: 2, emoji: "😐", color: "bg-yellow-100 border-yellow-300 text-yellow-700" },
  { value: 3, emoji: "🙂", color: "bg-lime-100 border-lime-300 text-lime-700" },
  { value: 4, emoji: "😄", color: "bg-green-100 border-green-300 text-green-700" },
];

function ChildScaleInput({ value, onChange }: { value?: number; onChange: (value: number) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {CHILD_FACES.map((face) => (
        <button
          key={face.value}
          type="button"
          onClick={() => onChange(face.value)}
          className={`flex flex-col items-center justify-center rounded-2xl border-2 py-3 text-2xl ${
            value === face.value ? `${face.color} ring-2 ring-offset-1` : "border-border bg-card"
          }`}
        >
          {face.emoji}
        </button>
      ))}
    </div>
  );
}

function emotionStyle(val: number, positive: boolean | null, selected: boolean): React.CSSProperties {
  if (positive === null) {
    const g = ["#e5e7eb","#d1d5db","#9ca3af","#6b7280"];
    return selected
      ? { backgroundColor: g[val-1], color: "#111827", borderColor: g[val-1] }
      : { backgroundColor: g[val-1] + "25", color: "#444441", borderColor: g[val-1] };
  }
  return scaleStyle(val, positive, selected);
}

function EmotionsInput({ value, onChange, childMode }: { value?: Record<string, number>; onChange: (value: Record<string, number>) => void; childMode?: boolean }) {
  const current = value ?? {};
  // Kindgerechte Emotions-Gruppen: reduziert auf wesentliche Gefühle
  const CHILD_EMOTIONS_CONFIG = [
    { name: "Traurig",              color: "#85B7EB", textColor: "#0C447C" },
    { name: "Wütend",               color: "#E24B4A", textColor: "#501313" },
    { name: "Ängstlich",            color: "#F0997B", textColor: "#712B13" },
    { name: "Ich fühle gar nichts", color: "#B4B2A9", textColor: "#444441" },
    { name: "Ruhig und okay",        color: "#9FE1CB", textColor: "#085041" },
    { name: "Froh / glücklich",     color: "#C0DD97", textColor: "#27500A" },
    { name: "Aufgeregt",             color: "#FAC775", textColor: "#633806" },
  ];
  const CHILD_EMOTIONS = CHILD_EMOTIONS_CONFIG.map(e => e.name);
  const displayGroups = childMode
    ? [{ label: "Gefühle", positive: null, emotions: CHILD_EMOTIONS }]
    : EMOTION_GROUPS;
  return (
    <div className="space-y-4">
      {displayGroups.map((group) => (
        <div key={group.label}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</p>
          <div className="space-y-3">
            {group.emotions.map((emotion) => {
              const childCfg = childMode ? CHILD_EMOTIONS_CONFIG.find(e => e.name === emotion) : undefined;
              return (
              <div key={emotion} className="rounded-xl border border-border bg-card px-3 py-3">
                <p className="mb-2 text-sm font-medium">{childMode ? (CHILD_EMOTION_NAMES[emotion] ?? emotion) : emotion}</p>
                {childMode && childCfg ? (
                  <div className="grid grid-cols-4 gap-1 mb-1">
                    {SCALE_STEPS.map((step) => (
                      <button key={step.val} type="button"
                        onClick={() => onChange({ ...current, [emotion]: step.val })}
                        className="rounded-xl border py-2 text-[11px] font-semibold transition-all"
                        style={current[emotion] === step.val
                          ? { background: childCfg.color, color: childCfg.textColor, borderColor: childCfg.color }
                          : { background: "transparent", color: "#888780", borderColor: "#e0dfd8" }}>
                        {step.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-1 mb-1">
                    {SCALE_STEPS.map((step) => (
                      <button key={step.val} type="button"
                        onClick={() => onChange({ ...current, [emotion]: step.val })}
                        style={emotionStyle(step.val, group.positive, current[emotion] === step.val)}
                        className="rounded-xl border py-2 text-[11px] font-semibold transition-all">
                        {step.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex justify-between text-[9px] text-muted-foreground px-0.5">
                  <span>{group.positive === false ? "trifft gar nicht zu" : "gar nicht"}</span>
                  <span>{group.positive === false ? "trifft voll zu" : "sehr stark"}</span>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function EnergyInput({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  const levels = [
    { val: 1, label: "Leer",    bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", fill: "#ef4444" },
    { val: 2, label: "Niedrig", bg: "#fff7ed", color: "#9a3412", border: "#fdba74", fill: "#f97316" },
    { val: 3, label: "Mittel",  bg: "#fefce8", color: "#854d0e", border: "#fde047", fill: "#eab308" },
    { val: 4, label: "Voll",    bg: "#f0fdf4", color: "#14532d", border: "#86efac", fill: "#22c55e" },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {levels.map((l) => (
          <button key={l.val} type="button" onClick={() => onChange(l.val)}
            style={value === l.val
              ? { backgroundColor: l.bg, borderColor: l.border, color: l.color, borderWidth: 2 }
              : { backgroundColor: "transparent", borderColor: "#e0dfd8", color: "#888780", borderWidth: 1 }}
            className="rounded-2xl border py-4 flex flex-col items-center gap-2 transition-all">
            <div className="flex gap-0.5 items-end h-6">
              {[1,2,3,4].map(i => (
                <div key={i} style={{
                  width: 6, height: 6 + i * 4, borderRadius: 2,
                  backgroundColor: i <= l.val ? (value === l.val ? l.fill : "#d1d5db") : "#f3f4f6"
                }} />
              ))}
            </div>
            <span className="text-[11px] font-semibold">{l.label}</span>
          </button>
        ))}
      </div>
      {value != null && (
        <div className="flex items-center gap-2">
          {[1,2,3,4].map(i => (
            <div key={i} style={{
              flex: 1, height: 10, borderRadius: 3,
              backgroundColor: i <= value ? levels[value-1].fill : "#e5e7eb"
            }} />
          ))}
          <span className="text-xs text-muted-foreground ml-1">{levels[value-1]?.label}</span>
        </div>
      )}
    </div>
  );
}

function BooleanInput({
  value,
  onChange,
}: {
  value?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        [true, "Ja"],
        [false, "Nein"],
      ].map(([bool, label]) => (
        <button
          key={String(bool)}
          type="button"
          onClick={() => onChange(Boolean(bool))}
          className={`rounded-2xl border p-4 text-sm font-semibold ${
            value === bool
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function WizardInput({
  item,
  answer,
  onAnswer,
  childMode,
}: {
  item: WellbeingItem;
  answer?: WellbeingAnswer;
  onAnswer: (answer: WellbeingAnswer) => void;
  childMode?: boolean;
}) {
  const childLabel = childMode ? CHILD_LABELS[item.id] : undefined;
  const setValue = (value: WellbeingAnswer["value"], time?: string) =>
    onAnswer({ itemId: item.id, slot: answer?.slot ?? "morning", value, time });

  if (item.kind === "boolean") {
    return <BooleanInput value={answer?.value as boolean | undefined} onChange={setValue} />;
  }
  if (item.kind === "multiselect") {
    const selected = (answer?.value as string[] | undefined) ?? [];
    return (
      <div className="flex flex-wrap gap-2">
        {(item.options ?? []).map((option) => (
          <Chip
            key={option}
            active={selected.includes(option)}
            onClick={() =>
              setValue(
                selected.includes(option)
                  ? selected.filter((entry) => entry !== option)
                  : [...selected, option],
              )
            }
          >
            {option}
          </Chip>
        ))}
      </div>
    );
  }
  if (item.kind === "time") {
    return (
      <input
        type="time"
        value={answer?.time ?? ""}
        onChange={(event) => setValue(event.target.value, event.target.value)}
        className="w-full rounded-2xl border border-border bg-card p-4 text-lg font-semibold text-primary outline-none focus:border-primary"
      />
    );
  }
  if (item.kind === "energy") {
    return <EnergyInput value={answer?.value as number | undefined} onChange={setValue} />;
  }
  if (item.kind === "text") {
    return (
      <textarea
        value={answer?.value as string ?? ""}
        onChange={(e) => setValue(e.target.value)}
        placeholder={childMode ? "Hier kannst du etwas aufschreiben..." : "Optional..."}
        rows={2}
        className="w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
      />
    );
  }
  if (item.kind === "emotions") {
    return <EmotionsInput value={answer?.value as Record<string, number> | undefined} onChange={(v) => setValue(v as unknown as WellbeingAnswer["value"])} childMode={childMode} />;
  }
  if (item.kind === "number") {
    const isSleep = item.id === "sleep_duration";
    return (
      <div className="flex items-center gap-3">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={isSleep ? 24 : 240}
          step={isSleep ? 0.5 : 1}
          value={answer?.value as number ?? ""}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-32 rounded-2xl border border-border bg-card px-4 py-3 text-2xl font-semibold text-primary outline-none focus:border-primary"
          placeholder={isSleep ? "7.5" : "0"}
        />
        <span className="text-sm text-muted-foreground">{isSleep ? "Stunden" : "Minuten"}</span>
      </div>
    );
  }
  if (childMode) {
    return <ChildScaleInput value={answer?.value as number | undefined} onChange={setValue} />;
  }
  return <ScaleInput value={answer?.value as number | undefined} onChange={setValue} itemId={item.id} />;
}


function SlotWizard({
  slot, log, period, items, onClose, onChange,
}: {
  slot: TimeSlot;
  log: DayLog;
  period: ObservationPeriod;
  items: WellbeingItem[];
  onClose: () => void;
  onChange: Props["onChange"];
}) {
  const [localLog, setLocalLog] = useState<DayLog>(log);
  const slotLog = localLog.slots[slot];
  const [groupIndex, setGroupIndex] = useState(0);
  const childMode = period.profile === "child_self" || period.profile === "child_parent" || period.profile === "child_both" || period.profile === "teen_self";
  const speechEnabled = period.speechOutput === true;

  const patchSlot = (patch: Partial<typeof slotLog>) => {
    const next: DayLog = { ...localLog, slots: { ...localLog.slots, [slot]: { ...slotLog, status: "in_progress", ...patch } } };
    setLocalLog(next);
    onChange(next);
  };

  const activeGroups = QUESTION_GROUPS.filter((group) => {
    if (!group.slots.includes(slot)) return false;
    if (group.items.length === 0) return false;
    if (group.id === "cycle" && period.cycleTracking !== true) return false;
    if ((group as any).childExclude && (period.profile === "child_parent" || period.profile === "child_both")) return false;
    if (group.condition) {
      const a = slotLog.answers[group.condition.itemId];
      if (!a || a.value !== group.condition.value) return false;
    }
    return group.items.some((id) => items.find((i) => i.id === id));
  });

  const steps = ["medication", ...activeGroups.map((g) => g.id), "note"];
  const total = steps.length;
  const currentStep = steps[groupIndex];
  const currentGroup = activeGroups.find((g) => g.id === currentStep);
  const currentItems = currentGroup
    ? (currentGroup.items.map((id) => items.find((i) => i.id === id)).filter(Boolean) as WellbeingItem[])
    : [];

  useEffect(() => {
    if (!speechEnabled) return;
    const title = currentGroup?.title ?? (currentStep === "medication" ? "Medikament" : "Optionale Notiz");
    speak(title);
  }, [groupIndex, speechEnabled]);

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-background/95 px-4 py-6 backdrop-blur">
      <div className="mx-auto max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-primary">Schließen</button>
          <span className="text-xs text-muted-foreground">{groupIndex + 1} / {total}</span>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5">
          {currentStep === "medication" && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">Medikament</h2>
              <div className="space-y-2">
                {period.medications.map((med) => {
                  const taken = slotLog.medicationTaken === true || 
                    (slotLog.medsTaken ?? {})[med.id] === true;
                  const takenDose = (slotLog.medsDose ?? {})[med.id] ?? med.mg;
                  return (
                    <div key={med.id}
                      className={`rounded-2xl border p-4 space-y-2 ${taken ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                      <button
                        type="button"
                        onClick={() => { patchSlot({ medsTaken: { ...(slotLog.medsTaken ?? {}), [med.id]: !taken } }); }}
                        className="w-full flex items-center gap-3 text-left">
                        <div className={`h-8 w-8 rounded-full border-2 flex items-center justify-center text-sm font-bold flex-shrink-0 ${taken ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                          {taken ? "✓" : ""}
                        </div>
                        <span className="flex-1 text-sm font-semibold">{med.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {med.duration === "long" ? "Retard" : "Kurz"}
                        </span>
                      </button>
                      <div className="flex items-center gap-2 pl-11">
                        <input
                          type="number"
                          value={takenDose}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => patchSlot({
                            medsDose: { ...(slotLog.medsDose ?? {}), [med.id]: Number(e.target.value) }
                          })}
                          className="w-20 rounded-xl border border-border bg-background px-2 py-1 text-sm font-semibold outline-none"
                          min={0}
                          step={5}
                        />
                        <span className="text-xs text-muted-foreground">mg</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {taken ? "✓ genommen" : "nicht genommen"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}
          {currentGroup && currentItems.length > 0 && (
            <div className="space-y-5">
              <h2 className="text-2xl font-semibold">{childMode ? (CHILD_GROUP_TITLES[currentGroup.title] ?? currentGroup.title) : currentGroup.title}</h2>
              {currentItems.filter(item =>
                !(period.profile === "child_parent" && CHILD_EXCLUDED_ITEMS.has(item.id))
              ).map((item, idx) => (
                <div key={item.id} className={`space-y-2 ${idx > 0 ? "pt-4 border-t border-border" : ""}`}>
                  <div className="flex items-center gap-2">
                    <QuestionIcon category={item.category} />
                    <p className="flex-1 text-sm font-semibold text-muted-foreground">{(childMode ? CHILD_LABELS[item.id] : undefined) ?? item.label}</p>
                    <SpeakButton text={(childMode ? CHILD_LABELS[item.id] : undefined) ?? item.label} />
                  </div>
                  {item.id === "tics_note" && slotLog.answers["tics"]?.value !== true ? null :
                   ["rebound_time","rebound_type","rebound_intensity","rebound_duration"].includes(item.id) && slotLog.answers["rebound_today"]?.value !== true ? null : (
                    <WizardInput item={item} answer={slotLog.answers[item.id]} childMode={childMode}
                      onAnswer={(answer) => patchSlot({ answers: { ...slotLog.answers, [item.id]: { ...answer, slot } } })} />
                  )}
                </div>
              ))}
            </div>
          )}
          {currentStep === "note" && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold">Optionale Notiz</h2>
              <textarea value={slotLog.note ?? ""} onChange={(e) => patchSlot({ note: e.target.value })}
                placeholder="Was ist für diesen Zeitpunkt wichtig?"
                className="min-h-32 w-full resize-none rounded-2xl border border-border bg-background p-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary" />
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-between">
          <button type="button" disabled={groupIndex === 0}
            onClick={() => setGroupIndex((v) => Math.max(0, v - 1))}
            className="rounded-full px-4 py-2 text-sm font-semibold text-primary disabled:opacity-40">Zurück</button>
          {groupIndex === total - 1 ? (
            <button type="button" onClick={() => { patchSlot({ status: "done" }); onClose(); }}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Fertig</button>
          ) : (
            <button type="button" onClick={() => setGroupIndex((v) => Math.min(total - 1, v + 1))}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">Weiter</button>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── Parent-Admin-Beobachtungsformular ───────────────────────────────────────

const OBS_SCALE = [
  { value: 1, label: "sehr schlecht", color: "#E24B4A" },
  { value: 2, label: "schlecht",      color: "#EF9F27" },
  { value: 3, label: "mittel",        color: "#EAB308" },
  { value: 4, label: "gut",           color: "#97C459" },
  { value: 5, label: "sehr gut",      color: "#1D9E75" },
];

function ObsScale({ label, hint, value, onChange }: { label: string; hint?: string; value?: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {OBS_SCALE.map((s) => (
          <button key={s.value} type="button" onClick={() => onChange(s.value)}
            style={value === s.value ? { borderColor: s.color, background: s.color + "22", color: s.color } : {}}
            className={`rounded-xl border-2 py-2 text-[10px] font-semibold text-center transition-all ${
              value === s.value ? "" : "border-border bg-card text-muted-foreground"
            }`}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ObsYesNo({ label, hint, value, onChange }: { label: string; hint?: string; value?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {([true, false] as const).map((v) => (
          <button key={String(v)} type="button" onClick={() => onChange(v)}
            className={`rounded-xl border-2 py-2.5 text-sm font-semibold transition-all ${
              value === v
                ? v ? "border-green-500 bg-green-50 text-green-700" : "border-red-400 bg-red-50 text-red-700"
                : "border-border bg-card text-muted-foreground"
            }`}>
            {v ? "Ja" : "Nein"}
          </button>
        ))}
      </div>
    </div>
  );
}

function ParentAdminObserverPanel({
  ownerId,
  periodId,
  date,
}: {
  ownerId: string;
  periodId: string;
  date: string;
}) {
  const [open, setOpen]               = useState(false);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [mood, setMood]               = useState<number>();
  const [cooperation, setCooperation] = useState<number>();
  const [emotionReg, setEmotionReg]   = useState<number>();
  const [focus, setFocus]             = useState<number>();
  const [bedtime, setBedtime]         = useState<number>();
  const [rebound, setRebound]         = useState<boolean>();
  const [note, setNote]               = useState("");
  const [status, setStatus]           = useState<"idle" | "saving" | "done">("idle");
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    hasObservationToday(ownerId, ownerId, date)
      .then(setAlreadyDone)
      .catch(() => {});
  }, [ownerId, date]);

  const handleSubmit = async () => {
    setStatus("saving");
    setError(null);
    try {
      const extras = [
        emotionReg !== undefined ? `Emotionsreg.: ${emotionReg}/5` : "",
        bedtime    !== undefined ? `Schlafroutine: ${bedtime}/5`    : "",
        rebound    !== undefined ? `Rebound: ${rebound ? "Ja" : "Nein"}` : "",
        note.trim(),
      ].filter(Boolean).join(" · ");

      await submitObserverObservation(
        ownerId,
        periodId,
        ownerId,
        "Elternteil (Admin)",
        date,
        {
          mood,
          behavior:      cooperation,
          concentration: focus,
          note:          extras || undefined,
        },
      );
      setStatus("done");
      setAlreadyDone(true);
    } catch {
      setError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      setStatus("idle");
    }
  };

  if (!open) {
    return (
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-foreground">
              Deine Beobachtung als Elternteil
              {alreadyDone && (
                <span className="ml-2 inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">✓</span>
              )}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {alreadyDone ? "Heute bereits ausgefüllt" : "Tägliche Einschätzung · 2 Min."}
            </p>
          </div>
          <button type="button" onClick={() => setOpen(true)}
            className="shrink-0 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            {alreadyDone ? "Ändern" : "Ausfüllen"}
          </button>
        </div>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm text-center space-y-2">
        <p className="text-base font-semibold">Gespeichert ✓</p>
        <p className="text-sm text-muted-foreground">Deine Elternteil-Beobachtung für heute wurde gespeichert.</p>
        <button type="button" onClick={() => { setStatus("idle"); setOpen(false); }}
          className="text-xs font-medium text-primary">Schliessen</button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border">
        <div>
          <p className="font-semibold text-foreground">Beobachtung als Elternteil</p>
          <p className="text-xs text-muted-foreground mt-0.5">Wie war es heute zu Hause?</p>
        </div>
        <button type="button" onClick={() => setOpen(false)}
          className="text-sm font-medium text-muted-foreground">Schliessen</button>
      </div>

      <div className="space-y-5 px-5 py-5">
        <ObsScale label="Stimmung zu Hause" value={mood} onChange={setMood} />
        <ObsScale label="Mitarbeit / Kooperation" hint="Anweisungen folgen, Hausaufgaben" value={cooperation} onChange={setCooperation} />
        <ObsScale label="Emotionsregulation" hint="Frustration, Wutausbrüche, Flexibilität" value={emotionReg} onChange={setEmotionReg} />
        <ObsScale label="Fokus / Hausaufgaben" hint="Konzentration bei Aufgaben zu Hause" value={focus} onChange={setFocus} />
        <ObsScale label="Zubettgeh-Routine" hint="Einschlafen, Beruhigung am Abend" value={bedtime} onChange={setBedtime} />
        <ObsYesNo label="Rebound beobachtet?" hint="Stimmungsabfall oder Reizbarkeit am Abend" value={rebound} onChange={setRebound} />

        <div className="space-y-2">
          <p className="text-sm font-semibold">Notiz (optional)</p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Auffälligkeiten, Besonderheiten heute…"
            rows={3}
            className="w-full resize-none rounded-2xl border border-border bg-background p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={status === "saving" || (!mood && !cooperation && !emotionReg && !focus && !bedtime && rebound === undefined)}
          className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {status === "saving" ? "Wird gespeichert…" : "Beobachtung speichern"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function TodayView({ log, settings, onChange, onSettingsChange, userId, hasExistingLogs }: Props) {
  const period = getActivePeriod(settings);
  const [activeSlot, setActiveSlot] = useState<TimeSlot | null>(null);
  const [childPhase, setChildPhase] = useState(false);
  const items = useMemo(() => availableWellbeingItems(settings), [settings]);
  const isChildParent = period?.profile === "child_parent" || period?.profile === "child_both";

  if (!period && !hasExistingLogs) {
    return <Onboarding settings={settings} onSettingsChange={onSettingsChange} userId={userId} />;
  }
  if (!period) {
    return (
      <div className="space-y-4 pt-6 pb-32 px-1">
        <p className="text-sm text-muted-foreground">
          Keine aktive Beobachtungsperiode. Gehe zu <strong>Konto</strong> um eine neue Periode zu starten.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-32">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {new Date(log.date).toLocaleDateString("de-DE", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Heute erfassen</h1>
        <p className="mt-1 text-sm text-muted-foreground">{period.name}</p>
      </header>

      <div className="grid gap-3">
        {TIME_SLOTS.map((slot) => {
          const slotLog = log.slots[slot];
          const answerCount = Object.keys(slotLog.answers).length;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => {
                if (isChildParent && slot === "evening") {
                  const childDone = (log.slots.evening as any).childDone;
                  if (!childDone) { setChildPhase(true); }
                  setActiveSlot(slot);
                } else {
                  setActiveSlot(slot);
                }
              }}
              className="rounded-3xl border border-border bg-card p-5 text-left shadow-sm transition-transform active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
                    {slot === "morning" ? (
                      <CalendarDays className="h-5 w-5" />
                    ) : slot === "midday" ? (
                      <Pill className="h-5 w-5" />
                    ) : (
                      <Clock className="h-5 w-5" />
                    )}
                  </div>
                  <h2 className="text-xl font-semibold">{SLOT_LABELS[slot]}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Start um {period.timeSlots[slot]} · {answerCount} Antworten
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                  {statusLabel(slotLog.status)}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <SectionCard title="Heute im Blick" >
        <div className="grid grid-cols-3 gap-2 text-center">
          {TIME_SLOTS.map((slot) => (
            <div key={slot} className="rounded-2xl bg-primary/10 p-3">
              <p className="text-xs text-muted-foreground">{SLOT_LABELS[slot]}</p>
              <p className="mt-1 text-lg font-semibold text-primary">
                {log.slots[slot].status === "done" ? "✓" : "–"}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      {activeSlot && isChildParent && activeSlot === "evening" && childPhase && (
        <div className="fixed inset-0 z-30 bg-background overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-4">
            <button type="button" onClick={() => { setChildPhase(false); setActiveSlot(null); }}
              className="text-sm font-semibold text-primary">Schliessen</button>
            <span className="text-xs text-muted-foreground">Kind-Teil</span>
          </div>
          <ChildWizard
            period={period}
            log={log}
            onDone={(patch) => {
              onChange(patch);
              setChildPhase(false);
            }}
          />
        </div>
      )}

      {activeSlot && !(isChildParent && activeSlot === "evening" && childPhase) && (
        <SlotWizard
          slot={activeSlot}
          log={log}
          period={period}
          items={items}
          onClose={() => setActiveSlot(null)}
          onChange={onChange}
        />
      )}

      {(period.profile === "child_parent" || period.profile === "child_both") && userId && (
        <ParentAdminObserverPanel
          ownerId={userId}
          periodId={period.id}
          date={log.date}
        />
      )}
    </div>
  );
}


