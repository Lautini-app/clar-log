import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { todayKey, SLOT_LABELS } from "@/lib/clar-storage";
import type { Medication, TimeSlot } from "@/lib/clar-storage";

export const Route = createFileRoute("/tagebuch/$token")({
  ssr: false,
  head: () => ({ meta: [{ title: "Mein Tagebuch — clar.log" }] }),
  component: TagebuchRoute,
});

type ResolvedTeen = {
  ownerId: string;
  periodId: string;
  name: string;
  periodName: string;
  medications: Medication[];
};

type SlotData = {
  medsTaken: Record<string, boolean>;
  energyLevel?: "low" | "mid" | "high";
  mood?: number;
  note?: string;
};

const SLOTS: TimeSlot[] = ["morning", "midday", "evening"];

function EnergyBtn({ value, current, onChange, label }: {
  value: "low" | "mid" | "high";
  current?: "low" | "mid" | "high";
  onChange: (v: "low" | "mid" | "high") => void;
  label: string;
}) {
  const active = current === value;
  const colors: Record<string, { bg: string; color: string }> = {
    low:  { bg: active ? "#FCEBEB" : "transparent", color: active ? "#A32D2D" : "#9CA3AF" },
    mid:  { bg: active ? "#FAEEDA" : "transparent", color: active ? "#854F0B" : "#9CA3AF" },
    high: { bg: active ? "#E1F5EE" : "transparent", color: active ? "#0F6E56" : "#9CA3AF" },
  };
  return (
    <button
      type="button"
      onClick={() => onChange(value)}
      style={{
        flex: 1, padding: "10px 4px", borderRadius: 12,
        border: active ? "2px solid currentColor" : "1.5px solid #E5E7EB",
        background: colors[value].bg, color: colors[value].color,
        fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all .15s",
      }}
    >
      {label}
    </button>
  );
}

function SlotCard({
  slot, medications, data, onChange, saved,
}: {
  slot: TimeSlot;
  medications: Medication[];
  data: SlotData;
  onChange: (patch: Partial<SlotData>) => void;
  saved: boolean;
}) {
  const slotMeds = medications.filter(
    (m) => m.intakeSlot === slot || (slot === "morning" && !m.intakeSlot),
  );

  return (
    <div style={{
      borderRadius: 20, border: "1.5px solid #E5E7EB",
      background: saved ? "#F0FDF4" : "var(--color-card, #1C1C1E)",
      padding: "18px 16px", marginBottom: 12,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".04em", color: "#6B7280", textTransform: "uppercase" }}>
          {SLOT_LABELS[slot]}
        </p>
        {saved && <span style={{ fontSize: 12, color: "#0F6E56", fontWeight: 600 }}>✓ gespeichert</span>}
      </div>

      {slotMeds.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8, fontWeight: 500 }}>Medikament eingenommen?</p>
          {slotMeds.map((med) => (
            <button
              key={med.id}
              type="button"
              onClick={() => onChange({ medsTaken: { ...data.medsTaken, [med.id]: !data.medsTaken[med.id] } })}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 14px", borderRadius: 12, marginBottom: 6,
                border: data.medsTaken[med.id] ? "2px solid #0F6E56" : "1.5px solid #E5E7EB",
                background: data.medsTaken[med.id] ? "#E1F5EE" : "transparent",
                cursor: "pointer", textAlign: "left",
              }}
            >
              <span style={{
                width: 20, height: 20, borderRadius: 6, border: "2px solid",
                borderColor: data.medsTaken[med.id] ? "#0F6E56" : "#D1D5DB",
                background: data.medsTaken[med.id] ? "#0F6E56" : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                {data.medsTaken[med.id] && <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>✓</span>}
              </span>
              <span style={{ fontSize: 14, fontWeight: 500, color: data.medsTaken[med.id] ? "#0F6E56" : "inherit" }}>
                {med.name} {med.mg ? `${med.mg}mg` : ""}
              </span>
            </button>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8, fontWeight: 500 }}>Energie</p>
        <div style={{ display: "flex", gap: 6 }}>
          <EnergyBtn value="low"  current={data.energyLevel} onChange={(v) => onChange({ energyLevel: v })} label="tief" />
          <EnergyBtn value="mid"  current={data.energyLevel} onChange={(v) => onChange({ energyLevel: v })} label="mittel" />
          <EnergyBtn value="high" current={data.energyLevel} onChange={(v) => onChange({ energyLevel: v })} label="hoch" />
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 8, fontWeight: 500 }}>Stimmung</p>
        <div style={{ display: "flex", gap: 4 }}>
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ mood: v })}
              style={{
                flex: 1, padding: "9px 4px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                border: data.mood === v ? "2px solid var(--color-primary, #085041)" : "1.5px solid #E5E7EB",
                background: data.mood === v ? "var(--color-primary, #085041)" : "transparent",
                color: data.mood === v ? "#fff" : "#9CA3AF",
                cursor: "pointer",
              }}
            >
              {v}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: "#9CA3AF" }}>schlecht</span>
          <span style={{ fontSize: 10, color: "#9CA3AF" }}>sehr gut</span>
        </div>
      </div>

      {slot === "evening" && (
        <div>
          <p style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 6, fontWeight: 500 }}>Notiz (optional)</p>
          <textarea
            value={data.note ?? ""}
            onChange={(e) => onChange({ note: e.target.value })}
            placeholder="Wie war der Tag? Besonderes erlebt?"
            rows={3}
            style={{
              width: "100%", borderRadius: 12, border: "1.5px solid #E5E7EB",
              background: "transparent", padding: "10px 12px", fontSize: 13,
              outline: "none", resize: "none", boxSizing: "border-box",
              fontFamily: "inherit", color: "inherit",
            }}
          />
        </div>
      )}
    </div>
  );
}

function TagebuchRoute() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<"loading" | "ready" | "invalid" | "saving" | "done">("loading");
  const [teen, setTeen] = useState<ResolvedTeen | null>(null);
  const [slots, setSlots] = useState<Record<TimeSlot, SlotData>>({
    morning: { medsTaken: {} },
    midday:  { medsTaken: {} },
    evening: { medsTaken: {} },
  });
  const [savedSlots, setSavedSlots] = useState<Record<TimeSlot, boolean>>({
    morning: false, midday: false, evening: false,
  });
  const [error, setError] = useState<string | null>(null);
  const today = todayKey();

  useEffect(() => {
    void (async () => {
      try {
        const { data, error: rpcErr } = await supabase.rpc("resolve_teen_token", { input_token: token });
        if (rpcErr || !data) { setStatus("invalid"); return; }
        const row = (Array.isArray(data) ? data[0] : data) as any;
        if (!row) { setStatus("invalid"); return; }
        setTeen({
          ownerId: String(row.owner_id),
          periodId: String(row.period_id),
          name: String(row.name ?? ""),
          periodName: String(row.period_name ?? ""),
          medications: Array.isArray(row.medications) ? (row.medications as Medication[]) : [],
        });
        setStatus("ready");
      } catch {
        setStatus("invalid");
      }
    })();
  }, [token]);

  const patchSlot = (slot: TimeSlot, patch: Partial<SlotData>) => {
    setSlots((prev) => ({ ...prev, [slot]: { ...prev[slot], ...patch } }));
  };

  const handleSave = async () => {
    if (!teen) return;
    setStatus("saving");
    setError(null);
    try {
      const logData = {
        date: today,
        periodId: teen.periodId,
        slots: {
          morning: {
            status: "done",
            medsTaken: slots.morning.medsTaken,
            answers: {
              energy_level: slots.morning.energyLevel
                ? { itemId: "energy_level", slot: "morning", value: slots.morning.energyLevel }
                : undefined,
              base_mood: slots.morning.mood !== undefined
                ? { itemId: "base_mood", slot: "morning", value: slots.morning.mood }
                : undefined,
            },
            note: slots.morning.note,
          },
          midday: {
            status: "done",
            medsTaken: slots.midday.medsTaken,
            answers: {
              energy_level: slots.midday.energyLevel
                ? { itemId: "energy_level", slot: "midday", value: slots.midday.energyLevel }
                : undefined,
              base_mood: slots.midday.mood !== undefined
                ? { itemId: "base_mood", slot: "midday", value: slots.midday.mood }
                : undefined,
            },
          },
          evening: {
            status: "done",
            medsTaken: slots.evening.medsTaken,
            answers: {
              energy_level: slots.evening.energyLevel
                ? { itemId: "energy_level", slot: "evening", value: slots.evening.energyLevel }
                : undefined,
              base_mood: slots.evening.mood !== undefined
                ? { itemId: "base_mood", slot: "evening", value: slots.evening.mood }
                : undefined,
            },
            note: slots.evening.note,
          },
        },
        updatedAt: Date.now(),
      };

      const { error: rpcErr } = await supabase.rpc("submit_teen_log", {
        input_token: token,
        input_date: today,
        input_data: logData,
      });
      if (rpcErr) throw new Error(rpcErr.message);

      setSavedSlots({ morning: true, midday: true, evening: true });
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
      setStatus("ready");
    }
  };

  if (status === "loading") return (
    <div style={{ display: "flex", minHeight: "100svh", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#9CA3AF" }}>
      Lädt…
    </div>
  );

  if (status === "invalid") return (
    <div style={{ display: "flex", minHeight: "100svh", alignItems: "center", justifyContent: "center", padding: "0 24px", textAlign: "center" }}>
      <p style={{ fontSize: 14, color: "#9CA3AF", maxWidth: 300 }}>
        Dieser Link ist abgelaufen oder ungültig. Bitte einen neuen Link anfordern.
      </p>
    </div>
  );

  if (status === "done") return (
    <div style={{ display: "flex", minHeight: "100svh", alignItems: "center", justifyContent: "center", padding: "0 24px", textAlign: "center" }}>
      <div>
        <p style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Gespeichert! 🎉</p>
        <p style={{ fontSize: 14, color: "#6B7280" }}>Dein Tagebuch für heute wurde übermittelt.</p>
        <button
          type="button"
          onClick={() => { setStatus("ready"); setSavedSlots({ morning: false, midday: false, evening: false }); }}
          style={{
            marginTop: 20, padding: "11px 24px", borderRadius: 50,
            background: "var(--color-primary, #085041)", color: "#fff",
            border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          Nochmal ausfüllen
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px 100px" }}>
      {/* Header */}
      <header style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontSize: 12, color: "#9CA3AF", fontWeight: 500 }}>
            {new Date().toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
          </span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
          Hallo {teen?.name || ""}
        </h1>
        {teen?.periodName && (
          <p style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>{teen.periodName}</p>
        )}
      </header>

      {/* Slot cards */}
      {SLOTS.map((slot) => (
        <SlotCard
          key={slot}
          slot={slot}
          medications={teen?.medications ?? []}
          data={slots[slot]}
          onChange={(patch) => patchSlot(slot, patch)}
          saved={savedSlots[slot]}
        />
      ))}

      {error && (
        <p style={{ fontSize: 13, color: "#A32D2D", marginBottom: 12, textAlign: "center" }}>{error}</p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={status === "saving"}
        style={{
          width: "100%", padding: "14px", borderRadius: 50,
          background: "var(--color-primary, #085041)", color: "#fff",
          border: "none", fontSize: 15, fontWeight: 700,
          cursor: status === "saving" ? "default" : "pointer",
          opacity: status === "saving" ? 0.6 : 1,
        }}
      >
        {status === "saving" ? "Wird gespeichert…" : "Tagebuch speichern"}
      </button>

      <p style={{ fontSize: 11, color: "#9CA3AF", textAlign: "center", marginTop: 14 }}>
        Kein Login nötig · clar·log von Lautini
      </p>
    </div>
  );
}
