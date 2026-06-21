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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function weekMonday(): string {
  const d = new Date();
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(d);
  monday.setDate(d.getDate() + offset);
  return monday.toISOString().split("T")[0];
}

function isoWeekNumber(): number {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function avg(...nums: (number | undefined)[]): number | undefined {
  const defined = nums.filter((n): n is number => n !== undefined);
  if (defined.length === 0) return undefined;
  return Math.round(defined.reduce((a, b) => a + b, 0) / defined.length);
}

// ─── Weekly teacher answer bag ────────────────────────────────────────────────

type WeeklyAnswers = {
  amAttention?: number;
  amInstructions?: number;
  amTaskCompletion?: number;
  amMotorUnrest?: number;
  amImpulsivity?: number;

  pmAttention?: number;
  pmTaskCompletion?: number;
  pmMotorUnrest?: number;
  pmImpulsivity?: number;
  pmDifferent?: boolean;
  pmDifferentNote?: string;

  socialPeers?: number;
  socialEmotionReg?: number;
  socialConflicts?: boolean;
  socialConflictsNote?: string;
  socialFrustration?: number;

  orgWorkspace?: number;
  orgMaterials?: number;
  orgTransitions?: number;

  overallRating?: number;
  overallPositive?: string;
  overallChallenges?: string;
  overallNotes?: string;
};

// ─── Shared UI components ─────────────────────────────────────────────────────

const SCALE_LABELS: Record<number, string> = {
  1: "sehr\nschwach",
  2: "schwach",
  3: "mittel",
  4: "gut",
  5: "sehr\ngut",
};

function ScaleInput({
  label, hint, value, onChange,
}: {
  label: string; hint?: string;
  value?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold leading-snug">{label}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 rounded-xl border-2 py-2.5 text-[11px] font-semibold leading-tight whitespace-pre-line text-center transition-all ${
              value === v
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {SCALE_LABELS[v]}
          </button>
        ))}
      </div>
    </div>
  );
}

function YesNo({
  label, hint, value, onChange,
}: {
  label: string; hint?: string; value?: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold leading-snug">{label}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="grid grid-cols-2 gap-2">
        {([true, false] as const).map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            className={`rounded-xl border-2 py-2.5 text-sm font-semibold transition-all ${
              value === v
                ? v
                  ? "border-green-500 bg-green-50 text-green-700"
                  : "border-red-400 bg-red-50 text-red-700"
                : "border-border bg-card text-muted-foreground"
            }`}
          >
            {v ? "Ja" : "Nein"}
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}

// ─── Route component ──────────────────────────────────────────────────────────

function BeobachtungRoute() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<"checking" | "valid" | "invalid" | "done">("checking");
  const [tokenType, setTokenType] = useState<"teacher" | "observer" | null>(null);
  const [personName, setPersonName] = useState<string | undefined>();

  // Teacher weekly form
  const [wa, setWa] = useState<WeeklyAnswers>({});
  const patch = (p: Partial<WeeklyAnswers>) => setWa((prev) => ({ ...prev, ...p }));

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

  const teacherCanSubmit =
    wa.amAttention !== undefined &&
    wa.amInstructions !== undefined &&
    wa.amTaskCompletion !== undefined &&
    wa.amMotorUnrest !== undefined &&
    wa.amImpulsivity !== undefined &&
    wa.pmAttention !== undefined &&
    wa.pmTaskCompletion !== undefined &&
    wa.pmMotorUnrest !== undefined &&
    wa.pmImpulsivity !== undefined &&
    wa.pmDifferent !== undefined &&
    wa.socialPeers !== undefined &&
    wa.socialEmotionReg !== undefined &&
    wa.socialConflicts !== undefined &&
    wa.socialFrustration !== undefined &&
    wa.orgWorkspace !== undefined &&
    wa.orgMaterials !== undefined &&
    wa.orgTransitions !== undefined &&
    wa.overallRating !== undefined &&
    (wa.overallPositive?.trim().length ?? 0) > 0;

  const handleTeacherSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const moodScore = wa.overallRating;
      const concentrationScore = avg(wa.amAttention, wa.amInstructions, wa.amTaskCompletion, wa.pmAttention);
      const behaviorScore = avg(wa.socialPeers, wa.socialEmotionReg, wa.socialFrustration);
      const noteJson = JSON.stringify({
        am: {
          attention: wa.amAttention,
          instructions: wa.amInstructions,
          taskCompletion: wa.amTaskCompletion,
          motorUnrest: wa.amMotorUnrest,
          impulsivity: wa.amImpulsivity,
        },
        pm: {
          attention: wa.pmAttention,
          taskCompletion: wa.pmTaskCompletion,
          motorUnrest: wa.pmMotorUnrest,
          impulsivity: wa.pmImpulsivity,
          different: wa.pmDifferent,
          differentNote: wa.pmDifferentNote ?? "",
        },
        social: {
          peers: wa.socialPeers,
          emotionReg: wa.socialEmotionReg,
          conflicts: wa.socialConflicts,
          conflictsNote: wa.socialConflictsNote ?? "",
          frustration: wa.socialFrustration,
        },
        org: {
          workspace: wa.orgWorkspace,
          materials: wa.orgMaterials,
          transitions: wa.orgTransitions,
        },
        overall: {
          rating: wa.overallRating,
          positive: wa.overallPositive ?? "",
          challenges: wa.overallChallenges ?? "",
          notes: wa.overallNotes ?? "",
        },
        meta: { teacherName: personName ?? "", week: weekMonday(), kw: isoWeekNumber() },
      });
      await submitTeacherObservation(token, weekMonday(), {
        mood: moodScore,
        behavior: behaviorScore,
        concentration: concentrationScore,
        note: noteJson,
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
        <p className="text-sm text-muted-foreground">
          {tokenType === "teacher"
            ? "Der Wochenbericht wurde übermittelt."
            : "Die Beobachtung wurde übermittelt."}
        </p>
      </div>
    </div>
  );

  // ─── Observer (home/parent) form ─────────────────────────────────────────────

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
          <textarea
            value={observerNote}
            onChange={(e) => setObserverNote(e.target.value)}
            placeholder="Auffälligkeiten, Besonderheiten heute…"
            rows={3}
            className="w-full resize-none rounded-2xl border border-border bg-card p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <button
          type="button"
          onClick={handleObserverSubmit}
          disabled={submitting || (!homeMood && !homeCooperation && !homeEmotionReg && !homeFocus && !homeBedtime && homeRebound === undefined)}
          className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
        >
          {submitting ? "Wird gesendet…" : "Absenden"}
        </button>
      </div>
    );
  }

  // ─── Teacher weekly form ──────────────────────────────────────────────────────

  const kw = isoWeekNumber();

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-8 pb-16">
      <header>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          KW {kw} · {new Date().getFullYear()}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Wochenbericht</h1>
        {personName && (
          <p className="mt-0.5 text-sm text-muted-foreground">{personName}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Kein Login nötig — Angaben gehen direkt an die Familie.</p>
      </header>

      {/* VORMITTAG */}
      <SectionBox title="Vormittag">
        <ScaleInput
          label="Aufmerksamkeit im Unterricht"
          value={wa.amAttention} onChange={(v) => patch({ amAttention: v })}
        />
        <ScaleInput
          label="Instruktionen befolgen"
          value={wa.amInstructions} onChange={(v) => patch({ amInstructions: v })}
        />
        <ScaleInput
          label="Aufgaben beginnen und abschliessen"
          value={wa.amTaskCompletion} onChange={(v) => patch({ amTaskCompletion: v })}
        />
        <ScaleInput
          label="Motorische Unruhe"
          value={wa.amMotorUnrest} onChange={(v) => patch({ amMotorUnrest: v })}
        />
        <ScaleInput
          label="Impulsives Reinrufen"
          value={wa.amImpulsivity} onChange={(v) => patch({ amImpulsivity: v })}
        />
      </SectionBox>

      {/* NACHMITTAG */}
      <SectionBox title="Nachmittag">
        <ScaleInput
          label="Aufmerksamkeit"
          value={wa.pmAttention} onChange={(v) => patch({ pmAttention: v })}
        />
        <ScaleInput
          label="Aufgaben abschliessen"
          value={wa.pmTaskCompletion} onChange={(v) => patch({ pmTaskCompletion: v })}
        />
        <ScaleInput
          label="Motorische Unruhe"
          value={wa.pmMotorUnrest} onChange={(v) => patch({ pmMotorUnrest: v })}
        />
        <ScaleInput
          label="Impulsivität"
          value={wa.pmImpulsivity} onChange={(v) => patch({ pmImpulsivity: v })}
        />
        <YesNo
          label="Unterschied zum Vormittag?"
          value={wa.pmDifferent}
          onChange={(v) => patch({ pmDifferent: v })}
        />
        {wa.pmDifferent && (
          <textarea
            value={wa.pmDifferentNote ?? ""}
            onChange={(e) => patch({ pmDifferentNote: e.target.value })}
            placeholder="Was hat sich verändert?"
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        )}
      </SectionBox>

      {/* SOZIALES & EMOTIONALES */}
      <SectionBox title="Soziales & Emotionales">
        <ScaleInput
          label="Interaktion mit Gleichaltrigen"
          value={wa.socialPeers} onChange={(v) => patch({ socialPeers: v })}
        />
        <ScaleInput
          label="Emotionale Regulation"
          value={wa.socialEmotionReg} onChange={(v) => patch({ socialEmotionReg: v })}
        />
        <YesNo
          label="Konflikte auf dem Pausenplatz?"
          value={wa.socialConflicts}
          onChange={(v) => patch({ socialConflicts: v })}
        />
        {wa.socialConflicts && (
          <textarea
            value={wa.socialConflictsNote ?? ""}
            onChange={(e) => patch({ socialConflictsNote: e.target.value })}
            placeholder="Kurze Beschreibung…"
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        )}
        <ScaleInput
          label="Frustrationstoleranz"
          value={wa.socialFrustration} onChange={(v) => patch({ socialFrustration: v })}
        />
      </SectionBox>

      {/* ORGANISATION */}
      <SectionBox title="Organisation">
        <ScaleInput
          label="Arbeitsplatz ordentlich"
          value={wa.orgWorkspace} onChange={(v) => patch({ orgWorkspace: v })}
        />
        <ScaleInput
          label="Material dabei"
          value={wa.orgMaterials} onChange={(v) => patch({ orgMaterials: v })}
        />
        <ScaleInput
          label="Übergänge zwischen Aktivitäten"
          value={wa.orgTransitions} onChange={(v) => patch({ orgTransitions: v })}
        />
      </SectionBox>

      {/* GESAMTEINDRUCK */}
      <SectionBox title="Gesamteindruck">
        <ScaleInput
          label="Gesamtbeurteilung der Woche"
          value={wa.overallRating} onChange={(v) => patch({ overallRating: v })}
        />
        <div className="space-y-2">
          <p className="text-sm font-semibold">Positives diese Woche <span className="text-destructive">*</span></p>
          <textarea
            value={wa.overallPositive ?? ""}
            onChange={(e) => patch({ overallPositive: e.target.value })}
            placeholder="Was lief gut diese Woche?"
            rows={3}
            className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">Herausforderungen (optional)</p>
          <textarea
            value={wa.overallChallenges ?? ""}
            onChange={(e) => patch({ overallChallenges: e.target.value })}
            placeholder="Was war schwierig?"
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">Weitere Beobachtungen (optional)</p>
          <textarea
            value={wa.overallNotes ?? ""}
            onChange={(e) => patch({ overallNotes: e.target.value })}
            placeholder="Sonstige Hinweise…"
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-background p-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        </div>
      </SectionBox>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!teacherCanSubmit && (
        <p className="text-xs text-muted-foreground text-center">
          Bitte alle Felder ausfüllen und «Positives diese Woche» angeben.
        </p>
      )}

      <button
        type="button"
        onClick={handleTeacherSubmit}
        disabled={submitting || !teacherCanSubmit}
        className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        {submitting ? "Wird gesendet…" : "Wochenbericht absenden"}
      </button>
    </div>
  );
}
