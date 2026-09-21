/**
 * The fixture adapters: the ports, backed by generated readings.
 *
 * This is what makes the plan's order work. Screens 1-4 get built and reviewed
 * against these, and at the store step a BigQuery adapter implements the same
 * two interfaces - what changes is which object gets passed in, not a line of
 * the aggregation logic above it.
 *
 * They hold the whole fixture set in memory, which is fine for a day or two of
 * synthetic data and is exactly what the real adapter must not do. The port is
 * an AsyncIterable for that reason; honouring it here keeps the callers written
 * the way the warehouse will need them.
 */
import type {
  LatestReadingStore,
  ReadingRepository,
  TimeRange,
} from "@power-meter/application";
import type { MeterId, Reading } from "@power-meter/domain";

function byMeterThenTime(a: Reading, b: Reading): number {
  if (a.meterId !== b.meterId) return a.meterId < b.meterId ? -1 : 1;
  return a.at.getTime() - b.at.getTime();
}

export class FixtureReadingRepository implements ReadingRepository {
  readonly #byMeter: ReadonlyMap<MeterId, readonly Reading[]>;

  constructor(readings: readonly Reading[]) {
    const byMeter = new Map<MeterId, Reading[]>();
    for (const reading of [...readings].sort(byMeterThenTime)) {
      const existing = byMeter.get(reading.meterId);
      if (existing) existing.push(reading);
      else byMeter.set(reading.meterId, [reading]);
    }
    this.#byMeter = byMeter;
  }

  async *readingsInRange(
    meterIds: readonly MeterId[],
    range: TimeRange,
  ): AsyncIterable<Reading> {
    const from = range.from.getTime();
    const to = range.to.getTime();
    // Half-open [from, to), and meter-major ordering, because that is the
    // contract the aggregations rely on to read each series in order.
    for (const meterId of [...meterIds].sort()) {
      for (const reading of this.#byMeter.get(meterId) ?? []) {
        const at = reading.at.getTime();
        if (at >= from && at < to) yield reading;
      }
    }
  }
}

/**
 * The newest reading per meter.
 *
 * In production this is the ingester's in-memory hot state; here it is the tail
 * of the fixture set. A meter that went offline keeps its last reading, which is
 * what lets the realtime screen show it as stale rather than as missing - the
 * staleness is the reading's age, and belongs to the screen, not the store.
 */
export class FixtureLatestReadingStore implements LatestReadingStore {
  readonly #latest: ReadonlyMap<MeterId, Reading>;

  constructor(readings: readonly Reading[]) {
    const latest = new Map<MeterId, Reading>();
    for (const reading of readings) {
      const current = latest.get(reading.meterId);
      if (current === undefined || reading.at.getTime() > current.at.getTime()) {
        latest.set(reading.meterId, reading);
      }
    }
    this.#latest = latest;
  }

  async latest(): Promise<ReadonlyMap<MeterId, Reading>> {
    return this.#latest;
  }
}
