// =============================================================================
// cleanup-subscription-consent — daily cron job
// =============================================================================
// For every user with consent_level = 'subscription_only' but no active
// subscription, delete their public.email_consent row and record the deletion
// in public.audit_log. On their next login the consent modal appears again
// and they get to re-decide.
//
// "Active subscription" =
//   subscribers.subscribed = true
//   AND (subscribers.subscription_end IS NULL
//        OR subscribers.subscription_end > now())
//
// Triggered by pg_cron via pg_net (see ../../migrations/*_cleanup_cron.sql).
// =============================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // 1. Pull every user currently on the conditional plan.
    const { data: candidates, error: candErr } = await admin
      .from("email_consent")
      .select("user_id")
      .eq("consent_level", "subscription_only");
    if (candErr) throw candErr;

    const candidateIds: string[] = (candidates ?? []).map((r: { user_id: string }) => r.user_id);

    if (candidateIds.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, scanned: 0, deleted: 0, deleted_user_ids: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Look up active subscriptions for those users.
    const nowIso = new Date().toISOString();
    const { data: activeSubs, error: subErr } = await admin
      .from("subscribers")
      .select("user_id, subscribed, subscription_end")
      .in("user_id", candidateIds)
      .eq("subscribed", true);
    if (subErr) throw subErr;

    const activeUserIds = new Set<string>(
      (activeSubs ?? [])
        .filter((s: { subscription_end: string | null }) => {
          if (!s.subscription_end) return true;
          return s.subscription_end > nowIso;
        })
        .map((s: { user_id: string }) => s.user_id),
    );

    // 3. The candidates without an active subscription get cleaned up.
    const toDelete = candidateIds.filter((id) => !activeUserIds.has(id));

    if (toDelete.length === 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          scanned: candidateIds.length,
          deleted: 0,
          deleted_user_ids: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: delErr } = await admin
      .from("email_consent")
      .delete()
      .in("user_id", toDelete);
    if (delErr) throw delErr;

    // 4. Audit-log one row per cleaned user.
    const auditRows = toDelete.map((uid) => ({
      user_id: uid,
      action: "consent_deleted_subscription_expired",
      details: { performed_by: "system", source: "cleanup-subscription-consent" },
    }));

    const { error: logErr } = await admin.from("audit_log").insert(auditRows);
    if (logErr) {
      // Don't fail the job if audit-log insertion fails — the consent row is
      // already gone. Surface the warning to the caller instead.
      console.warn("[cleanup-subscription-consent] audit_log insert failed", logErr.message);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        scanned: candidateIds.length,
        deleted: toDelete.length,
        deleted_user_ids: toDelete,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[cleanup-subscription-consent] failed", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
