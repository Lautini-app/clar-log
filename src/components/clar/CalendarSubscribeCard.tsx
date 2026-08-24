import { useState } from "react";

/**
 * Kalender-Abo für Personen, die clar·log nur über ihren persönlichen Link
 * nutzen (Beobachter:innen, Jugendliche). Sie brauchen keinen Account:
 * der Link ist der Schlüssel, das Abo erinnert sie zu den vereinbarten Zeiten.
 */
export function CalendarSubscribeCard({
  token,
  kind,
}: {
  token: string;
  kind: "beobachtung" | "tagebuch";
}) {
  const [copied, setCopied] = useState(false);
  const [showManual, setShowManual] = useState(false);

  const base =
    typeof window !== "undefined" ? window.location.origin : "https://clar.log.lautini.ch";
  const httpsUrl = `${base}/api/calendar/${kind}/${token}.ics`;
  const webcalUrl = httpsUrl.replace(/^https?/, "webcal");
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${webcalUrl}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShowManual(true);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <p className="text-sm font-semibold">📅 Erinnerungen in deinen Kalender</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Du bekommst zu den vereinbarten Zeiten eine Erinnerung — im Termin ist dein
          persönlicher Link, ein Tipp genügt.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <a
          href={webcalUrl}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background py-2 text-xs font-semibold text-primary"
        >
          🍎 iPhone / Mac: abonnieren
        </a>
        <a
          href={googleUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background py-2 text-xs font-semibold text-primary"
        >
          📆 Google Kalender: abonnieren
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background py-2 text-xs font-semibold text-primary"
        >
          {copied ? "Abo-Adresse kopiert!" : "Abo-Adresse kopieren"}
        </button>
      </div>

      {showManual && (
        <p className="break-all rounded-xl bg-background p-2 text-[11px] text-muted-foreground">
          {httpsUrl}
        </p>
      )}

      <details className="text-[11px] text-muted-foreground">
        <summary className="cursor-pointer font-semibold">Klappt es nicht?</summary>
        <p className="mt-2">
          Apple fragt beim Abonnieren einmal «Unsichere Verbindung» — auf «Fortfahren»
          tippen, geladen wird trotzdem verschlüsselt.
        </p>
        <p className="mt-2">
          Ganz ohne Rückfrage: «Abo-Adresse kopieren», dann Einstellungen → Kalender →
          Accounts → Account hinzufügen → Andere → Kalenderabo hinzufügen → Adresse
          einfügen.
        </p>
      </details>
    </div>
  );
}
