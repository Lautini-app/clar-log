import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import type { Observer, ObserverObservation, ObserverRole, TeacherLink } from "./clar-storage";

function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(18)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("");
}

function fromRow(row: Record<string, unknown>): Observer {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    observerUserId: row.observer_user_id ? String(row.observer_user_id) : undefined,
    email: String(row.email),
    role: row.role as ObserverRole,
    name: row.name ? String(row.name) : undefined,
    status: row.observer_user_id ? "active" : "pending",
    createdAt: String(row.created_at),
  };
}

export async function listObservers(ownerId: string): Promise<Observer[]> {
  const { data, error } = await supabase.schema("clar_log").from("observers").select("*").eq("owner_id", ownerId);
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function inviteObserver(
  ownerId: string,
  email: string,
  role: ObserverRole,
  name?: string,
): Promise<Observer> {
  const { data, error } = await supabase
    .schema("clar_log")
    .from("observers")
    .upsert(
      { owner_id: ownerId, email, role, name },
      { onConflict: "owner_id,email" },
    )
    .select()
    .single();
  if (error) throw error;
  const observer = fromRow(data);

  // Einladungsmail mit gueltigem Token via send-family-invite Edge Function.
  // Token wird in family_invites gespeichert, damit /einladung/{token} funktioniert.
  try {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(36).padStart(2, "0"))
      .join("")
      .slice(0, 24);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await supabase
      .schema("clar_log")
      .from("family_invites")
      .insert({
        admin_user_id: ownerId,
        email,
        name: name ?? null,
        role: "member",
        token,
        expires_at: expiresAt,
        status: "pending",
      });

    const { data: sessionData } = await supabase.auth.getSession();
    const bearer = sessionData.session?.access_token ?? SUPABASE_PUBLISHABLE_KEY;
    await fetch(`${SUPABASE_URL}/functions/v1/send-family-invite`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
        apikey: SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ toEmail: email, toName: name ?? null, role, token }),
    });
  } catch (e) {
    console.warn("[clar] Einladungsmail fehlgeschlagen:", e);
  }
  return observer;
}
export async function removeObserver(observerId: string): Promise<void> {
  const { error } = await supabase.from("observers").delete().eq("id", observerId);
  if (error) throw error;
}

/** Vom eingeladenen Beobachter nach dem Login aufrufen, um die Einladung anzunehmen. */
export async function acceptObserverInvite(email: string): Promise<void> {
  const { error } = await supabase.rpc("accept_observer_invite", { invite_email: email });
  if (error) throw error;
}

export async function getActiveTeacherLink(ownerId: string, periodId: string): Promise<TeacherLink | null> {
  const { data, error } = await supabase
    .schema("clar_log")
    .from("teacher_links")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("period_id", periodId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: String(data.id),
    ownerId: String(data.owner_id),
    periodId: String(data.period_id),
    token: String(data.token),
    active: Boolean(data.active),
    createdAt: String(data.created_at),
    expiresAt: String(data.expires_at),
  };
}

/** Erstellt einen neuen Lehrperson-Link (7 Tage gültig) und deaktiviert alte Links für die Periode. */
export async function rotateTeacherLink(ownerId: string, periodId: string): Promise<TeacherLink> {
  await supabase.schema("clar_log").from("teacher_links").update({ active: false }).eq("owner_id", ownerId).eq("period_id", periodId);
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .schema("clar_log")
    .from("teacher_links")
    .insert({ owner_id: ownerId, period_id: periodId, token, active: true, expires_at: expiresAt })
    .select("*")
    .single();
  if (error) throw error;
  return {
    id: String(data.id),
    ownerId: String(data.owner_id),
    periodId: String(data.period_id),
    token: String(data.token),
    active: Boolean(data.active),
    createdAt: String(data.created_at),
    expiresAt: String(data.expires_at),
  };
}

/** Öffentlicher Zugriff (kein Login): prüft den Token via RPC und liefert Owner-Kontext. */
export async function resolveTeacherToken(token: string): Promise<{ ownerId: string; periodId: string } | null> {
  const { data, error } = await supabase.rpc("resolve_teacher_token", { input_token: token });
  if (error || !data) return null;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { ownerId: String(row.owner_id), periodId: String(row.period_id) };
}

/** Öffentlicher Zugriff (kein Login): Lehrperson reicht das abendliche Kurzformular ein. */
export async function submitTeacherObservation(
  token: string,
  date: string,
  answers: { mood?: number; behavior?: number; concentration?: number; note?: string },
): Promise<void> {
  const { error } = await supabase.rpc("submit_teacher_observation", {
    input_token: token,
    input_date: date,
    input_mood: answers.mood ?? null,
    input_behavior: answers.behavior ?? null,
    input_concentration: answers.concentration ?? null,
    input_note: answers.note ?? null,
  });
  if (error) throw error;
}

/** Für eingeloggte Beobachter (z.B. Elternteil, der ein Kind beobachtet). */
export async function submitObserverObservation(
  ownerId: string,
  periodId: string,
  observerUserId: string,
  observerName: string | undefined,
  date: string,
  answers: { mood?: number; behavior?: number; concentration?: number; note?: string },
): Promise<void> {
  const { error } = await supabase.from("observer_observations").upsert(
    {
      owner_id: ownerId,
      period_id: periodId,
      observer_user_id: observerUserId,
      observer_name: observerName,
      date,
      mood: answers.mood,
      behavior: answers.behavior,
      concentration: answers.concentration,
      note: answers.note,
    },
    { onConflict: "owner_id,observer_user_id,date" },
  );
  if (error) throw error;
}

export async function listObserverObservations(ownerId: string, periodId: string): Promise<ObserverObservation[]> {
  const { data, error } = await supabase
    .from("observer_observations")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("period_id", periodId);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: String(row.id),
    ownerId: String(row.owner_id),
    periodId: String(row.period_id),
    date: String(row.date),
    observerUserId: row.observer_user_id ? String(row.observer_user_id) : undefined,
    observerName: row.observer_name ? String(row.observer_name) : undefined,
    mood: row.mood ?? undefined,
    behavior: row.behavior ?? undefined,
    concentration: row.concentration ?? undefined,
    note: row.note ?? undefined,
    createdAt: String(row.created_at),
  }));
}

