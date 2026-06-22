import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
  Link,
} from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Calendar, BarChart3, Settings as SettingsIcon } from "lucide-react";
import { useStore } from "@/lib/clar-storage";
import { supabase } from "@/integrations/supabase/client";
import { consumeSessionTokenFromUrl } from "@/lib/clar-auth";
import { ConsentScreen } from "@/components/clar/ConsentScreen";
import {
  isEmbeddedShell,
  installShellBridge,
  persistEmbeddedFlag,
  signalShellReady,
  signalNeedsSession,
  signalSignedIn,
  signalSignedOut,
} from "@/lib/embedded-shell";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">clar·log lädt…</p>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { hydrated, userId, authChecked } = useStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [tokenChecked, setTokenChecked] = useState(false);
  const [tokenConsumed, setTokenConsumed] = useState(false);
  const [observerChecked, setObserverChecked] = useState(false);
  const [isObserver, setIsObserver] = useState(false);
  const [shellSessionTimeout, setShellSessionTimeout] = useState(false);
  const [redirectingToAuth, setRedirectingToAuth] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [hasConsent, setHasConsent] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);

  // Install the shell bridge FIRST, before consuming URL tokens, so that a
  // clar:session postMessage that arrives while consumeSessionTokenFromUrl()
  // is still running is not missed.
  useEffect(() => {
    if (!isEmbeddedShell()) return;
    const cleanup = installShellBridge();
    const t = setTimeout(() => setShellSessionTimeout(true), 4000);
    return () => { cleanup(); clearTimeout(t); };
  }, []);

  useEffect(() => {
    let active = true;
    consumeSessionTokenFromUrl()
      .then((consumed) => {
        if (active) setTokenConsumed(consumed);
      })
      .catch((error) => {
        console.warn("[clar-auth] failed to consume token:", error);
        return false;
      })
      .finally(() => {
        if (active) setTokenChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Embedded-Shell-Lifecycle.
  useEffect(() => {
    if (!hydrated) return;
    persistEmbeddedFlag();
    if (isEmbeddedShell()) signalShellReady();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !isEmbeddedShell()) return;
    if (userId) signalSignedIn(userId);
  }, [hydrated, userId]);

  useEffect(() => {
    if (!isEmbeddedShell()) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") signalSignedOut();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Consent prüfen
  useEffect(() => {
    if (!hydrated || !tokenChecked || !userId) return;
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("user_consents")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        console.log("[consent] check result:", { data, error, userId });
        if (active) {
          setHasConsent(!!data);
          setConsentChecked(true);
        }
      } catch (e) {
        console.error("[consent] check failed:", e);
        if (active) setConsentChecked(true);
      }
    })();
    return () => { active = false; };
  }, [hydrated, tokenChecked, userId]);

  const acceptConsent = useCallback(async () => {
    if (!userId || consentSaving) return;
    setConsentSaving(true);
    try {
      const { data, error } = await supabase
        .from("user_consents")
        .insert({ user_id: userId, consent_version: "v1.0" })
        .select("id")
        .single();
      console.log("[consent] insert result:", { data, error });
      if (error) {
        console.error("[consent] insert error:", error.message, error.details, error.hint);
        return;
      }
      setHasConsent(true);
    } catch (e) {
      console.error("[consent] save failed", e);
    } finally {
      setConsentSaving(false);
    }
  }, [userId]);

  // Observer-Rolle + Familienmitglied (Teen) parallel prüfen
  useEffect(() => {
    if (!hydrated || !tokenChecked || !userId) return;
    const currentPath = window.location.pathname;
    if (currentPath === "/beobachten" || currentPath.startsWith("/beobachtung/")) {
      setObserverChecked(true);
      return;
    }
    void (async () => {
      try {
        const { data: obsData } = await supabase.schema("clar_log").from("observers")
          .select("owner_id, period_id")
          .eq("observer_user_id", userId)
          .maybeSingle();
        const isObs = !!obsData;
        setIsObserver(isObs);
        setObserverChecked(true);
        if (isObs) navigate({ to: "/beobachten", replace: true });
      } catch {
        setObserverChecked(true);
      }
    })();
  }, [hydrated, tokenChecked, userId, navigate]);

  useEffect(() => {
    if (!hydrated || !authChecked || !tokenChecked) return;
    if (!userId && !tokenConsumed) {
      if (isEmbeddedShell() && !shellSessionTimeout) {
        signalNeedsSession();
        return;
      }
      setRedirectingToAuth(true);
      navigate({ to: "/auth", replace: true });
    }
  }, [hydrated, authChecked, tokenChecked, tokenConsumed, userId, navigate, shellSessionTimeout]);

  // Block render until auth state is confirmed and URL token has been processed.
  if (!hydrated || !authChecked || !tokenChecked) return <LoadingScreen />;

  // No session and no pending token — the auth-guard effect above will navigate
  // to /auth. Don't block with an infinite LoadingScreen; render nothing so the
  // router can complete the navigation.
  if (!userId) {
    if (redirectingToAuth) return null;
    return <LoadingScreen />;
  }

  if (pathname !== "/beobachten" && (!observerChecked || isObserver)) {
    return <LoadingScreen />;
  }

  if (!consentChecked) return <LoadingScreen />;
  if (!hasConsent) {
    return <ConsentScreen onAccept={acceptConsent} loading={consentSaving} />;
  }

  const tabs: Array<{
    to: "/heute" | "/bericht" | "/einstellungen";
    label: string;
    Icon: typeof Calendar;
  }> = [
    { to: "/heute", label: "Heute", Icon: Calendar },
    { to: "/bericht", label: "Verlauf", Icon: BarChart3 },
    { to: "/einstellungen", label: "Konto", Icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-md px-4 pt-4 pb-24">
        <div className="mb-3 flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/20 text-primary">
            <span className="text-sm font-bold">c.</span>
          </div>
          <span className="text-sm font-medium tracking-tight text-foreground">
            clar.<span className="text-muted-foreground">log</span>
          </span>
        </div>

        <main className="mt-3">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur-md">
        <div className="mx-auto grid max-w-md grid-cols-3">
          {tabs.map(({ to, label, Icon }) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                replace
                className={`flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </Link>
            );
          })}
        </div>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  );
}
