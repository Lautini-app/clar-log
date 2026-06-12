import { useEffect, useMemo, useRef, useState } from "react";
import type { Dose, EffectPoint, MedType } from "@/lib/clar-storage";

const X_MIN = 6;
const X_MAX = 23;
const W = 320;
const H = 200;
const PAD_L = 10;
const PAD_R = 10;
const PAD_T = 36; // top lanes: activities + moods
const PAD_B = 56; // axis labels + dose lanes
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const NEG_FRAC = 0.28; // share of plot reserved for rebound below baseline
const POS_H = PLOT_H * (1 - NEG_FRAC);
const NEG_H = PLOT_H * NEG_FRAC;
const REBOUND_COLOR = "oklch(0.7 0.17 25)"; // warm coral for rebound

const MED_COLOR: Record<MedType, string> = {
  retard: "var(--primary)",
  instant: "oklch(0.78 0.16 60)",
  antidepressant: "oklch(0.72 0.15 160)",
};
const MED_LABEL: Record<MedType, string> = {
  retard: "Retard",
  instant: "Bedarf",
  antidepressant: "Sonstige",
};

function hmToHours(t?: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h + m / 60;
}
function hoursToHM(h: number): string {
  const c = Math.max(X_MIN, Math.min(X_MAX, h));
  const hh = Math.floor(c);
  const mm = Math.round((c - hh) * 60);
  if (mm === 60) return `${String(hh + 1).padStart(2, "0")}:00`;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const hourToX = (h: number) =>
  PAD_L + ((h - X_MIN) / (X_MAX - X_MIN)) * PLOT_W;
const xToHour = (x: number) =>
  X_MIN + ((x - PAD_L) / PLOT_W) * (X_MAX - X_MIN);
const BASELINE_Y = PAD_T + POS_H;
const BOTTOM_Y = PAD_T + PLOT_H;
const valToY = (v: number) =>
  v >= 0 ? BASELINE_Y - v * POS_H : BASELINE_Y + -v * NEG_H;
const yToVal = (y: number) =>
  y <= BASELINE_Y ? (BASELINE_Y - y) / POS_H : -(y - BASELINE_Y) / NEG_H;

const snapH = (h: number) => Math.round(h * 4) / 4; // 15 min
const snapV = (v: number) => Math.round(v * 20) / 20; // 5%

/** Smooth Catmull-Rom -> Bezier path through points. */
function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function defaultPoints(
  onset?: string,
  peak?: string,
  wornOff?: string,
): EffectPoint[] {
  const o = hmToHours(onset);
  const w = hmToHours(wornOff);
  if (o != null && w != null && w > o) {
    const p = hmToHours(peak) ?? (o + w) / 2;
    return [
      { h: o, y: 0 },
      { h: Math.max(o + 0.25, Math.min(w - 0.25, p)), y: 0.85 },
      { h: w, y: 0 },
    ];
  }
  return [];
}

export function EffectCurve({
  onset,
  peak,
  wornOff,
  points,
  doses = [],
  moods = [],
  activities = [],
  onChange,
}: {
  onset?: string;
  peak?: string;
  wornOff?: string;
  points?: EffectPoint[];
  doses?: Dose[];
  moods?: { id: string; time: string; emoji: string; label?: string }[];
  activities?: { id: string; time: string; emoji: string; label?: string }[];
  onChange: (next: {
    onset?: string;
    peak?: string;
    wornOff?: string;
    points?: EffectPoint[];
  }) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  const initial = useMemo<EffectPoint[]>(
    () => points ?? defaultPoints(onset, peak, wornOff),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [pts, setPts] = useState<EffectPoint[]>(initial);
  const [drag, setDrag] = useState<number | null>(null);

  // Sync incoming changes (e.g. legacy onset/wornOff from elsewhere)
  useEffect(() => {
    if (points && points !== pts) setPts(points);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  const commit = (next: EffectPoint[]) => {
    const sorted = [...next].sort((a, b) => a.h - b.h);
    setPts(sorted);
    if (sorted.length === 0) {
      onChange({ points: [], onset: undefined, peak: undefined, wornOff: undefined });
      return;
    }
    const o = sorted[0];
    const w = sorted[sorted.length - 1];
    let peakIdx = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].y > sorted[peakIdx].y) peakIdx = i;
    }
    onChange({
      points: sorted,
      onset: hoursToHM(o.h),
      wornOff: hoursToHM(w.h),
      peak: hoursToHM(sorted[peakIdx].h),
    });
  };

  // Pointer-move drag
  useEffect(() => {
    if (drag == null) return;
    const svg = svgRef.current;
    if (!svg) return;
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const lx = ((e.clientX - rect.left) / rect.width) * W;
      const ly = ((e.clientY - rect.top) / rect.height) * H;
      const isEndpoint = drag === 0 || drag === pts.length - 1;
      const next = pts.map((p, i) => {
        if (i !== drag) return p;
        let h = snapH(xToHour(lx));
        h = Math.max(X_MIN, Math.min(X_MAX, h));
        // prevent crossing neighbours
        const left = pts[i - 1]?.h ?? X_MIN - 1;
        const right = pts[i + 1]?.h ?? X_MAX + 1;
        h = Math.max(left + 0.25, Math.min(right - 0.25, h));
        const y = isEndpoint
          ? 0
          : Math.max(-1, Math.min(1, snapV(yToVal(ly))));
        return { h, y };
      });
      commit(next);
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, pts]);

  const baselineY = BASELINE_Y;
  const bottomY = BOTTOM_Y;

  // Tap on empty plot area: insert a point or seed initial curve.
  const onSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drag != null) return;
    const targetEl = e.target as Element;
    if (targetEl.getAttribute("data-handle")) return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * W;
    const ly = ((e.clientY - rect.top) / rect.height) * H;
    if (ly > bottomY) return; // tapped below the plot area
    const h = Math.max(X_MIN, Math.min(X_MAX, snapH(xToHour(lx))));
    const v = Math.max(-1, Math.min(1, snapV(yToVal(ly))));

    if (pts.length === 0) {
      // Seed a basic wave around the tap
      const start = Math.max(X_MIN, h - 1);
      const end = Math.min(X_MAX, h + 4);
      commit([
        { h: start, y: 0 },
        { h, y: Math.max(0.4, v) },
        { h: end, y: 0 },
      ]);
      return;
    }

    // Insert intermediate point inside the existing range
    const o = pts[0].h;
    const w = pts[pts.length - 1].h;
    if (h <= o + 0.2 || h >= w - 0.2) return;
    if (pts.some((p) => Math.abs(p.h - h) < 0.3)) return;
    commit([...pts, { h, y: v }]);
  };

  // Build smooth path
  const screenPts = pts.map((p) => ({ x: hourToX(p.h), y: valToY(p.y) }));
  const curvePath = smoothPath(screenPts);
  const fillPath =
    pts.length >= 2
      ? `${curvePath} L ${screenPts[screenPts.length - 1].x} ${baselineY} L ${screenPts[0].x} ${baselineY} Z`
      : "";

  const ticks: number[] = [];
  for (let i = X_MIN; i <= X_MAX; i += 2) ticks.push(i);

  const hasData = pts.length >= 2;

  // Dose markers below axis
  const lanes: MedType[] = ["retard", "instant", "antidepressant"];
  const laneY = (type: MedType) => bottomY + 22 + lanes.indexOf(type) * 9;

  return (
    <div className="select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none"
        style={{ touchAction: "none" }}
        onPointerDown={onSvgPointerDown}
      >
        <defs>
          <linearGradient id="curveFill" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor="color-mix(in oklab, var(--primary) 55%, transparent)"
            />
            <stop
              offset="100%"
              stopColor="color-mix(in oklab, var(--primary) 5%, transparent)"
            />
          </linearGradient>
          <linearGradient id="reboundFill" x1="0" x2="0" y1="0" y2="1">
            <stop
              offset="0%"
              stopColor={`color-mix(in oklab, ${REBOUND_COLOR} 5%, transparent)`}
            />
            <stop
              offset="100%"
              stopColor={`color-mix(in oklab, ${REBOUND_COLOR} 55%, transparent)`}
            />
          </linearGradient>
          <clipPath id="clipPos">
            <rect x={0} y={0} width={W} height={baselineY} />
          </clipPath>
          <clipPath id="clipNeg">
            <rect x={0} y={baselineY} width={W} height={bottomY - baselineY} />
          </clipPath>
        </defs>

        {/* horizontal gridlines */}
        {[0.25, 0.5, 0.75].map((v) => (
          <line
            key={v}
            x1={PAD_L}
            x2={W - PAD_R}
            y1={valToY(v)}
            y2={valToY(v)}
            stroke="color-mix(in oklab, var(--border) 50%, transparent)"
            strokeDasharray="1 4"
            strokeWidth={1}
          />
        ))}

        {/* rebound zone background */}
        <rect
          x={PAD_L}
          y={baselineY}
          width={PLOT_W}
          height={bottomY - baselineY}
          fill={`color-mix(in oklab, ${REBOUND_COLOR} 6%, transparent)`}
        />
        {/* baseline (zero line) */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={baselineY}
          y2={baselineY}
          stroke="var(--border)"
          strokeWidth={1}
        />
        <text
          x={W - PAD_R - 2}
          y={bottomY - 3}
          textAnchor="end"
          fontSize={8}
          fill={REBOUND_COLOR}
          opacity={0.7}
        >
          Rebound
        </text>
        {/* x-axis bottom line */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={bottomY}
          y2={bottomY}
          stroke="var(--border)"
          strokeWidth={1}
        />

        {/* x-axis ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={hourToX(t)}
              x2={hourToX(t)}
              y1={bottomY}
              y2={bottomY + 4}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={hourToX(t)}
              y={bottomY + 16}
              textAnchor="middle"
              fontSize={9}
              fill="var(--muted-foreground)"
            >
              {t}
            </text>
          </g>
        ))}

        {/* Dose markers */}
        {doses.map((d) => {
          const t: MedType = d.type ?? "retard";
          const h = hmToHours(d.time);
          if (h == null || h < X_MIN || h > X_MAX) return null;
          return (
            <g key={d.id}>
              <line
                x1={hourToX(h)}
                x2={hourToX(h)}
                y1={bottomY + 1}
                y2={laneY(t) - 4}
                stroke={MED_COLOR[t]}
                strokeWidth={1}
                strokeDasharray="1.5 2"
              />
              <circle
                cx={hourToX(h)}
                cy={laneY(t)}
                r={3.5}
                fill={MED_COLOR[t]}
              />
            </g>
          );
        })}

        {/* Mood markers above plot */}
        {moods.map((m) => {
          const h = hmToHours(m.time);
          if (h == null || h < X_MIN || h > X_MAX) return null;
          const x = hourToX(h);
          return (
            <g key={m.id}>
              <line
                x1={x}
                x2={x}
                y1={PAD_T - 4}
                y2={baselineY}
                stroke="color-mix(in oklab, var(--foreground) 25%, transparent)"
                strokeWidth={1}
                strokeDasharray="1.5 2.5"
              />
              <text
                x={x}
                y={PAD_T - 6}
                textAnchor="middle"
                fontSize={12}
              >
                {m.emoji}
              </text>
            </g>
          );
        })}

        {/* Activity markers (top-most lane) */}
        {activities.map((a) => {
          const h = hmToHours(a.time);
          if (h == null || h < X_MIN || h > X_MAX) return null;
          const x = hourToX(h);
          return (
            <g key={a.id}>
              <line
                x1={x}
                x2={x}
                y1={12}
                y2={baselineY}
                stroke="color-mix(in oklab, var(--primary) 35%, transparent)"
                strokeWidth={1}
                strokeDasharray="1 3"
              />
              <text
                x={x}
                y={11}
                textAnchor="middle"
                fontSize={11}
              >
                {a.emoji}
              </text>
            </g>
          );
        })}

        {hasData && (
          <>
            <path d={fillPath} fill="url(#curveFill)" clipPath="url(#clipPos)" />
            <path d={fillPath} fill="url(#reboundFill)" clipPath="url(#clipNeg)" />
            <path
              d={curvePath}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Handles */}
            {pts.map((p, i) => {
              const isEndpoint = i === 0 || i === pts.length - 1;
              const cx = hourToX(p.h);
              const cy = valToY(p.y);
              return (
                <g
                  key={i}
                  data-handle="1"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                    setDrag(i);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (isEndpoint) return;
                    commit(pts.filter((_, j) => j !== i));
                  }}
                  style={{ cursor: "grab" }}
                >
                  <circle
                    data-handle="1"
                    cx={cx}
                    cy={cy}
                    r={18}
                    fill="transparent"
                  />
                  <circle
                    data-handle="1"
                    cx={cx}
                    cy={cy}
                    r={drag === i ? 8 : 6}
                    fill={isEndpoint ? "var(--background)" : "var(--primary)"}
                    stroke="var(--primary)"
                    strokeWidth={2}
                  />
                </g>
              );
            })}
          </>
        )}
      </svg>

      {doses.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {(["retard", "instant", "antidepressant"] as MedType[])
            .filter((t) => doses.some((d) => (d.type ?? "retard") === t))
            .map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: MED_COLOR[t] }}
                />
                {MED_LABEL[t]}
              </span>
            ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {hasData
            ? `${hoursToHM(pts[0].h)} – ${hoursToHM(pts[pts.length - 1].h)}`
            : "Tippe in die Fläche, um die Kurve zu starten."}
        </span>
        {hasData && (
          <button
            type="button"
            onClick={() => commit([])}
            className="rounded-md px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            Zurücksetzen
          </button>
        )}
      </div>
      {hasData && (
        <p className="mt-0.5 text-center text-[10px] text-muted-foreground">
          Punkte ziehen · Fläche tippen für neuen Punkt · Doppelklick entfernt
        </p>
      )}
    </div>
  );
}