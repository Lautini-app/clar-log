import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = "https://cgwpzpnklxphqxlixtva.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnd3B6cG5rbHhwaHF4bGl4dHZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwODcyNTcsImV4cCI6MjA5NDY2MzI1N30.t-VnUALdHsoNo9mJ6LV-lW4OntJLqHnF36SHb0rNP0c";

/**
 * Browser-Client für Supabase. Schreibt in das Schema `clar_log`
 * (geteiltes Projekt mit clar.heim / clar.markt).
 *
 * Wichtig: in supabase-js wird `db.schema` für alle Queries gesetzt;
 * `auth` läuft weiter gegen `auth.users` im Standard-Pfad.
 */
const inIframe = typeof window !== "undefined" && window.self !== window.top;

const memoryStore: Record<string, string> = {};
const iframeStorage = {
  getItem: (key: string) => memoryStore[key] ?? null,
  setItem: (key: string, value: string) => { memoryStore[key] = value; },
  removeItem: (key: string) => { delete memoryStore[key]; },
};

function getStorage() {
  if (typeof window === "undefined") return undefined;
  if (inIframe) return iframeStorage;
  return localStorage;
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: getStorage(),
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: "clar.tracker.auth",
  },
  db: { schema: "clar_log" },
});