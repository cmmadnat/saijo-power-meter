/**
 * The fleet strip's two windowed tiles: energy since the day began, and total
 * load across the last hour.
 *
 * Step 5b left both out because the latest reading per meter has no baseline
 * and no window. They are built here out of `meterSeries` and nothing else —
 * the counter-reset walk, the bucket rules and the gap-not-zero rule are all
 * the charts' own, so the strip cannot disagree with a chart of the same
 * meters about the same minutes. The only arithmetic of this file's own is a
 * sum across meters, which is what "fleet" means.
 */
import type { ReadingRepository, RollupRepository } from "./ports.ts";
import { MIN_BUCKET_MS, meterSeries } from "./series.ts";
import type { MeterRegistry } from "@power-meter/domain";

export interface FleetTrendInput {
  readonly registry: MeterRegistry;
  /** The rollup in live mode; either port folds into the same buckets. */
  readonly repository: ReadingRepository | RollupRepository;
  /** Where "today" starts — 00:00 Asia/Bangkok, converted by the caller. */
  readonly dayStart: Date;
  /** The end of both windows, exclusive. Minute-aligned when reading the rollup. */
  readonly to: Date;
  /** How far back the load line reaches. An hour unless told otherwise. */
  readonly sparkMs?: number;
}

/** One minute of the load line. */
export interface TrendPoint {
  readonly at: Date;
  /** Sum of the reporting meters' mean power in the minute. Null when none reported. */
  readonly activePowerKw: number | null;
  /** How many meters that sum is over. */
  readonly meters: number;
}

export interface FleetTrend {
  readonly dayStart: Date;
  readonly to: Date;
  /**
   * Energy consumed across the fleet since `dayStart`, kWh, counter resets
   * handled per meter. Null when no meter reported anything today.
   */
  readonly energyTodayKwh: number | null;
  /** Meters that contributed to that figure. */
  readonly energyMeters: number;
  /** The last hour, one point per minute. Trailing points are null until their minute is written. */
  readonly spark: readonly TrendPoint[];
  readonly sparkBucketMs: number;
}

const HOUR_MS = 60 * 60_000;

export async function fleetTrend(input: FleetTrendInput): Promise<FleetTrend> {
  const meterIds = input.registry.commissioned().map((meter) => meter.meterId);
  const sparkMs = input.sparkMs ?? HOUR_MS;
  const to = input.to;

  // Energy is read from one minute *before* the day starts. The walk measures
  // consumption from the first bucket's last counter, so starting at 00:00
  // would take the baseline from 00:00:59 and drop the first minute of the
  // day; the minute before gives the counter as the day opened. Buckets are
  // pinned to one minute for the same reason: a wider first bucket would drop
  // more.
  const energyFrom = new Date(input.dayStart.getTime() - MIN_BUCKET_MS);
  const energySpanMs = to.getTime() - energyFrom.getTime();
  const energy = await meterSeries({
    registry: input.registry,
    repository: input.repository,
    meterIds,
    range: { from: energyFrom, to },
    maxPoints: Math.ceil(energySpanMs / MIN_BUCKET_MS),
  });

  let energyTodayKwh: number | null = null;
  let energyMeters = 0;
  for (const series of energy.series) {
    // The walk carries its total forward through trailing gaps, so the last
    // point is the meter's consumption to date, or null if it never reported.
    const consumed = series.points[series.points.length - 1]?.energyConsumedKwh ?? null;
    if (consumed === null) continue;
    energyTodayKwh = (energyTodayKwh ?? 0) + consumed;
    energyMeters += 1;
  }

  const load = await meterSeries({
    registry: input.registry,
    repository: input.repository,
    meterIds,
    range: { from: new Date(to.getTime() - sparkMs), to },
    maxPoints: Math.ceil(sparkMs / MIN_BUCKET_MS),
  });

  const first = load.series[0]?.points ?? [];
  const spark = first.map((point, index): TrendPoint => {
    let sum = 0;
    let meters = 0;
    for (const series of load.series) {
      const kw = series.points[index]?.activePowerKw ?? null;
      if (kw === null) continue;
      sum += kw;
      meters += 1;
    }
    return { at: point.at, activePowerKw: meters === 0 ? null : sum, meters };
  });

  return {
    dayStart: input.dayStart,
    to,
    energyTodayKwh,
    energyMeters,
    spark,
    sparkBucketMs: load.bucketMs,
  };
}
