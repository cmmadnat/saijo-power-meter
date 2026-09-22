/**
 * The two real-time charts: screens 2 and 3 of the specification, as one use
 * case.
 *
 * Both charts are the same query — a window of readings for the meters someone
 * selected — plotted against different fields, which is why there is one
 * function here and not two. Active power is a rate and averages across a
 * bucket; energy is a cumulative counter and takes the bucket's last value,
 * because averaging a counter invents readings that never happened.
 *
 * Bucketing is the point of doing this in the application layer. The repository
 * hands back every reading in the window — 9 600 per meter over 24 hours at the
 * real publish rate — and a chart cannot use them: the browser would be asked
 * to draw ten points per pixel. The same bucketing is what the warehouse's
 * 1-minute rollup does at step 6, so this function keeps the two definitions in
 * one place rather than letting a SQL query and a chart quietly disagree.
 */
import type { ReadingRepository, TimeRange } from "./ports.ts";
import {
  machineLabel,
  meterNumber,
  type Department,
  type MeterId,
  type MeterRegistry,
  type Reading,
} from "@power-meter/domain";

/**
 * One bucket. Both values are null when no reading arrived in it, which is a
 * gap in the line rather than a zero — a meter that stopped reporting has not
 * started consuming nothing.
 */
export interface SeriesPoint {
  readonly at: Date;
  /** Mean active power across the bucket, kW. */
  readonly activePowerKw: number | null;
  /** The bucket's last energy counter reading, kWh. */
  readonly energyKwh: number | null;
  /**
   * Energy consumed from the start of the window up to this bucket, kWh.
   *
   * The counter itself is what the meter sends, but four meters' counters
   * plotted together are four flat parallel lines separated by whatever each
   * one happened to have totalled since it was installed — the shape carries
   * almost nothing. The rise across the window is the quantity someone is
   * actually looking for, and it is the same arithmetic the History screen's
   * Total Energy column does.
   */
  readonly energyConsumedKwh: number | null;
}

export interface MeterSeries {
  readonly meterId: MeterId;
  readonly meterNumber: string;
  readonly department: Department | null;
  readonly machineNumber: string | null;
  readonly machineName: string | null;
  readonly points: readonly SeriesPoint[];
}

export interface SeriesView {
  readonly from: Date;
  readonly to: Date;
  readonly bucketMs: number;
  /** In the order the meters were asked for, so colour assignment is stable. */
  readonly series: readonly MeterSeries[];
}

export interface MeterSeriesInput {
  readonly registry: MeterRegistry;
  readonly repository: ReadingRepository;
  readonly meterIds: readonly MeterId[];
  readonly range: TimeRange;
  /**
   * Roughly how many buckets to produce. The real limit is pixels: a 1600px
   * chart cannot show more than a few hundred meaningful points, and asking for
   * more costs transfer and render time to draw the same line.
   */
  readonly maxPoints?: number;
}

const DEFAULT_MAX_POINTS = 360;

/** The rollup resolution the warehouse will use, and the floor for a bucket. */
export const MIN_BUCKET_MS = 60_000;

/**
 * Bucket width for a window: at least a minute, a whole number of minutes, and
 * never so fine that the window needs more than `maxPoints` of them.
 */
export function bucketWidthMs(spanMs: number, maxPoints = DEFAULT_MAX_POINTS): number {
  if (spanMs <= 0) throw new RangeError("span must be positive");
  if (maxPoints <= 0) throw new RangeError("maxPoints must be positive");
  const needed = Math.ceil(spanMs / maxPoints);
  return Math.max(MIN_BUCKET_MS, Math.ceil(needed / MIN_BUCKET_MS) * MIN_BUCKET_MS);
}

/**
 * Counter readings to energy consumed since the first of them.
 *
 * A counter that falls has been reset — a meter replaced, or its register
 * rolled over — and the drop is not negative consumption. The reading after a
 * reset is treated as consumption since the reset, which is the most that can
 * be said without knowing what the old meter reached before it went: whatever
 * it used between its last report and its removal is unrecoverable, and
 * counting the step down as a negative would be visibly wrong rather than
 * merely incomplete.
 *
 * Exported because step 5's Total Energy is the last value this produces, and
 * that must not become a second implementation of the same rule.
 */
export function consumptionFrom(
  counters: readonly (number | null)[],
): (number | null)[] {
  let previous: number | null = null;
  let consumed = 0;

  return counters.map((counter) => {
    if (counter === null) return previous === null ? null : consumed;
    if (previous === null) {
      previous = counter;
      return 0;
    }
    consumed += counter >= previous ? counter - previous : counter;
    previous = counter;
    return consumed;
  });
}

/**
 * One bucket's running totals, and the three rules that define a bucket.
 *
 * These exist as primitives rather than as inline arithmetic because two things
 * bucket readings: the charts above, over a window chosen by whoever is looking
 * at them, and the warehouse's 1-minute rollup below, over absolute minutes.
 * "Mean power, last counter, count the readings" has to mean the same thing in
 * both or a chart and the table under it will disagree about the same machine.
 *
 * `lastAtMs` is what makes the last-counter rule independent of arrival order.
 * The repository contract is ascending per meter, so a plain last-wins would be
 * correct here — but the ingester batches a minute of messages from nine
 * stations and has no such guarantee, and a rollup that silently depended on it
 * would be wrong only occasionally, which is the worst way to be wrong.
 */
interface Bucket {
  count: number;
  powerSumKw: number;
  lastEnergyKwh: number | null;
  lastAtMs: number;
}

function emptyBucket(): Bucket {
  return {
    count: 0,
    powerSumKw: 0,
    lastEnergyKwh: null,
    lastAtMs: Number.NEGATIVE_INFINITY,
  };
}

function addToBucket(bucket: Bucket, reading: Reading): void {
  const atMs = reading.at.getTime();
  bucket.count += 1;
  // Active power is a rate: it averages across the bucket.
  bucket.powerSumKw += reading.activePowerKw;
  // Energy is a counter: averaging it would invent a reading that never
  // happened, so the bucket carries the latest one it saw.
  if (atMs >= bucket.lastAtMs) {
    bucket.lastAtMs = atMs;
    bucket.lastEnergyKwh = reading.energyKwh;
  }
}

/** Null rather than zero for an empty bucket: a gap in the line, not no load. */
function meanActivePowerKw(bucket: Bucket): number | null {
  return bucket.count === 0 ? null : bucket.powerSumKw / bucket.count;
}

/** One row of the warehouse's 1-minute rollup table. */
export interface RollupBucket {
  readonly meterId: MeterId;
  /** Start of the bucket, aligned to absolute time. */
  readonly at: Date;
  /** How many raw readings the bucket held. Never zero — empty buckets are not rows. */
  readonly readingCount: number;
  /** Mean active power across the bucket, kW. */
  readonly activePowerKw: number;
  /** The bucket's last energy counter reading, kWh. */
  readonly energyKwh: number;
}

/**
 * Readings to rollup rows, by the same three rules the charts bucket by.
 *
 * **Buckets are aligned to absolute time, not to a window's start.** The charts
 * align to whatever `from` they were asked for, which is right for a plot and
 * wrong for a stored table: the rollup is written once, by an ingester that has
 * no window, and read later by queries whose windows all differ. Flooring to
 * the epoch is what makes two writers of the same minute agree, and what makes
 * a row's identity `(meter, minute)` rather than `(meter, whenever this batch
 * started)`.
 *
 * Empty buckets produce no row. A minute in which a meter said nothing is a
 * minute with no evidence, and storing a zero for it would turn "we did not
 * hear from this machine" into "this machine drew no power" — the same
 * distinction the charts draw as a gap.
 *
 * Input order does not matter, so an ingester may hand over a batch as it
 * arrived across nine stations.
 */
export function rollupReadings(
  readings: Iterable<Reading>,
  bucketMs: number = MIN_BUCKET_MS,
): RollupBucket[] {
  if (!Number.isFinite(bucketMs) || bucketMs <= 0) {
    throw new RangeError("bucket width must be positive");
  }

  const buckets = new Map<string, { meterId: MeterId; atMs: number; bucket: Bucket }>();

  for (const reading of readings) {
    const atMs = Math.floor(reading.at.getTime() / bucketMs) * bucketMs;
    const key = `${reading.meterId}\u0000${atMs}`;
    let entry = buckets.get(key);
    if (entry === undefined) {
      entry = { meterId: reading.meterId, atMs, bucket: emptyBucket() };
      buckets.set(key, entry);
    }
    addToBucket(entry.bucket, reading);
  }

  return [...buckets.values()]
    .sort((a, b) =>
      a.meterId === b.meterId
        ? a.atMs - b.atMs
        : a.meterId < b.meterId
          ? -1
          : 1,
    )
    .map(({ meterId, atMs, bucket }) => ({
      meterId,
      at: new Date(atMs),
      readingCount: bucket.count,
      // Non-null by construction: a bucket only exists because a reading made it.
      activePowerKw: meanActivePowerKw(bucket) ?? 0,
      energyKwh: bucket.lastEnergyKwh ?? 0,
    }));
}

export async function meterSeries(
  input: MeterSeriesInput,
): Promise<SeriesView> {
  const { from, to } = input.range;
  const spanMs = to.getTime() - from.getTime();
  if (spanMs <= 0) throw new RangeError("series range must have from < to");

  const bucketMs = bucketWidthMs(spanMs, input.maxPoints ?? DEFAULT_MAX_POINTS);
  const bucketCount = Math.ceil(spanMs / bucketMs);

  // One accumulator per meter per bucket. Built up front so a meter with no
  // readings at all still yields a full-length series of gaps, and so the
  // series come back in the order they were asked for.
  const accumulators = new Map<MeterId, Bucket[]>();
  for (const meterId of input.meterIds) {
    accumulators.set(
      meterId,
      Array.from({ length: bucketCount }, () => emptyBucket()),
    );
  }

  for await (const reading of input.repository.readingsInRange(
    input.meterIds,
    input.range,
  )) {
    const buckets = accumulators.get(reading.meterId);
    if (buckets === undefined) continue;
    const index = Math.floor((reading.at.getTime() - from.getTime()) / bucketMs);
    // The repository's contract is half-open [from, to), but a repository that
    // returns one reading outside it should not write past the end of an array.
    if (index < 0 || index >= bucketCount) continue;
    const bucket = buckets[index];
    if (bucket === undefined) continue;
    addToBucket(bucket, reading);
  }

  const series = input.meterIds.map((meterId): MeterSeries => {
    const meter = input.registry.find(meterId);
    const buckets = accumulators.get(meterId) ?? [];
    const label = meter ? machineLabel(meter) : { number: null, name: null };

    const consumed = consumptionFrom(
      buckets.map((bucket) => bucket.lastEnergyKwh),
    );

    return {
      meterId,
      meterNumber: meter ? meterNumber(meter) : meterId,
      department: meter?.department ?? null,
      machineNumber: label.number,
      machineName: label.name,
      points: buckets.map((bucket, index) => ({
        at: new Date(from.getTime() + index * bucketMs),
        activePowerKw: meanActivePowerKw(bucket),
        energyKwh: bucket.lastEnergyKwh,
        energyConsumedKwh: consumed[index] ?? null,
      })),
    };
  });

  return { from, to, bucketMs, series };
}
