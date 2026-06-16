import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listObservers, submitObserverObservation } from "@/lib/clar-observers";
import { todayKey } from "@/lib/clar-storage";
import { useStore } from "@/lib/clar-storage";

export const Route = createFileRoute("/_authenticated/beobachten")({
  ssr: false,
  head: () => ({ meta: [{ title: "Beobachtung — clar.log" }] }),
  component: PartnerBeobachtung,
});

const FACES = [
  { value: 1, label: "schlecht", color: "#E24B4A" },
  { value: 2, label: "nicht so gut", color: "#EF9F27" },
  { value: 3, label: "mittel", color: "#EAB308" },
  { value: 4, label: "gut", color: "#97C459" },
  { value: 5, label: "sehr gut", color: "#1D9E75" },
];

function ScaleInput({ label, value, onChange }: { label: string; value?: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <div className="grid grid-cols-5 gap-2">
        {FACES.map((f) => (
          <button key={f.value} type="button" onClick={() => onChange(f.value)}
            style={value === f.value ? { borderColor: f.color, background: f.color + "22", color: f.color } : {}}
            className={`rounded-2xl border-2 py-2 text-xs font-semibold transition-all ${
              value === f.value ? "" : "border-border bg-card text-muted-foreground"
            }`}>
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PartnerBeobachtung() {
  const { userId } = useStore();
  const [loading, setLoading] = useState(true);
  const [observerEntry, setObserverEntry] = useState<{ ownerId: string; periodId: string; name?: string } | null>(null);
  const [mood, setMood] = useState<number>();
  const [behavior, setBehavior] = useState<number>();
  const [concentration, setConcentration] = useState<number>();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    // Suche ob dieser User als Observer eingeladen wurde
    supabase
      .from("observers")
      .select("owner_id, period_id, name")
      .eq("observer_user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setObserverEntry({ ownerId: data.owner_id, periodId: data.period_id, name: data.name ?? undefined });
        }
        setLoading(false);
      });
  }, [userId]);

  const handleSubmit = async () => {
    if (!observerEntry || !userId) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitObserverObservation(
        observerEntry.ownerId,
        observerEntry.periodId,
        userId,
        observerEntry.name,
        todayKey(),
        { mood, behavior, concentration, note: note.trim() || undefined }
      );
      setDone(true);
    } catch (err) {
      setError("Senden fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">Lädt…</div>;

  if (!observerEntry) {
    return (
      <div className="py-12 text-center space-y-2">
        <p className="text-sm font-semibold">Keine aktive Beobachtungsrolle</p>
        <p className="text-xs text-muted-foreground">Du wurdest noch nicht als Beobachter eingeladen.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="py-12 text-center space-y-2">
        <p className="text-lg font-semibold">Danke!</p>
        <p className="text-sm text-muted-foreground">Deine Beobachtung für heute wurde gespeichert.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Fremdbeobachtung</p>
        <h1 className="mt-1 text-2xl font-semibold">Wie war es heute?</h1>
        <p className="mt-1 text-sm text-muted-foreground">Deine tägliche Einschätzung — 1 Minute</p>
      </header>

      <ScaleInput label="Stimmung heute" value={mood} onChange={setMood} />
      <ScaleInput label="Verhalten heute" value={behavior} onChange={setBehavior} />
      <ScaleInput label="Konzentration heute" value={concentration} onChange={setConcentration} />

      <div className="space-y-2">
        <p className="text-sm font-semibold text-muted-foreground">Notiz (optional)</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Besonderheiten heute…"
          rows={3}
          className="w-full resize-none rounded-2xl border border-border bg-card p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button type="button" onClick={handleSubmit}
        disabled={submitting || (!mood && !behavior && !concentration)}
        className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">
        {submitting ? "Wird gespeichert…" : "Beobachtung speichern"}
      </button>
    </div>
  );
}
