import { supabase } from "@/integrations/supabase/client";

function randomToken(length = 24): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

/**
 * Familienmitglied einladen.
 * Speichert Token in DB + sendet Supabase Magic Link mit redirectTo auf /einladung/TOKEN.
 * Kein Service Role Key nötig, kein Edge Function Deploy.
 */
export async function inviteFamilyMember(params: {
  email: string;
  name?: string;
  role: "member" | "teen";
}): Promise<{ ok: boolean; inviteUrl: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error("Nicht eingeloggt");

  // Limit prüfen
  const { count } = await supabase
    .schema("clar_log")
    .from("family_invites")
    .select("id", { count: "exact", head: true })
    .eq("admin_user_id", userId)
    .in("status", ["pending", "accepted"]);

  if ((count ?? 0) >= 4) throw new Error("Maximal 4 Familienmitglieder erlaubt.");

  // Token in DB speichern
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

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

  const appUrl = "https://clar.log.lautini.ch";
  const inviteUrl = `${appUrl}/einladung/${token}`;

  // Supabase sendet Magic Link — Person klickt → landet auf /einladung/TOKEN
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: params.email,
    options: {
      emailRedirectTo: inviteUrl,
      shouldCreateUser: true,
      data: { clar_invite_token: token, clar_role: params.role },
    },
  });

  if (otpError) throw new Error(`Einladungsmail fehlgeschlagen: ${otpError.message}`);

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
    supabase
      .schema("clar_log")
      .from("family_members")
      .select("member_user_id, role, name, status")
      .eq("admin_user_id", userId)
      .eq("status", "active"),
    supabase
      .schema("clar_log")
      .from("family_invites")
      .select("email, name, role, expires_at")
      .eq("admin_user_id", userId)
      .eq("status", "pending")
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
