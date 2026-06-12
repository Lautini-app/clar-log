import { useState } from "react";
import { Mail, WifiOff, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export function AuthScreen({ onOfflineContinue }: { onOfflineContinue: () => void }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const online = typeof navigator === "undefined" ? true : navigator.onLine;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("sending");
    setErrorMsg(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <div className="mb-8 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/20 text-primary">
            <span className="text-sm font-bold">c.</span>
          </div>
          <span className="text-sm font-medium tracking-tight text-foreground">
            clar.<span className="text-muted-foreground">tracker</span>
          </span>
        </div>

        <h1 className="text-2xl font-semibold text-foreground">Anmelden</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Wir schicken dir einen Magic-Link per E-Mail. Kein Passwort nötig.
        </p>

        {!online && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
            <WifiOff className="h-3.5 w-3.5" /> Offline. Du kannst lokal weiterarbeiten.
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">E-Mail</span>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-background/40 px-3 py-2.5">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                required
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={status === "sending" || status === "sent"}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {status === "sending" && <Loader2 className="h-4 w-4 animate-spin" />}
            {status === "sent" ? "Mail verschickt" : "Magic-Link senden"}
            {status === "idle" && <ArrowRight className="h-4 w-4" />}
          </button>
        </form>

        {status === "sent" && (
          <p className="mt-4 rounded-lg border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground">
            Prüfe dein Postfach. Der Link öffnet die App direkt.
          </p>
        )}
        {status === "error" && errorMsg && (
          <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {errorMsg}
          </p>
        )}

        <button
          type="button"
          onClick={onOfflineContinue}
          className="mt-8 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Ohne Konto offline weiterarbeiten
        </button>

        <p className="mt-10 text-center text-[10px] text-muted-foreground">
          Deine Daten liegen verschlüsselt in clar.cloud · DSGVO · Server in der EU
        </p>
      </div>
    </div>
  );
}