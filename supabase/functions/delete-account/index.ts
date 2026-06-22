import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { accessToken } = await req.json();
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, Deno.env.get("ANON_KEY")!, { auth: { persistSession: false } });
    const { data: userData } = await userClient.auth.getUser(accessToken);
    if (!userData?.user) throw new Error("Unauthorized");
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const cl = admin.schema("clar_log");

    // Delete ALL clar_log schema data for this user.
    // Order matters: child tables before parents to avoid FK violations.
    await Promise.all([
      cl.from("observer_observations").delete().eq("owner_id", userId),
      cl.from("observer_observations").delete().eq("observer_user_id", userId),
      cl.from("word_reports").delete().eq("user_id", userId),
      cl.from("daily_logs").delete().eq("user_id", userId),
    ]);

    await Promise.all([
      cl.from("observer_links").delete().eq("owner_id", userId),
      cl.from("teacher_links").delete().eq("owner_id", userId),
      cl.from("doctor_links").delete().eq("owner_id", userId),
      cl.from("teen_tokens").delete().eq("owner_id", userId),
      cl.from("observers").delete().eq("owner_id", userId),
      cl.from("observers").delete().eq("observer_user_id", userId),
    ]);

    await Promise.all([
      cl.from("observation_periods").delete().eq("user_id", userId),
      cl.from("tracker_logs").delete().eq("user_id", userId),
      cl.from("tracker_settings").delete().eq("user_id", userId),
      cl.from("family_members").delete().eq("admin_user_id", userId),
      cl.from("family_members").delete().eq("member_user_id", userId),
      cl.from("family_invites").delete().eq("admin_user_id", userId),
      cl.from("user_consents").delete().eq("user_id", userId),
    ]);

    // NOTE: Auth user is NOT deleted — it is shared across all clar apps.
    // The user keeps access to clar·markt, clar·heim, clar·tag.

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
