import { useState } from "react";
import type { Medication, MedType, Settings } from "@/lib/clar-storage";
import { SectionCard } from "./SectionCard";
import { Pill, Plus, X, Zap, Clock, Heart, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { deleteAllUserData } from "@/lib/clar-sync";
import { deleteAccount } from "@/lib/account.functions";

export function SettingsView({
  settings,
  onChange,
  onReset,
  userId,
}: {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
  userId: string | null;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleHardDelete() {
    const ok = confirm(
      "Alle deine Daten dauerhaft löschen?\n\nDas entfernt alle Logs und Einstellungen aus der Cloud und auf diesem Gerät und meldet dich ab. Nicht widerrufbar.",
    );
    if (!ok) return;
    const confirm2 = prompt('Zur Bestätigung bitte "LÖSCHEN" eingeben:');
    if (confirm2 !== "LÖSCHEN") return;
    setDeleting(true);
    try {
      if (userId) {
        // 1) Daten löschen, solange wir noch authentifiziert sind (RLS).
        await deleteAllUserData(userId);
        // 2) auth.users-Eintrag löschen via Service-Role-Server-Funktion.
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (accessToken) {
          try {
            await deleteAccount({ data: { accessToken } });
          } catch (err) {
            console.warn("[clar] account delete failed:", err);
            alert(
              "Deine Daten wurden gelöscht, aber der Account konnte nicht entfernt werden. Bitte später erneut versuchen oder Support kontaktieren.",
            );
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

  const updateMed = (id: string, patch: Partial<Medication>) => {
    onChange({
      medications: settings.medications.map((m) =>
        m.id === id ? { ...m, ...patch } : m,
      ),
    });
  };

  const removeMed = (id: string) => {
    onChange({ medications: settings.medications.filter((m) => m.id !== id) });
  };

  const addMed = (type: MedType) => {
    const med: Medication = {
      id: crypto.randomUUID(),
      name:
        type === "retard"
          ? "Neues Retard-Medikament"
          : type === "instant"
            ? "Neues Bedarfsmedikament"
            : "Neue sonstige",
      mg: 10,
      type,
    };
    onChange({ medications: [...settings.medications, med] });
  };

  return (
    <div className="space-y-4 pb-32">
      <header className="pt-2 animate-fade-up">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Personalisieren</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">Einstellungen</h1>
      </header>

      <SectionCard title="Wochenfokus" subtitle="Erscheint jeden Abend als eine kurze Frage.">
        <textarea
          value={settings.weeklyFocus}
          onChange={(e) => onChange({ weeklyFocus: e.target.value })}
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm text-foreground outline-none"
        />
      </SectionCard>

      <SectionCard
        title="Medikamente"
        subtitle="Lege ein Retard-Medikament und ein Bedarfsmedikament an."
      >
        <div className="space-y-2">
          {settings.medications.map((m) => (
            <div
              key={m.id}
              className="rounded-xl border border-border bg-background/40 p-3"
            >
              <div className="mb-2 flex items-center gap-2">
                {m.type === "retard" ? (
                  <Clock className="h-4 w-4 text-primary" />
                ) : m.type === "instant" ? (
                  <Zap className="h-4 w-4 text-primary" />
                ) : (
                  <Heart className="h-4 w-4 text-primary" />
                )}
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {m.type === "retard"
                    ? "Retard (Dauerwirkung)"
                    : m.type === "instant"
                      ? "Instant (bei Bedarf)"
                      : "Sonstige"}
                </span>
                <button
                  onClick={() => removeMed(m.id)}
                  className="ml-auto grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                  aria-label="Medikament löschen"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={m.name}
                  onChange={(e) => updateMed(m.id, { name: e.target.value })}
                  className="col-span-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm text-foreground outline-none"
                />
                <div className="flex items-center gap-1 rounded-lg border border-border bg-background/60 px-2">
                  <input
                    type="number"
                    value={m.mg}
                    onChange={(e) => updateMed(m.id, { mg: Number(e.target.value) })}
                    className="w-full bg-transparent py-2 text-right text-sm text-foreground outline-none"
                  />
                  <span className="text-xs text-muted-foreground">mg</span>
                </div>
              </div>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => addMed("retard")}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" /> Retard
            </button>
            <button
              onClick={() => addMed("instant")}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" /> Bei Bedarf
            </button>
            <button
              onClick={() => addMed("antidepressant")}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" /> Sonstige
            </button>
          </div>
          {settings.medications.length === 0 && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Pill className="h-3 w-3" /> Noch keine Medikamente hinterlegt.
            </p>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Erinnerungen" subtitle="Werden für die simulierten Hinweise verwendet.">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">Morgens</span>
            <input
              type="time"
              value={settings.morningTime}
              onChange={(e) => onChange({ morningTime: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm text-foreground outline-none [color-scheme:dark]"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Abends</span>
            <input
              type="time"
              value={settings.eveningTime}
              onChange={(e) => onChange({ eveningTime: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-background/40 px-3 py-2.5 text-sm text-foreground outline-none [color-scheme:dark]"
            />
          </label>
        </div>
      </SectionCard>

      <button
        onClick={() => {
          if (confirm("Alle Logs und Einstellungen löschen?")) onReset();
        }}
        className="w-full rounded-xl border border-destructive/40 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        Daten auf diesem Gerät zurücksetzen
      </button>

      <SectionCard title="Konto & Datenschutz" subtitle={userId ? "Eingeloggt — Daten werden mit clar.cloud synchronisiert." : "Nicht eingeloggt — nur lokal."}>
        <div className="space-y-2">
          <button
            onClick={handleHardDelete}
            disabled={deleting}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/40 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-60"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Alle meine Daten löschen (DSGVO)
          </button>
          <p className="text-[11px] text-muted-foreground">
            Entfernt alle Logs und Einstellungen aus der clar.cloud sowie lokal.
          </p>
        </div>
      </SectionCard>

      <p className="text-center text-xs text-muted-foreground">
        clar.tracker · auf diesem Gerät gespeichert · kein Konto nötig
      </p>
    </div>
  );
}