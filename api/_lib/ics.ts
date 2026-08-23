// Gemeinsamer ICS-Bauer für die clar·log Kalenderfeeds (Vercel Functions).
// Erzeugt für jeden Tag der Beobachtungsperiode Termine zu den konfigurierten
// Zeitfenstern (morgens/mittags/abends) — mit dem persönlichen Erfassungslink.

export type PeriodData = {
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

export function buildPeriodICal(opts: {
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

export function icsResponseHeaders(filename: string) {
  return {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `inline; filename="${filename}"`,
    "Cache-Control": "public, max-age=300",
  } as Record<string, string>;
}
