/**
 * The write path, run against a real dataset for longer than the old one
 * survived.
 *
 * Step 8c's whole claim is that the ingester's steady state no longer spends a
 * per-table daily quota. That claim cannot be checked on a machine with no
 * credentials, and it cannot be checked by a test against a fake either: the
 * fake has no quota. So this drives the real `RowStream` against a scratch
 * dataset with the batch the ingester actually flushes — 55 meters, one raw row
 * each per sampling interval, plus the closed minute's rollup, both tables in
 * one call — and counts what BigQuery refused.
 *
 * Two deliberate departures from the ingester:
 *
 * - **It runs faster than real time.** The limit being disproved is per day, so
 *   2 000 appends to each table inside an hour is a stronger result than 2 000
 *   spread over thirteen — and it is a result that arrives the same afternoon.
 *   `--interval 45000` runs it at the real rate for anyone who wants that
 *   instead.
 * - **The rows are fixtures with the clock's timestamps.** Each cycle stamps
 *   `reading_at` with the moment it runs, so nothing collides with anything and
 *   the rows land in today's partition, which is where the ingester's would.
 *   Fidelity is `load` and `verify`'s job, not this one's: what is being
 *   measured here is whether the writes are accepted at all, forever.
 *
 * It writes nothing anywhere near `power_meter`; the CLI refuses that dataset
 * by name before it gets here.
 */
import { rollupReadings } from "@power-meter/application";
import { MeterRegistry, type Reading } from "@power-meter/domain";
import { generateFixtures } from "../fixtures/generate.ts";
import { bucketToStreamRow, readingToStreamRow, TABLES } from "./schema.ts";
import type { RowStream } from "./stream.ts";

export interface SoakOptions {
  readonly stream: RowStream;
  /** How many flush-shaped writes to make. 2 000 crosses the old 1 500 cap. */
  readonly cycles: number;
  readonly intervalMs: number;
  readonly log?: (message: string) => void;
  /** Injected in tests. Real runs sleep. */
  readonly wait?: (ms: number) => Promise<void>;
  readonly now?: () => Date;
}

export interface SoakOutcome {
  /** Appends per table. Two tables, so twice this many requests. */
  readonly appends: number;
  readonly rows: number;
  readonly failures: readonly string[];
}

const MINUTE_MS = 60_000;

export async function soak(options: SoakOptions): Promise<SoakOutcome> {
  const log = options.log ?? (() => {});
  const wait =
    options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => new Date());

  // One reading per commissioned meter, generated once: each cycle re-stamps
  // them rather than regenerating, so what is being measured is BigQuery's cost
  // and not the fixture generator's.
  const registry = MeterRegistry.fromWorkbook();
  const reference = new Date("2026-09-22T02:00:00.000Z");
  const template = generateFixtures({
    from: reference,
    to: new Date(reference.getTime() + MINUTE_MS),
    intervalMs: MINUTE_MS,
    registry,
  }).readings;

  const failures: string[] = [];
  let appends = 0;
  let rows = 0;

  for (let cycle = 0; cycle < options.cycles; cycle += 1) {
    const at = now();
    const readings: Reading[] = template.map((reading) => ({ ...reading, at }));
    // The bucket the ingester would have closed: a whole minute, in the past.
    // It walks backwards one minute per cycle so no two cycles write the same
    // `(meter, minute)` pair — that pair is the rollup row's identity, and a
    // soak that duplicated it would be demonstrating the exact failure the
    // closed-minute rule exists to prevent.
    const minute = new Date(
      Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS - (cycle + 1) * MINUTE_MS,
    );
    const rollup = rollupReadings(readings.map((reading) => ({ ...reading, at: minute })));

    try {
      await Promise.all([
        options.stream.append(
          TABLES.readings,
          readings.map((reading) => readingToStreamRow(reading, at)),
        ),
        options.stream.append(TABLES.rollup, rollup.map(bucketToStreamRow)),
      ]);
      appends += 1;
      rows += readings.length + rollup.length;
    } catch (error) {
      failures.push(
        `cycle ${cycle} at ${at.toISOString()}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if ((cycle + 1) % 100 === 0) {
      log(
        `${cycle + 1}/${options.cycles} cycles, ${appends} append(s) per table, ` +
          `${rows} rows, ${failures.length} failure(s)`,
      );
    }
    if (cycle + 1 < options.cycles) await wait(options.intervalMs);
  }

  await options.stream.close();
  return { appends, rows, failures };
}
