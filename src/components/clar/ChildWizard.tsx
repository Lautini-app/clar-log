import { useState } from "react";
import type { DayLog, ObservationPeriod, WellbeingAnswer } from "@/lib/clar-storage";

type Props = {
  period: ObservationPeriod;
  log: DayLog;
  onDone: (patch: Partial<DayLog>) => void;
};

const CHILD_FEELINGS = [
  { id: "sad",      label: "Traurig",              color: "#85B7EB", textColor: "#0C447C" },
  { id: "scared",   label: "Ängstlich",             color: "#F0997B", textColor: "#712B13" },
  { id: "angry",    label: "Wütend",                color: "#E24B4A", textColor: "#501313" },
  { id: "numb",     label: "Ich fühle gar nichts",  color: "#B4B2A9", textColor: "#444441" },
  { id: "calm",     label: "Ruhig und okay",         color: "#9FE1CB", textColor: "#085041" },
  { id: "happy",    label: "Froh / glücklich",       color: "#C0DD97", textColor: "#27500A" },
  { id: "excited",  label: "Aufgeregt",              color: "#FAC775", textColor: "#633806" },
];

type ChildAnswers = {
  feeling?: string;
  energy?: number;        // 1=leer 2=halb 3=voll
  wellSlept?: boolean;
  bodyOk?: boolean;       // false = Bauch/Kopfweh
  schoolOk?: number;      // 1-4 Gesichter
  note?: string;
};

function FaceButton({ label, score, selected, onSelect }: {
  label: string; score: number; selected: boolean; onSelect: () => void;
}) {
  const faces = [
    { d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 13.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm2-5H8c-.55 0-1-.45-1-1s.45-1 1-1h8c.55 0 1 .45 1 1s-.45 1-1 1z", color: "#E24B4A" },
    { d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 13.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm2-4H8c-.55 0-1-.45-1-1s.45-1 1-1h8c.55 0 1 .45 1 1s-.45 1-1 1z", color: "#EF9F27" },
    { d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 13.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1-4.5c0 1.66-1.34 3-3 3s-3-1.34-3-3h6z", color: "#97C459" },
    { d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 13.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1-3.5H7c-.55 0-1-.45-1-1 0-2.76 2.24-5 5-5s5 2.24 5 5c0 .55-.45 1-1 1z", color: "#22c55e" },
  ];
  const face = faces[score - 1];
  return (
    <button type="button" onClick={onSelect}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        padding: "16px 8px", borderRadius: 16, border: selected ? `3px solid ${face.color}` : "2px solid #e0dfd8",
        background: selected ? face.color + "22" : "#fff", cursor: "pointer", flex: 1, transition: "all .2s"
      }}>
      <svg viewBox="0 0 24 24" style={{ width: 48, height: 48 }} fill={face.color}>
        <path d={face.d} />
      </svg>
      <span style={{ fontSize: 12, fontWeight: selected ? 600 : 400, color: selected ? face.color : "#888780", textAlign: "center", lineHeight: 1.3 }}>
        {label}
      </span>
    </button>
  );
}

function BatteryButton({ level, selected, onSelect }: { level: 1|2|3; selected: boolean; onSelect: () => void }) {
  const colors = { 1: "#E24B4A", 2: "#EF9F27", 3: "#22c55e" };
  const labels = { 1: "Leer", 2: "Mittel", 3: "Voll" };
  const pct = { 1: 20, 2: 55, 3: 90 };
  const color = colors[level];
  return (
    <button type="button" onClick={onSelect}
      style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        padding: "16px 8px", borderRadius: 16, border: selected ? `3px solid ${color}` : "2px solid #e0dfd8",
        background: selected ? color + "22" : "#fff", cursor: "pointer", transition: "all .2s"
      }}>
      <div style={{ width: 32, height: 56, borderRadius: 6, border: `2px solid ${color}`, position: "relative", overflow: "hidden", background: "#f1efe8" }}>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: `${pct[level]}%`, background: color, borderRadius: "0 0 4px 4px", transition: "height .3s" }} />
        <div style={{ position: "absolute", top: -6, left: "50%", transform: "translateX(-50%)", width: 12, height: 6, background: color, borderRadius: "2px 2px 0 0" }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: selected ? 600 : 400, color: selected ? color : "#888780" }}>{labels[level]}</span>
    </button>
  );
}

function BigYesNo({ question, value, onChange }: { question: string; value?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ space: "y-3" }}>
      <p style={{ fontSize: 16, fontWeight: 500, marginBottom: 12, lineHeight: 1.4 }}>{question}</p>
      <div style={{ display: "flex", gap: 12 }}>
        {([true, false] as const).map((v) => (
          <button key={String(v)} type="button" onClick={() => onChange(v)}
            style={{
              flex: 1, padding: "20px 8px", borderRadius: 16, fontSize: 18, fontWeight: 600,
              border: value === v ? `3px solid ${v ? "#22c55e" : "#E24B4A"}` : "2px solid #e0dfd8",
              background: value === v ? (v ? "#f0fdf4" : "#FCEBEB") : "#fff",
              color: value === v ? (v ? "#14532d" : "#A32D2D") : "#888780",
              cursor: "pointer", transition: "all .2s"
            }}>
            {v ? "Ja" : "Nein"}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChildWizard({ period, log, onDone }: Props) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ChildAnswers>({});
  const childName = period.name || "du";

  const patch = (p: Partial<ChildAnswers>) => setAnswers((a) => ({ ...a, ...p }));

  const steps = [
    {
      question: `Wie fühlst du dich gerade, ${childName}?`,
      hint: "Wähle das Gefühl das am besten passt.",
      content: (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {CHILD_FEELINGS.map((f) => (
            <button key={f.id} type="button" onClick={() => patch({ feeling: f.id })}
              style={{
                flex: "1 1 calc(50% - 5px)", padding: "14px 10px", borderRadius: 14,
                border: answers.feeling === f.id ? `3px solid ${f.color}` : "2px solid #e0dfd8",
                background: answers.feeling === f.id ? f.color + "33" : "#fff",
                color: answers.feeling === f.id ? f.textColor : "#444441",
                fontSize: 14, fontWeight: answers.feeling === f.id ? 600 : 400,
                cursor: "pointer", transition: "all .2s", textAlign: "left"
              }}>
              {f.label}
            </button>
          ))}
        </div>
      ),
      canNext: () => !!answers.feeling,
    },
    {
      question: "Wie ist deine Energie?",
      hint: "Wie viel Kraft hast du gerade?",
      content: (
        <div style={{ display: "flex", gap: 12 }}>
          {([1, 2, 3] as const).map((level) => (
            <BatteryButton key={level} level={level} selected={answers.energy === level} onSelect={() => patch({ energy: level })} />
          ))}
        </div>
      ),
      canNext: () => answers.energy !== undefined,
    },
    {
      question: "Wie hast du heute Nacht geschlafen?",
      hint: "",
      content: (
        <div style={{ display: "flex", gap: 8 }}>
          {(["Sehr gut", "Gut", "Nicht so gut", "Schlecht"] as const).map((label, i) => (
            <FaceButton key={label} label={label} score={4 - i} selected={answers.wellSlept === (i < 2)} onSelect={() => patch({ wellSlept: i < 2 })} />
          ))}
        </div>
      ),
      canNext: () => answers.wellSlept !== undefined,
    },
    {
      question: "Hast du Bauchschmerzen oder Kopfschmerzen?",
      hint: "",
      content: (
        <BigYesNo question="" value={answers.bodyOk !== undefined ? !answers.bodyOk : undefined} onChange={(v) => patch({ bodyOk: !v })} />
      ),
      canNext: () => answers.bodyOk !== undefined,
    },
    {
      question: "Wie war die Schule heute?",
      hint: "",
      content: (
        <div style={{ display: "flex", gap: 8 }}>
          {(["Sehr gut", "Gut", "Nicht so gut", "Schwierig"] as const).map((label, i) => (
            <FaceButton key={label} label={label} score={4 - i} selected={answers.schoolOk === 4 - i} onSelect={() => patch({ schoolOk: 4 - i })} />
          ))}
        </div>
      ),
      canNext: () => answers.schoolOk !== undefined,
    },
    {
      question: "Möchtest du noch etwas sagen?",
      hint: "Das ist freiwillig.",
      content: (
        <textarea
          value={answers.note ?? ""}
          onChange={(e) => patch({ note: e.target.value })}
          placeholder="z.B. Heute war die Pause schön..."
          rows={3}
          style={{
            width: "100%", borderRadius: 12, border: "1.5px solid #e0dfd8",
            padding: "12px 14px", fontSize: 14, resize: "none", outline: "none",
            fontFamily: "inherit", background: "#fafaf8", color: "#333"
          }}
        />
      ),
      canNext: () => true,
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  const handleDone = () => {
    // Kindantworten als WellbeingAnswers in evening slot schreiben
    const eveningAnswers: Record<string, WellbeingAnswer> = {
      child_feeling: { itemId: "child_feeling", slot: "evening", value: answers.feeling },
      child_energy: { itemId: "child_energy", slot: "evening", value: answers.energy },
      child_slept: { itemId: "child_slept", slot: "evening", value: answers.wellSlept },
      child_body: { itemId: "child_body", slot: "evening", value: answers.bodyOk },
      child_school: { itemId: "child_school", slot: "evening", value: answers.schoolOk },
      child_note: { itemId: "child_note", slot: "evening", value: answers.note ?? "" },
    };
    const updatedEvening = {
      ...log.slots.evening,
      answers: { ...log.slots.evening.answers, ...eveningAnswers },
      childDone: true,
    };
    onDone({ slots: { ...log.slots, evening: updatedEvening } });
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 120px" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= step ? "#085041" : "#e0dfd8",
              transition: "background .3s"
            }} />
          ))}
        </div>
        <p style={{ fontSize: 12, color: "#888780", marginBottom: 8 }}>
          Frage {step + 1} von {steps.length}
        </p>
        <h2 style={{ fontSize: 22, fontWeight: 500, lineHeight: 1.3, marginBottom: 4 }}>
          {current.question}
        </h2>
        {current.hint && (
          <p style={{ fontSize: 13, color: "#888780", marginBottom: 16 }}>{current.hint}</p>
        )}
      </div>

      <div style={{ marginBottom: 32 }}>
        {current.content}
      </div>

      <div style={{ display: "flex", gap: 12, position: "fixed", bottom: 24, left: 16, right: 16, maxWidth: 448, margin: "0 auto" }}>
        {step > 0 && (
          <button type="button" onClick={() => setStep((s) => s - 1)}
            style={{
              padding: "14px 20px", borderRadius: 50, border: "1.5px solid #e0dfd8",
              background: "#fff", fontSize: 14, fontWeight: 500, color: "#085041", cursor: "pointer"
            }}>
            Zurück
          </button>
        )}
        <button type="button"
          onClick={isLast ? handleDone : () => setStep((s) => s + 1)}
          disabled={!current.canNext()}
          style={{
            flex: 1, padding: "14px 20px", borderRadius: 50,
            background: current.canNext() ? "#085041" : "#d3d1c7",
            color: "#fff", fontSize: 16, fontWeight: 600, border: "none",
            cursor: current.canNext() ? "pointer" : "not-allowed", transition: "background .2s"
          }}>
          {isLast ? "Fertig — Eltern sind dran" : "Weiter"}
        </button>
      </div>
    </div>
  );
}
