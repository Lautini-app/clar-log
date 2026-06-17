import { supabase } from "@/integrations/supabase/client";

export async function generateDoctorLink(ownerId: string, periodId: string): Promise<string> {
  await supabase.schema("clar_log").from("doctor_links")
    .update({ active: false })
    .eq("owner_id", ownerId).eq("period_id", periodId);
  const { data, error } = await supabase.schema("clar_log").from("doctor_links")
    .insert({ owner_id: ownerId, period_id: periodId })
    .select("token").single();
  if (error) throw error;
  const base = typeof window !== "undefined" ? window.location.origin : "https://clar.log.lautini.ch";
  return `${base}/dossier/${data.token}`;
}

export async function getActiveDoctorLink(ownerId: string, periodId: string): Promise<string | null> {
  const { data } = await supabase.schema("clar_log").from("doctor_links")
    .select("token").eq("owner_id", ownerId).eq("period_id", periodId)
    .eq("active", true).maybeSingle();
  if (!data) return null;
  const base = typeof window !== "undefined" ? window.location.origin : "https://clar.log.lautini.ch";
  return `${base}/dossier/${data.token}`;
}

export async function resolveDoctorToken(token: string): Promise<{ ownerId: string; periodId: string } | null> {
  const { data, error } = await supabase.rpc("resolve_doctor_token", { input_token: token });
  if (error || !data || data.length === 0) return null;
  return { ownerId: String(data[0].owner_id), periodId: String(data[0].period_id) };
}
