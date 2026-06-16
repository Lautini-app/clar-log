import { MedicationEditor } from "@/components/clar/TodayView";
import { useState } from "react";
import { Download, Loader2, Plus, Trash2 } from "lucide-react";

import { SectionCard } from "./SectionCard";
import { supabase } from "@/integrations/supabase/client";
import { deleteAccount } from "@/lib/account.functions";
import { deleteAllUserData } from "@/lib/clar-sync";
import type {
  Medication,
  MedicationType,
  ObservationPeriod,
  Settings,
  TimeSlot,
  WellbeingItem,
} from "@/lib/clar-storage";
import {
  MEDICATION_TYPE_LABELS,
  SLOT_LABELS,
  TIME_SLOTS,
  WELLBEING_CATALOG,
  createMedication,
  createPeriod,
  getActivePeriod,
} from "@/lib/clar-storage";

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
  userId: string | null;
};

function makeIcs(period: ObservationPeriod) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//clar//Konto//DE",
    ...TIME_SLOTS.flatMap((slot) => [
      "BEGIN:VEVENT",
      `UID:${period.id}-${slot}@clar`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${period.startDate.replace(/-/g, "")}T${period.timeSlots[slot].replace(":", "")}00`,
      `RRULE:FREQ=DAILY;UNTIL:${period.endDate.replace(/-/g, "")}T235900`,
      `SUMMARY:clar ${SLOT_LABELS[slot]} erfassen`,
      "END:VEVENT",
    ]),
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

function upsertPeriod(settings: Settings, period: ObservationPeriod, onChange: Props["onChange"]) {
  onChange({
    activePeriodId: period.id,
    periods: settings.periods.some((item) => item.id === period.id)
      ? settings.periods.map((item) => (item.id === period.id ? period : item))
      : [...settings.periods, period],
  });
}

function MedicationRows({
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
          <div className="flex gap-2">
            <input
              value={med.name}
              onChange={(event) => update(med.id, { name: event.target.value })}
              className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => onChange(medications.filter((item) => item.id !== med.id))}
              className="grid h-10 w-10 place-items-center rounded-full text-primary hover:bg-primary/10"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <div className="rounded-xl border border-border bg-card p-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Dosis</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  value={med.mg}
                  onChange={(e) => update(med.id, { mg: Number(e.target.value) })}
                  className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm font-semibold outline-none"
                  min={0}
                  step={5}
                />
                <span className="text-sm text-muted-foreground">mg</span>
              </div>
            </div>
            <label className="rounded-xl border border-border bg-card p-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Einnahme
              </span>
              <select
                value={med.intakeSlot}
                onChange={(event) => update(med.id, { intakeSlot: event.target.value as TimeSlot })}
                className="mt-1 w-full bg-transparent text-sm font-semibold outline-none"
              >
                {TIME_SLOTS.map((slot) => (
                  <option key={slot} value={slot}>
                    {SLOT_LABELS[slot]}
                  </option>
                ))}
              </select>
            </label>
            <label className="rounded-xl border border-border bg-card p-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Typ
              </span>
              <select
                value={med.type}
                onChange={(event) =>
                  update(med.id, { type: event.target.value as MedicationType })
                }
                className="mt-1 w-full bg-transparent text-sm font-semibold outline-none"
              >
                {Object.entries(MEDICATION_TYPE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {med.type === "stimulant" && (
              <label className="rounded-xl border border-border bg-card p-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Wirkdauer
                </span>
                <select
                  value={med.duration ?? "short"}
                  onChange={(e) => update(med.id, { duration: e.target.value as "short" | "long" })}
                  className="mt-1 w-full bg-transparent text-sm font-semibold outline-none"
                >
                  <option value="short">Kurzwirksam</option>
                  <option value="long">Langwirksam (Retard)</option>
                </select>
              </label>
            )}
            {med.type === "other" && (
              <label className="rounded-xl border border-border bg-card p-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Bezeichnung
                </span>
                <input
                  type="text"
                  value={med.customName ?? ""}
                  onChange={(e) => update(med.id, { customName: e.target.value })}
                  placeholder="z.B. Melatonin"
                  className="mt-1 w-full bg-transparent text-sm font-semibold outline-none"
                />
              </label>
            )}
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

export function SettingsView({ settings, onChange, onReset, userId }: Props) {
  const [deleting, setDeleting] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const activePeriod = getActivePeriod(settings);

  async function handleHardDelete() {
    const ok = confirm(
      "Alle deine Daten dauerhaft löschen?\n\nDas entfernt alle Logs und Einstellungen aus der Cloud und auf diesem Gerät. Nicht widerrufbar.",
    );
    if (!ok) return;
    const confirm2 = prompt('Zur Bestätigung bitte "LÖSCHEN" eingeben:');
    if (confirm2 !== "LÖSCHEN") return;
    setDeleting(true);
    try {
      if (userId) {
        await deleteAllUserData(userId);
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (accessToken) {
          try {
            await deleteAccount({ data: { accessToken } });
          } catch (err) {
            console.warn("[clar] account delete failed:", err);
            alert("Daten gelöscht, Account-Löschung konnte nicht abgeschlossen werden.");
          }
        }
      } else {
        localStorage.removeItem("clar.tracker.v1");
        localStorage.removeItem("clar.tracker.migrated.v1");
      }
      await supabase.auth.signOut();
      window.location.reload();
    } finally {
      setDeleting(false);
    }
  }

  const updateActivePeriod = (patch: Partial<ObservationPeriod>) => {
    const next = createPeriod({ ...activePeriod, ...patch, id: activePeriod?.id });
    upsertPeriod(settings, next, onChange);
  };

  const addCustomItem = () => {
    const label = customLabel.trim();
    if (!label) return;
    const item: WellbeingItem = {
      id: `custom-${crypto.randomUUID?.() ?? Date.now()}`,
      category: "custom",
      label,
      kind: "scale",
    };
    onChange({ customWellbeingItems: [...settings.customWellbeingItems, item] });
    setCustomLabel("");
  };

  return (
    <div className="space-y-4 pb-32">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Konto</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">clar verwalten</h1>
      </header>

      <SectionCard title="Aktive Periode verwalten">
        {activePeriod ? (
          <div className="space-y-3">
            <label className="block rounded-2xl border border-border bg-background p-3">
              <span className="text-xs font-semibold text-muted-foreground">Name</span>
              <input
                value={activePeriod.name}
                onChange={(event) => updateActivePeriod({ name: event.target.value })}
                className="mt-1 w-full bg-transparent text-base font-semibold outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={activePeriod.startDate}
                onChange={(event) => updateActivePeriod({ startDate: event.target.value })}
                className="rounded-2xl border border-border bg-background p-3 text-sm font-semibold outline-none"
              />
              <input
                type="date"
                value={activePeriod.endDate}
                onChange={(event) => updateActivePeriod({ endDate: event.target.value })}
                className="rounded-2xl border border-border bg-background p-3 text-sm font-semibold outline-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {TIME_SLOTS.map((slot) => (
                <label key={slot} className="rounded-2xl border border-border bg-background p-3">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {SLOT_LABELS[slot]}
                  </span>
                  <input
                    type="time"
                    value={activePeriod.timeSlots[slot]}
                    onChange={(event) =>
                      updateActivePeriod({
                        timeSlots: { ...activePeriod.timeSlots, [slot]: event.target.value },
                      })
                    }
                    className="mt-1 w-full bg-transparent text-sm font-semibold text-primary outline-none"
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => downloadIcs(activePeriod)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              <Download className="h-4 w-4" /> Kalender erneut exportieren
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => upsertPeriod(settings, createPeriod(), onChange)}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Periode erstellen
          </button>
        )}
      </SectionCard>

      {activePeriod && (
        <>
          <SectionCard title="Beobachtungsperiode">
            <button
              type="button"
              onClick={() => onSettingsChange({ ...settings, periods: settings.periods.filter(p => p.id !== activePeriod?.id) })}
              className="w-full rounded-2xl border border-border bg-card p-3 text-sm font-semibold text-primary text-left"
            >
              Periode neu einrichten →
            </button>
          </SectionCard>

          <SectionCard title="Medikamente">
            <MedicationEditor
              medications={activePeriod.medications}
              onChange={(medications) => updateActivePeriod({ medications })}
            />
          </SectionCard>
        </>
      )}

      <SectionCard title="Eigene Befindlichkeiten hinzufügen">
        <div className="flex gap-2">
          <input
            value={customLabel}
            onChange={(event) => setCustomLabel(event.target.value)}
            placeholder="z.B. Geräuschempfindlichkeit"
            className="min-w-0 flex-1 rounded-2xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={addCustomItem}
            className="rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            +
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[...settings.customWellbeingItems].map((item) => (
            <span key={item.id} className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              {item.label}
            </span>
          ))}
          {WELLBEING_CATALOG.slice(0, 5).map((item) => (
            <span key={item.id} className="rounded-full bg-card px-3 py-1.5 text-xs text-muted-foreground">
              {item.label}
            </span>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Sprache">
        <div className="grid grid-cols-2 gap-2">
          {[
            ["de", "Deutsch"],
            ["en", "English"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange({ language: key as Settings["language"] })}
              className={`rounded-2xl py-3 text-sm font-semibold ${
                settings.language === key ? "bg-primary text-primary-foreground" : "bg-card text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </SectionCard>

      <button
        type="button"
        onClick={() => {
          if (confirm("Alle lokalen Logs und Einstellungen löschen?")) onReset();
        }}
        className="w-full rounded-xl border border-primary/40 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
      >
        Daten auf diesem Gerät zurücksetzen
      </button>

      <SectionCard
        title="Konto löschen (DSGVO)"
        subtitle={userId ? "Eingeloggt und synchronisiert." : "Nicht eingeloggt — nur lokale Daten."}
      >
        <button
          type="button"
          onClick={handleHardDelete}
          disabled={deleting}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Konto und Daten löschen
        </button>
      </SectionCard>
    </div>
  );
}
