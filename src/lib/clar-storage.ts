export type MedType = "retard" | "instant" | "antidepressant";
export type Medication = { id: string; name: string; mg: number; type: MedType };
export type Dose = {
  id: string;
  name: string;
  mg: number;
  time: string;
  type?: MedType;
  medId?: string;
};
export type EffectPoint = { h: number; y: number };
export type MoodEntry = { id: string; time: string; mood: string };
export type ActivityEntry = { id: string; time: string; activity: string };
export type EffectWindow = {
  onset?: string;
  peak?: string;
  wornOff?: string;
  rebound?: boolean;
  /** Wave control points: h in 0..19, y in 0..1. Sorted by h. */
  points?: EffectPoint[];
};
export type DayLog = {
  date: string; // YYYY-MM-DD
  doses: Dose[];
  effect: EffectWindow;
  moods: string[];
  moodEntries?: MoodEntry[];
  activityEntries?: ActivityEntry[];
  sleepQuality?: number; // 1-5
  sleepHours?: number;
  sleepWakeups?: number; // times woken during the night
  appetite?: "none" | "little" | "normal" | "much";
  sideEffects: string[];
  rating?: number; // 1-10
  note?: string;
  updatedAt: number;
};

export type Settings = {
  morningTime: string;
  eveningTime: string;
  weeklyFocus: string;
  medications: Medication[];
};

const KEY = "clar.tracker.v1";

type Store = {
  logs: Record<string, DayLog>;
  settings: Settings;
};

const defaultSettings: Settings = {
  morningTime: "08:00",
  eveningTime: "21:00",
  weeklyFocus: "Diese Woche Schlaf & Rebound beobachten",
  medications: [
    { id: "med-retard", name: "Methylphenidat retard", mg: 20, type: "retard" },
    { id: "med-instant", name: "Methylphenidat instant", mg: 10, type: "instant" },
  ],
};

function load(): Store {
  if (typeof window === "undefined") return { logs: {}, settings: defaultSettings };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { logs: {}, settings: defaultSettings };
    const parsed = JSON.parse(raw) as Partial<Store> & {
      settings?: Partial<Settings> & { defaultMedName?: string; defaultMedMg?: number };
    };
    type LegacySettings = Partial<Settings> & {
      defaultMedName?: string;
      defaultMedMg?: number;
    };
    const incoming: LegacySettings = parsed.settings ?? {};
    let medications = incoming.medications;
    if (!medications || medications.length === 0) {
      // Migrate legacy single-med settings
      if (incoming.defaultMedName) {
        medications = [
          {
            id: "med-legacy",
            name: incoming.defaultMedName,
            mg: incoming.defaultMedMg ?? 10,
            type: "retard",
          },
        ];
      } else {
        medications = defaultSettings.medications;
      }
    }
    return {
      logs: parsed.logs ?? {},
      settings: { ...defaultSettings, ...incoming, medications },
    };
  } catch {
    return { logs: {}, settings: defaultSettings };
  }
}

function save(s: Store) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function emptyLog(date: string): DayLog {
  return {
    date,
    doses: [],
    effect: {},
    moods: [],
    sideEffects: [],
    updatedAt: Date.now(),
  };
}

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  loadFromSupabase,
  migrateLocalToSupabase,
  upsertLogToSupabase,
  upsertSettingsToSupabase,
} from "./clar-sync";

export function useStore() {
  const [store, setStore] = useState<Store>({ logs: {}, settings: defaultSettings });
  const [hydrated, setHydrated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const local = load();
    setStore(local);
    setHydrated(true);

    // Auth-Status abfragen + abonnieren
    let active = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!active) return;
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) await hydrateFromRemote(uid, local);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!active) return;
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (event === "SIGNED_IN" && uid) {
        await hydrateFromRemote(uid, load());
      }
      if (event === "SIGNED_OUT") {
        // Lokal-Store bleibt (Offline-Fallback)
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    async function hydrateFromRemote(uid: string, localStore: Store) {
      try {
        await migrateLocalToSupabase(uid, localStore);
        const remote = await loadFromSupabase(uid);
        setStore((prev) => {
          const merged: Store = {
            logs: { ...prev.logs, ...remote.logs },
            settings: remote.settings ?? prev.settings,
          };
          save(merged);
          return merged;
        });
      } catch (err) {
        console.warn("[clar-storage] remote hydrate failed:", err);
      }
    }
  }, []);

  const update = useCallback((updater: (s: Store) => Store) => {
    setStore((prev) => {
      const next = updater(prev);
      save(next);
      return next;
    });
  }, []);

  const upsertLog = useCallback(
    (date: string, patch: Partial<DayLog>) => {
      update((s) => {
        const existing = s.logs[date] ?? emptyLog(date);
        const merged: DayLog = { ...existing, ...patch, date, updatedAt: Date.now() };
        if (userId) void upsertLogToSupabase(userId, merged);
        return { ...s, logs: { ...s.logs, [date]: merged } };
      });
    },
    [update, userId],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      update((s) => {
        const next = { ...s, settings: { ...s.settings, ...patch } };
        if (userId) void upsertSettingsToSupabase(userId, next.settings);
        return next;
      });
    },
    [update, userId],
  );

  return { store, hydrated, userId, upsertLog, updateSettings, setStore };
}