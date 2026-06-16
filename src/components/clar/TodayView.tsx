import { useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Pill,
  Plus,
  Trash2,
} from "lucide-react";

import { Chip } from "./Chip";
import { SectionCard } from "./SectionCard";
import type {
  DayLog,
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
};

const CATEGORY_LABEL: Record<WellbeingItem["category"], string> = {
  sleep: "Schlaf",
  mood: "Stimmung",
  rebound: "Rebound",
  concentration: "Konzentration",
  appetite: "Appetit",
  body: "Körper",
  cycle: "Zyklus",
  custom: "Eigene",
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

function MedicationEditor({
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
                          const next = active ? current.filter((t) => t.slot !== slot) : [...current, { slot }];
                          update(med.id, { intakeTimes: next, intakeSlot: next[0]?.slot ?? "morning" });
                        }}
                        className="h-4 w-4 rounded accent-primary"
                      />
                      <span className="flex-1 text-sm font-medium">{labels[slot]}</span>
                      {active && slot !== "asBraucht" && (
                        <input
                          type="time"
                          value={entry?.time ?? ""}
                          onChange={(e) => {
                            const current = med.intakeTimes ?? [];
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

function Onboarding({ settings, onSettingsChange }: Pick<Props, "settings" | "onSettingsChange">) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ObservationPeriod>(() => createPeriod());
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

  const steps = [
    {
      title: "Für wen ist das Tagebuch?",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Wähle aus, wer die Beobachtungen erfasst.</p>
          {([
            ["self", "Für mich selbst", "Ich beobachte mich selbst und fülle täglich aus."],
            ["child_parent", "Für mein Kind (ich fülle aus)", "Ich beobachte mein Kind und erfasse die Daten."],
            ["child_self", "Für mein Kind (Kind füllt aus)", "Mein Kind füllt das Tagebuch selbst aus — kindgerechte Ansicht."],
            ["child_both", "Für mein Kind (beide füllen aus)", "Kind und Elternteil füllen je eigene Ansichten aus."],
          ] as const).map(([key, label, desc]) => (
            <button
              key={key}
              type="button"
              onClick={() => updateDraft({ profile: key as ProfileType })}
              className={`w-full rounded-2xl border p-4 text-left ${
                draft.profile === key
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground"
              }`}
            >
              <div className="text-sm font-semibold">{label}</div>
              <div className={`text-xs mt-1 ${draft.profile === key ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{desc}</div>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Schnellprofil",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Zwei Angaben genügen — der Rest wird automatisch eingerichtet.</p>
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
            {(draft.gender === "female" || draft.gender === "diverse") && (
              <p className="mt-2 text-xs text-primary">Zyklusfragen werden automatisch eingebunden.</p>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">Lebenssituation</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([
                ["pupil", "Schüler/in"],
                ["apprentice", "Lehrling / Ausbildung"],
                ["student", "Studierend"],
                ["employed", "Berufstätig"],
                ["training", "In Weiterbildung"],
                ["unemployed", "Nicht berufstätig"],
                ["unable_to_work", "Arbeitsunfähig"],
                ["retired", "Pensioniert"],
              ] as [string, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => updateDraft({ lifeContext: key as any })}
                  className={`rounded-xl border px-2 py-2 text-xs font-semibold text-left ${
                    draft.lifeContext === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.speechOutput ?? false}
                onChange={(e) => updateDraft({ speechOutput: e.target.checked })}
                className="h-4 w-4 rounded accent-primary"
              />
              <div>
                <div className="font-semibold">Sprachausgabe</div>
                <div className="text-xs text-muted-foreground">Alle Fragen werden vorgelesen</div>
              </div>
            </label>
          </div>
        </div>
      ),
    },
    {
      title: "Name & Zeitraum",
      body: (
        <div className="space-y-3">
          <label className="block rounded-2xl border border-border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">Periodenname</span>
            <input
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
              className="mt-1 w-full bg-transparent text-base font-semibold outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["startDate", "Startdatum"],
              ["endDate", "Enddatum"],
            ].map(([key, label]) => (
              <label key={key} className="block rounded-2xl border border-border bg-card p-3">
                <span className="text-xs font-semibold text-muted-foreground">{label}</span>
                <input
                  type="date"
                  value={draft[key as "startDate" | "endDate"]}
                  onChange={(event) => updateDraft({ [key]: event.target.value })}
                  className="mt-1 w-full bg-transparent text-sm font-semibold outline-none"
                />
              </label>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "Zeitpunkte",
      body: (
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
      ),
    },
    {
      title: "Medikamente",
      body: (
        <MedicationEditor
          medications={draft.medications}
          onChange={(medications) => updateDraft({ medications })}
        />
      ),
    },
    {
      title: "Befindlichkeiten",
      body: (
        <div className="space-y-4">
          {categories.map((category) => (
            <div key={category}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABEL[category]}
              </p>
              <div className="space-y-2">
                {catalog
                  .filter((item) => item.category === category)
                  .map((item) => {
                    const active = draft.selectedWellbeingIds.includes(item.id);
                    return (
                      <div key={item.id} className="rounded-2xl border border-border bg-card p-3">
                        <button
                          type="button"
                          onClick={() => toggleItem(item.id)}
                          className={`w-full text-left text-sm font-semibold ${
                            active ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {active ? "✓ " : ""}
                          {item.label}
                        </button>
                        {active && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {TIME_SLOTS.map((slot) => (
                              <Chip
                                key={slot}
                                active={(draft.wellbeingSlots[item.id] ?? []).includes(slot)}
                                onClick={() => toggleItemSlot(item.id, slot)}
                                className="px-3 py-1.5 text-xs"
                              >
                                {SLOT_LABELS[slot]}
                              </Chip>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: "Kalender-Export",
      body: (
        <div className="space-y-4">
          <div className="rounded-3xl bg-primary/10 p-5 text-sm text-foreground">
            Exportiere Erinnerungen für Morgen, Mittag und Abend als `.ics`.
          </div>
          <button
            type="button"
            onClick={() => downloadIcs(draft)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
          >
            <Download className="h-4 w-4" /> .ics herunterladen
          </button>
        </div>
      ),
    },
    {
      title: "Arzt-Bericht",
      body: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Der Arzt erhält am Ende der Beobachtungsperiode automatisch einen visuellen Bericht und eine Textzusammenfassung. Du kannst den Bericht auch jederzeit manuell versenden.
          </p>
          <label className="block rounded-2xl border border-border bg-card p-3">
            <span className="text-xs font-semibold text-muted-foreground">E-Mail des Arztes (optional)</span>
            <input
              type="email"
              placeholder="arzt@praxis.ch"
              value={draft.doctorEmail ?? ""}
              onChange={(e) => updateDraft({ doctorEmail: e.target.value })}
              className="mt-1 w-full bg-transparent text-sm font-semibold outline-none"
            />
          </label>
          <div className="rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground space-y-1">
            <p>✓ Bericht jederzeit abrufbar — auch während der Periode</p>
            <p>✓ Export als PDF oder per E-Mail</p>
            <p>✓ Daten werden anonymisiert verarbeitet</p>
            <p>✓ Kein Medizinprodukt — Wellness-Tool</p>
          </div>
        </div>
      ),
    },
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
              onClick={() => savePeriod(settings, draft, onSettingsChange)}
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

function ScaleInput({ value, onChange }: { value?: number; onChange: (value: number) => void }) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {[1, 2, 3, 4, 5].map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`rounded-2xl py-3 text-sm font-semibold ${
            value === item ? "bg-primary text-primary-foreground" : "bg-card text-primary"
          }`}
        >
          {item}
        </button>
      ))}
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
}: {
  item: WellbeingItem;
  answer?: WellbeingAnswer;
  onAnswer: (answer: WellbeingAnswer) => void;
}) {
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
  return <ScaleInput value={answer?.value as number | undefined} onChange={setValue} />;
}

function SlotWizard({
  slot,
  log,
  period,
  items,
  onClose,
  onChange,
}: {
  slot: TimeSlot;
  log: DayLog;
  period: ObservationPeriod;
  items: WellbeingItem[];
  onClose: () => void;
  onChange: Props["onChange"];
}) {
  const slotLog = log.slots[slot];
  const questions = items.filter(
    (item) =>
      period.selectedWellbeingIds.includes(item.id) &&
      (period.wellbeingSlots[item.id] ?? TIME_SLOTS).includes(slot),
  );
  const [index, setIndex] = useState(0);
  const total = questions.length + 2;

  const patchSlot = (patch: Partial<typeof slotLog>) => {
    onChange({
      slots: {
        ...log.slots,
        [slot]: { ...slotLog, status: "in_progress", ...patch },
      },
    });
  };

  const medQuestion = index === 0;
  const noteQuestion = index === total - 1;
  const item = questions[index - 1];

  return (
    <div className="fixed inset-0 z-30 bg-background/95 px-4 py-6 backdrop-blur">
      <div className="mx-auto flex h-full max-w-md flex-col">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={onClose} className="text-sm font-semibold text-primary">
            Schließen
          </button>
          <span className="text-xs font-semibold text-muted-foreground">
            {index + 1}/{total}
          </span>
        </div>
        <div className="flex-1 rounded-3xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {SLOT_LABELS[slot]}
          </p>
          {medQuestion && (
            <div className="mt-4 space-y-4">
              <h2 className="text-2xl font-semibold">Medikament genommen?</h2>
              <BooleanInput
                value={slotLog.medicationTaken}
                onChange={(value) => patchSlot({ medicationTaken: value })}
              />
              <label className="block rounded-2xl border border-border bg-background p-4">
                <span className="text-xs font-semibold text-muted-foreground">Uhrzeit</span>
                <input
                  type="time"
                  value={slotLog.medicationTime ?? period.timeSlots[slot]}
                  onChange={(event) => patchSlot({ medicationTime: event.target.value })}
                  className="mt-2 w-full bg-transparent text-lg font-semibold text-primary outline-none"
                />
              </label>
            </div>
          )}
          {item && (
            <div className="mt-4 space-y-5">
              <h2 className="text-2xl font-semibold">{item.label}</h2>
              <WizardInput
                item={item}
                answer={slotLog.answers[item.id]}
                onAnswer={(answer) =>
                  patchSlot({
                    answers: {
                      ...slotLog.answers,
                      [item.id]: { ...answer, slot },
                    },
                  })
                }
              />
            </div>
          )}
          {noteQuestion && (
            <div className="mt-4 space-y-4">
              <h2 className="text-2xl font-semibold">Optionale Notiz</h2>
              <textarea
                value={slotLog.note ?? ""}
                onChange={(event) => patchSlot({ note: event.target.value })}
                placeholder="Was ist für diesen Zeitpunkt wichtig?"
                className="min-h-40 w-full resize-none rounded-2xl border border-border bg-background p-4 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-between">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            className="rounded-full px-4 py-2 text-sm font-semibold text-primary disabled:opacity-40"
          >
            Zurück
          </button>
          {index === total - 1 ? (
            <button
              type="button"
              onClick={() => {
                patchSlot({ status: "done" });
                onClose();
              }}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
            >
              Fertig
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((value) => Math.min(total - 1, value + 1))}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
            >
              Weiter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function TodayView({ log, settings, onChange, onSettingsChange }: Props) {
  const period = getActivePeriod(settings);
  const [activeSlot, setActiveSlot] = useState<TimeSlot | null>(null);
  const items = useMemo(() => availableWellbeingItems(settings), [settings]);

  if (!period) {
    return <Onboarding settings={settings} onSettingsChange={onSettingsChange} />;
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
              onClick={() => setActiveSlot(slot)}
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

      <SectionCard title="Heute im Blick" subtitle="Keine Kurven mehr: eine Frage pro Seite.">
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

      {activeSlot && (
        <SlotWizard
          slot={activeSlot}
          log={log}
          period={period}
          items={items}
          onClose={() => setActiveSlot(null)}
          onChange={onChange}
        />
      )}
    </div>
  );
}
