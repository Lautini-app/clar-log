import type { DayLog, MoodEntry } from "@/lib/clar-storage";

const MOOD_LABELS: Record<string, { label: string; emoji: string; tone: "pos" | "neg" | "neu" }> = {
  focused: { label: "Fokussiert", emoji: "🎯", tone: "pos" },
  calm: { label: "Ruhig", emoji: "🌿", tone: "pos" },
  energized: { label: "Energiegeladen", emoji: "⚡", tone: "pos" },
  anxious: { label: "Ängstlich", emoji: "😰", tone: "neg" },
  irritable: { label: "Gereizt", emoji: "😤", tone: "neg" },
  flat: { label: "Flach", emoji: "😐", tone: "neu" },
  overwhelmed: { label: "Überfordert", emoji: "🌀", tone: "neg" },
  sad: { label: "Traurig", emoji: "🌧️", tone: "neg" },
};

function hmToHours(t?: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h + m / 60;
}
function hoursToHM(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  if (mm === 60) return `${String(hh + 1).padStart(2, "0")}:00`;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
function fmtDuration(hours: number) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m} Min.`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} Min.`;
}

/** Approximate area under the curve (positive only) using trapezoid rule. */
function auc(points: { h: number; y: number }[], sign: "pos" | "neg") {
  let a = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a1 = points[i];
    const a2 = points[i + 1];
    const y1 = sign === "pos" ? Math.max(0, a1.y) : Math.max(0, -a1.y);
    const y2 = sign === "pos" ? Math.max(0, a2.y) : Math.max(0, -a2.y);
    a += ((y1 + y2) / 2) * (a2.h - a1.h);
  }
  return a;
}

function classifyMoodAt(
  entry: MoodEntry,
  phases: { name: string; start: number; end: number }[],
) {
  const t = hmToHours(entry.time);
  if (t == null) return null;
  for (const p of phases) {
    if (t >= p.start && t <= p.end) return p.name;
  }
  return null;
}

export function CurveInsights({ log }: { log: DayLog }) {
  const pts = log.effect.points ?? [];
  const moods = log.moodEntries ?? [];
  const doses = log.doses ?? [];

  const observations: string[] = [];
  const interpretations: string[] = [];

  // --- Doses ---
  if (doses.length === 0) {
    observations.push("Heute wurden noch keine Dosen erfasst.");
  } else {
    const sorted = [...doses].sort((a, b) => a.time.localeCompare(b.time));
    const types = sorted.reduce<Record<string, number>>((acc, d) => {
      const k = d.type ?? "retard";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    const partsTxt = Object.entries(types)
      .map(([k, n]) => `${n}× ${k === "retard" ? "Retard" : k === "instant" ? "Bei Bedarf" : "Sonstige"}`)
      .join(", ");
    observations.push(
      `${sorted.length} Dosis-Eintrag${sorted.length === 1 ? "" : "e"} (${partsTxt}); erste um ${sorted[0].time}, letzte um ${sorted[sorted.length - 1].time}.`,
    );
    const lastInstant = [...sorted].reverse().find((d) => (d.type ?? "retard") === "instant");
    if (lastInstant) {
      const lh = hmToHours(lastInstant.time);
      if (lh != null && lh >= 16) {
        interpretations.push(
          `Späte Bedarfsdosis um ${lastInstant.time} könnte Einschlafen erschweren — Schlafqualität gegenchecken.`,
        );
      }
    }
  }

  // --- Curve shape ---
  if (pts.length < 2) {
    observations.push("Noch kein Wirkungsfenster eingezeichnet.");
  } else {
    const onsetH = pts[0].h;
    const offH = pts[pts.length - 1].h;
    const duration = offH - onsetH;
    const peakIdx = pts.reduce(
      (best, p, i, arr) => (p.y > arr[best].y ? i : best),
      0,
    );
    const peakH = pts[peakIdx].h;
    const peakY = pts[peakIdx].y;
    const aPos = auc(pts, "pos");
    const aNeg = auc(pts, "neg");

    observations.push(
      `Wirkung von ${hoursToHM(onsetH)} bis ${hoursToHM(offH)} (Dauer ${fmtDuration(duration)}), Peak gegen ${hoursToHM(peakH)} (~${Math.round(peakY * 100)} % Intensität).`,
    );

    // Onset latency vs first dose
    const firstDoseH = doses.length
      ? Math.min(...doses.map((d) => hmToHours(d.time) ?? Infinity))
      : null;
    if (firstDoseH != null && Number.isFinite(firstDoseH)) {
      const lat = onsetH - firstDoseH;
      if (lat > 0.1) {
        observations.push(
          `Anflutung ca. ${fmtDuration(lat)} nach erster Dosis (${hoursToHM(firstDoseH)}).`,
        );
      } else if (lat < -0.5) {
        observations.push(
          `Wirkungsbeginn liegt vor der ersten erfassten Dosis — evtl. Dosis nicht eingetragen.`,
        );
      }
    }

    if (duration < 3) {
      interpretations.push(
        "Eher kurzes Wirkungsfenster (< 3 h). Wenn das regelmäßig vorkommt, mit Ärzt:in über Dosis oder Galenik (Retard) sprechen.",
      );
    } else if (duration > 10) {
      interpretations.push(
        "Sehr langes Wirkungsfenster (> 10 h) — kann auf Überdosierung am Abend oder verzögerten Wirkstoffabbau hinweisen.",
      );
    }
    if (peakY < 0.4) {
      interpretations.push(
        "Peak-Intensität gefühlt eher niedrig — Wirkung könnte unzureichend sein.",
      );
    } else if (peakY > 0.9) {
      interpretations.push(
        "Sehr hoher Peak — auf Nebenwirkungen wie Herzrasen oder Anspannung achten.",
      );
    }

    // Rebound
    if (aNeg > 0.05) {
      const reboundPts = pts.filter((p) => p.y < -0.05);
      const rStart = reboundPts.length ? reboundPts[0].h : null;
      observations.push(
        `Rebound-Phase eingezeichnet${rStart != null ? ` ab ca. ${hoursToHM(rStart)}` : ""} (Tiefe ~${Math.round(Math.min(...pts.map((p) => p.y)) * -100)} %).`,
      );
      interpretations.push(
        "Sichtbares Tief nach Wirkungsende deutet auf Rebound — typisch für Stimulanzien. Eine kleine Bedarfsdosis am späten Nachmittag kann das abfedern (mit Ärzt:in besprechen).",
      );
    }

    // Mood ↔ phase
    if (moods.length > 0) {
      const phases = [
        { name: "Anflutung", start: onsetH, end: Math.min(peakH, offH) },
        { name: "Peak-Phase", start: Math.max(onsetH, peakH - 0.5), end: Math.min(offH, peakH + 1) },
        { name: "Nachlass", start: peakH, end: offH },
      ];
      const tally: Record<string, { pos: number; neg: number; neu: number }> = {};
      for (const m of moods) {
        const phase = classifyMoodAt(m, phases);
        const tone = MOOD_LABELS[m.mood]?.tone ?? "neu";
        const key = phase ?? "Außerhalb der Wirkung";
        tally[key] = tally[key] ?? { pos: 0, neg: 0, neu: 0 };
        tally[key][tone]++;
      }
      const lines = Object.entries(tally).map(([phase, t]) => {
        const total = t.pos + t.neg + t.neu;
        const parts = [
          t.pos ? `${t.pos}× positiv` : null,
          t.neg ? `${t.neg}× belastend` : null,
          t.neu ? `${t.neu}× neutral` : null,
        ].filter(Boolean);
        return `${phase}: ${total} Eintrag${total === 1 ? "" : "e"} (${parts.join(", ")})`;
      });
      observations.push("Stimmung pro Phase — " + lines.join("; ") + ".");

      const peakTally = tally["Peak-Phase"];
      if (peakTally && peakTally.neg > peakTally.pos) {
        interpretations.push(
          "Während der Peak-Phase überwiegen belastende Stimmungen — möglicher Hinweis auf zu hohe Dosis oder Übererregung.",
        );
      } else if (peakTally && peakTally.pos > 0 && peakTally.neg === 0) {
        interpretations.push(
          "Peak-Phase fühlt sich überwiegend gut an — die Dosis trifft den gewünschten Bereich.",
        );
      }
      const wearTally = tally["Nachlass"];
      if (wearTally && wearTally.neg > 0) {
        interpretations.push(
          "Im Nachlass häufen sich belastende Stimmungen — Hinweis auf abrupten Wirkungsabbruch oder Rebound.",
        );
      }
    }
  }

  // --- Sleep ---
  if (log.sleepHours != null && log.sleepHours < 6) {
    interpretations.push(
      `Kurze Schlafdauer (${log.sleepHours} h) kann Wirkung und Stimmung am Folgetag verzerren.`,
    );
  }
  if (log.sleepWakeups != null && log.sleepWakeups >= 3) {
    interpretations.push(
      "Viele nächtliche Aufwachphasen — wenn das anhält, abendliche Dosis und Koffein prüfen.",
    );
  }

  if (observations.length === 0 && interpretations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {observations.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Beobachtung
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-foreground">
            {observations.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {interpretations.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary-soft/30 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Interpretation & Bewertung
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-foreground">
            {interpretations.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
            Hinweis: automatisch aus deinen Einträgen abgeleitet. Keine
            medizinische Diagnose — als Gesprächsgrundlage für deine Ärzt:in
            gedacht.
          </p>
        </div>
      )}
    </div>
  );
}
