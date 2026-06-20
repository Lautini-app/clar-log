import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Onboarding } from "@/components/clar/TodayView";
import { useStore } from "@/lib/clar-storage";
import type { ObservationPeriod, Settings } from "@/lib/clar-storage";
import { deletePeriodData } from "@/lib/clar-sync";

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
  onDelete,
}: {
  period: ObservationPeriod;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
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
    <div
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
        position: "relative",
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
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{
              background: "none",
              border: "none",
              padding: "4px",
              cursor: "pointer",
              color: "#94a3b8",
              display: "flex",
              alignItems: "center",
              borderRadius: 6,
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
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
    </div>
  );
}

function exportPeriodJson(period: ObservationPeriod, logs: Record<string, unknown>, settings: Settings) {
  const data = JSON.stringify({ period, logs, settings, exportedAt: new Date().toISOString() }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `clar-periode-${period.name || period.id}-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function PeriodenRoute() {
  const { store, userId, updateSettings } = useStore();
  const navigate = useNavigate();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ObservationPeriod | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const doDelete = async (period: ObservationPeriod) => {
    setDeleting(true);
    try {
      if (userId) {
        await deletePeriodData(userId, period.id).catch(() => {});
      }
      const remainingPeriods = store.settings.periods.filter((p) => p.id !== period.id);
      const newActivePeriodId = store.settings.activePeriodId === period.id
        ? remainingPeriods[0]?.id
        : store.settings.activePeriodId;
      updateSettings({ periods: remainingPeriods, activePeriodId: newActivePeriodId });
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
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
              onDelete={() => setPendingDelete(period)}
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

      {pendingDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            zIndex: 100,
            padding: "0 16px 32px",
          }}
          onClick={() => !deleting && setPendingDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--color-card)",
              borderRadius: 20,
              padding: "24px 20px 20px",
              width: "100%",
              maxWidth: 480,
            }}
          >
            <p style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
              Periode „{pendingDelete.name}" wirklich löschen?
            </p>
            <p style={{ fontSize: 13, color: "var(--color-muted-foreground)", marginBottom: 20, lineHeight: 1.5 }}>
              Alle zugehörigen Einträge werden unwiderruflich gelöscht. Empfehlung: vorher exportieren.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => {
                  exportPeriodJson(pendingDelete, store.logs as Record<string, unknown>, store.settings);
                  void doDelete(pendingDelete);
                }}
                style={{
                  padding: "13px 16px",
                  borderRadius: 12,
                  background: "var(--color-primary)",
                  color: "#fff",
                  border: "none",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  opacity: deleting ? 0.5 : 1,
                }}
              >
                Exportieren &amp; Löschen
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void doDelete(pendingDelete)}
                style={{
                  padding: "13px 16px",
                  borderRadius: 12,
                  background: "none",
                  color: "#dc2626",
                  border: "1.5px solid #dc2626",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                  opacity: deleting ? 0.5 : 1,
                }}
              >
                {deleting ? "Löschen…" : "Löschen"}
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setPendingDelete(null)}
                style={{
                  padding: "13px 16px",
                  borderRadius: 12,
                  background: "none",
                  color: "var(--color-muted-foreground)",
                  border: "1.5px solid var(--color-border)",
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
