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
    await admin.schema("clar_log").from("tracker_logs").delete().eq("user_id", userId);
    await admin.schema("clar_log").from("tracker_settings").delete().eq("user_id", userId);
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
