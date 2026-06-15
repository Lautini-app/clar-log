import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthScreen } from "@/components/clar/AuthScreen";
import { useStore } from "@/lib/clar-storage";
import { consumeSessionTokenFromUrl } from "@/lib/clar-auth";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "clar by lautini — clar.log" },
      {
        name: "description",
        content: "clar.log wird über clar by lautini geöffnet und erhält die Session per Token.",
      },
    ],
  }),
  component: AuthRoute,
});

function AuthRoute() {
  const { userId, hydrated } = useStore();
  const navigate = useNavigate();
  const [tokenChecked, setTokenChecked] = useState(false);

  useEffect(() => {
    let active = true;
    consumeSessionTokenFromUrl()
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

  useEffect(() => {
    if (!hydrated || !tokenChecked) return;
    if (userId) {
      navigate({ to: "/heute", replace: true });
    }
  }, [hydrated, tokenChecked, userId, navigate]);

  if (!hydrated || !tokenChecked) return <div className="min-h-screen bg-background" />;

  return <AuthScreen />;
}
