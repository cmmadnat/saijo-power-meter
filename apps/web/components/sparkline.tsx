"use client";

/**
 * The fleet strip's load line: total active power across the last hour, one
 * point a minute.
 *
 * One series, so no legend — the tile's label names it. A minute nobody
 * reported in is a break in the line, not a drop to zero, for the same reason
 * the charts draw gaps: silence is not no load. Hovering reads a minute off;
 * the tile's own figures carry the numbers for anyone who does not.
 */
import { useState } from "react";

export interface SparklinePoint {
  /** Formatted on the server, in Asia/Bangkok. */
  readonly label: string;
  readonly kw: number | null;
  readonly meters: number;
}

const WIDTH = 240;
const HEIGHT = 40;
const PAD = 2;

export function Sparkline({ points }: { points: readonly SparklinePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = points.map((p) => p.kw).filter((v): v is number => v !== null);
  if (values.length === 0) {
    return (
      <p className="h-10 font-mono text-2xs text-muted-foreground">
        no minute written yet
      </p>
    );
  }

  // Zero-based: the question is how much load, and a line floating in a band
  // that starts at the minimum would make a 2% wobble look like a surge.
  const max = Math.max(...values) || 1;
  const x = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (WIDTH - 2 * PAD);
  const y = (kw: number) => HEIGHT - PAD - (kw / max) * (HEIGHT - 2 * PAD);

  // One path, lifted at every gap.
  let d = "";
  let pen = false;
  points.forEach((p, i) => {
    if (p.kw === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p.kw).toFixed(1)}`;
    pen = true;
  });

  const active = hover === null ? null : points[hover];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="block h-10 w-full overflow-visible"
        role="img"
        aria-label={`Total load over the last hour, peaking at ${max.toFixed(0)} kW`}
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const ratio = (event.clientX - box.left) / box.width;
          setHover(Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <line
          x1={0}
          x2={WIDTH}
          y1={HEIGHT - PAD}
          y2={HEIGHT - PAD}
          className="stroke-border"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={d}
          fill="none"
          className="stroke-series-1"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {hover !== null && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={0}
            y2={HEIGHT}
            className="stroke-muted-foreground"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {active !== null && active !== undefined && (
        <p className="pointer-events-none absolute -top-7 right-0 border border-border bg-card px-2 py-0.5 font-mono text-2xs whitespace-nowrap text-foreground shadow-sm">
          {active.label} ·{" "}
          {active.kw === null ? "no readings" : `${active.kw.toFixed(1)} kW · ${active.meters} meters`}
        </p>
      )}
    </div>
  );
}
