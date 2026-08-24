import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckinFlow } from "@/components/clar/CheckinFlow";
import { supabase } from "@/integrations/supabase/client";
import {
  WELLBEING_CATALOG,
  availableWellbeingItems,
  createPeriod,
  defaultSettings,
  emptyLog,
  todayKey,
} from "@/lib/clar-storage";
import type {
  DayLog,
  Medication,
  ObservationPeriod,
  WellbeingItem,
} from "@/lib/clar-storage";
import { CalendarSubscribeCard } from "@/components/clar/CalendarSubscribeCard";

export const Route = createFileRoute("/tagebuch/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Mein Tagebuch — clar.log" }] }),
  component: TagebuchRoute,
});

type Resolved = {
  ownerId: string;
  periodId: string;
  teenName: string;
  periodName: string;
  period: ObservationPeriod;
  items: WellbeingItem[];
};

async function resolveToken(token: string): Promise<Resolved | null> {
  const { data, error } = await supabase.rpc("resolve_teen_token", { input_token: token });
  if (error || !data) return null;
  const row = (Array.isArray(data) ? data[0] : data) as any;
  if (!row) return null;

  const teenName    = String(row.name ?? "");
  const periodName  = String(row.period_name ?? "");
  const meds        = Array.isArray(row.medications) ? (row.medications as Medication[]) : [];
  const rawPeriod   = row.period as Partial<ObservationPeriod> | null | undefined;

  // Vollständige Perioden-Konfig aus RPC – oder Fallback auf Standardkatalog.
  // Wichtig: Für den Token-Zugang erzwingen wir profile "teen_self", damit der
  // Wizard die teen-freundlichen Labels und den vollen Katalog rendert.
  const base: Partial<ObservationPeriod> = rawPeriod ?? {};
  const period = createPeriod({
    ...base,
    id:          String(row.period_id),
    profile:     "teen_self",
    name:        base.name ?? periodName ?? teenName,
    medications: meds,
    // Fallback: alle nicht-modulgebundenen Items auswählen, wenn Konfig fehlt.
    selectedWellbeingIds: base.selectedWellbeingIds && base.selectedWellbeingIds.length > 0
      ? base.selectedWellbeingIds
      : WELLBEING_CATALOG.filter((i) => !i.module || (base.modules?.[i.module])).map((i) => i.id),
    wellbeingSlots: base.wellbeingSlots ?? {},
    timeSlots: base.timeSlots ?? { morning: "07:30", midday: "12:30", evening: "19:30" },
    modules: base.modules ?? { cycleTracking: false, bodyFocus: true },
    cycleTracking: base.cycleTracking ?? false,
    speechOutput: base.speechOutput ?? false,
  });

  // availableWellbeingItems ignoriert Custom-Items ohne Settings-Objekt;
  // wir übergeben ein defaultSettings-ähnliches Objekt.
  const items = availableWellbeingItems({ ...defaultSettings, customWellbeingItems: [] });

  return { ownerId: String(row.owner_id), periodId: String(row.period_id), teenName, periodName, period, items };
}

async function loadExistingLog(token: string, date: string): Promise<DayLog | null> {
  const { data, error } = await supabase.rpc("get_teen_log", { input_token: token, input_date: date });
  if (error || !data) return null;
  return data as DayLog;
}

function TagebuchRoute() {
  const { token } = Route.useParams();
  const today = todayKey();

  const [status, setStatus] = useState<"loading" | "ready" | "invalid" | "saving" | "error">("loading");
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [log, setLog] = useState<DayLog>(() => emptyLog(today));
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Debounced save: sammelt Änderungen und schreibt nach 600ms.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLog = useRef<DayLog | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const ctx = await resolveToken(token);
        if (!ctx) { setStatus("invalid"); return; }
        setResolved(ctx);

        const existing = await loadExistingLog(token, today);
        setLog(existing ?? emptyLog(today, ctx.periodId));
        setStatus("ready");
      } catch {
        setStatus("invalid");
      }
    })();
  }, [token, today]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const flushSave = async () => {
    const payload = pendingLog.current;
    if (!payload) return;
    pendingLog.current = null;
    setStatus((s) => (s === "ready" ? "saving" : s));
    setSaveError(null);
    try {
      const { error } = await supabase.rpc("submit_teen_log", {
        input_token: token,
        input_date: payload.date,
        input_data: payload,
      });
      if (error) throw new Error(error.message);
      setLastSavedAt(Date.now());
      setStatus("ready");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
      setStatus("error");
    }
  };

  const scheduleSave = (nextLog: DayLog) => {
    pendingLog.current = nextLog;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void flushSave(); }, 600);
  };

  const handleChange = (patch: Partial<DayLog>) => {
    setLog((prev) => {
      const merged: DayLog = {
        ...prev,
        ...patch,
        date: today,
        periodId: resolved?.periodId,
        slots: {
          morning: patch.slots?.morning ?? prev.slots.morning,
          midday:  patch.slots?.midday  ?? prev.slots.midday,
          evening: patch.slots?.evening ?? prev.slots.evening,
        },
        updatedAt: Date.now(),
      };
      scheduleSave(merged);
      return merged;
    });
  };

  const savedLabel = useMemo(() => {
    if (status === "saving" || pendingLog.current) return "Wird gespeichert…";
    if (saveError) return null;
    if (lastSavedAt) return "✓ Gespeichert";
    return null;
  }, [status, saveError, lastSavedAt]);

  if (status === "loading") {
    return (
      <div style={{ display: "flex", minHeight: "100svh", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#9CA3AF" }}>
        Lädt…
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div style={{ display: "flex", minHeight: "100svh", alignItems: "center", justifyContent: "center", padding: "0 24px", textAlign: "center" }}>
        <p style={{ fontSize: 14, color: "#9CA3AF", maxWidth: 300 }}>
          Dieser Link ist abgelaufen oder ungültig. Bitte einen neuen Link anfordern.
        </p>
      </div>
    );
  }

  if (!resolved) return null;

  return (
    <div className="space-y-4 pb-32" style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 100px" }}>
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" })}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Hallo {resolved.teenName}
        </h1>
        {resolved.periodName && (
          <p className="mt-1 text-sm text-muted-foreground">{resolved.periodName}</p>
        )}
        <div className="mt-2 flex items-center gap-3">
          {savedLabel && <span style={{ fontSize: 12, color: status === "saving" ? "#6B7280" : "#0F6E56" }}>{savedLabel}</span>}
          {saveError && <span style={{ fontSize: 12, color: "#A32D2D" }}>{saveError} <button type="button" onClick={() => void flushSave()} style={{ textDecoration: "underline" }}>Erneut versuchen</button></span>}
        </div>
      </header>

      <CheckinFlow
        log={log}
        period={resolved.period}
        items={resolved.items}
        onChange={handleChange}
      />

      <CalendarSubscribeCard token={token} kind="tagebuch" />

      <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 14 }}>
        Kein Login nötig · clar·log von Lautini
      </p>
    </div>
  );
}
