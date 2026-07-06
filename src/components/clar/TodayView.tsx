import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
} from "lucide-react";

import { CheckinFlow } from "./CheckinFlow";
import { SectionCard } from "./SectionCard";
import { hasObservationToday, submitObserverObservation } from "@/lib/clar-observers";
import type {
  DayLog,
  IntakeTime,
  Medication,
  ObservationPeriod,
  ProfileType,
  Settings,
  TimeSlot,
} from "@/lib/clar-storage";
import {
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
};

function savePeriodWithInvite(
  settings: Settings,
  period: ObservationPeriod,
  onSettingsChange: Props["onSettingsChange"],
) {
  const periods = settings.periods.some((item) => item.id === period.id)
    ? settings.periods.map((item) => (item.id === period.id ? period : item))
    : [...settings.periods, period];
  onSettingsChange({ periods, activePeriodId: period.id });
}

// ─── MedicationEditor ────────────────────────────────────────────────────────

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

// ─── Onboarding ──────────────────────────────────────────────────────────────

export function Onboarding({ settings, onSettingsChange, userId, onDone }: Pick<Props, "settings" | "onSettingsChange" | "userId"> & { onDone?: () => void }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ObservationPeriod>(() => createPeriod());

  const updateDraft = (patch: Partial<ObservationPeriod>) =>
    setDraft((current) => createPeriod({ ...current, ...patch, id: current.id }));

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
                ["teen_self", "Jugendliche/r (12–17)", "Einladung des Jugendlichen später über den Konto-Tab."],
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
  ];

  // avoid unused-var lint for userId (kept in signature for API compat)
  void userId;

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
              onClick={() => { savePeriodWithInvite(settings, draft, onSettingsChange); onDone?.(); }}
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

// ─── TodayView ───────────────────────────────────────────────────────────────

export function TodayView({ log, settings, onChange, onSettingsChange, userId }: Props) {
  const period = getActivePeriod(settings);
  const navigate = useNavigate();
  const items = useMemo(() => availableWellbeingItems(settings), [settings]);

  // Fallback für ältere Perioden ohne selectedWellbeingIds
  void WELLBEING_CATALOG;

  useEffect(() => {
    if (!period) {
      void navigate({ to: "/perioden", replace: true });
    }
  }, [period, navigate]);

  // avoid unused-var lint
  void onSettingsChange;

  if (!period) return null;

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
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          <button type="button" onClick={() => void navigate({ to: "/perioden" })} className="hover:underline text-left">
            {period.name}
          </button>
        </h1>
      </header>

      <CheckinFlow log={log} period={period} items={items} onChange={onChange} />

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
