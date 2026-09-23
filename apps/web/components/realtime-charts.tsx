"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  MeterChart,
  formatValue,
  type ChartSeries,
} from "@/components/meter-chart";

/**
 * Screens 2 and 3 together with the controls that scope them: the meter
 * selector the specification draws beside the plot, and a window control it
 * does not draw but a live chart cannot do without.
 *
 * Selection and window live in the URL rather than in component state, so the
 * server builds exactly the series being looked at — 55 meters' worth of points
 * is not something to ship to the browser so it can draw four of them — and so
 * a particular view can be linked to. The frame holds at reduced opacity while
 * the new one loads instead of collapsing to a spinner.
 *
 * The two charts share one series key rather than carrying a legend each: they
 * plot the same meters, and a second copy of the same eight rows was noise. The
 * key doubles as the readable form of both charts — it prints each meter's
 * current power and its consumption across the window — and pointing at a row
 * dims every other line, which is what makes eight series separable.
 */

export interface SelectableMeter {
  readonly meterId: string;
  readonly meterNumber: string;
  readonly department: string | null;
  readonly machineName: string | null;
}

export interface ChartWindow {
  readonly id: string;
  readonly label: string;
}

export interface ChartSeriesData {
  readonly meterId: string;
  readonly slot: number;
  readonly meterNumber: string;
  readonly machineNumber: string | null;
  readonly machineName: string | null;
  readonly activePowerKw: readonly (number | null)[];
  /** Energy consumed since the start of the window, not the raw counter. */
  readonly energyConsumedKwh: readonly (number | null)[];
}

/** The last value a series actually reported, for the key's columns. */
function last(values: readonly (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

export function RealtimeCharts({
  meters,
  selection,
  windows,
  windowId,
  windowLabel,
  times,
  series,
  bucketMs,
  maxSeries,
  since,
  energyRecorded = true,
}: {
  /**
   * False in the Incoming view. The kW chart draws the hour the observer
   * holds; the kWh chart would need the counter's history, which nothing
   * stores, so it says "not recorded yet" rather than draw an hour of it.
   */
  energyRecorded?: boolean;
  meters: readonly SelectableMeter[];
  /** Fixed-length, with holes: a meter keeps its colour slot when others go. */
  selection: readonly (string | null)[];
  windows: readonly ChartWindow[];
  windowId: string;
  windowLabel: string;
  times: readonly number[];
  series: readonly ChartSeriesData[];
  bucketMs: number;
  maxSeries: number;
  /** Start of the window in Asia/Bangkok, formatted on the server. */
  since: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [focused, setFocused] = useState<string | null>(null);

  const navigate = (next: readonly (string | null)[], nextWindow: string) => {
    const slots = [...next];
    while (slots.length > 0 && slots[slots.length - 1] === null) slots.pop();
    const params = new URLSearchParams({
      meters: slots.map((id) => id ?? "").join(","),
      window: nextWindow,
    });
    startTransition(() => {
      router.push(`/?${params.toString()}`, { scroll: false });
    });
  };

  const toggle = (meterId: string) => {
    const next = [...selection];
    const index = next.indexOf(meterId);
    if (index !== -1) {
      // Emptying the slot rather than removing it is what keeps every other
      // series the colour it already had.
      next[index] = null;
    } else {
      const free = next.indexOf(null);
      if (free === -1) return;
      next[free] = meterId;
    }
    navigate(next, windowId);
  };

  const selectedCount = selection.filter((id) => id !== null).length;
  const full = selectedCount >= maxSeries;

  /** The 55 meters as the specification lists them: by department, in station order. */
  const groups = useMemo(() => {
    const byDepartment = new Map<string, SelectableMeter[]>();
    for (const meter of meters) {
      const key = meter.department ?? "—";
      const existing = byDepartment.get(key);
      if (existing) existing.push(meter);
      else byDepartment.set(key, [meter]);
    }
    return [...byDepartment.entries()];
  }, [meters]);

  const toChartSeries = (
    key: "activePowerKw" | "energyConsumedKwh",
  ): ChartSeries[] =>
    series.map((s) => ({
      meterId: s.meterId,
      slot: s.slot,
      meterNumber: s.meterNumber,
      machineNumber: s.machineNumber,
      machineName: s.machineName,
      values: s[key],
    }));

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
          Window
        </span>
        {windows.map((window) => {
          const active = window.id === windowId;
          return (
            <button
              key={window.id}
              type="button"
              onClick={() => navigate(selection, window.id)}
              aria-pressed={active}
              className={[
                "border px-2.5 py-1 text-xs transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:border-accent-strong hover:text-foreground",
              ].join(" ")}
            >
              {window.label}
            </button>
          );
        })}
        <span className="ms-auto font-mono text-2xs uppercase tracking-wider text-muted-foreground">
          {selectedCount} of {maxSeries} series · since {since}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="flex max-h-160 flex-col border border-border bg-card">
          <p className="border-b border-border px-3 py-2 font-mono text-2xs uppercase tracking-wider text-muted-foreground">
            Power meter
          </p>
          <div className="overflow-y-auto">
            {groups.map(([department, group]) => (
              <div key={department}>
                <p className="sticky top-0 border-b border-border bg-muted/80 px-3 py-1 font-mono text-3xs uppercase tracking-wider text-muted-foreground backdrop-blur">
                  {department}
                </p>
                <ul>
                  {group.map((meter) => {
                    const slotIndex = selection.indexOf(meter.meterId);
                    const selected = slotIndex !== -1;
                    return (
                      <li key={meter.meterId}>
                        <button
                          type="button"
                          onClick={() => toggle(meter.meterId)}
                          onPointerEnter={() =>
                            setFocused(selected ? meter.meterId : null)
                          }
                          onPointerLeave={() => setFocused(null)}
                          aria-pressed={selected}
                          disabled={!selected && full}
                          className={[
                            "flex w-full items-center gap-2 border-b border-border/50 px-3 py-1 text-start text-xs transition-colors",
                            selected
                              ? "bg-muted/60 text-foreground"
                              : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                            !selected && full ? "cursor-not-allowed opacity-50" : "",
                          ].join(" ")}
                        >
                          <span
                            aria-hidden
                            className="inline-block h-0.5 w-4 shrink-0"
                            style={{
                              background: selected
                                ? `var(--series-${slotIndex + 1})`
                                : "var(--border)",
                            }}
                          />
                          <span className="font-mono">{meter.meterNumber}</span>
                          <span className="truncate">
                            {meter.machineName ?? "—"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <p className="border-t border-border px-3 py-2 text-2xs text-muted-foreground">
            {full
              ? "Eight series is the limit — deselect one to add another."
              : `Select up to ${maxSeries}. Each keeps its colour.`}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-4 border border-border bg-card p-4">
          {series.length > 0 ? (
            <table className="w-full border-collapse text-xs">
              <caption className="sr-only">
                Series key: the meters plotted, with their current values
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="py-1 pe-2 text-left font-mono text-3xs font-normal uppercase tracking-wider text-muted-foreground"
                  >
                    Series
                  </th>
                  <th
                    scope="col"
                    className="px-2 py-1 text-right font-mono text-3xs font-normal uppercase tracking-wider text-muted-foreground"
                  >
                    Power now (kW)
                  </th>
                  {energyRecorded && (
                    <th
                      scope="col"
                      className="ps-2 py-1 text-right font-mono text-3xs font-normal uppercase tracking-wider text-muted-foreground"
                    >
                      Consumed ({windowLabel}, kWh)
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr
                    key={s.meterId}
                    onPointerEnter={() => setFocused(s.meterId)}
                    onPointerLeave={() => setFocused(null)}
                    className={[
                      "border-b border-border/50 last:border-b-0 transition-colors",
                      focused === s.meterId ? "bg-muted/50" : "",
                    ].join(" ")}
                  >
                    <td className="py-1 pe-2">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-block h-0.5 w-4 shrink-0"
                          style={{ background: `var(--series-${s.slot})` }}
                        />
                        <span className="font-mono">{s.meterNumber}</span>
                        <span className="truncate text-muted-foreground">
                          {s.machineName ?? "—"}
                          {s.machineNumber === null ? "" : ` · ${s.machineNumber}`}
                        </span>
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                      {formatValue(last(s.activePowerKw), 1)}
                    </td>
                    {energyRecorded && (
                      <td className="ps-2 py-1 text-right font-mono tabular-nums">
                        {formatValue(last(s.energyConsumedKwh), 1)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          <MeterChart
            title="Power (kW)"
            unit="kW"
            decimals={1}
            zeroBased
            times={times}
            series={toChartSeries("activePowerKw")}
            bucketMs={bucketMs}
            pending={pending}
            focused={focused}
          />

          {energyRecorded ? (
            <>
              <div className="border-t border-border pt-4">
                <MeterChart
                  title="Energy (kWh)"
                  subtitle={`consumed since ${since}`}
                  unit="kWh"
                  decimals={1}
                  zeroBased
                  times={times}
                  series={toChartSeries("energyConsumedKwh")}
                  bucketMs={bucketMs}
                  pending={pending}
                  focused={focused}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                The meter reports a cumulative counter, which plotted raw is a
                flat line whose height is whatever that meter has totalled since
                it was installed. This is its rise across the window — the same
                arithmetic as the History screen&rsquo;s Total Energy, including
                the rule that a counter reset counts as the new reading rather
                than as negative consumption.
              </p>
            </>
          ) : (
            <div className="border-t border-border pt-4">
              <p className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
                Energy (kWh)
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Not recorded yet. This view stores nothing, so there is no
                counter history to plot. The power chart above is the last hour
                the observer holds in memory.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
