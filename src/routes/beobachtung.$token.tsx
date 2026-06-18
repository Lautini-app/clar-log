import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  resolveObserverToken,
  resolveTeacherToken,
  submitObservationByObserverToken,
  submitTeacherObservation,
} from "@/lib/clar-observers";
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

function YesNo({ label, hint, value, onChange }: { label: string; hint?: string; value?: boolean; onChange: (v: boolean) => void }) {
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

function BeobachtungRoute() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<"checking" | "valid" | "invalid" | "done">("checking");
  const [tokenType, setTokenType] = useState<"teacher" | "observer" | null>(null);
  const [personName, setPersonName] = useState<string | undefined>();

  // Teacher fields
  const [mood, setMood] = useState<number>();
  const [behavior, setBehavior] = useState<number>();
  const [concentration, setConcentration] = useState<number>();
  const [teacherNote, setTeacherNote] = useState("");

  // Observer (home/parent) fields
  const [homeMood, setHomeMood] = useState<number>();
  const [homeCooperation, setHomeCooperation] = useState<number>();
  const [homeEmotionReg, setHomeEmotionReg] = useState<number>();
  const [homeFocus, setHomeFocus] = useState<number>();
  const [homeBedtime, setHomeBedtime] = useState<number>();
  const [homeRebound, setHomeRebound] = useState<boolean>();
  const [observerNote, setObserverNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    resolveTeacherToken(token)
      .then((result) => {
        if (result) {
          setTokenType("teacher");
          setPersonName(result.name);
          setStatus("valid");
        } else {
          return resolveObserverToken(token).then((obsResult) => {
            if (obsResult) {
              setTokenType("observer");
              setPersonName(obsResult.name);
              setStatus("valid");
            } else {
              setStatus("invalid");
            }
          });
        }
      })
      .catch(() => setStatus("invalid"));
  }, [token]);

  const handleTeacherSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submitTeacherObservation(token, todayKey(), {
        mood,
        behavior,
        concentration,
        note: teacherNote.trim() || undefined,
      });
      setStatus("done");
    } catch {
      setError("Senden fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleObserverSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await submitObservationByObserverToken(token, todayKey(), {
        home_mood: homeMood,
        home_cooperation: homeCooperation,
        home_emotional_regulation: homeEmotionReg,
        home_focus_homework: homeFocus,
        home_bedtime_routine: homeBedtime,
        home_rebound_observed: homeRebound,
        note: observerNote.trim() || undefined,
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

  if (tokenType === "observer") {
    return (
      <div className="mx-auto max-w-md space-y-5 px-4 py-8">
        <header>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            {personName ? `Hallo ${personName}` : "Wie war es heute?"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Kein Login nötig — Angaben gehen direkt an die Familie.</p>
        </header>

        <ScaleInput label="Stimmung zu Hause" value={homeMood} onChange={setHomeMood} />
        <ScaleInput label="Mitarbeit / Kooperation" hint="Anweisungen folgen, Hausaufgaben" value={homeCooperation} onChange={setHomeCooperation} />
        <ScaleInput label="Emotionsregulation" hint="Frustration, Wutausbrüche, Flexibilität" value={homeEmotionReg} onChange={setHomeEmotionReg} />
        <ScaleInput label="Fokus / Hausaufgaben" hint="Konzentration bei Aufgaben zu Hause" value={homeFocus} onChange={setHomeFocus} />
        <ScaleInput label="Zubettgeh-Routine" hint="Einschlafen, Beruhigung am Abend" value={homeBedtime} onChange={setHomeBedtime} />
        <YesNo label="Rebound beobachtet?" hint="Stimmungsabfall oder Reizbarkeit am Abend" value={homeRebound} onChange={setHomeRebound} />

        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">Notiz (optional)</p>
          <textarea value={observerNote} onChange={(e) => setObserverNote(e.target.value)}
            placeholder="Auffälligkeiten, Besonderheiten heute…"
            rows={3}
            className="w-full resize-none rounded-2xl border border-border bg-card p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button type="button" onClick={handleObserverSubmit} disabled={submitting || (!homeMood && !homeCooperation && !homeEmotionReg && !homeFocus && !homeBedtime && homeRebound === undefined)}
          className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          {submitting ? "Wird gesendet…" : "Absenden"}
        </button>
      </div>
    );
  }

  // Teacher form
  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-8">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">
          {personName ? `Hallo ${personName}` : "Feedback"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Kein Login nötig — Angaben gehen direkt an die Familie.</p>
      </header>

      <ScaleInput label="Stimmung heute" value={mood} onChange={setMood} />
      <ScaleInput label="Verhalten heute" hint="Im Unterricht / in der Gruppe" value={behavior} onChange={setBehavior} />
      <ScaleInput label="Konzentration heute" value={concentration} onChange={setConcentration} />

      <div className="space-y-2">
        <p className="text-sm font-semibold text-muted-foreground">Notiz (optional)</p>
        <textarea value={teacherNote} onChange={(e) => setTeacherNote(e.target.value)}
          placeholder="Besonderheiten heute…"
          rows={2}
          className="w-full resize-none rounded-2xl border border-border bg-card p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button type="button" onClick={handleTeacherSubmit} disabled={submitting}
        className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">
        {submitting ? "Wird gesendet…" : "Absenden"}
      </button>
    </div>
  );
}
