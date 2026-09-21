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
