import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  loadFromSupabase,
  migrateLocalToSupabase,
  upsertLogToSupabase,
  upsertSettingsToSupabase,
} from "./clar-sync";

export type ProfileType = "self" | "child_self" | "child_parent" | "child_both";
export type GenderType = "male" | "female" | "diverse";
export type AgeGroup = "child" | "youth" | "adult";
export type LifeContext = "pupil" | "apprentice" | "student" | "employed" | "training" | "unemployed" | "unable_to_work" | "retired";
export type TimeSlot = "morning" | "midday" | "evening";
export type MedicationType = "stimulant" | "antidepressant" | "other";
export type MedType = "retard" | "instant" | "antidepressant";
export type ModuleKey = "cycleTracking" | "bodyFocus";
export type Language = "de" | "en";
export type SlotStatus = "pending" | "in_progress" | "done";
export type AnswerKind = "scale" | "boolean" | "multiselect" | "time" | "emotions";
export type WellbeingCategory =
  | "sleep"
  | "mood"
  | "rebound"
  | "concentration"
  | "appetite"
  | "body"
  | "social"
  | "school"
  | "cycle"
  | "custom";

export type IntakeTime = {
  slot?: TimeSlot;
  time?: string;
};

export type Medication = {
  id: string;
  name: string;
  mg: number;
  intakeSlot: TimeSlot;
  intakeTimes?: IntakeTime[];
  type: MedicationType;
  duration?: "short" | "long";
  customName?: string;
  remindPush?: boolean;
  remindCalendar?: boolean;
};

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
  points?: EffectPoint[];
};

export type WellbeingItem = {
  id: string;
  category: WellbeingCategory;
  label: string;
  kind: AnswerKind;
  module?: ModuleKey;
  options?: string[];
  slots?: TimeSlot[];
};

export type QuestionGroup = {
  id: string;
  title: string;
  slots: TimeSlot[];
  items: string[];
  condition?: {
    itemId: string;
    value: boolean | string;
  };
  variant?: "school" | "general";
};

export const QUESTION_GROUPS: QuestionGroup[] = [
  {
    id: "medication_morning",
    title: "Medikament",
    slots: ["morning"],
    items: [],
  },
  {
    id: "sleep",
    title: "Schlaf",
    slots: ["morning"],
    items: ["sleep_latency", "sleep_through", "sleep_recovery", "sleep_duration"],
  },
  {
    id: "emotions",
    title: "Emotionen",
    slots: ["morning", "evening"],
    items: ["emotions"],
  },
  {
    id: "cognition_morning",
    title: "Konzentration & Kognition",
    slots: ["morning"],
    items: ["focus", "distractibility", "impulsivity", "thought_racing", "hyperfocus"],
  },
  {
    id: "breakfast",
    title: "Frühstück",
    slots: ["morning"],
    items: ["breakfast"],
  },
  {
    id: "school_check",
    title: "Schule / Arbeit / Ausbildung",
    slots: ["midday", "evening"],
    items: ["school_work_today"],
  },
  {
    id: "cognition_school",
    title: "Konzentration in Schule / Arbeit",
    slots: ["midday", "evening"],
    items: ["focus", "distractibility", "impulsivity", "school_performance", "school_social", "school_conflicts"],
    condition: { itemId: "school_work_today", value: true },
    variant: "school",
  },
  {
    id: "cognition_general",
    title: "Konzentration heute",
    slots: ["midday", "evening"],
    items: ["focus", "distractibility", "impulsivity"],
    condition: { itemId: "school_work_today", value: false },
    variant: "general",
  },
  {
    id: "rebound_check",
    title: "Rebound",
    slots: ["evening"],
    items: ["rebound_time", "rebound_type", "rebound_intensity", "rebound_duration"],
  },
  {
    id: "body",
    title: "Körper & Nebenwirkungen",
    slots: ["evening"],
    items: ["heart_racing", "chest_tightness", "headache", "stomachache", "dry_mouth", "tics"],
  },
  {
    id: "mood_evening",
    title: "Stimmung & Befinden",
    slots: ["evening"],
    items: ["drive", "inner_tension", "frustration_tolerance", "emotional_outbursts", "crying_outbursts"],
  },
  {
    id: "social",
    title: "Soziales & Stress",
    slots: ["evening"],
    items: ["stress_level", "social_interactions", "conflicts", "special_events"],
  },
  {
    id: "appetite_evening",
    title: "Appetit & Mahlzeiten",
    slots: ["evening"],
    items: ["hunger", "meals_today", "ate"],
  },
  {
    id: "cycle",
    title: "Zyklus",
    slots: ["evening"],
    items: ["cycle_phase", "cycle_mood", "pms_symptoms"],
  },
];

export type ObserverRole = "parent" | "teacher" | "other";
export type ObserverStatus = "pending" | "active";

export type Observer = {
  id: string;
  ownerId: string;
  observerUserId?: string;
  email: string;
  role: ObserverRole;
  name?: string;
  status: ObserverStatus;
  createdAt: string;
};

export type TeacherLink = {
  id: string;
  ownerId: string;
  periodId: string;
  token: string;
  active: boolean;
  createdAt: string;
  expiresAt: string;
};

export type ObserverObservation = {
  id: string;
  ownerId: string;
  periodId: string;
  date: string;
  observerUserId?: string;
  observerName?: string;
  mood?: number;
  behavior?: number;
  concentration?: number;
  note?: string;
  createdAt: string;
};

export const MAX_OBSERVERS = 4;

export type ObservationPeriod = {
  id: string;
  profile: ProfileType;
  gender?: GenderType;
  birthYear?: number;
  ageGroup?: AgeGroup;
  cycleTracking?: boolean;
  speechOutput?: boolean;
  doctorEmail?: string;
  lifeContext?: LifeContext;
  modules: Record<ModuleKey, boolean>;
  name: string;
  startDate: string;
  endDate: string;
  timeSlots: Record<TimeSlot, string>;
  medications: Medication[];
  selectedWellbeingIds: string[];
  wellbeingSlots: Record<string, TimeSlot[]>;
  createdAt: number;
  updatedAt: number;
};

export type WellbeingAnswer = {
  itemId: string;
  slot: TimeSlot;
  value?: number | boolean | string | string[];
  time?: string;
};

export type DailySlotLog = {
  status: SlotStatus;
  medicationTaken?: boolean;
  medicationTime?: string;
  answers: Record<string, WellbeingAnswer>;
  note?: string;
};

export type DayLog = {
  date: string;
  periodId?: string;
  slots: Record<TimeSlot, DailySlotLog>;
  doses?: Dose[];
  effect?: EffectWindow;
  moods?: string[];
  moodEntries?: MoodEntry[];
  activityEntries?: ActivityEntry[];
  sideEffects?: string[];
  updatedAt: number;
};

export type Settings = {
  activePeriodId?: string;
  periods: ObservationPeriod[];
  customWellbeingItems: WellbeingItem[];
  language: Language;
};

export type Store = {
  logs: Record<string, DayLog>;
  settings: Settings;
};

export const TIME_SLOTS: TimeSlot[] = ["morning", "midday", "evening"];

export const SLOT_LABELS: Record<TimeSlot, string> = {
  morning: "Morgen",
  midday: "Mittag",
  evening: "Abend",
};

export const PROFILE_LABELS: Record<ProfileType, string> = {
  child: "Kind",
  youth: "Jugendlicher",
  adult: "Erwachsen",
  self: "Eigen",
};

export const MEDICATION_TYPE_LABELS: Record<MedicationType, string> = {
  stimulant: "Stimulanz",
  antidepressant: "Antidepressivum",
  other: "Anderes",
};

export const WELLBEING_CATALOG: WellbeingItem[] = [
  { id: "sleep_latency", category: "sleep", label: "Einschlafdauer (Minuten)", kind: "number", slots: ["morning"] },
  { id: "sleep_through", category: "sleep", label: "Durchgeschlafen", kind: "boolean", slots: ["morning"] },
  { id: "sleep_recovery", category: "sleep", label: "Erholungsgrad", kind: "scale", slots: ["morning"] },
  { id: "sleep_duration", category: "sleep", label: "Schlafdauer (Stunden)", kind: "scale", slots: ["morning"] },

  {
    id: "emotions",
    category: "mood",
    label: "Emotionen heute",
    kind: "emotions",
    options: [
      "Verzweifelt", "Traurig", "Melancholisch", "Ängstlich", "Wütend", "Stumpf/Taub",
      "Neutral", "Ausgeglichen",
      "Freudig", "Aufgeregt", "Euphorisch"
    ],
  },

  { id: "drive", category: "mood", label: "Antrieb / Motivation", kind: "scale" },
  { id: "inner_tension", category: "mood", label: "Innere Unruhe / Anspannung", kind: "scale" },
  { id: "frustration_tolerance", category: "mood", label: "Frustrationstoleranz", kind: "scale" },
  { id: "emotional_outbursts", category: "mood", label: "Emotionale Überreaktionen (RSD)", kind: "boolean" },
  { id: "crying_outbursts", category: "mood", label: "Weinen / Gefühlsausbrüche", kind: "boolean", slots: ["evening"] },

  { id: "focus", category: "concentration", label: "Konzentration / Fokus", kind: "scale" },
  { id: "distractibility", category: "concentration", label: "Ablenkbarkeit", kind: "scale" },
  { id: "impulsivity", category: "concentration", label: "Impulsivität", kind: "scale" },
  { id: "thought_racing", category: "concentration", label: "Gedankenrasen", kind: "scale" },
  { id: "hyperfocus", category: "concentration", label: "Hyperfokus heute", kind: "boolean" },
  { id: "tasks_done", category: "concentration", label: "Aufgaben fertiggestellt", kind: "scale", slots: ["evening"] },

  { id: "rebound_time", category: "rebound", label: "Rebound-Zeitpunkt", kind: "time", slots: ["evening"] },
  {
    id: "rebound_type",
    category: "rebound",
    label: "Rebound-Art",
    kind: "multiselect",
    options: ["Stimmungseinbruch", "Reizbarkeit", "Erschöpfung", "Hunger", "Kopfschmerzen", "Weinen"],
  },
  { id: "rebound_intensity", category: "rebound", label: "Rebound-Intensität", kind: "scale", slots: ["evening"] },
  { id: "rebound_duration", category: "rebound", label: "Rebound-Dauer", kind: "scale", slots: ["evening"] },

  { id: "breakfast", category: "appetite", label: "Gefrühstückt?", kind: "boolean", slots: ["morning"] },
  { id: "hunger", category: "appetite", label: "Hungergefühl", kind: "scale" },
  { id: "ate", category: "appetite", label: "Gegessen", kind: "boolean" },
  { id: "meals_today", category: "appetite", label: "Mahlzeiten heute", kind: "scale", slots: ["evening"] },

  { id: "headache", category: "body", label: "Kopfschmerzen", kind: "boolean" },
  { id: "stomachache", category: "body", label: "Bauchschmerzen", kind: "boolean" },
  { id: "heart_racing", category: "body", label: "Herzrasen", kind: "boolean" },
  { id: "chest_tightness", category: "body", label: "Engegefühl in der Brust", kind: "boolean" },
  { id: "dry_mouth", category: "body", label: "Mundtrockenheit", kind: "boolean" },
  { id: "tics", category: "body", label: "Tics", kind: "scale" },

  { id: "stress_level", category: "social", label: "Stresslevel", kind: "scale" },
  { id: "social_interactions", category: "social", label: "Soziale Interaktionen", kind: "scale" },
  { id: "conflicts", category: "social", label: "Konflikte heute", kind: "boolean" },
  { id: "special_events", category: "social", label: "Besondere Ereignisse", kind: "scale" },

  { id: "school_work_today", category: "school", label: "Schule / Arbeit heute", kind: "boolean", slots: ["midday"] },
  { id: "school_performance", category: "school", label: "Leistung in Schule / Arbeit", kind: "scale", slots: ["evening"] },
  { id: "school_social", category: "school", label: "Soziales in Schule / Arbeit", kind: "scale", slots: ["evening"] },
  { id: "school_conflicts", category: "school", label: "Konflikte in Schule / Arbeit", kind: "boolean", slots: ["evening"] },

  {
    id: "cycle_phase",
    category: "cycle",
    label: "Zyklusphase",
    kind: "multiselect",
    options: ["Menstruation", "Follikelphase", "Eisprung", "Lutealphase"],
    module: "cycleTracking",
  },
  {
    id: "cycle_mood",
    category: "cycle",
    label: "Hormoneller Einfluss auf Stimmung",
    kind: "scale",
    module: "cycleTracking",
  },
  {
    id: "pms_symptoms",
    category: "cycle",
    label: "PMS-Symptome",
    kind: "boolean",
    module: "cycleTracking",
  },
];
const KEY = "clar.tracker.v1";

function id(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function createMedication(
  patch: Partial<Medication> = {},
): Medication {
  return {
    id: patch.id ?? id("med"),
    name: patch.name ?? "Medikament",
    mg: patch.mg ?? 10,
    intakeSlot: patch.intakeSlot ?? "morning",
    type: patch.type ?? "stimulant",
  };
}

export function availableWellbeingItems(settings: Settings): WellbeingItem[] {
  return [...WELLBEING_CATALOG, ...settings.customWellbeingItems];
}

export function createPeriod(patch: Partial<ObservationPeriod> = {}): ObservationPeriod {
  const now = Date.now();
  const start = patch.startDate ?? todayKey();
  const end = patch.endDate ?? todayKey(addDays(new Date(), 13));
  const modules = {
    cycleTracking: patch.modules?.cycleTracking ?? false,
    bodyFocus: patch.modules?.bodyFocus ?? true,
  };
  const selectedWellbeingIds =
    patch.selectedWellbeingIds ??
    WELLBEING_CATALOG.filter((item) => !item.module || modules[item.module]).map((item) => item.id);
  const wellbeingSlots = Object.fromEntries(
    selectedWellbeingIds.map((itemId) => {
      const catalogItem = WELLBEING_CATALOG.find((i) => i.id === itemId);
      const defaultSlots = catalogItem?.slots ?? TIME_SLOTS;
      return [itemId, patch.wellbeingSlots?.[itemId] ?? defaultSlots];
    }),
  );

  return {
    id: patch.id ?? id("period"),
    profile: patch.profile ?? "self",
    gender: patch.gender ?? undefined,
    birthYear: patch.birthYear ?? undefined,
    ageGroup: patch.ageGroup ?? undefined,
    cycleTracking: patch.cycleTracking ?? false,
    speechOutput: patch.speechOutput ?? false,
    doctorEmail: patch.doctorEmail ?? undefined,
    lifeContext: patch.lifeContext ?? undefined,
    modules,
    name: patch.name ?? "Beobachtungsperiode",
    startDate: start,
    endDate: end,
    timeSlots: patch.timeSlots ?? {
      morning: "07:30",
      midday: "12:30",
      evening: "19:30",
    },
    medications: patch.medications ?? [
      createMedication({ id: "med-default", name: "Medikament", mg: 10, intakeSlot: "morning" }),
    ],
    selectedWellbeingIds,
    wellbeingSlots,
    createdAt: patch.createdAt ?? now,
    updatedAt: now,
  };
}

export const defaultSettings: Settings = {
  activePeriodId: undefined,
  periods: [],
  customWellbeingItems: [],
  language: "de",
};

export function getActivePeriod(settings: Settings): ObservationPeriod | undefined {
  return (
    settings.periods.find((period) => period.id === settings.activePeriodId) ??
    settings.periods[0]
  );
}

function emptySlot(status: SlotStatus = "pending"): DailySlotLog {
  return { status, answers: {} };
}

export function emptyLog(date: string, periodId?: string): DayLog {
  return {
    date,
    periodId,
    slots: {
      morning: emptySlot(),
      midday: emptySlot(),
      evening: emptySlot(),
    },
    updatedAt: Date.now(),
  };
}

function normalizeSlot(slot?: Partial<DailySlotLog>): DailySlotLog {
  return {
    status: slot?.status ?? "pending",
    medicationTaken: slot?.medicationTaken,
    medicationTime: slot?.medicationTime,
    answers: slot?.answers ?? {},
    note: slot?.note,
  };
}

function normalizeLog(date: string, log: Partial<DayLog> | undefined, periodId?: string): DayLog {
  return {
    ...emptyLog(date, periodId),
    ...log,
    date,
    periodId: log?.periodId ?? periodId,
    slots: {
      morning: normalizeSlot(log?.slots?.morning),
      midday: normalizeSlot(log?.slots?.midday),
      evening: normalizeSlot(log?.slots?.evening),
    },
    updatedAt: log?.updatedAt ?? Date.now(),
  };
}

type LegacyMedication = {
  id?: string;
  name?: string;
  mg?: number;
  type?: "retard" | "instant" | "antidepressant" | MedicationType;
};

type LegacySettings = Partial<Settings> & {
  morningTime?: string;
  eveningTime?: string;
  weeklyFocus?: string;
  medications?: LegacyMedication[];
  defaultMedName?: string;
  defaultMedMg?: number;
};

function mapLegacyMedication(med: LegacyMedication, index: number): Medication {
  const type: MedicationType =
    med.type === "antidepressant"
      ? "antidepressant"
      : med.type === "other"
        ? "other"
        : "stimulant";
  return createMedication({
    id: med.id ?? `med-legacy-${index}`,
    name: med.name ?? "Medikament",
    mg: med.mg ?? 10,
    type,
    intakeSlot: index === 1 ? "midday" : "morning",
  });
}

function normalizeSettings(incoming?: LegacySettings): Settings {
  if (incoming?.periods && incoming.periods.length > 0) {
    const periods = incoming.periods.map((period) => createPeriod(period));
    return {
      activePeriodId: incoming.activePeriodId ?? periods[0]?.id,
      periods,
      customWellbeingItems: incoming.customWellbeingItems ?? [],
      language: incoming.language ?? "de",
    };
  }

  const legacyMeds =
    incoming?.medications?.map(mapLegacyMedication) ??
    (incoming?.defaultMedName
      ? [
          createMedication({
            id: "med-legacy",
            name: incoming.defaultMedName,
            mg: incoming.defaultMedMg ?? 10,
          }),
        ]
      : undefined);

  return {
    ...defaultSettings,
    customWellbeingItems: incoming?.customWellbeingItems ?? [],
    language: incoming?.language ?? "de",
    periods: legacyMeds
      ? [
          createPeriod({
            timeSlots: {
              morning: incoming?.morningTime ?? "07:30",
              midday: "12:30",
              evening: incoming?.eveningTime ?? "19:30",
            },
            medications: legacyMeds,
          }),
        ]
      : [],
  };
}

function normalizeStore(raw: Partial<Store> | undefined): Store {
  const settings = normalizeSettings(raw?.settings as LegacySettings | undefined);
  const activePeriod = getActivePeriod(settings);
  const logs: Record<string, DayLog> = {};
  for (const [date, log] of Object.entries(raw?.logs ?? {})) {
    logs[date] = normalizeLog(date, log as Partial<DayLog>, activePeriod?.id);
  }
  return { logs, settings };
}

function load(): Store {
  if (typeof window === "undefined") return { logs: {}, settings: defaultSettings };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { logs: {}, settings: defaultSettings };
    return normalizeStore(JSON.parse(raw) as Partial<Store>);
  } catch {
    return { logs: {}, settings: defaultSettings };
  }
}

function save(s: Store) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function useStore() {
  const [store, setStoreState] = useState<Store>({ logs: {}, settings: defaultSettings });
  const [hydrated, setHydrated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const setStore = useCallback((next: Store) => {
    const normalized = normalizeStore(next);
    save(normalized);
    setStoreState(normalized);
  }, []);

  useEffect(() => {
    const local = load();
    setStoreState(local);
    setHydrated(true);

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
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    async function hydrateFromRemote(uid: string, localStore: Store) {
      try {
        await migrateLocalToSupabase(uid, localStore);
        const remote = await loadFromSupabase(uid);
        setStoreState((prev) => {
          const merged = normalizeStore({
            logs: { ...prev.logs, ...remote.logs },
            settings: remote.settings ?? prev.settings,
          });
          save(merged);
          return merged;
        });
      } catch (err) {
        console.warn("[clar-storage] remote hydrate failed:", err);
      }
    }
  }, []);

  const update = useCallback((updater: (s: Store) => Store) => {
    setStoreState((prev) => {
      const next = normalizeStore(updater(prev));
      save(next);
      return next;
    });
  }, []);

  const upsertLog = useCallback(
    (date: string, patch: Partial<DayLog>) => {
      update((s) => {
        const activePeriod = getActivePeriod(s.settings);
        const existing = s.logs[date] ?? emptyLog(date, activePeriod?.id);
        const merged = normalizeLog(
          date,
          { ...existing, ...patch, date, updatedAt: Date.now() },
          activePeriod?.id,
        );
        if (userId) void upsertLogToSupabase(userId, merged);
        return { ...s, logs: { ...s.logs, [date]: merged } };
      });
    },
    [update, userId],
  );

  const updateSettings = useCallback(
    (patch: Partial<Settings>) => {
      update((s) => {
        const nextSettings = normalizeSettings({ ...s.settings, ...patch });
        const next = { ...s, settings: nextSettings };
        if (userId) void upsertSettingsToSupabase(userId, next.settings);
        return next;
      });
    },
    [update, userId],
  );

  return { store, hydrated, userId, upsertLog, updateSettings, setStore };
}