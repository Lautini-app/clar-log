// Kalenderfeed für Betroffene/Tagebuch: /api/calendar/tagebuch/{token}.ics
// Der Token ist derselbe wie im Erfassungslink /tagebuch/{token}.
import { createClient } from "@supabase/supabase-js";

// Gemeinsamer ICS-Bauer für die clar·log Kalenderfeeds (Vercel Functions).
// Erzeugt für jeden Tag der Beobachtungsperiode Termine zu den konfigurierten
// Zeitfenstern (morgens/mittags/abends) — mit dem persönlichen Erfassungslink.

type PeriodData = {
  id: string;
  name?: string;
  initialen?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  timeSlots?: Partial<Record<"morning" | "midday" | "evening", string>>;
};

const SLOT_LABELS: Record<string, string> = {
  morning: "morgens",
  midday: "mittags",
  evening: "abends",
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function icsStamp(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function addDays(key: string, days: number): string {
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildPeriodICal(opts: {
  period: PeriodData;
  entryUrl: string;      // persönlicher Link (beobachtung/… oder tagebuch/…)
  calName: string;       // z.B. "clar · log Beobachtung"
  who?: string | null;   // Name des Beobachters/Betroffenen (optional)
}): string {
  const { period, entryUrl, calName, who } = opts;
  const now = icsStamp(new Date());
  const wer = (period.initialen || period.name || "").trim();
  const basisTitel = wer ? `clar·log (${wer})` : "clar·log Beobachtung";

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//clar·log//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calName)}`,
    "X-WR-TIMEZONE:Europe/Zurich",
  ];

  const slots = Object.entries(period.timeSlots ?? {}).filter(
    ([, time]) => typeof time === "string" && /^\d{1,2}:\d{2}$/.test(time),
  ) as Array<[string, string]>;

  // Sicherheitsdeckel: höchstens ein Jahr
  let day = period.startDate;
  let count = 0;
  while (day <= period.endDate && count < 366) {
    const dateCompact = day.replace(/-/g, "");
    if (slots.length === 0) {
      // Keine Uhrzeiten konfiguriert → ganztägiger Merker
      lines.push(
        "BEGIN:VEVENT",
        `UID:${period.id}-${dateCompact}@clar.log.lautini.ch`,
        `DTSTAMP:${now}`,
        `DTSTART;VALUE=DATE:${dateCompact}`,
        `DTEND;VALUE=DATE:${addDays(day, 1).replace(/-/g, "")}`,
        `SUMMARY:${escapeText(basisTitel + " – Eintrag machen")}`,
        `DESCRIPTION:${escapeText((who ? who + ", bitte " : "Bitte ") + "kurz eintragen: " + entryUrl)}`,
        `URL:${entryUrl}`,
        "END:VEVENT",
      );
    } else {
      for (const [slot, time] of slots) {
        const [h, m] = time.split(":");
        const startT = `${dateCompact}T${pad(Number(h))}${pad(Number(m))}00`;
        const endMinutes = Number(h) * 60 + Number(m) + 15;
        const eh = Math.min(23, Math.floor(endMinutes / 60));
        const em = endMinutes >= 24 * 60 ? 59 : endMinutes % 60;
        const endT = `${dateCompact}T${pad(eh)}${pad(em)}00`;
        lines.push(
          "BEGIN:VEVENT",
          `UID:${period.id}-${dateCompact}-${slot}@clar.log.lautini.ch`,
          `DTSTAMP:${now}`,
          // Ohne Z = lokale Zeit des Geräts (Familie ist in der Schweiz)
          `DTSTART:${startT}`,
          `DTEND:${endT}`,
          `SUMMARY:${escapeText(`${basisTitel} – ${SLOT_LABELS[slot] ?? slot}`)}`,
          `DESCRIPTION:${escapeText((who ? who + ", bitte " : "Bitte ") + "kurz eintragen: " + entryUrl)}`,
          `URL:${entryUrl}`,
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `DESCRIPTION:${escapeText("clar·log: Zeit für den Eintrag")}`,
          "TRIGGER:PT0S",
          "END:VALARM",
          "END:VEVENT",
        );
      }
    }
    day = addDays(day, 1);
    count++;
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

function icsResponseHeaders(filename: string) {
  return {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `inline; filename="${filename}"`,
    "Cache-Control": "public, max-age=300",
  } as Record<string, string>;
}


export default async function handler(req: any, res: any) {
  const raw = String(req.query?.token ?? "");
  const token = raw.replace(/\.ics$/i, "").trim();
  if (!token || token.length < 8) {
    res.status(400).send("Invalid token");
    return;
  }

  const url = process.env.EXT_SUPABASE_URL;
  const serviceKey = process.env.EXT_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(500).send("Calendar not configured");
    return;
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "clar_log" },
  });

  const { data: link, error } = await supabase
    .from("teen_tokens")
    .select("id, owner_id, period_id, name, active, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error) {
    res.status(500).send(`Error: ${error.message}`);
    return;
  }
  if (!link || !link.active || (link.expires_at && new Date(link.expires_at) < new Date())) {
    res.status(404).send("Link nicht gefunden oder abgelaufen");
    return;
  }

  // 1) Periode direkt aus observation_periods
  let period: PeriodData | null = null;
  const { data: periodRow } = await supabase
    .from("observation_periods")
    .select("id, data")
    .eq("id", link.period_id)
    .maybeSingle();
  if (periodRow?.data) period = periodRow.data as PeriodData;

  // 2) Fallback: Perioden liegen (je nach Sync-Stand) in tracker_settings.data.periods
  if (!period && link.owner_id) {
    const { data: settingsRow } = await supabase
      .from("tracker_settings")
      .select("data")
      .eq("user_id", link.owner_id)
      .maybeSingle();
    const settings = (settingsRow?.data ?? null) as
      | { periods?: PeriodData[]; activePeriodId?: string }
      | null;
    const periods = settings?.periods ?? [];
    period =
      periods.find((p) => p?.id === link.period_id) ??
      periods.find((p) => p?.id === settings?.activePeriodId) ??
      periods[0] ??
      null;
  }

  // 3) Fallback: irgendeine Periode dieses Owners
  if (!period && link.owner_id) {
    const { data: anyRow } = await supabase
      .from("observation_periods")
      .select("data, updated_at")
      .eq("user_id", link.owner_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (anyRow?.data) period = anyRow.data as PeriodData;
  }

  if (!period || !period.startDate || !period.endDate) {
    res.status(404).send("Beobachtungsperiode nicht gefunden");
    return;
  }
  const entryUrl = `https://clar.log.lautini.ch/tagebuch/${token}`;
  const ics = buildPeriodICal({
    period,
    entryUrl,
    calName: "clar · log Tagebuch",
    who: link.name,
  });

  const headers = icsResponseHeaders(`clar-log-tagebuch.ics`);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.status(200).send(ics);
}
