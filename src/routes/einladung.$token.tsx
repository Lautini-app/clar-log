import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { acceptFamilyInvite } from "@/lib/family.functions";
import { acceptObserverInvite } from "@/lib/clar-observers";
import { createPeriod, defaultSettings } from "@/lib/clar-storage";

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
      // Falls die Person als Beobachter:in eingeladen wurde, als Observer verknuepfen
      let isObserver = false;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user?.id;
        const userEmail = sessionData.session?.user?.email;
        if (userEmail) {
          await acceptObserverInvite(userEmail);
        }
        if (userId) {
          const { data: asObserver } = await supabase
            .schema("clar_log")
            .from("observers")
            .select("id")
            .eq("observer_user_id", userId)
            .maybeSingle();
          isObserver = !!asObserver;

          // Kein Beobachter → Familienmitglied: teen_self-Settings anlegen falls noch keine vorhanden
          if (!isObserver) {
            const { data: existing } = await supabase
              .schema("clar_log")
              .from("tracker_settings")
              .select("data")
              .eq("user_id", userId)
              .maybeSingle();
            const existingPeriods = (existing?.data as { periods?: unknown[] } | null)?.periods;
            if (!existingPeriods?.length) {
              const period = createPeriod({ profile: "teen_self" });
              const settings = { ...defaultSettings, periods: [period], activePeriodId: period.id };
              await supabase.schema("clar_log").from("tracker_settings")
                .upsert(
                  { user_id: userId, data: settings, updated_at: new Date().toISOString() },
                  { onConflict: "user_id" },
                );
            }
          }
        }
      } catch (_e) {
        // Verknuepfung optional
      }
      setStep("done");
      setTimeout(() => navigate({ to: isObserver ? "/beobachten" : "/heute" }), 2000);
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
      // Zuerst einloggen versuchen (falls Konto schon existiert)
      const { data: loginFirst, error: loginFirstError } = await supabase.auth.signInWithPassword({ email, password });
      if (!loginFirstError && loginFirst.session) {
        setStep("accepting");
        await handleAccept(loginFirst.session.access_token);
        return;
      }
      // Konto neu erstellen
      const { data, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.href, data: { invite_token: token } }
      });
      if (authError) throw authError;
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        // Nochmals einloggen versuchen
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError || !loginData.session) {
          setError("Konto erstellt — bitte bestätige deine E-Mail-Adresse und klicke dann auf den Link in der Bestätigungsmail, um die Einladung anzunehmen.");
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


