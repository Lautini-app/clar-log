import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, userId } = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Invite prüfen
    const { data: invite, error } = await admin
      .schema("clar_log")
      .from("family_invites")
      .select("*")
      .eq("token", token)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !invite) throw new Error("Einladung abgelaufen oder ungültig.");

    // Mitglied eintragen
    await admin.schema("clar_log").from("family_members").insert({
      admin_user_id: invite.admin_user_id,
      member_user_id: userId,
      role: invite.role,
      name: invite.name ?? null,
      status: "active",
    });

    // Invite als angenommen markieren
    await admin.schema("clar_log").from("family_invites")
      .update({ status: "accepted" })
      .eq("token", token);

    // Observer-Eintrag für Beobachtungs-Formular
    const { data: userRes } = await admin.auth.admin.getUserById(userId);
    await admin.schema("clar_log").from("observers").insert({
      owner_id: invite.admin_user_id,
      observer_user_id: userId,
      email: userRes?.user?.email ?? "",
      role: invite.role === "teen" ? "other" : "parent",
      name: invite.name ?? null,
    });

    return new Response(
      JSON.stringify({ ok: true, adminUserId: invite.admin_user_id, role: invite.role }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
