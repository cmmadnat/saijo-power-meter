/**
 * Replaying the step-2 fixtures into the warehouse.
 *
 * The point is not to have data to look at — the screens already have that in
 * process. It is that the fixtures are the one dataset whose correct answers
 * are already known: the step-5 tests compute History's two quantities from
 * them by hand. Loading them into BigQuery and reading them back through the
 * repository turns "the adapter is faithful" from a claim into a comparison,
 * and `verifyAgainstFixtures` below is that comparison.
 *
 * Raw, rollup and latest are written from the same generated set, and the
 * rollup is produced by `rollupReadings` — the application-layer function the
 * charts bucket with — rather than by a SQL `GROUP BY` that would be a second
 * definition of a minute.
 */
import {
  historyTable,
  rollupReadings,
  type HistoryRow,
  type TimeRange,
} from "@power-meter/application";
import { MeterRegistry, type MeterId, type Reading } from "@power-meter/domain";
import type { WarehouseClient } from "./client.ts";
import {
  generateFixtures,
  type FixtureOptions,
} from "../fixtures/generate.ts";
import { FixtureReadingRepository } from "../fixtures/repository.ts";
import { WarehouseReadingRepository } from "./repository.ts";
import {
  bucketToRow,
  latestToRow,
  readingToRow,
  TABLES,
  type WarehouseTarget,
} from "./schema.ts";

export interface LoadReport {
  readonly readings: number;
  readonly rollupRows: number;
  readonly latestRows: number;
  readonly from: Date;
  readonly to: Date;
}

export interface LoadFixturesOptions extends FixtureOptions {
  /** Stamped into `ingested_at`. Defaults to now. */
  readonly ingestedAt?: Date;
  readonly onProgress?: (message: string) => void;
}

export async function loadFixtures(
  client: WarehouseClient,
  target: WarehouseTarget,
  options: LoadFixturesOptions,
): Promise<LoadReport> {
  const report = options.onProgress ?? (() => {});
  const ingestedAt = options.ingestedAt ?? new Date();
  const fixtures = generateFixtures(options);

  report(`generated ${fixtures.readings.length} readings`);

  const readings = await client.load(
    TABLES.readings,
    iterate(fixtures.readings.map((reading) => readingToRow(reading, ingestedAt))),
  );
  report(`loaded ${readings} rows into ${TABLES.readings}`);

  const rollupRows = await client.load(
    TABLES.rollup,
    iterate(rollupReadings(fixtures.readings).map(bucketToRow)),
  );
  report(`loaded ${rollupRows} rows into ${TABLES.rollup}`);

  const latestRows = await client.replace(
    TABLES.latest,
    iterate(
      latestPerMeter(fixtures.readings).map((reading) =>
        latestToRow(reading, ingestedAt),
      ),
    ),
  );
  report(`replaced ${TABLES.latest} with ${latestRows} rows`);

  return {
    readings,
    rollupRows,
    latestRows,
    from: fixtures.from,
    to: fixtures.to,
  };
}

function latestPerMeter(readings: readonly Reading[]): Reading[] {
  const latest = new Map<MeterId, Reading>();
  for (const reading of readings) {
    const current = latest.get(reading.meterId);
    if (current === undefined || reading.at.getTime() > current.at.getTime()) {
      latest.set(reading.meterId, reading);
    }
  }
  return [...latest.values()];
}

async function* iterate<T>(items: Iterable<T>): AsyncIterable<T> {
  for (const item of items) yield item;
}

export interface VerificationRow {
  readonly meterId: MeterId;
  readonly field: string;
  readonly expected: number | null;
  readonly actual: number | null;
}

export interface Verification {
  readonly rows: number;
  readonly mismatches: readonly VerificationRow[];
}

/**
 * The equivalence the plan asks for, phrased the way the architecture makes it
 * answerable.
 *
 * The plan's wording was "the two history queries return the same numbers the
 * step-5 pure functions do". There are no history queries: the aggregation
 * never moved into SQL, so there is nothing for it to disagree with. What is
 * worth checking is the layer that *did* arrive — the adapter — so this runs
 * `historyTable` twice over the same window, once against the fixtures in
 * memory and once against what the warehouse gave back, and compares every row.
 *
 * A mismatch means the round trip through BigQuery lost or reordered
 * something: a timestamp that came back at second resolution, a float that went
 * through a string, a meter whose readings arrived out of order and quietly
 * turned a counter rise into a reset.
 */
export async function verifyAgainstFixtures(
  client: WarehouseClient,
  target: WarehouseTarget,
  options: LoadFixturesOptions & { readonly range?: TimeRange },
): Promise<Verification> {
  const fixtures = generateFixtures(options);
  const registry = options.registry ?? MeterRegistry.fromWorkbook();
  const range = options.range ?? { from: fixtures.from, to: fixtures.to };

  const [expected, actual] = await Promise.all([
    historyTable({
      registry,
      repository: new FixtureReadingRepository(fixtures.readings),
      range,
    }),
    historyTable({
      registry,
      repository: new WarehouseReadingRepository(client, target),
      range,
    }),
  ]);

  const byMeter = new Map(actual.rows.map((row) => [row.meterId, row]));
  const mismatches: VerificationRow[] = [];

  for (const row of expected.rows) {
    const other = byMeter.get(row.meterId);
    for (const field of ["totalEnergyKwh", "runningMs", "readingCount"] as const) {
      const left = row[field] as number | null;
      const right = (other?.[field] ?? null) as number | null;
      if (!near(left, right, field)) {
        mismatches.push({
          meterId: row.meterId,
          field,
          expected: left,
          actual: right,
        });
      }
    }
  }

  return { rows: expected.rows.length, mismatches };
}

/**
 * Energy is a float that has been through JSON on the way out and back, so an
 * exact comparison would fail on the last bit rather than on anything real.
 * Counts and milliseconds are integers and are compared exactly.
 */
function near(
  left: number | null,
  right: number | null,
  field: keyof HistoryRow,
): boolean {
  if (left === null || right === null) return left === right;
  if (field === "totalEnergyKwh") return Math.abs(left - right) < 1e-6;
  return left === right;
}
