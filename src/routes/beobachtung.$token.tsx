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

const FACES = [
  { value: 1, emoji: "😢" },
  { value: 2, emoji: "🙁" },
  { value: 3, emoji: "😐" },
  { value: 4, emoji: "🙂" },
  { value: 5, emoji: "😄" },
];

function FaceScale({ label, value, onChange }: { label: string; value?: number; onChange: (value: number) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <div className="grid grid-cols-5 gap-2">
        {FACES.map((face) => (
          <button
            key={face.value}
            type="button"
            onClick={() => onChange(face.value)}
            className={`rounded-2xl border-2 py-3 text-2xl ${
              value === face.value ? "border-primary bg-primary/10" : "border-border bg-card"
            }`}
          >
            {face.emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

function BeobachtungRoute() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<"checking" | "valid" | "invalid" | "done">("checking");
  const [mood, setMood] = useState<number>();
  const [behavior, setBehavior] = useState<number>();
  const [concentration, setConcentration] = useState<number>();
  const [note, setNote] = useState("");
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
      await submitTeacherObservation(token, todayKey(), { mood, behavior, concentration, note: note.trim() || undefined });
      setStatus("done");
    } catch (err) {
      setError("Senden fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "checking") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Lädt…</div>;
  }

  if (status === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-sm text-muted-foreground">Dieser Link ist abgelaufen oder ungültig. Bitte neuen Link anfordern.</p>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-base font-semibold">Danke! Die Beobachtung wurde übermittelt.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Fremdbeobachtung</p>
        <h1 className="mt-1 text-2xl font-semibold">Kurzes Tagesfeedback</h1>
        <p className="mt-1 text-sm text-muted-foreground">Kein Login nötig — diese Angaben gehen direkt an die beobachtende Familie.</p>
      </header>

      <FaceScale label="Stimmung heute" value={mood} onChange={setMood} />
      <FaceScale label="Verhalten heute" value={behavior} onChange={setBehavior} />
      <FaceScale label="Konzentration heute" value={concentration} onChange={setConcentration} />

      <label className="block space-y-2">
        <span className="text-sm font-semibold text-muted-foreground">Notiz (optional)</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Besonderheiten heute…"
          className="min-h-24 w-full resize-none rounded-2xl border border-border bg-card p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {submitting ? "Wird gesendet…" : "Absenden"}
      </button>
    </div>
  );
}
