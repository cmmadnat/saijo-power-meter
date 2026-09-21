"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { MeterChart, type ChartSeries } from "@/components/meter-chart";

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

export function RealtimeCharts({
  meters,
  selection,
  windows,
  windowId,
  times,
  series,
  bucketMs,
  maxSeries,
}: {
  meters: readonly SelectableMeter[];
  /** Fixed-length, with holes: a meter keeps its colour slot when others go. */
  selection: readonly (string | null)[];
  windows: readonly ChartWindow[];
  windowId: string;
  times: readonly number[];
  /** Power and energy for the selected meters, already bucketed. */
  series: readonly {
    meterId: string;
    slot: number;
    meterNumber: string;
    machineNumber: string | null;
    machineName: string | null;
    activePowerKw: readonly (number | null)[];
    energyKwh: readonly (number | null)[];
  }[];
  bucketMs: number;
  maxSeries: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const slotOf = (meterId: string): number | null => {
    const index = selection.indexOf(meterId);
    return index === -1 ? null : index + 1;
  };

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

  const toChartSeries = (
    key: "activePowerKw" | "energyKwh",
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
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
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
                  : "border-border text-muted-foreground hover:border-primary hover:text-foreground",
              ].join(" ")}
            >
              {window.label}
            </button>
          );
        })}
        <span className="ms-auto font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
          {selectedCount} of {maxSeries} series
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="flex max-h-[560px] flex-col border border-border bg-card">
          <p className="border-b border-border px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Power meter
          </p>
          <ul className="overflow-y-auto">
            {meters.map((meter) => {
              const slot = slotOf(meter.meterId);
              const selected = slot !== null;
              return (
                <li key={meter.meterId}>
                  <button
                    type="button"
                    onClick={() => toggle(meter.meterId)}
                    aria-pressed={selected}
                    disabled={!selected && full}
                    className={[
                      "flex w-full items-center gap-2 border-b border-border/60 px-3 py-1.5 text-start text-xs transition-colors",
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
                          ? `var(--series-${slot})`
                          : "var(--border)",
                      }}
                    />
                    <span className="font-mono">{meter.meterNumber}</span>
                    <span className="truncate">{meter.machineName ?? "—"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            {full
              ? `Eight series is the limit — deselect one to add another.`
              : `Select up to ${maxSeries}. Each keeps its colour.`}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <MeterChart
            title="Power (kW)"
            unit="kW"
            decimals={1}
            zeroBased
            times={times}
            series={toChartSeries("activePowerKw")}
            bucketMs={bucketMs}
            pending={pending}
          />
          <MeterChart
            title="Energy (kWh)"
            unit="kWh"
            decimals={1}
            zeroBased={false}
            times={times}
            series={toChartSeries("energyKwh")}
            bucketMs={bucketMs}
            pending={pending}
          />
          <p className="text-xs text-muted-foreground">
            Energy is the meter&rsquo;s own cumulative counter, not consumption
            per interval — it climbs, and only steps down when a meter is
            replaced. Consumption across a period is the History screen&rsquo;s
            column.
          </p>
        </div>
      </div>
    </section>
  );
}
