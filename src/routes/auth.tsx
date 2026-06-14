import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthScreen } from "@/components/clar/AuthScreen";
import { useStore } from "@/lib/clar-storage";
import { isEmbeddedShell } from "@/lib/embedded-shell";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Anmelden — clar.tracker" },
      {
        name: "description",
        content:
          "Melde dich mit E-Mail und Passwort an, um deine Tracker-Daten geräteübergreifend zu synchronisieren — oder fahre offline fort.",
      },
    ],
  }),
  component: AuthRoute,
});

function AuthRoute() {
  const { userId, hydrated } = useStore();
  const navigate = useNavigate();
  const [offlineBypass, setOfflineBypass] = useState(false);

  // Wenn bereits angemeldet (oder Shell übernimmt) → in die App.
  useEffect(() => {
    if (!hydrated) return;
    if (userId || isEmbeddedShell() || offlineBypass) {
      navigate({ to: "/heute", replace: true });
    }
  }, [hydrated, userId, offlineBypass, navigate]);

  if (!hydrated) return <div className="min-h-screen bg-background" />;

  return (
    <AuthScreen
      onOfflineContinue={() => {
        try {
          localStorage.setItem("clar.offlineBypass", "1");
        } catch {}
        setOfflineBypass(true);
      }}
    />
  );
}