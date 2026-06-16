import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { resolveTeacherToken, submitTeacherObservation } from "@/lib/clar-observers";
import { todayKey } from "@/lib/clar-storage";

export const Route = createFileRoute("/beobachtung/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Fremdbeobachtung — clar.log" }],
  }),
  component: BeobachtungRoute,
});

const SCALE = [
  { value: 1, label: "sehr schwach", color: "#E24B4A" },
  { value: 2, label: "schwach",      color: "#EF9F27" },
  { value: 3, label: "mittel",       color: "#EAB308" },
  { value: 4, label: "gut",          color: "#97C459" },
  { value: 5, label: "sehr gut",     color: "#1D9E75" },
];

function ScaleInput({ label, hint, value, onChange }: { label: string; hint?: string; value?: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {SCALE.map((s) => (
          <button key={s.value} type="button" onClick={() => onChange(s.value)}
            style={value === s.value ? { borderColor: s.color, background: s.color + "22", color: s.color } : {}}
            className={`rounded-xl border-2 py-2 text-[11px] font-semibold transition-all text-center ${
              value === s.value ? "" : "border-border bg-card text-muted-foreground"
            }`}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function YesNo({ label, value, onChange }: { label: string; value?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">{label}</p>
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

function BeobachtungRoute() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<"checking" | "valid" | "invalid" | "done">("checking");
  const [mode, setMode] = useState<"daily" | "weekly">("daily");
  const [mood, setMood] = useState<number>();
  const [behavior, setBehavior] = useState<number>();
  const [concentration, setConcentration] = useState<number>();
  const [note, setNote] = useState("");
  // Wöchentliche Zusatzfelder
  const [schoolPerf, setSchoolPerf] = useState<number>();
  const [socialBehavior, setSocialBehavior] = useState<number>();
  const [conflictsThisWeek, setConflictsThisWeek] = useState<boolean>();
  const [medEffect, setMedEffect] = useState<number>();
  const [weekNote, setWeekNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resolveTeacherToken(token)
      .then((result) => setStatus(result ? "valid" : "invalid"))
      .catch(() => setStatus("invalid"));
  }, [token]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const combinedNote = [
        note.trim(),
        weekNote.trim(),
        conflictsThisWeek !== undefined ? `Konflikte diese Woche: ${conflictsThisWeek ? "Ja" : "Nein"}` : "",
        schoolPerf !== undefined ? `Schulleistung: ${schoolPerf}/5` : "",
        socialBehavior !== undefined ? `Sozialverhalten: ${socialBehavior}/5` : "",
        medEffect !== undefined ? `Medikamentenwirkung: ${medEffect}/5` : "",
      ].filter(Boolean).join(" | ");

      await submitTeacherObservation(token, todayKey(), {
        mood,
        behavior,
        concentration,
        note: combinedNote || undefined,
      });
      setStatus("done");
    } catch {
      setError("Senden fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "checking") return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Lädt…</div>
  );

  if (status === "invalid") return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <p className="text-sm text-muted-foreground">Dieser Link ist abgelaufen oder ungültig. Bitte neuen Link anfordern.</p>
    </div>
  );

  if (status === "done") return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div className="space-y-2">
        <p className="text-lg font-semibold">Danke!</p>
        <p className="text-sm text-muted-foreground">Die Beobachtung wurde übermittelt.</p>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Fremdbeobachtung</p>
        <h1 className="mt-1 text-2xl font-semibold">Feedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">Kein Login nötig — Angaben gehen direkt an die Familie.</p>
      </header>

      {/* Modus-Wahl */}
      <div className="grid grid-cols-2 gap-2">
        {(["daily", "weekly"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)}
            className={`rounded-xl border-2 py-2 text-sm font-semibold transition-all ${
              mode === m ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"
            }`}>
            {m === "daily" ? "Tagesfeedback" : "Wochenfeedback"}
          </button>
        ))}
      </div>

      {/* Täglich — immer sichtbar */}
      <ScaleInput label="Stimmung heute" value={mood} onChange={setMood} />
      <ScaleInput label="Verhalten heute" hint="Im Unterricht / in der Gruppe" value={behavior} onChange={setBehavior} />
      <ScaleInput label="Konzentration heute" value={concentration} onChange={setConcentration} />

      {/* Wöchentlich — nur bei weekly */}
      {mode === "weekly" && (
        <>
          <div className="border-t border-border pt-4 space-y-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wochenrückblick</p>
            <ScaleInput label="Schulleistung diese Woche" hint="Aufgaben, Tests, Mitarbeit" value={schoolPerf} onChange={setSchoolPerf} />
            <ScaleInput label="Sozialverhalten" hint="Mit Peers, in Gruppen" value={socialBehavior} onChange={setSocialBehavior} />
            <ScaleInput label="Medikamentenwirkung" hint="Soweit beobachtbar" value={medEffect} onChange={setMedEffect} />
            <YesNo label="Konflikte oder besondere Ereignisse diese Woche?" value={conflictsThisWeek} onChange={setConflictsThisWeek} />
            <div className="space-y-2">
              <p className="text-sm font-semibold">Wochennotiz</p>
              <textarea value={weekNote} onChange={(e) => setWeekNote(e.target.value)}
                placeholder="Auffälligkeiten, Fortschritte, Empfehlungen…"
                rows={4}
                className="w-full resize-none rounded-2xl border border-border bg-card p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
          </div>
        </>
      )}

      <div className="space-y-2">
        <p className="text-sm font-semibold text-muted-foreground">Notiz (optional)</p>
        <textarea value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Besonderheiten heute…"
          rows={2}
          className="w-full resize-none rounded-2xl border border-border bg-card p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button type="button" onClick={handleSubmit} disabled={submitting}
        className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">
        {submitting ? "Wird gesendet…" : "Absenden"}
      </button>
    </div>
  );
}
