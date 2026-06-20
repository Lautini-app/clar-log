import { createFileRoute } from "@tanstack/react-router";
import { SettingsView } from "@/components/clar/SettingsView";
import { useStore } from "@/lib/clar-storage";

export const Route = createFileRoute("/_authenticated/einstellungen")({
  head: () => ({
    meta: [
      { title: "Konto — clar.log" },
      {
        name: "description",
        content: "Periode, Medikamente, eigene Befindlichkeiten, Sprache und Datenschutz verwalten.",
      },
    ],
  }),
  component: EinstellungenRoute,
});

function EinstellungenRoute() {
  const { store, userId, updateSettings, setStore } = useStore();
  return (
    <SettingsView
      settings={store.settings}
      logs={store.logs as Record<string, unknown>}
      onChange={updateSettings}
      userId={userId}
      onImport={(data: { logs?: Record<string, unknown>; settings?: unknown }) => {
        const next = {
          logs: (data.logs ?? store.logs) as typeof store.logs,
          settings: (data.settings ?? store.settings) as typeof store.settings,
        };
        setStore(next);
      }}
    />
  );
}