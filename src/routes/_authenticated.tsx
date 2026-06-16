import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouterState,
  Link,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Calendar, BarChart3, Settings as SettingsIcon } from "lucide-react";
import { useStore } from "@/lib/clar-storage";
import { supabase } from "@/integrations/supabase/client";
import { consumeSessionTokenFromUrl } from "@/lib/clar-auth";
import {
  isEmbeddedShell,
  installShellBridge,
  persistEmbeddedFlag,
  signalShellReady,
  signalSignedIn,
  signalSignedOut,
} from "@/lib/embedded-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { hydrated, userId } = useStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [tokenChecked, setTokenChecked] = useState(false);
  const [tokenConsumed, setTokenConsumed] = useState(false);

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
    if (!isEmbeddedShell()) return;
    return installShellBridge();
  }, []);

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

  useEffect(() => {
    if (!hydrated || !tokenChecked) return;
    if (!userId && !tokenConsumed) {
      navigate({ to: "/auth", replace: true });
    }
  }, [hydrated, tokenChecked, tokenConsumed, userId, navigate]);

  if (!hydrated || !tokenChecked) return <div className="min-h-screen bg-background" />;

  if (!userId) {
    return <div className="min-h-screen bg-background" />;
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