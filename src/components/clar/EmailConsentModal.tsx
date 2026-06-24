import { useState } from "react";
import { Loader2 } from "lucide-react";
import { setEmailConsent, type ConsentLevel } from "@/lib/email-consent";

type Option = {
  value: ConsentLevel;
  title: string;
  desc: string;
};

const OPTIONS: Option[] = [
  {
    value: "always",
    title: "Ja, dauerhaft",
    desc: "Ich möchte E-Mails von clar by Lautini erhalten — auch nach einer Aboperiode.",
  },
  {
    value: "subscription_only",
    title: "Ja, nur während Abo",
    desc: "Ja, aber nur während ich ein clar-Angebot abonniert habe. Danach soll meine Adresse gelöscht werden.",
  },
  {
    value: "never",
    title: "Nein",
    desc: "Ich möchte keine Marketing-E-Mails erhalten.",
  },
];

export function EmailConsentModal({
  userId,
  onDone,
  allowClose = false,
  onClose,
}: {
  userId: string;
  onDone: (level: ConsentLevel) => void;
  allowClose?: boolean;
  onClose?: () => void;
}) {
  const [selected, setSelected] = useState<ConsentLevel | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    const res = await setEmailConsent(userId, selected);
    if (!res.ok) {
      setError(res.error ?? "Konnte nicht gespeichert werden.");
      setBusy(false);
      return;
    }
    onDone(selected);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">
          E-Mails von clar
        </h2>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
          Möchtest du E-Mails von clar by Lautini erhalten? Du kannst diese Wahl
          jederzeit in den Einstellungen ändern.
        </p>

        <div className="mt-4 space-y-2">
          {OPTIONS.map((opt) => {
            const active = selected === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelected(opt.value)}
                disabled={busy}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background hover:border-primary/50"
                }`}
              >
                <div className="text-sm font-semibold text-foreground">
                  {opt.title}
                </div>
                <div className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {opt.desc}
                </div>
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
          Transaktionsmails (Login, Rechnung, Account-Sicherheit) sind davon
          nicht betroffen — diese erhältst du immer.
        </p>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

        <div className="mt-5 flex gap-2">
          {allowClose && onClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground disabled:opacity-50"
            >
              Abbrechen
            </button>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!selected || busy}
            className="flex-1 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
          >
            {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
