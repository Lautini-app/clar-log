import { supabase } from "@/integrations/supabase/client";

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
}): Promise<{ ok: boolean }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Nicht eingeloggt");

  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error("Nicht eingeloggt");

  // Mitglieder-Limit prüfen (max 4)
  const { count } = await supabase
    .schema("clar_log")
    .from("family_invites")
    .select("id", { count: "exact", head: true })
    .eq("admin_user_id", userId)
    .in("status", ["pending", "accepted"]);

  if ((count ?? 0) >= 4) throw new Error("Maximal 4 Familienmitglieder erlaubt.");

  // Token erstellen
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

  // E-Mail via Supabase Edge Function senden
  const { error: fnError } = await supabase.functions.invoke("send-family-invite", {
    body: {
      accessToken,
      email: params.email,
      name: params.name,
      role: params.role,
      token,
    },
  });

  if (fnError) {
    console.warn("[clar] E-Mail-Versand fehlgeschlagen:", fnError);
    // Einladung trotzdem gültig — Token ist in DB
  }

  return { ok: true };
}

export async function listFamilyMembers(): Promise<{
  members: Array<{ member_user_id: string; role: string; name?: string }>;
  pendingInvites: Array<{ email: string; name?: string; role: string; expires_at: string }>;
}> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error("Nicht eingeloggt");

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

export async function acceptFamilyInvite(token: string): Promise<{ adminUserId: string; role: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const userId = sessionData.session?.user?.id;
  const email = sessionData.session?.user?.email;
  if (!accessToken || !userId) throw new Error("Nicht eingeloggt");

  // Invite prüfen
  const { data: invite, error } = await supabase
    .schema("clar_log")
    .from("family_invites")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !invite) throw new Error("Einladung abgelaufen oder ungültig.");

  // Via Edge Function akzeptieren (braucht Service Role für family_members Insert)
  const { data, error: fnError } = await supabase.functions.invoke("accept-family-invite", {
    body: { accessToken, token, userId, email },
  });

  if (fnError) throw new Error(fnError.message);
  return data;
}
