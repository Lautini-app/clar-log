import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

function getAdminClient() {
  const serviceKey = process.env.CLAR_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error("CLAR_SUPABASE_SERVICE_ROLE_KEY is not configured");
  return createClient(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function verifyUser(accessToken: string) {
  const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await userClient.auth.getUser(accessToken);
  if (error || !data?.user) throw new Error("Unauthorized");
  return data.user;
}

function randomToken(length = 24) {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, length);
}

/**
 * Lädt ein Familienmitglied ein.
 * Erstellt einen invite_token in der family_invites Tabelle.
 * Sendet eine Einladungs-E-Mail via Resend — kein Name im Link.
 */
export const inviteFamilyMember = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string; email: string; role: "member" | "child" | "teen"; name?: string }) => {
    if (!data?.accessToken || !data?.email || !data?.role) throw new Error("accessToken, email and role required");
    return data;
  })
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const inviter = await verifyUser(data.accessToken);

    // Prüfe ob Einladender Admin-Rolle hat (stripe_customer_id vorhanden)
    const { data: profile } = await admin
      .schema("clar_log")
      .from("tracker_settings")
      .select("data")
      .eq("user_id", inviter.id)
      .maybeSingle();

    const settingsData = profile?.data as Record<string, unknown> | null;
    if (!settingsData?.isAdmin) {
      // Setze isAdmin falls Stripe-Abo vorhanden
      const { data: stripeCheck } = await admin
        .from("stripe_subscriptions")
        .select("id")
        .eq("user_id", inviter.id)
        .eq("status", "active")
        .maybeSingle();
      if (!stripeCheck) throw new Error("Kein aktives Abo. Nur Admin kann einladen.");
    }

    // Prüfe Mitglieder-Limit (max 4)
    const { count } = await admin
      .schema("clar_log")
      .from("family_members")
      .select("id", { count: "exact", head: true })
      .eq("admin_user_id", inviter.id)
      .eq("status", "active");
    if ((count ?? 0) >= 4) throw new Error("Maximal 4 Familienmitglieder erlaubt.");

    // Token erstellen (kein Name, keine E-Mail im Token)
    const token = randomToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await admin
      .schema("clar_log")
      .from("family_invites")
      .insert({
        admin_user_id: inviter.id,
        email: data.email,
        role: data.role,
        name: data.name ?? null,
        token,
        expires_at: expiresAt,
        status: "pending",
      });

    // E-Mail via Resend senden
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    const appUrl = process.env.APP_URL ?? "https://clar.log.lautini.ch";
    const inviteUrl = `${appUrl}/einladung/${token}`;

    const roleText = data.role === "teen" ? "Jugendliche/r" : data.role === "child" ? "Kind" : "Familienmitglied";
    const displayName = data.name ? ` (${data.name})` : "";

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "clar.log <einladung@lautini.ch>",
        to: [data.email],
        subject: "Einladung zu clar.log",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
            <p style="font-size: 16px; color: #1a1a1a; margin-bottom: 16px;">
              Du wurdest als <strong>${roleText}${displayName}</strong> zu clar.log eingeladen.
            </p>
            <p style="font-size: 14px; color: #666; margin-bottom: 24px;">
              clar.log ist ein Stimulanzien-Tagebuch für Menschen mit ADHS. Du kannst tägliche Beobachtungen erfassen, die deiner Familie helfen, die Wirkung der Medikation zu verstehen.
            </p>
            <a href="${inviteUrl}" style="display: inline-block; background: #085041; color: #fff; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 12px; text-decoration: none;">
              Einladung annehmen
            </a>
            <p style="font-size: 12px; color: #999; margin-top: 24px;">
              Dieser Link ist 7 Tage gültig. Er enthält keine personenbezogenen Daten.
            </p>
          </div>
        `,
      }),
    });

    return { ok: true, token };
  });

/**
 * Einladung annehmen — wird vom neuen Mitglied nach Registrierung aufgerufen.
 * Verknüpft den neuen Account mit dem Admin.
 */
export const acceptFamilyInvite = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string; token: string }) => {
    if (!data?.accessToken || !data?.token) throw new Error("accessToken and token required");
    return data;
  })
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const member = await verifyUser(data.accessToken);

    // Invite prüfen
    const { data: invite, error } = await admin
      .schema("clar_log")
      .from("family_invites")
      .select("*")
      .eq("token", data.token)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !invite) throw new Error("Einladung abgelaufen oder ungültig.");

    // Mitglied in family_members eintragen
    await admin.schema("clar_log").from("family_members").insert({
      admin_user_id: invite.admin_user_id,
      member_user_id: member.id,
      role: invite.role,
      status: "active",
    });

    // Invite als angenommen markieren
    await admin.schema("clar_log").from("family_invites").update({ status: "accepted" }).eq("token", data.token);

    // Observer-Eintrag erstellen (für Beobachtungs-Rolle)
    if (invite.role === "member") {
      await admin.schema("clar_log").from("observers").insert({
        owner_id: invite.admin_user_id,
        observer_user_id: member.id,
        email: member.email,
        role: "parent",
      });
    }

    return { ok: true, adminUserId: invite.admin_user_id, role: invite.role };
  });

/**
 * Familienmitglieder auflisten (nur für Admin).
 */
export const listFamilyMembers = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string }) => {
    if (!data?.accessToken) throw new Error("accessToken required");
    return data;
  })
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const user = await verifyUser(data.accessToken);

    const { data: members, error } = await admin
      .schema("clar_log")
      .from("family_members")
      .select("member_user_id, role, status, created_at")
      .eq("admin_user_id", user.id)
      .eq("status", "active");

    if (error) throw new Error(error.message);

    const { data: pendingInvites } = await admin
      .schema("clar_log")
      .from("family_invites")
      .select("email, role, expires_at")
      .eq("admin_user_id", user.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString());

    return {
      members: members ?? [],
      pendingInvites: pendingInvites ?? [],
    };
  });

/**
 * Lehrperson-Link generieren (ohne personenbezogene Daten).
 * Nutzt bestehende teacher_links Tabelle.
 */
export const generateTeacherLink = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string; periodId: string }) => {
    if (!data?.accessToken || !data?.periodId) throw new Error("accessToken and periodId required");
    return data;
  })
  .handler(async ({ data }) => {
    const admin = getAdminClient();
    const user = await verifyUser(data.accessToken);

    // Alte Links deaktivieren
    await admin
      .schema("clar_log")
      .from("teacher_links")
      .update({ active: false })
      .eq("owner_id", user.id)
      .eq("period_id", data.periodId);

    const token = randomToken(18);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: link, error } = await admin
      .schema("clar_log")
      .from("teacher_links")
      .insert({ owner_id: user.id, period_id: data.periodId, token, active: true, expires_at: expiresAt })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    const appUrl = process.env.APP_URL ?? "https://clar.log.lautini.ch";
    return {
      token,
      url: `${appUrl}/beobachtung/${token}`,
      expiresAt,
    };
  });
