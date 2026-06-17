import { MedicationEditor } from "@/components/clar/TodayView";
import { useEffect, useState } from "react";
import { Copy, Download, Loader2, Plus, Trash2 } from "lucide-react";

import { SectionCard } from "./SectionCard";
import { supabase } from "@/integrations/supabase/client";
import { deleteAccount } from "@/lib/account.functions";
import { inviteFamilyMember, listFamilyMembers } from "@/lib/family.functions";
import { deleteAllUserData } from "@/lib/clar-sync";
import { getActiveTeacherLink, inviteObserver, listObservers, removeObserver, rotateTeacherLink } from "@/lib/clar-observers";
import type {
  Medication,
  MedicationType,
  Observer,
  ObserverRole,
  ObservationPeriod,
  Settings,
  TeacherLink,
  TimeSlot,
  WellbeingItem,
} from "@/lib/clar-storage";
import {
  MAX_OBSERVERS,
  MEDICATION_TYPE_LABELS,
  SLOT_LABELS,
  TIME_SLOTS,
  WELLBEING_CATALOG,
  createMedication,
  createPeriod,
  getActivePeriod,
} from "@/lib/clar-storage";

const OBSERVER_ROLE_LABELS: Record<string, string> = {
  parent: "Familienmitglied / Partner",
};

function ObserverSettings({ ownerId, periodId }: { ownerId: string; periodId: string }) {
  const [observers, setObservers] = useState<Observer[]>([]);
  const [teacherLink, setTeacherLink] = useState<TeacherLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ObserverRole>("parent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [obs, link] = await Promise.all([
        listObservers(ownerId),
        getActiveTeacherLink(ownerId, periodId),
      ]);
      setObservers(obs);
      setTeacherLink(link);
    } catch (err) {
      console.warn("[clar] Beobachter laden fehlgeschlagen:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, [ownerId, periodId]);

  const handleInvite = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (observers.length >= MAX_OBSERVERS) {
      setError(`Maximal ${MAX_OBSERVERS} Beobachter pro Periode.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await inviteObserver(ownerId, trimmed, role);
      setEmail("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : typeof err === "object" ? JSON.stringify(err) : "Einladung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (observerId: string) => {
    setBusy(true);
    try {
      await removeObserver(observerId);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleRotateLink = async () => {
    setBusy(true);
    try {
      const link = await rotateTeacherLink(ownerId, periodId);
      setTeacherLink(link);
    } finally {
      setBusy(false);
    }
  };

  const linkUrl = teacherLink && typeof window !== "undefined" ? `${window.location.origin}/beobachtung/${teacherLink.token}` : null;

  if (loading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {observers.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Beobachter eingeladen.</p>}
        {observers.map((observer) => (
          <div key={observer.id} className="flex items-center gap-2 rounded-2xl border border-border bg-background p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{observer.email}</p>
              <p className="text-xs text-muted-foreground">
                {OBSERVER_ROLE_LABELS[observer.role]} Â· {observer.status === "active" ? "Aktiv" : "Einladung ausstehend"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleRemove(observer.id)}
              disabled={busy}
              className="grid h-9 w-9 place-items-center rounded-full text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
              aria-label="Beobachter entfernen"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {observers.length < MAX_OBSERVERS && (
        <div className="space-y-2 rounded-2xl border border-border bg-background p-3">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="email@beispiel.de"
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(OBSERVER_ROLE_LABELS) as ObserverRole[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setRole(key)}
                className={`rounded-xl border py-2 text-xs font-semibold ${
                  role === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"
                }`}
              >
                {OBSERVER_ROLE_LABELS[key]}
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            type="button"
            onClick={handleInvite}
            disabled={busy || !email.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Beobachter einladen
          </button>
        </div>
      )}
  );
}

type Props = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
  userId: string | null;
};

function TeacherLinkSettings({ ownerId, periodId }: { ownerId: string; periodId: string }) {
  const [teacherLink, setTeacherLink] = useState<{ token: string; url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const { getActiveTeacherLink, rotateTeacherLink } = await import("@/lib/clar-observers");
      const link = await rotateTeacherLink(ownerId, periodId);
      const url = typeof window !== "undefined" ? `${window.location.origin}/beobachtung/${link.token}` : "";
      setTeacherLink({ token: link.token, url, expiresAt: link.expiresAt });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Lehrperson oder TherapeutÂ·in erhÃ¤lt einen Link â kein Login, kein Name im Link. Formular einmal tÃ¤glich oder wÃ¶chentlich ausfÃ¼llbar.
      </p>
      {teacherLink ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{teacherLink.url}</span>
            <button type="button" onClick={() => navigator.clipboard.writeText(teacherLink.url)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-primary hover:bg-primary/10"
              aria-label="Link kopieren">
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            GÃ¼ltig bis {new Date(teacherLink.expiresAt).toLocaleDateString("de-DE")}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Noch kein Link erstellt.</p>
      )}
      <button type="button" onClick={handleCreate} disabled={busy}
        className="w-full rounded-2xl border border-border bg-card p-2.5 text-sm font-semibold text-primary disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : teacherLink ? "Neuen Link erstellen" : "Link erstellen"}
      </button>
    </div>
  );
}

function FamilySettings({ userId, childOnly }: { userId: string; childOnly?: boolean }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"member" | "teen">("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [members, setMembers] = useState<{ member_user_id: string; role: string }[]>([]);
  const [pending, setPending] = useState<{ email: string; role: string; expires_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await listFamilyMembers();
      setMembers(result.members);
      setPending(result.pendingInvites);
    } catch {
      // Tabellen noch nicht angelegt â kein Fehler zeigen
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [userId]);

  const [inviteLink, setInviteLink] = useState<string | null>(null);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    setSuccess(false);
    setInviteLink(null);
    try {
      const result = await inviteFamilyMember({ email: email.trim(), role, name: name.trim() || undefined });
      setInviteLink(result.inviteUrl);
      setEmail("");
      setName("");
      setSuccess(true);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : typeof err === "object" ? JSON.stringify(err) : "Einladung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  const handleRemovePending = async (email: string) => {
    try {
      await supabase.schema("clar_log").from("family_invites").delete().eq("email", email).eq("admin_user_id", userId);
      await refresh();
    } catch (err) {
      console.warn("Einladung lÃ¶schen fehlgeschlagen:", err);
    }
  };

  const ROLE_LABELS: Record<string, string> = {
    member: "Familienmitglied / Partner",
    teen: "Jugendliche/r (12â17)",
    child: "Kind unter 12",
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <>
          {members.length === 0 && pending.length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Mitglieder eingeladen.</p>
          )}
          {members.map((m) => (
            <div key={m.member_user_id} className="flex items-center justify-between rounded-2xl border border-border bg-background p-3">
              <div>
                <p className="text-sm font-semibold">{(m as any).name || ROLE_LABELS[m.role] || m.role}</p>
                <p className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]} Â· Aktiv</p>
              </div>
            </div>
          ))}
          {pending.map((p) => (
            <div key={p.email} className="flex items-center justify-between rounded-2xl border border-border bg-background p-3">
              <div>
                <p className="text-sm font-semibold">{(p as any).name || p.email}</p>
                <p className="text-xs text-muted-foreground">{ROLE_LABELS[p.role] ?? p.role} Â· Einladung ausstehend</p>
              </div>
              <button type="button" onClick={() => handleRemovePending(p.email)}
                className="text-xs text-destructive font-semibold shrink-0 ml-2">Entfernen</button>
            </div>
          ))}
        </>
      )}

      {members.length + pending.length < 4 && (
        <div className="space-y-3 rounded-2xl border border-border bg-background p-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name oder Initialen (z.B. Mama, L.M.)"
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@beispiel.ch"
            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <div className="grid grid-cols-2 gap-2">
            {((childOnly ? ["teen"] : ["member", "teen"]) as const).map((r) => (
              <button key={r} type="button" onClick={() => setRole(r)}
                className={`rounded-xl border py-2 text-xs font-semibold ${
                  role === r ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"
                }`}>
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          {success && (
            <p className="text-xs font-semibold text-primary">â Einladung verschickt.</p>
          )}
          <button type="button" onClick={handleInvite} disabled={busy || !email.trim()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40">
            <Plus className="h-4 w-4" /> Einladen
          </button>
        </div>
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
        <Plus className="h-4 w-4" /> Medikament hinzufÃ¼gen
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
      "Alle deine Daten dauerhaft lÃ¶schen?\n\nDas entfernt alle Logs und Einstellungen aus der Cloud und auf diesem GerÃ¤t. Nicht widerrufbar.",
    );
    if (!ok) return;
    const confirm2 = prompt('Zur BestÃ¤tigung bitte "LÃSCHEN" eingeben:');
    if (confirm2 !== "LÃSCHEN") return;
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
            alert("Daten gelÃ¶scht, Account-LÃ¶schung konnte nicht abgeschlossen werden.");
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
            onClick={() => { window.location.href = "/heute"; }}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Onboarding starten â
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
              }}
              className="w-full rounded-2xl border border-border bg-card p-3 text-sm font-semibold text-primary text-left"
            >
              Neue Periode starten â Onboarding
            </button>
          </SectionCard>

          <SectionCard title="Medikamente">
            <MedicationEditor
              medications={activePeriod.medications}
              onChange={(medications) => updateActivePeriod({ medications })}
            />
          </SectionCard>

          {/* Beobachter einladen: nur fÃ¼r Erwachsene (self) */}
          {userId && (activePeriod.profile === "self" || !activePeriod.profile) && (
            <SectionCard title="Beobachter" subtitle="Partner oder Familienmitglied â fÃ¼llt tÃ¤glich ein Kurzformular aus.">
              <ObserverSettings ownerId={userId} periodId={activePeriod.id} />
            </SectionCard>
          )}
          {/* Kind/Jugendliche/r einladen: nur fÃ¼r Elternteile */}
          {userId && (activePeriod.profile === "child_parent" || activePeriod.profile === "child_both") && (
            <SectionCard title="Kind einladen" subtitle="Kind oder Jugendliche/r erhÃ¤lt Zugang auf eigenem GerÃ¤t.">
              <FamilySettings userId={userId} childOnly />
            </SectionCard>
          )}
          {/* Jugendliche/r einladen: fÃ¼r teen_self Elternteil */}
          {userId && activePeriod.profile === "teen_self" && (
            <SectionCard title="Jugendliche/r einladen" subtitle="Jugendliche/r erhÃ¤lt Zugang auf eigenem GerÃ¤t.">
              <FamilySettings userId={userId} childOnly />
            </SectionCard>
          )}

        </>
      )}



      <SectionCard title="Sprache">
        <div className="grid grid-cols-2 gap-2">
          {[
            ["de", "Deutsch"],
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

      <SectionCard title="Datensicherung & Reset">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              const data = JSON.stringify({ settings, exportedAt: new Date().toISOString() }, null, 2);
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
            Daten exportieren (JSON) â
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirm("Alle lokalen Logs und Einstellungen lÃ¶schen?\n\nEmpfehlung: Vorher exportieren.")) return;
              onReset();
            }}
            className="w-full rounded-xl border border-primary/40 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
          >
            Daten auf diesem GerÃ¤t zurÃ¼cksetzen
          </button>
        </div>
      </SectionCard>

      <SectionCard
        title="Konto lÃ¶schen (DSGVO)"
        subtitle={userId ? "Eingeloggt und synchronisiert." : "Nicht eingeloggt â nur lokale Daten."}
      >
        <button
          type="button"
          onClick={handleHardDelete}
          disabled={deleting}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-primary/40 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Konto und Daten lÃ¶schen
        </button>
      </SectionCard>
    </div>
  );
}



