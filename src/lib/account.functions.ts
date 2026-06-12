import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

/**
 * DSGVO Account-Delete-Pfad.
 *
 * Verifiziert das Access-Token des Aufrufers gegen Supabase Auth und löscht
 * anschließend den `auth.users`-Eintrag via Service-Role-Key. Über die
 * `ON DELETE CASCADE`-FKs auf `clar_log.tracker_logs` und
 * `clar_log.tracker_settings` werden alle Userdaten automatisch entfernt.
 */
export const deleteAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string }) => {
    if (!data || typeof data.accessToken !== "string" || data.accessToken.length < 10) {
      throw new Error("accessToken required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const serviceKey = process.env.CLAR_SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new Error("CLAR_SUPABASE_SERVICE_ROLE_KEY is not configured");
    }

    // 1) Token verifizieren — wer ruft auf?
    const userClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: getUserErr } = await userClient.auth.getUser(
      data.accessToken,
    );
    if (getUserErr || !userData?.user) {
      throw new Error("Unauthorized");
    }
    const userId = userData.user.id;

    // 2) Admin-Client (Service-Role) — bypasst RLS, kann auth.users löschen.
    const admin = createClient(SUPABASE_URL, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Belt-and-suspenders: explizit Tabellen leeren (falls FK-Cascade fehlen sollte).
    await admin.schema("clar_log").from("tracker_logs").delete().eq("user_id", userId);
    await admin
      .schema("clar_log")
      .from("tracker_settings")
      .delete()
      .eq("user_id", userId);

    // 3) auth.users-Eintrag löschen.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) {
      throw new Error(`Failed to delete auth user: ${delErr.message}`);
    }

    return { ok: true, userId };
  });