import { MedicationEditor } from "@/components/clar/TodayView";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Copy, Download, Loader2, Plus, Share2, Trash2 } from "lucide-react";

import { SectionCard } from "./SectionCard";
import { createTeenToken, deleteTeenToken, listTeenTokens } from "@/lib/family.functions";
import type { TeenToken } from "@/lib/family.functions";
import { deletePeriodData } from "@/lib/clar-sync";
import { createObserverLink, listObserverLinks, deleteObserverLink, listTeacherLinks, deleteTeacherLink, createTeacherLink } from "@/lib/clar-observers";
import { generateDoctorLink, getActiveDoctorLink } from "@/lib/doctor-links";
import type {
  Medication,
  MedicationType,
  ObservationPeriod,
  ObserverLink,
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

function LinkRow({
  link, urlBase, onDelete,
}: {
  link: ObserverLink;
  urlBase: string;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const url = `${urlBase}/beobachtung/${link.token}`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    const mailto = `mailto:?subject=${encodeURIComponent("clar·log Beobachtungslink")}&body=${encodeURIComponent(url)}`;
    if (typeof navigator.share === "function") {
      navigator.share({ title: "clar·log Beobachtungslink", url }).catch(() => window.open(mailto, "_blank"));
    } else {
      window.open(mailto, "_blank");
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{link.name || "Beobachter"}</p>
        <button type="button" onClick={() => setConfirmDelete(true)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {confirmDelete ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-destructive">Link wirklich löschen?</p>
          <div className="flex gap-2">
            <button type="button" onClick={onDelete}
              className="flex-1 rounded-xl bg-destructive py-1.5 text-xs font-semibold text-white">
              Löschen
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)}
              className="flex-1 rounded-xl border border-border bg-card py-1.5 text-xs font-semibold text-muted-foreground">
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="truncate text-xs text-muted-foreground">{url}</p>
          <p className="text-xs text-muted-foreground">
            Gültig bis {new Date(link.expiresAt).toLocaleDateString("de-DE")}
            {link.lastUsedAt && <span> · Zuletzt {new Date(link.lastUsedAt).toLocaleDateString("de-DE")}</span>}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={handleCopy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-1.5 text-xs font-semibold text-primary">
              <Copy className="h-3.5 w-3.5" /> {copied ? "Kopiert!" : "Kopieren"}
            </button>
            <button type="button" onClick={handleShare}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-1.5 text-xs font-semibold text-primary">
              <Share2 className="h-3.5 w-3.5" /> Teilen
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ObserverLinkSettings({ ownerId, periodId }: { ownerId: string; periodId: string }) {
  const [links, setLinks] = useState<ObserverLink[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const urlBase = typeof window !== "undefined" ? window.location.origin : "";

  const reload = () =>
    listObserverLinks(ownerId, periodId)
      .then(setLinks)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { reload(); }, [ownerId, periodId]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createObserverLink(ownerId, periodId, name.trim());
      setName("");
      setAdding(false);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteObserverLink(id).catch(() => {});
    await reload();
  };

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Jede Person erhält einen eigenen Link — kein Login nötig. Der Link ist 30 Tage gültig.
      </p>

      {links.map((l) => (
        <LinkRow key={l.id} link={l} urlBase={urlBase} onDelete={() => handleDelete(l.id)} />
      ))}

      {adding ? (
        <div className="space-y-2 rounded-2xl border border-border bg-background p-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Name, z.B. Mama, Papa, Oma"
            autoFocus
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <button type="button" onClick={handleCreate} disabled={busy || !name.trim()}
              className="flex-1 rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Link erstellen"}
            </button>
            <button type="button" onClick={() => { setAdding(false); setName(""); }}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card p-2.5 text-sm font-semibold text-primary">
          <Plus className="h-4 w-4" /> Neuen Beobachter hinzufügen
        </button>
      )}
    </div>
  );
}

type Props = {
  settings: Settings;
  logs?: Record<string, unknown>;
  onChange: (patch: Partial<Settings>) => void;
  onImport: (data: { logs?: Record<string, unknown>; settings?: Partial<Settings> }) => void;
  userId: string | null;
};

function TeacherLinkRow({
  link, urlBase, onDelete,
}: {
  link: { id: string; token: string; name?: string; expiresAt: string };
  urlBase: string;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const url = `${urlBase}/beobachtung/${link.token}`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    const mailto = `mailto:?subject=${encodeURIComponent("clar·log Lehrpersonen-Link")}&body=${encodeURIComponent(url)}`;
    if (typeof navigator.share === "function") {
      navigator.share({ title: "clar·log Lehrpersonen-Link", url }).catch(() => window.open(mailto, "_blank"));
    } else {
      window.open(mailto, "_blank");
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{link.name || "Lehrperson"}</p>
        <button type="button" onClick={() => setConfirmDelete(true)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {confirmDelete ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-destructive">Link wirklich löschen?</p>
          <div className="flex gap-2">
            <button type="button" onClick={onDelete}
              className="flex-1 rounded-xl bg-destructive py-1.5 text-xs font-semibold text-white">
              Löschen
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)}
              className="flex-1 rounded-xl border border-border bg-card py-1.5 text-xs font-semibold text-muted-foreground">
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="truncate text-xs text-muted-foreground">{url}</p>
          <p className="text-xs text-muted-foreground">Gültig bis {new Date(link.expiresAt).toLocaleDateString("de-DE")}</p>
          <div className="flex gap-2">
            <button type="button" onClick={handleCopy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-1.5 text-xs font-semibold text-primary">
              <Copy className="h-3.5 w-3.5" /> {copied ? "Kopiert!" : "Kopieren"}
            </button>
            <button type="button" onClick={handleShare}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-1.5 text-xs font-semibold text-primary">
              <Share2 className="h-3.5 w-3.5" /> Teilen
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TeacherLinkSettings({ ownerId, periodId }: { ownerId: string; periodId: string }) {
  const [links, setLinks] = useState<{ id: string; token: string; name?: string; expiresAt: string }[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const urlBase = typeof window !== "undefined" ? window.location.origin : "";

  const reload = () =>
    listTeacherLinks(ownerId, periodId)
      .then(setLinks)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { reload(); }, [ownerId, periodId]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createTeacherLink(ownerId, periodId, name.trim());
      setName("");
      setAdding(false);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteTeacherLink(id).catch(() => {});
    await reload();
  };

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Jede Lehr- oder Fachperson erhält einen eigenen Link — kein Login nötig, 7 Tage gültig.
      </p>

      {links.map((l) => (
        <TeacherLinkRow key={l.id} link={l} urlBase={urlBase} onDelete={() => handleDelete(l.id)} />
      ))}

      {adding ? (
        <div className="space-y-2 rounded-2xl border border-border bg-background p-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder='z.B. "Fr. Müller Klass." oder "Hr. Weber IF"'
            autoFocus
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <button type="button" onClick={handleCreate} disabled={busy || !name.trim()}
              className="flex-1 rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Link erstellen"}
            </button>
            <button type="button" onClick={() => { setAdding(false); setName(""); }}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card p-2.5 text-sm font-semibold text-primary">
          <Plus className="h-4 w-4" /> Neue Lehrperson hinzufügen
        </button>
      )}
    </div>
  );
}

function TeenTokenRow({
  link, urlBase, onDelete,
}: {
  link: TeenToken;
  urlBase: string;
  onDelete: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const url = `${urlBase}/tagebuch/${link.token}`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    const text = `clar·log Tagebuch für ${link.name}: ${url}`;
    if (typeof navigator.share === "function") {
      navigator.share({ title: `clar·log Tagebuch — ${link.name}`, url, text }).catch(() => {
        void navigator.clipboard.writeText(url);
      });
    } else {
      void navigator.clipboard.writeText(url);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-background p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{link.name}</p>
        <button type="button" onClick={() => setConfirmDelete(true)}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {confirmDelete ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2">
          <p className="text-xs font-semibold text-destructive">Link wirklich löschen?</p>
          <div className="flex gap-2">
            <button type="button" onClick={onDelete}
              className="flex-1 rounded-xl bg-destructive py-1.5 text-xs font-semibold text-white">
              Löschen
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)}
              className="flex-1 rounded-xl border border-border bg-card py-1.5 text-xs font-semibold text-muted-foreground">
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="truncate text-xs text-muted-foreground">{url}</p>
          <p className="text-xs text-muted-foreground">
            Gültig bis {new Date(link.expiresAt).toLocaleDateString("de-DE")}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={handleCopy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-1.5 text-xs font-semibold text-primary">
              <Copy className="h-3.5 w-3.5" /> {copied ? "Kopiert!" : "Kopieren"}
            </button>
            <button type="button" onClick={handleShare}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-1.5 text-xs font-semibold text-primary">
              <Share2 className="h-3.5 w-3.5" /> Teilen
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TeenLinkSettings({ ownerId, periodId }: { ownerId: string; periodId: string }) {
  const [links, setLinks] = useState<TeenToken[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const urlBase = typeof window !== "undefined" ? window.location.origin : "";

  const reload = () =>
    listTeenTokens(ownerId, periodId)
      .then(setLinks)
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { reload(); }, [ownerId, periodId]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createTeenToken(ownerId, periodId, name.trim());
      setName("");
      setAdding(false);
      await reload();
    } catch (err) {
      console.warn("[teen] Link erstellen fehlgeschlagen:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteTeenToken(id).catch(() => {});
    await reload();
  };

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Jugendliche/r erhält einen persönlichen Link — kein Login, kein Konto nötig. Link ist 30 Tage gültig.
      </p>

      {links.map((l) => (
        <TeenTokenRow key={l.id} link={l} urlBase={urlBase} onDelete={() => handleDelete(l.id)} />
      ))}

      {adding ? (
        <div className="space-y-2 rounded-2xl border border-border bg-background p-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Vorname, z.B. Lena"
            autoFocus
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <button type="button" onClick={handleCreate} disabled={busy || !name.trim()}
              className="flex-1 rounded-xl bg-primary py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Link erstellen"}
            </button>
            <button type="button" onClick={() => { setAdding(false); setName(""); }}
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card p-2.5 text-sm font-semibold text-primary">
          <Plus className="h-4 w-4" /> Jugendliche/n hinzufügen
        </button>
      )}
    </div>
  );
}

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

function DoctorLinkSettings({ ownerId, periodId }: { ownerId: string; periodId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getActiveDoctorLink(ownerId, periodId).then(setLink).catch(() => {});
  }, [ownerId, periodId]);

  const handleGenerate = async () => {
    setBusy(true);
    try {
      const url = await generateDoctorLink(ownerId, periodId);
      setLink(url);
    } catch (e) {
      console.warn("Arzt-Link Fehler:", e);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Arzt oder Therapeut·in öffnet den Link im Browser — sieht alle Wochen, kann navigieren. Kein Login nötig.
      </p>
      {link ? (
        <div className="space-y-2">
          <div className="rounded-xl border border-border bg-background p-3">
            <p className="text-xs break-all text-muted-foreground">{link}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleCopy}
              className="flex-1 rounded-2xl border border-border bg-card py-2 text-sm font-semibold text-primary">
              {copied ? "✓ Kopiert" : "Link kopieren"}
            </button>
            <button type="button" onClick={handleGenerate} disabled={busy}
              className="rounded-2xl border border-border bg-card px-3 py-2 text-sm font-semibold text-primary disabled:opacity-40">
              Neu
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={handleGenerate} disabled={busy}
          className="w-full rounded-2xl border border-border bg-card py-2.5 text-sm font-semibold text-primary disabled:opacity-40">
          {busy ? "Erstelle Link…" : "Arzt-Link erstellen"}
        </button>
      )}
    </div>
  );
}

export function SettingsView({ settings, logs, onChange, onImport, userId }: Props) {
  const [customLabel, setCustomLabel] = useState("");
  const [pendingDeletePeriod, setPendingDeletePeriod] = useState<ObservationPeriod | null>(null);
  const [deletingPeriod, setDeletingPeriod] = useState(false);
  const navigate = useNavigate();
  const activePeriod = getActivePeriod(settings);

  const updateActivePeriod = (patch: Partial<ObservationPeriod>) => {
    const next = createPeriod({ ...activePeriod, ...patch, id: activePeriod?.id });
    upsertPeriod(settings, next, onChange);
  };

  const doDeletePeriod = async (period: ObservationPeriod) => {
    setDeletingPeriod(true);
    try {
      if (userId) {
        await deletePeriodData(userId, period.id).catch(() => {});
      }
      const remaining = settings.periods.filter((p) => p.id !== period.id);
      const newActive = settings.activePeriodId === period.id ? remaining[0]?.id : settings.activePeriodId;
      onChange({ periods: remaining, activePeriodId: newActive });
    } finally {
      setDeletingPeriod(false);
      setPendingDeletePeriod(null);
    }
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
            <button
              type="button"
              onClick={() => setPendingDeletePeriod(activePeriod)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/40 px-4 py-2.5 text-sm font-semibold text-destructive hover:bg-destructive/5"
            >
              <Trash2 className="h-4 w-4" /> Periode löschen
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => { window.location.href = "/heute"; }}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Onboarding starten →
          </button>
        )}
      </SectionCard>

      {activePeriod && (
        <>
          <SectionCard title="Beobachtungsperiode">
            <button
              type="button"
              onClick={() => {
                if (!confirm("Neue Periode starten? Das Onboarding startet neu. Deine bisherigen Logs bleiben erhalten.")) return;
                const next = {
                  ...settings,
                  activePeriodId: undefined as string | undefined,
                  periods: settings.periods.map(p =>
                    p.id === activePeriod.id
                      ? { ...p, endDate: new Date().toISOString().split("T")[0], active: false }
                      : p
                  ),
                };
                try { localStorage.removeItem("clar.tracker.v1"); } catch {}
                onChange(next);
                void navigate({ to: "/perioden" });
              }}
              className="w-full rounded-2xl border border-border bg-card p-3 text-sm font-semibold text-primary text-left"
            >
              Neue Periode starten → Onboarding
            </button>
          </SectionCard>

          <SectionCard title="Medikamente">
            <MedicationEditor
              medications={activePeriod.medications}
              onChange={(medications) => updateActivePeriod({ medications })}
            />
          </SectionCard>

          {/* Beobachter: für self + child_parent + teen_self */}
          {userId && (
            <SectionCard title="Beobachter" subtitle="Partner oder zweites Elternteil → füllt täglich ein Kurzformular aus.">
              <ObserverLinkSettings ownerId={userId} periodId={activePeriod.id} />
            </SectionCard>
          )}
          {/* Lehrperson-Link: für child_parent + teen_self (nicht für self) */}
          {userId && activePeriod.profile !== "self" && (
            <SectionCard title="Lehrperson" subtitle="Link für wöchentlichen Fragebogen — kein Login nötig, 7 Tage gültig.">
              <TeacherLinkSettings ownerId={userId} periodId={activePeriod.id} />
            </SectionCard>
          )}
          {userId && (
            <SectionCard title="Jugendliche/r einladen" subtitle="Jugendliche/r erhält einen täglichen Link — kein Login, kein Konto, keine E-Mail nötig.">
              <TeenLinkSettings ownerId={userId} periodId={activePeriod.id} />
            </SectionCard>
          )}

        </>
      )}

            {userId && activePeriod && (
            <SectionCard title="Arzt-Freigabe" subtitle="Schreibgeschützter Link — kein Login, kein Name im Link, 90 Tage gültig.">
              <DoctorLinkSettings ownerId={userId} periodId={activePeriod.id} />
            </SectionCard>
          )}
          <SectionCard title="Daten">
        <div className="space-y-2">
          <label className="block w-full cursor-pointer rounded-xl border border-border bg-card py-3 text-sm font-semibold text-primary text-left px-4">
            Daten importieren (JSON)
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  try {
                    const parsed = JSON.parse(String(reader.result));
                    const payload = parsed && parsed.store ? parsed.store : parsed;
                    const data: { logs?: Record<string, unknown>; settings?: Partial<Settings> } = {};
                    if (payload && typeof payload === "object") {
                      if (payload.logs && typeof payload.logs === "object") data.logs = payload.logs;
                      if (payload.settings && typeof payload.settings === "object") data.settings = payload.settings;
                      if (!data.settings && (payload.periods || payload.customWellbeingItems || payload.activePeriodId)) {
                        data.settings = payload;
                      }
                      if (payload.observer_observations && Array.isArray(payload.observer_observations)) {
                        (data as any).observer_observations = payload.observer_observations;
                      }
                      if (payload.teacher_reports && Array.isArray(payload.teacher_reports)) {
                        (data as any).teacher_reports = payload.teacher_reports;
                      }
                    }
                    if (!data.logs && !data.settings) {
                      window.alert("Keine gueltigen clar.log-Daten in der Datei gefunden.");
                      return;
                    }
                    onImport(data);
                    window.alert("Daten erfolgreich importiert.");
                  } catch {
                    window.alert("Datei konnte nicht gelesen werden (kein gueltiges JSON).");
                  } finally {
                    e.target.value = "";
                  }
                };
                reader.readAsText(file);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const data = JSON.stringify({ settings, logs: logs ?? {}, exportedAt: new Date().toISOString() }, null, 2);
              const blob = new Blob([data], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `clar-log-export-${new Date().toISOString().split("T")[0]}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="w-full rounded-xl border border-border bg-card py-3 text-sm font-semibold text-primary text-left px-4"
          >
            Daten exportieren (JSON) →
          </button>
        </div>
      </SectionCard>

      <LegalSection userId={userId} />
      <DeleteAccountSection userId={userId} />

      {pendingDeletePeriod && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-4 pb-8"
          onClick={() => !deletingPeriod && setPendingDeletePeriod(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-card p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-base font-bold">Periode „{pendingDeletePeriod.name}" wirklich löschen?</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Alle zugehörigen Einträge werden unwiderruflich gelöscht. Empfehlung: vorher exportieren.
            </p>
            <div className="space-y-2">
              <button
                type="button"
                disabled={deletingPeriod}
                onClick={() => {
                  const data = JSON.stringify({ settings, logs: logs ?? {}, exportedAt: new Date().toISOString() }, null, 2);
                  const blob = new Blob([data], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `clar-periode-${pendingDeletePeriod.name || pendingDeletePeriod.id}-${new Date().toISOString().split("T")[0]}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  void doDeletePeriod(pendingDeletePeriod);
                }}
                className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
              >
                Exportieren &amp; Löschen
              </button>
              <button
                type="button"
                disabled={deletingPeriod}
                onClick={() => void doDeletePeriod(pendingDeletePeriod)}
                className="w-full rounded-xl border border-destructive/50 py-3 text-sm font-semibold text-destructive disabled:opacity-40"
              >
                {deletingPeriod ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Löschen"}
              </button>
              <button
                type="button"
                disabled={deletingPeriod}
                onClick={() => setPendingDeletePeriod(null)}
                className="w-full rounded-xl border border-border py-3 text-sm font-semibold text-muted-foreground"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LegalSection({ userId }: { userId: string | null }) {
  const [consentDate, setConsentDate] = useState<string | null>(null);
  const [consentVersion, setConsentVersion] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("user_consents")
          .select("consent_given_at, consent_version")
          .eq("user_id", userId)
          .maybeSingle();
        if (active && data) {
          setConsentDate(data.consent_given_at);
          setConsentVersion(data.consent_version);
        }
      } catch { /* ignore */ }
      if (active) setLoaded(true);
    })();
    return () => { active = false; };
  }, [userId]);

  const formattedDate = consentDate
    ? new Date(consentDate).toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

  return (
    <SectionCard title="Rechtliches">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          clar·log ist kein Medizinprodukt und dient ausschliesslich der persönlichen Dokumentation.
        </p>

        <div className="space-y-1">
          <a
            href="https://blog.lautini.ch/datenschutz-clar-log.html"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm font-medium text-primary"
          >
            Datenschutzerklärung ↗
          </a>
          <a
            href="https://blog.lautini.ch/agb-clar-log.html"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm font-medium text-primary"
          >
            AGB ↗
          </a>
          <a
            href="https://lautini.ch/impressum"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm font-medium text-primary"
          >
            Impressum ↗
          </a>
        </div>

        {loaded && formattedDate && (
          <div className="mt-2 rounded-xl border border-border bg-background p-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Einwilligung erteilt am {formattedDate}, Version {consentVersion ?? "v1.0"}
            </p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Du kannst deine Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen.
              Der Widerruf erfolgt durch Löschung deines Kontos (siehe unten) — dabei werden
              alle deine Daten unwiderruflich gelöscht und dein Abonnement gekündigt.
            </p>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function DeleteAccountSection({ userId }: { userId: string | null }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmText === "LÖSCHEN";

  async function handleDelete() {
    if (!userId || !canDelete || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Keine aktive Sitzung.");

      const { deleteAccount } = await import("@/lib/account.functions");
      await deleteAccount({ accessToken });

      await supabase.auth.signOut();
      if (typeof window !== "undefined") {
        localStorage.removeItem("clar.tracker.v1");
        localStorage.removeItem("clar.tracker.migrated.v1");
      }
      window.location.href = "https://home.lautini.ch";
    } catch (e) {
      setError((e as Error).message || "Löschen fehlgeschlagen.");
      setDeleting(false);
    }
  }

  if (!userId) return null;

  return (
    <div id="delete-account-section" className="mt-6 rounded-2xl border border-destructive/30 bg-card p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-destructive">Gefahrenzone</p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          Löscht dein Konto, alle Daten und kündigt dein Abonnement unwiderruflich. Dieser Vorgang kann nicht rückgängig gemacht werden.
        </p>
      </div>

      {!showConfirm ? (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          className="w-full rounded-xl border border-destructive/50 py-3 text-sm font-semibold text-destructive"
        >
          Konto und alle Daten endgültig löschen
        </button>
      ) : (
        <div className="space-y-3 rounded-xl border border-destructive/30 bg-background p-3">
          <p className="text-sm font-bold text-foreground">
            Möchtest du wirklich dein Konto und ALLE Daten unwiderruflich löschen?
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Dies kann nicht rückgängig gemacht werden. Dein Abonnement wird ebenfalls gekündigt.
            Tippe <strong>LÖSCHEN</strong> zur Bestätigung.
          </p>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="LÖSCHEN"
            className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-mono outline-none focus:border-destructive"
            autoComplete="off"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canDelete || deleting}
              onClick={handleDelete}
              className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Endgültig löschen"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => { setShowConfirm(false); setConfirmText(""); setError(null); }}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm font-semibold text-muted-foreground"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
