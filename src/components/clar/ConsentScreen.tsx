import { useState } from "react";

type Props = {
  onAccept: () => void;
  loading?: boolean;
};

export function ConsentScreen({ onAccept, loading }: Props) {
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);

  const allChecked = check1 && check2;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F3EE] px-5 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#085041]/20">
            <span className="text-sm font-bold text-[#085041]">c.</span>
          </div>
          <span className="text-sm font-medium tracking-tight text-[#1a1a1a]">
            clar.<span className="text-[#1a1a1a]/50">log</span>
          </span>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h1 className="mb-4 text-lg font-semibold text-[#1a1a1a]">
            Einwilligung & Hinweise
          </h1>

          <p className="mb-5 text-sm font-bold text-[#1a1a1a]">
            clar·log dient der Unterstützung der Medikamenteneinstellung durch
            bessere Dokumentation. Die finale Entscheidung über die Medikation
            trifft immer der behandelnde Arzt.
          </p>

          <div className="space-y-4">
            <label className="flex gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={check1}
                onChange={(e) => setCheck1(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#085041] rounded"
              />
              <span className="text-sm text-[#1a1a1a]/80 leading-snug">
                Mir ist bewusst, dass clar·log kein Medizinprodukt ist und keine
                medizinischen Zwecke erfüllt (insbesondere keine Diagnose,
                Therapie oder medizinische Überwachung). Die App dient
                ausschliesslich der persönlichen Dokumentation. Die Nutzung
                erfolgt auf eigene Verantwortung.
              </span>
            </label>

            <label className="flex gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={check2}
                onChange={(e) => setCheck2(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#085041] rounded"
              />
              <span className="text-sm text-[#1a1a1a]/80 leading-snug">
                Ich habe die{" "}
                <a
                  href="https://blog.lautini.ch/datenschutz-clar-log.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#085041] underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Datenschutzerklärung
                </a>{" "}
                und die{" "}
                <a
                  href="https://blog.lautini.ch/agb-clar-log.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#085041] underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  AGB
                </a>{" "}
                gelesen und stimme ausdrücklich der Verarbeitung meiner besonders
                schützenswerten Gesundheitsdaten (einschliesslich Daten von
                Minderjährigen, falls zutreffend) zu den darin genannten
                Bedingungen zu. Mir ist bekannt, dass ich diese Einwilligung
                jederzeit mit Wirkung für die Zukunft widerrufen kann.
              </span>
            </label>
          </div>

          <p className="mt-4 text-xs text-[#1a1a1a]/50 leading-snug">
            Mit dem Fortfahren bestätigen Sie, dass Sie mindestens 18 Jahre alt
            sind oder die erforderliche Einwilligung eines Erziehungsberechtigten
            haben.
          </p>

          <button
            onClick={onAccept}
            disabled={!allChecked || loading}
            className="mt-5 w-full rounded-xl bg-[#085041] py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {loading ? "Wird gespeichert …" : "Einwilligung erteilen und App nutzen"}
          </button>
        </div>

        <p className="text-center text-xs text-[#1a1a1a]/40">
          clar · log — Teil der clar App-Familie von Lautini
        </p>
      </div>
    </div>
  );
}
