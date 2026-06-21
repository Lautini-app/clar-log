import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";
import type { Medication } from "@/lib/clar-storage";

const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

async function functionsPost(fnName: string, body: Record<string, unknown>): Promise<unknown> {
  let bearer = SUPABASE_PUBLISHABLE_KEY;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) bearer = data.session.access_token;
  } catch { /* keep anon */ }

  const res = await fetch(`${FUNCTIONS_BASE}/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
      apikey: SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify(body),
  });

  let data: any;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    const msg = typeof data?.error === "string" ? data.error : JSON.stringify(data?.error ?? data);
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return data;
}

function randomToken(length = 24): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

export async function inviteFamilyMember(params: {
  email: string;
  name?: string;
  role: "member" | "teen";
}): Promise<{ ok: boolean; inviteUrl: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error("Nicht eingeloggt");

  const { count } = await supabase
    .schema("clar_log")
    .from("family_invites")
    .select("id", { count: "exact", head: true })
    .eq("admin_user_id", userId)
    .in("status", ["pending", "accepted"]);

  const token = randomToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const appUrl = "https://clar.log.lautini.ch";
  const inviteUrl = `${appUrl}/einladung/${token}`;

  const { error: insertError } = await supabase
    .schema("clar_log")
    .from("family_invites")
    .insert({
      admin_user_id: userId,
      email: params.email,
      name: params.name ?? null,
      role: params.role,
      token,
      expires_at: expiresAt,
      status: "pending",
    });
  if (insertError) throw new Error(insertError.message);

  // E-Mail via Edge Function senden
  await functionsPost("send-family-invite", {
    toEmail: params.email,
    toName: params.name ?? null,
    role: params.role,
    token,
  });

  return { ok: true, inviteUrl };
}

export async function listFamilyMembers(): Promise<{
  members: Array<{ member_user_id: string; role: string; name?: string }>;
  pendingInvites: Array<{ email: string; name?: string; role: string; expires_at: string }>;
}> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return { members: [], pendingInvites: [] };

  const [membersRes, pendingRes] = await Promise.all([
    supabase.schema("clar_log").from("family_members")
      .select("member_user_id, role, name, status")
      .eq("admin_user_id", userId).eq("status", "active"),
    supabase.schema("clar_log").from("family_invites")
      .select("email, name, role, expires_at")
      .eq("admin_user_id", userId).eq("status", "pending")
      .gt("expires_at", new Date().toISOString()),
  ]);

  return {
    members: membersRes.data ?? [],
    pendingInvites: pendingRes.data ?? [],
  };
}

export async function acceptFamilyInvite(token: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error("Nicht eingeloggt");

  const { error } = await supabase.rpc("accept_family_invite_token", {
    input_token: token,
    input_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

/** Legt teen_self-Settings an und kopiert Medikamente vom Admin-Account.
 *  Nutzt SECURITY DEFINER RPC um Admin-Settings trotz RLS zu lesen. */
export async function setupTeenSettings(token: string): Promise<void> {
  const { error } = await supabase.rpc("setup_teen_settings", { input_token: token });
  if (error) throw new Error(error.message);
}

export async function getAdminMedsForTeen(): Promise<Medication[]> {
  const { data, error } = await supabase.rpc("get_admin_meds_for_teen");
  if (error) return [];
  if (!Array.isArray(data)) return [];
  return data as Medication[];
}

export async function getTeenFamilyName(userId: string): Promise<string | null> {
  const { data } = await supabase
    .schema("clar_log")
    .from("family_members")
    .select("name")
    .eq("member_user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return (data as any)?.name ?? null;
}
