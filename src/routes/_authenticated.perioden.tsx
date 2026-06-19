import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Onboarding } from "@/components/clar/TodayView";
import { useStore } from "@/lib/clar-storage";
import type { ObservationPeriod } from "@/lib/clar-storage";

export const Route = createFileRoute("/_authenticated/perioden")({
  head: () => ({
    meta: [
      { title: "Perioden — clar.log" },
      {
        name: "description",
        content: "Beobachtungsperioden verwalten und wechseln.",
      },
    ],
  }),
  component: PeriodenRoute,
});

function PeriodCard({
  period,
  isActive,
  onSelect,
}: {
  period: ObservationPeriod;
  isActive: boolean;
  onSelect: () => void;
}) {
  const med = period.medications[0];
  const startFormatted = new Date(period.startDate + "T12:00:00").toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const endFormatted = period.endDate
    ? new Date(period.endDate + "T12:00:00").toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "16px",
        borderRadius: 16,
        border: isActive
          ? "2px solid var(--color-primary)"
          : "1.5px solid var(--color-border)",
        background: isActive ? "rgba(8,80,65,0.07)" : "var(--color-card)",
        cursor: "pointer",
        transition: "all .15s",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 15,
            color: "var(--color-foreground)",
          }}
        >
          {period.name || "Periode"}
        </span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 99,
            background: period.active !== false ? "#dcfce7" : "#f1f5f9",
            color: period.active !== false ? "#14532d" : "#64748b",
          }}
        >
          {period.active !== false ? "aktiv" : "abgeschlossen"}
        </span>
      </div>
      {med && (
        <p
          style={{
            fontSize: 13,
            color: "var(--color-muted-foreground)",
            marginBottom: 4,
          }}
        >
          {med.name}
          {med.mg ? ` · ${med.mg} mg` : ""}
        </p>
      )}
      <p style={{ fontSize: 12, color: "var(--color-muted-foreground)" }}>
        ab {startFormatted}
        {endFormatted ? ` — ${endFormatted}` : ""}
      </p>
      {isActive && (
        <p
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-primary)",
            marginTop: 6,
          }}
        >
          ✓ Aktuelle Periode
        </p>
      )}
    </button>
  );
}

function PeriodenRoute() {
  const { store, updateSettings } = useStore();
  const navigate = useNavigate();
  const [showOnboarding, setShowOnboarding] = useState(false);

  const periods = [...(store.settings?.periods ?? [])].sort((a, b) => {
    const aActive = a.active !== false;
    const bActive = b.active !== false;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return b.startDate.localeCompare(a.startDate);
  });

  const activePeriodId = store.settings?.activePeriodId;

  const selectPeriod = (period: ObservationPeriod) => {
    updateSettings({ activePeriodId: period.id });
    void navigate({ to: "/heute" });
  };

  if (showOnboarding) {
    return (
      <div style={{ padding: "0 16px 120px" }}>
        <div style={{ padding: "12px 0 8px" }}>
          <button
            type="button"
            onClick={() => setShowOnboarding(false)}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-primary)",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ← Zurück
          </button>
        </div>
        <Onboarding
          settings={store.settings}
          onSettingsChange={updateSettings}
          onDone={() => {
            setShowOnboarding(false);
            void navigate({ to: "/heute" });
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 16px 120px" }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>
          Beobachtungsperioden
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--color-muted-foreground)",
            marginTop: 4,
          }}
        >
          Wähle eine Periode aus oder starte eine neue.
        </p>
      </header>

      {periods.length > 0 ? (
        <div
          style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}
        >
          {periods.map((period) => (
            <PeriodCard
              key={period.id}
              period={period}
              isActive={period.id === activePeriodId}
              onSelect={() => selectPeriod(period)}
            />
          ))}
        </div>
      ) : (
        <p
          style={{
            fontSize: 14,
            color: "var(--color-muted-foreground)",
            marginBottom: 20,
          }}
        >
          Noch keine Periode vorhanden. Starte jetzt deine erste Beobachtungsperiode.
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowOnboarding(true)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "13px 20px",
          borderRadius: 50,
          background: "var(--color-primary)",
          color: "#fff",
          border: "none",
          fontWeight: 600,
          fontSize: 14,
          cursor: "pointer",
          width: "100%",
        }}
      >
        <Plus size={18} /> Neue Beobachtungsperiode starten
      </button>
    </div>
  );
}
