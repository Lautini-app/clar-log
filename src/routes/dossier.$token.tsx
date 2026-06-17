import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveDoctorToken } from "@/lib/doctor-links";
import { DossierView } from "@/components/clar/DossierView";
import { normalizeSettings } from "@/lib/clar-storage";

export const Route = createFileRoute("/dossier/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Dossier — clar.log" }] }),
  component: DossierRoute,
});

function DossierRoute() {
  const { token } = Route.useParams();
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [settings, setSettings] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [ownerId, setOwnerId] = useState<string>("");

  useEffect(() => {
    async function load() {
      try {
        const ctx = await resolveDoctorToken(token);
        if (!ctx) { setState("error"); return; }
        setOwnerId(ctx.ownerId);

        const [settingsRes, logsRes] = await Promise.all([
          supabase.schema("clar_log").from("tracker_settings").select("data").eq("user_id", ctx.ownerId).maybeSingle(),
          supabase.schema("clar_log").from("tracker_logs").select("*").eq("user_id", ctx.ownerId).order("date", { ascending: false }).limit(90),
        ]);

        const raw = settingsRes.data?.data ?? {};
        setSettings(normalizeSettings(raw));
        setLogs((logsRes.data ?? []).map((r: any) => r.data ?? r));
        setState("ok");
      } catch {
        setState("error");
      }
    }
    load();
  }, [token]);

  if (state === "loading") return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "var(--font-sans)", color: "var(--color-text-secondary)" }}>
      Dossier wird geladen…
    </div>
  );

  if (state === "error") return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "var(--font-sans)", gap: 8 }}>
      <p style={{ fontSize: 16, fontWeight: 500 }}>Link ungültig oder abgelaufen.</p>
      <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>Bitte eine neue Freigabe anfordern.</p>
    </div>
  );

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "1rem 1rem 4rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1.5rem", paddingTop: "1rem" }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-secondary)" }}>clar by lautini · Dossier (schreibgeschützt)</span>
      </div>
      <DossierView settings={settings} logs={logs} ownerId={ownerId} />
    </div>
  );
}
