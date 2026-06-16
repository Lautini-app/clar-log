import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

const MAX_REPORTS_PER_MONTH = 2;

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
  return data.user.id;
}

/** Aggregiert die letzten `rangeDays` Tageslogs zu anonymisierten Kennzahlen — kein Name, keine E-Mail. */
function buildAnonymizedSummary(
  logs: Array<{ date: string; data: Record<string, unknown> }>,
  rangeDays: number,
) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - rangeDays);
  const recent = logs.filter((row) => new Date(row.date) >= cutoff);

  const byCategory: Record<string, number[]> = {};
  for (const row of recent) {
    const slots = (row.data as { slots?: Record<string, { answers?: Record<string, { value?: unknown }> }> }).slots ?? {};
    for (const slot of Object.values(slots)) {
      for (const [itemId, answer] of Object.entries(slot.answers ?? {})) {
        if (typeof answer.value === "number") {
          byCategory[itemId] = byCategory[itemId] ?? [];
          byCategory[itemId].push(answer.value);
        }
      }
    }
  }

  const averages: Record<string, number> = {};
  for (const [itemId, values] of Object.entries(byCategory)) {
    averages[itemId] = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  }

  return { rangeDays, dayCount: recent.length, averages };
}

export const generateWordReport = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string; periodId: string; rangeDays?: number }) => {
    if (!data || typeof data.accessToken !== "string" || typeof data.periodId !== "string") {
      throw new Error("accessToken and periodId required");
    }
    return { rangeDays: 30, ...data };
  })
  .handler(async ({ data }) => {
    const userId = await verifyUser(data.accessToken);
    const admin = getAdminClient();

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const { count } = await admin
      .schema("clar_log")
      .from("word_reports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart.toISOString());
    if ((count ?? 0) >= MAX_REPORTS_PER_MONTH) {
      throw new Error(`Limit erreicht: maximal ${MAX_REPORTS_PER_MONTH} Berichte pro Monat`);
    }

    const { data: logRows, error: logsError } = await admin
      .schema("clar_log")
      .from("daily_logs")
      .select("date, data")
      .eq("user_id", userId)
      .eq("period_id", data.periodId);
    if (logsError) throw new Error(logsError.message);

    const summary = buildAnonymizedSummary(logRows ?? [], data.rangeDays);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      output_config: { effort: "high" },
      system:
        "Du fasst anonymisierte ADHS-Symptom-Tracking-Daten für einen Elternteil/Patienten in einem kurzen, " +
        "sachlichen deutschen Wortbericht zusammen (max. 200 Wörter), der einem Arzt vorgelegt werden kann. " +
        "Du erhältst nur aggregierte Durchschnittswerte pro Kategorie (Skala 1-5) und die Anzahl erfasster Tage — " +
        "keine Namen, kein Geburtsdatum, keine Kontaktdaten. Beschreibe Tendenzen und Auffälligkeiten neutral, " +
        "ohne Diagnose zu stellen.",
      messages: [
        {
          role: "user",
          content: `Anonymisierte Zusammenfassung (${summary.dayCount} erfasste Tage, letzte ${summary.rangeDays} Tage):\n${JSON.stringify(summary.averages, null, 2)}`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const content = textBlock && textBlock.type === "text" ? textBlock.text : "";

    const { data: inserted, error: insertError } = await admin
      .schema("clar_log")
      .from("word_reports")
      .insert({ user_id: userId, period_id: data.periodId, content, range_days: data.rangeDays })
      .select("*")
      .single();
    if (insertError) throw new Error(insertError.message);

    return { id: inserted.id, content, createdAt: inserted.created_at };
  });

export const listWordReports = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string; periodId: string }) => {
    if (!data || typeof data.accessToken !== "string" || typeof data.periodId !== "string") {
      throw new Error("accessToken and periodId required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const userId = await verifyUser(data.accessToken);
    const admin = getAdminClient();
    const { data: reports, error } = await admin
      .schema("clar_log")
      .from("word_reports")
      .select("*")
      .eq("user_id", userId)
      .eq("period_id", data.periodId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return reports ?? [];
  });

export const sendReportToDoctor = createServerFn({ method: "POST" })
  .inputValidator((data: { accessToken: string; reportId: string; doctorEmail: string }) => {
    if (!data || typeof data.accessToken !== "string" || typeof data.reportId !== "string" || typeof data.doctorEmail !== "string") {
      throw new Error("accessToken, reportId and doctorEmail required");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const userId = await verifyUser(data.accessToken);
    const admin = getAdminClient();

    const { data: report, error } = await admin
      .schema("clar_log")
      .from("word_reports")
      .select("*")
      .eq("id", data.reportId)
      .eq("user_id", userId)
      .single();
    if (error || !report) throw new Error("Bericht nicht gefunden");

    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) throw new Error("RESEND_API_KEY is not configured");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "clar.log <bericht@clar.log>",
        to: [data.doctorEmail],
        subject: "clar.log — Wortbericht",
        text: report.content,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Mail-Versand fehlgeschlagen: ${body}`);
    }

    await admin
      .schema("clar_log")
      .from("word_reports")
      .update({ sent_to_doctor_at: new Date().toISOString() })
      .eq("id", data.reportId);

    return { ok: true };
  });
