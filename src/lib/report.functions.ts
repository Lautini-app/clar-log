import { supabase } from "@/integrations/supabase/client";

type WordReport = { id: string; content: string; created_at: string; sent_to_doctor_at: string | null };

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Nicht eingeloggt");
  return token;
}

export async function generateWordReport(params: { periodId: string; rangeDays?: number }): Promise<WordReport> {
  const accessToken = await getAccessToken();
  const { data, error } = await supabase.functions.invoke("generate-word-report", {
    body: { accessToken, periodId: params.periodId, rangeDays: params.rangeDays ?? 30 },
  });
  if (error) throw new Error(error.message);
  return data as WordReport;
}

export async function listWordReports(params: { periodId: string }): Promise<WordReport[]> {
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) return [];

  const { data, error } = await supabase
    .schema("clar_log")
    .from("word_reports")
    .select("*")
    .eq("user_id", userId)
    .eq("period_id", params.periodId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as WordReport[];
}

export async function sendReportToDoctor(params: { reportId: string; doctorEmail: string }): Promise<void> {
  const accessToken = await getAccessToken();
  const { error } = await supabase.functions.invoke("send-report-to-doctor", {
    body: { accessToken, reportId: params.reportId, doctorEmail: params.doctorEmail },
  });
  if (error) throw new Error(error.message);
}
