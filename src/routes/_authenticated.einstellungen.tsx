import { createFileRoute } from "@tanstack/react-router";
import { SettingsView } from "@/components/clar/SettingsView";
import { useStore } from "@/lib/clar-storage";

export const Route = createFileRoute("/_authenticated/einstellungen")({
  head: () => ({
    meta: [
      { title: "Konto — clar.tracker" },
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
      onChange={updateSettings}
      userId={userId}
      onReset={() => {
        setStore({ logs: {}, settings: store.settings });
        try {
          localStorage.removeItem("clar.tracker.v1");
        } catch {}
      }}
    />
  );
}