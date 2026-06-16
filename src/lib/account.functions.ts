import { supabase } from "@/integrations/supabase/client";

export async function deleteAccount(params: { accessToken: string }): Promise<{ ok: boolean }> {
  const { error } = await supabase.functions.invoke("delete-account", {
    body: { accessToken: params.accessToken },
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}
