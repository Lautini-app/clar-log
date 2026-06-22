import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { acceptFamilyInvite } from "@/lib/family.functions";
import { acceptObserverInvite } from "@/lib/clar-observers";

export const Route = createFileRoute("/einladung/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Einladung — clar.log" }] }),
  component: EinladungRoute,
});

function EinladungRoute() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState<"loading" | "register" | "accepting" | "done" | "error" | "already_accepted">("loading");
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
        }
      } catch (_e) {
        // Verknuepfung optional
      }
      setStep("done");
      setTimeout(() => navigate({ to: isObserver ? "/beobachten" : "/heute" }), 2000);
    } catch (err) {
      // Prüfen ob der User das Invite bereits angenommen hat (family_members-Eintrag vorhanden)
      try {
        const { data: sid } = await supabase.auth.getSession();
        const uid = sid.session?.user?.id;
        if (uid) {
          const { data: member } = await supabase
            .schema("clar_log")
            .from("family_members")
            .select("id")
            .eq("member_user_id", uid)
            .eq("status", "active")
            .maybeSingle();
          if (member) {
            setStep("already_accepted");
            setBusy(false);
            return;
          }
        }
      } catch { /* ignore, zeige normalen Fehler */ }
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

  if (step === "already_accepted") return (
    <div className="mx-auto max-w-md space-y-5 px-4 py-12">
      <header>
        <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-primary/20">
          <span className="text-sm font-bold text-primary">c.</span>
        </div>
        <h1 className="text-xl font-semibold">Einladung bereits angenommen</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Du hast diese Einladung bereits angenommen. Melde dich mit deiner E-Mail-Adresse an, um clar·log zu öffnen.
        </p>
      </header>
      <button
        type="button"
        onClick={() => navigate({ to: "/heute" })}
        className="w-full rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
      >
        Weiter zu clar·log →
      </button>
      <p className="text-center text-xs text-muted-foreground">
        Noch nicht angemeldet?{" "}
        <a href="/auth" className="underline underline-offset-2">Zur Anmeldung</a>
      </p>
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


