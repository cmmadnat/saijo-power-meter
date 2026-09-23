/**
 * Ports: what the application needs from the outside world, stated as
 * interfaces it owns.
 *
 * The dependency rule runs inward. These interfaces live here, in the
 * application layer, and the infrastructure layer implements them — a BigQuery
 * repository, an in-memory latest-reading store, a fixture repository for the
 * screens built before any store exists. Nothing here knows those exist.
 *
 * That is what makes the plan's promise ("the aggregation written against
 * fixtures at step 5 moves server-side unchanged at step 8") true by
 * construction rather than by discipline: the use cases are written against
 * these ports, and swapping the fixture adapter for the BigQuery one changes
 * which object is passed in, not a line of the logic.
 *
 * Only the ports the plan already commits to are defined. The rest arrive with
 * the use cases that need them.
 */
import type { MeterId, Reading } from "@power-meter/domain";
import type { RollupBucket } from "./series.ts";

/** A half-open instant range, `[from, to)`. Callers convert from Asia/Bangkok. */
export interface TimeRange {
  readonly from: Date;
  readonly to: Date;
}

/**
 * Historical readings. Backed by fixtures at step 5 and by the warehouse from
 * step 6, which is why it is expressed as a stream: the History screen's window
 * can cover two weeks across 55 meters, which is not something to hold in
 * memory to sum it.
 */
export interface ReadingRepository {
  /**
   * Readings for the given meters within the range, ordered by meter and then
   * ascending in time. Ordering is part of the contract: the aggregations read
   * each meter's series in order and a repository that shuffles them would
   * produce wrong totals rather than an error.
   */
  readingsInRange(
    meterIds: readonly MeterId[],
    range: TimeRange,
  ): AsyncIterable<Reading>;
}

/**
 * The 1-minute rollup, for the charts and the fleet strip.
 *
 * A second read port rather than a second method on `ReadingRepository`,
 * because it is a different table with a different contract: the rows are
 * `rollupReadings` buckets, one per meter per *absolute* minute in which that
 * meter said anything. It exists to make wide windows cheap — a 24-hour chart
 * is 1 440 rows per meter here against ~9 600 raw — and handing its rows to
 * `meterSeries` is a change of table, not of arithmetic: the use case folds a
 * stored minute into its own bucket by the same three rules it folds a reading
 * by. History does not read it, because running hours are read off the gaps
 * between actual readings and a minute-resolution source would round them.
 */
export interface RollupRepository {
  /**
   * Rollup rows for the given meters whose minute starts within the range,
   * ordered by meter and then ascending in time — the same contract as
   * `readingsInRange`, for the same reason.
   */
  bucketsInRange(
    meterIds: readonly MeterId[],
    range: TimeRange,
  ): AsyncIterable<RollupBucket>;
}

/**
 * The newest reading per meter, for the real-time screen.
 *
 * Separate from ReadingRepository because it is a different cost shape, not
 * merely a different query: writing every reading to a durable latest-value row
 * would cost more per month than storing all the history. The ingester holds
 * these in memory and serves them, and the durable copy exists only so that a
 * restart does not begin blind.
 */
export interface LatestReadingStore {
  /** The newest reading for each known meter. Meters never seen are absent. */
  latest(): Promise<ReadonlyMap<MeterId, Reading>>;
}

/** Injected rather than read from the ambient clock, so time-bounded logic is testable. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/**
 * Where decoded readings go.
 *
 * The ingester is the only caller and the warehouse is the only implementation,
 * but it is a port for the same reason the others are: the write path is then
 * testable without BigQuery, and the row mapping stays in the adapter where the
 * column names live.
 *
 * `append` takes raw readings and their rollup buckets **together**, because
 * they are one batch: two tables written from the same buffer in the same
 * flush, so a reader never sees a minute in one and not the other. The buckets
 * come from `rollupReadings` in this layer — never from a SQL `GROUP BY`, which
 * would be a second definition of "a minute".
 */
export interface ReadingWriter {
  /** Append a flush's worth of raw readings and the rollup rows for it. */
  append(batch: ReadingBatch): Promise<void>;

  /**
   * Replace the durable latest-reading table with exactly these readings.
   *
   * Wholesale, not upserted: 55 rows are cheaper to rewrite than to merge, and
   * the table is only ever read by an ingester rehydrating after a restart.
   */
  replaceLatest(readings: readonly Reading[]): Promise<void>;
}

export interface ReadingBatch {
  readonly readings: readonly Reading[];
  readonly rollup: readonly RollupBucket[];
  /** When the flush happened. Stored as `ingested_at` beside the reading's own time. */
  readonly ingestedAt: Date;
}
