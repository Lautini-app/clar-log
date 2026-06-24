// Email-consent client lib — talks to public.email_consent (shared across all clar apps).
// Marketing mail is gated by this; transactional mail (login, password reset,
// receipts) is NOT — those always go.
import { supabase } from "@/integrations/supabase/client";

export type ConsentLevel = "always" | "subscription_only" | "never";

export type EmailConsent = {
  user_id: string;
  consent_level: ConsentLevel;
  consented_at: string;
  consent_version: number;
  updated_at: string;
};

export async function getEmailConsent(userId: string): Promise<EmailConsent | null> {
  const { data, error } = await (supabase as any)
    .schema("public")
    .from("email_consent")
    .select("user_id, consent_level, consented_at, consent_version, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[email-consent] read failed", error);
    return null;
  }
  return (data ?? null) as EmailConsent | null;
}

export async function setEmailConsent(
  userId: string,
  level: ConsentLevel,
): Promise<{ ok: boolean; error?: string }> {
  const now = new Date().toISOString();
  const { error } = await (supabase as any)
    .schema("public")
    .from("email_consent")
    .upsert(
      {
        user_id: userId,
        consent_level: level,
        consented_at: now,
        updated_at: now,
      },
      { onConflict: "user_id" },
    );
  if (error) return { ok: false, error: error.message };

  // Append to audit_log (best effort — failure does not block consent save).
  try {
    await (supabase as any).schema("public").from("audit_log").insert({
      user_id: userId,
      action: "email_consent_set",
      details: { consent_level: level, source: "app" },
    });
  } catch (e) {
    console.warn("[email-consent] audit_log insert failed", e);
  }

  return { ok: true };
}
