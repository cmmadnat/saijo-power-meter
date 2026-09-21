"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { TIME_ZONE } from "@/lib/format";

/**
 * Screens 2 and 3: one chart component, configured twice — active power over
 * time and the energy counter over time. The specification draws them
 * identically apart from the y-axis label, and the data behind them is one
 * query, so one component is the honest shape.
 *
 * Drawn as plain SVG rather than pulled from a charting library: the whole
 * requirement is a multi-series line with a crosshair, and a library would add
 * a dependency and its own opinions about theming for marks this simple.
 *
 * Colour identity comes from the eight validated series slots in globals.css,
 * and each series keeps its slot when others are removed. Because Doom 64's
 * light mode is a mid-grey surface, several of those hues sit under a 3:1
 * contrast ratio against it — so the values never depend on colour alone: every
 * chart carries a legend, direct labels at the line ends, a crosshair readout,
 * and a table view of the same numbers.
 */

export interface ChartSeries {
  readonly meterId: string;
  /** 1–8. The series' colour slot, held across selection changes. */
  readonly slot: number;
  readonly meterNumber: string;
  readonly machineNumber: string | null;
  readonly machineName: string | null;
  /** One value per bucket, aligned to `times`. Null is a gap, not a zero. */
  readonly values: readonly (number | null)[];
}

const PLOT_HEIGHT = 260;
const MARGIN = { top: 30, right: 84, bottom: 28, left: 60 };
const MIN_WIDTH = 320;
/** Below this vertical separation two end labels would read as one block. */
const LABEL_CLEARANCE = 14;

const TIME_LABEL = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

const DATE_TIME_LABEL = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

function color(slot: number): string {
  return `var(--series-${slot})`;
}

function format(value: number | null, decimals: number): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Axis bounds on round numbers, so the ticks read 0 / 20 / 40 rather than 0 / 17.3 / 34.6. */
function niceScale(
  min: number,
  max: number,
  zeroBased: boolean,
): { lo: number; hi: number; ticks: number[] } {
  const low = zeroBased ? 0 : min;
  // A flat series would otherwise divide by zero; give it a band to sit in.
  const span = max - low || Math.abs(max) || 1;
  // Finer steps when the axis does not start at zero, so a counter sitting at
  // 1,941 gets an axis that starts near it rather than one rounded down to 0 —
  // which would flatten every line against the top of the plot.
  const divisions = zeroBased ? 4 : 6;
  const step = Math.pow(10, Math.floor(Math.log10(span / divisions)));
  const scaled = span / divisions / step;
  const unit = step * (scaled > 5 ? 10 : scaled > 2 ? 5 : scaled > 1 ? 2 : 1);

  const lo = Math.floor(low / unit) * unit;
  const hi = Math.ceil(max / unit) * unit;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + unit / 2; t += unit) ticks.push(Number(t.toFixed(6)));
  return { lo, hi: ticks[ticks.length - 1] ?? hi, ticks };
}

export function MeterChart({
  title,
  unit,
  decimals,
  zeroBased,
  times,
  series,
  bucketMs,
  pending,
}: {
  title: string;
  /** Axis and readout unit, as the specification writes it. */
  unit: string;
  decimals: number;
  /** Power starts at zero; a cumulative counter does not, and would be a flat line if it did. */
  zeroBased: boolean;
  /** Bucket start instants, in epoch milliseconds. */
  times: readonly number[];
  series: readonly ChartSeries[];
  bucketMs: number;
  /** True while a new selection or window is loading, so the frame holds. */
  pending: boolean;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    const node = frame.current;
    if (node === null) return;
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width;
      if (measured) setWidth(Math.max(MIN_WIDTH, Math.round(measured)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const plotWidth = Math.max(80, width - MARGIN.left - MARGIN.right);
  const height = PLOT_HEIGHT + MARGIN.top + MARGIN.bottom;

  const scale = useMemo(() => {
    const values = series
      .flatMap((s) => s.values)
      .filter((v): v is number => v !== null);
    if (values.length === 0) return null;
    return niceScale(Math.min(...values), Math.max(...values), zeroBased);
  }, [series, zeroBased]);

  const x = (index: number): number =>
    MARGIN.left +
    (times.length <= 1 ? plotWidth / 2 : (index / (times.length - 1)) * plotWidth);

  const y = (value: number): number => {
    if (scale === null) return MARGIN.top + PLOT_HEIGHT;
    const span = scale.hi - scale.lo || 1;
    return MARGIN.top + PLOT_HEIGHT - ((value - scale.lo) / span) * PLOT_HEIGHT;
  };

  /** Split each series on its gaps, so a silent meter leaves a break rather than a straight line across it. */
  const paths = useMemo(() => {
    return series.map((s) => {
      const segments: string[] = [];
      let current: string[] = [];
      s.values.forEach((value, index) => {
        if (value === null) {
          if (current.length > 1) segments.push(current.join(" "));
          current = [];
          return;
        }
        current.push(`${current.length === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`);
      });
      if (current.length > 1) segments.push(current.join(" "));
      // A series reduced to single isolated readings has no line to draw; its
      // values still reach the reader through the crosshair and the table.
      return { meterId: s.meterId, d: segments.join(" ") };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- x and y are derived from these
  }, [series, times, scale, plotWidth]);

  /** The last real value of each series, for the direct labels at the right edge. */
  const ends = useMemo(() => {
    return series
      .map((s) => {
        for (let i = s.values.length - 1; i >= 0; i -= 1) {
          const value = s.values[i];
          if (value !== null && value !== undefined) {
            return { meterId: s.meterId, slot: s.slot, index: i, value };
          }
        }
        return null;
      })
      .filter((end): end is NonNullable<typeof end> => end !== null);
  }, [series]);

  /**
   * Direct labels are a supplement, and they stop working when they collide:
   * four converging lines with four labels stacked at the right edge read as a
   * block of numbers belonging to nothing. So label a line only where it ends
   * clear of its neighbours, and let the legend and the crosshair carry the
   * rest.
   */
  const labelled = useMemo(() => {
    if (series.length > 4) return new Set<string>();
    const sorted = [...ends].sort((a, b) => y(a.value) - y(b.value));
    const keep = new Set<string>();
    sorted.forEach((end, index) => {
      const previous = sorted[index - 1];
      const next = sorted[index + 1];
      const clear =
        (previous === undefined || Math.abs(y(end.value) - y(previous.value)) >= LABEL_CLEARANCE) &&
        (next === undefined || Math.abs(y(next.value) - y(end.value)) >= LABEL_CLEARANCE);
      if (clear) keep.add(end.meterId);
    });
    return keep;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- y is derived from scale
  }, [ends, series.length, scale]);

  const indexFromClientX = (clientX: number): number | null => {
    const node = frame.current;
    if (node === null || times.length === 0) return null;
    const box = node.getBoundingClientRect();
    const ratio = (clientX - box.left - MARGIN.left) / plotWidth;
    if (ratio < -0.02 || ratio > 1.02) return null;
    return Math.min(
      times.length - 1,
      Math.max(0, Math.round(ratio * (times.length - 1))),
    );
  };

  const hoverTime = hover === null ? null : times[hover];
  const tooltipLeft = hover === null ? 0 : x(hover);
  const tooltipOnLeft = tooltipLeft > MARGIN.left + plotWidth * 0.6;

  const empty = series.length === 0 || scale === null;

  return (
    <section className="flex flex-col gap-3 border border-border bg-card p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {title}
        </h2>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            {Math.round(bucketMs / 60_000)} min buckets
          </span>
          <button
            type="button"
            onClick={() => setShowTable((on) => !on)}
            aria-pressed={showTable}
            className={[
              "border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors",
              showTable
                ? "border-primary text-foreground"
                : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
            ].join(" ")}
          >
            table
          </button>
        </div>
      </header>

      <div
        ref={frame}
        className="relative w-full"
        style={{ opacity: pending ? 0.6 : 1, transition: "opacity 120ms linear" }}
      >
        {empty ? (
          <p
            className="flex items-center justify-center border border-dashed border-border text-sm text-muted-foreground"
            style={{ height }}
          >
            Select a meter to plot.
          </p>
        ) : (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`${title} for ${series.length} meters`}
            tabIndex={0}
            className="touch-none outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onPointerMove={(event) => setHover(indexFromClientX(event.clientX))}
            onPointerLeave={() => setHover(null)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const step = event.key === "ArrowRight" ? 1 : -1;
                setHover((current) => {
                  const next = (current ?? times.length - 1) + step;
                  return Math.min(times.length - 1, Math.max(0, next));
                });
              } else if (event.key === "Escape") {
                setHover(null);
              }
            }}
          >
            {/* Gridlines: hairline, solid, one step off the surface — present but recessive. */}
            {scale.ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + plotWidth}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke="var(--border)"
                  strokeWidth={1}
                  opacity={0.5}
                />
                <text
                  x={MARGIN.left - 8}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-muted-foreground font-mono tabular-nums"
                  fontSize={11}
                >
                  {format(tick, tick % 1 === 0 ? 0 : decimals)}
                </text>
              </g>
            ))}

            {/* The unit sits at the axis head, left-aligned under the top of the
                plot, so it never lands on the highest tick's label. */}
            <text
              x={4}
              y={11}
              textAnchor="start"
              className="fill-muted-foreground font-mono"
              fontSize={10}
            >
              {unit}
            </text>

            {/* Time axis: about six labels, whatever the window. */}
            {times.map((time, index) => {
              const every = Math.max(1, Math.round(times.length / 6));
              if (index % every !== 0 && index !== times.length - 1) return null;
              return (
                <text
                  key={time}
                  x={x(index)}
                  y={MARGIN.top + PLOT_HEIGHT + 16}
                  textAnchor={index === times.length - 1 ? "end" : "middle"}
                  className="fill-muted-foreground font-mono tabular-nums"
                  fontSize={11}
                >
                  {TIME_LABEL.format(time)}
                </text>
              );
            })}

            <line
              x1={MARGIN.left}
              x2={MARGIN.left + plotWidth}
              y1={MARGIN.top + PLOT_HEIGHT}
              y2={MARGIN.top + PLOT_HEIGHT}
              stroke="var(--border)"
              strokeWidth={1}
            />

            {hover !== null ? (
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={MARGIN.top}
                y2={MARGIN.top + PLOT_HEIGHT}
                stroke="var(--border)"
                strokeWidth={1}
              />
            ) : null}

            {paths.map((path, index) => (
              <path
                key={path.meterId}
                d={path.d}
                fill="none"
                stroke={color(series[index]?.slot ?? 1)}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}

            {/* End markers, each with a 2px ring in the surface colour so two
                lines ending close together stay legible. */}
            {ends.map((end) => (
              <circle
                key={end.meterId}
                cx={x(end.index)}
                cy={y(end.value)}
                r={4}
                fill={color(end.slot)}
                stroke="var(--card)"
                strokeWidth={2}
              />
            ))}

            {ends
              .filter((end) => labelled.has(end.meterId))
              .map((end) => (
                <text
                  key={end.meterId}
                  x={x(end.index) + 10}
                  y={y(end.value)}
                  dominantBaseline="middle"
                  className="fill-foreground font-mono tabular-nums"
                  fontSize={11}
                >
                  {format(end.value, decimals)}
                </text>
              ))}

            {hover !== null
              ? series.map((s) => {
                  const value = s.values[hover];
                  if (value === null || value === undefined) return null;
                  return (
                    <circle
                      key={s.meterId}
                      cx={x(hover)}
                      cy={y(value)}
                      r={4}
                      fill={color(s.slot)}
                      stroke="var(--card)"
                      strokeWidth={2}
                    />
                  );
                })
              : null}
          </svg>
        )}

        {hover !== null && hoverTime != null && !empty ? (
          <div
            className="pointer-events-none absolute z-20 min-w-[180px] border border-border bg-card p-2 shadow-md"
            style={{
              top: MARGIN.top,
              left: tooltipOnLeft ? undefined : tooltipLeft + 12,
              right: tooltipOnLeft ? width - tooltipLeft + 12 : undefined,
            }}
          >
            <p className="mb-1 font-mono text-[11px] tabular-nums text-muted-foreground">
              {DATE_TIME_LABEL.format(hoverTime)}
            </p>
            <ul className="flex flex-col gap-0.5">
              {series.map((s) => (
                <li
                  key={s.meterId}
                  className="flex items-center gap-2 text-xs whitespace-nowrap"
                >
                  <span
                    aria-hidden
                    className="inline-block h-0.5 w-3 shrink-0"
                    style={{ background: color(s.slot) }}
                  />
                  <span className="font-mono tabular-nums font-medium text-foreground">
                    {format(s.values[hover] ?? null, decimals)}
                  </span>
                  <span className="truncate text-muted-foreground">
                    {s.meterNumber} {s.machineName ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {series.length >= 2 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {series.map((s) => (
            <li key={s.meterId} className="flex items-center gap-2 text-xs">
              <span
                aria-hidden
                className="inline-block h-0.5 w-4 shrink-0"
                style={{ background: color(s.slot) }}
              />
              <span className="font-mono">{s.meterNumber}</span>
              <span className="text-muted-foreground">
                {s.machineName ?? "—"}
                {s.machineNumber === null ? "" : ` · ${s.machineNumber}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {showTable && !empty ? (
        <div className="max-h-80 overflow-auto border border-border">
          <table className="w-full border-collapse text-xs">
            <caption className="sr-only">{title}, as values</caption>
            <thead className="sticky top-0 bg-card">
              <tr>
                <th
                  scope="col"
                  className="border-b border-border px-2 py-1.5 text-left font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground"
                >
                  Time
                </th>
                {series.map((s) => (
                  <th
                    key={s.meterId}
                    scope="col"
                    className="border-b border-border px-2 py-1.5 text-right font-mono text-[11px] font-normal uppercase tracking-wider text-muted-foreground"
                  >
                    {s.meterNumber} ({unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {times.map((time, index) => (
                <tr key={time} className="border-b border-border/60 last:border-b-0">
                  <td className="px-2 py-1 font-mono tabular-nums whitespace-nowrap">
                    {DATE_TIME_LABEL.format(time)}
                  </td>
                  {series.map((s) => (
                    <td
                      key={s.meterId}
                      className="px-2 py-1 text-right font-mono tabular-nums"
                    >
                      {format(s.values[index] ?? null, decimals)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
