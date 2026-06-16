import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { acceptFamilyInvite } from "@/lib/family.functions";

export const Route = createFileRoute("/einladung/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Einladung — clar.log" }] }),
  component: EinladungRoute,
});

function EinladungRoute() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<"loading" | "register" | "accepting" | "done" | "error">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Prüfen ob User bereits eingeloggt
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setStep("accepting");
        handleAccept(data.session.access_token);
      } else {
        setStep("register");
      }
    });
  }, []);

  const handleAccept = async (_accessToken?: string) => {
    setBusy(true);
    setError(null);
    try {
      await acceptFamilyInvite(token);
      setStep("done");
      setTimeout(() => navigate({ to: "/heute" }), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Annehmen der Einladung.");
      setStep("error");
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: undefined, data: { invite_token: token } }
      });
      if (authError) throw authError;
      // Wenn keine Session (E-Mail-Bestätigung aktiv) → direkt einloggen versuchen
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        // Direkt einloggen nach signUp (funktioniert wenn E-Mail-Bestätigung deaktiviert)
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError || !loginData.session) {
          setError("Dein Konto wurde erstellt. Bitte melde dich jetzt mit deinen Zugangsdaten an.");
          setBusy(false);
          return;
        }
        setStep("accepting");
        await handleAccept(loginData.session.access_token);
        return;
      }
      setStep("accepting");
      await handleAccept(accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registrierung fehlgeschlagen.");
      setBusy(false);
    }
  };

  const handleLogin = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      setStep("accepting");
      await handleAccept(data.session.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen.");
      setBusy(false);
    }
  };

  if (step === "loading" || step === "accepting") return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      {step === "accepting" ? "Einladung wird angenommen…" : "Lädt…"}
    </div>
  );

  if (step === "done") return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div className="space-y-2">
        <p className="text-lg font-semibold">Willkommen!</p>
        <p className="text-sm text-muted-foreground">Du wirst weitergeleitet…</p>
      </div>
    </div>
  );

  if (step === "error") return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div className="space-y-3">
        <p className="text-sm font-semibold text-destructive">{error}</p>
        <p className="text-xs text-muted-foreground">Bitte neuen Link anfordern.</p>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-12">
      <header>
        <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-primary/20">
          <span className="text-sm font-bold text-primary">c.</span>
        </div>
        <h1 className="text-2xl font-semibold">Einladung annehmen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Erstelle ein Konto oder melde dich an, um die Einladung anzunehmen.
        </p>
      </header>

      <div className="space-y-3">
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">E-Mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="deine@email.ch"
            className="w-full rounded-2xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted-foreground">Passwort</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Mindestens 8 Zeichen"
            className="w-full rounded-2xl border border-border bg-card px-3 py-2.5 text-sm outline-none focus:border-primary" />
        </label>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-col gap-2">
        <button type="button" onClick={handleRegister} disabled={busy || !email || !password}
          className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40">
          {busy ? "Wird verarbeitet…" : "Konto erstellen & Einladung annehmen"}
        </button>
        <button type="button" onClick={handleLogin} disabled={busy || !email || !password}
          className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground disabled:opacity-40">
          Bereits registriert — Anmelden
        </button>
      </div>
    </div>
  );
}


