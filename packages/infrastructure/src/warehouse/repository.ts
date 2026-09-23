/**
 * The two ports, backed by the warehouse.
 *
 * This is the swap the plan has been building toward since step 2: the same
 * `ReadingRepository` and `RollupRepository` the fixtures implement, so the
 * History and chart aggregations move server-side by being handed a different
 * object rather than by being rewritten. There is deliberately no SQL here that
 * sums energy or running hours. Those rules — the counter-reset walk and the
 * three-minute gap cap — have one implementation, in `packages/application`,
 * and a second one in SQL would be free to disagree with it in exactly the
 * cases nobody checks.
 */
import type {
  ReadingRepository,
  RollupBucket,
  RollupRepository,
  TimeRange,
} from "@power-meter/application";
import type { MeterId, Reading } from "@power-meter/domain";
import type { WarehouseClient } from "./client.ts";
import {
  READING_COLUMNS,
  ROLLUP_COLUMNS,
  rowToBucket,
  rowToReading,
  TABLES,
  tableRef,
  type WarehouseTarget,
} from "./schema.ts";

/**
 * The two read queries, as functions so `warehouse cost` can dry-run exactly
 * what the screens issue. Each carries an explicit `DATE(...)` bound beside the
 * instant bound: both tables are `require_partition_filter`.
 */
export function readingsSql(target: WarehouseTarget): string {
  return `SELECT ${READING_COLUMNS.join(", ")}
FROM ${tableRef(target, TABLES.readings)}
WHERE meter_id IN UNNEST(@meterIds)
  AND reading_at >= @from AND reading_at < @to
  AND DATE(reading_at) BETWEEN DATE(@from) AND DATE(@to)
ORDER BY meter_id, reading_at`;
}

export function rollupSql(target: WarehouseTarget): string {
  return `SELECT ${ROLLUP_COLUMNS.join(", ")}
FROM ${tableRef(target, TABLES.rollup)}
WHERE meter_id IN UNNEST(@meterIds)
  AND minute >= @from AND minute < @to
  AND DATE(minute) BETWEEN DATE(@from) AND DATE(@to)
ORDER BY meter_id, minute`;
}

export interface WarehouseRepositoryOptions {
  /**
   * The most rows one query may be expected to return, estimated from the
   * window at the real publish rate. Sets how many meters share a query.
   */
  readonly rowBudget?: number;
}

/**
 * Rows one raw query may be expected to return. Well inside what a single
 * `ORDER BY` sorts comfortably, and large enough that a day of every meter —
 * History's default — is one query.
 */
export const DEFAULT_ROW_BUDGET = 750_000;

/** One reading per meter every nine seconds: 60 messages a minute across 9 stations. */
const PUBLISH_INTERVAL_MS = 9_000;

/**
 * How many meters one query can carry for a window, keeping the rows it
 * returns — and so the sort behind its `ORDER BY` — under the budget.
 */
export function metersPerQuery(range: TimeRange, meters: number, rowBudget: number): number {
  const rowsPerMeter = Math.max(1, (range.to.getTime() - range.from.getTime()) / PUBLISH_INTERVAL_MS);
  return Math.min(meters, Math.max(1, Math.floor(rowBudget / rowsPerMeter)));
}

/**
 * Readings out of `readings`, honouring the port's ordering contract.
 *
 * **As few queries as the window allows.** The contract is "ordered by meter,
 * then ascending in time". Step 6 met it with one query per meter, because a
 * single `ORDER BY meter_id, reading_at` over a fortnight of 55 meters is
 * ~9.7 M rows through one sort, which BigQuery refuses rather than merely takes
 * its time over. But one query per meter costs twice over on a short window:
 * every query bills at least 10 MB, and at this table's size clustering on
 * `meter_id` need not prune anything, so each of the 55 can scan the whole
 * day's partitions. So meters are batched by a row budget: History's default
 * window — today — is one query; a fortnight is a handful, each sorting at most
 * `rowBudget` rows. Batches are read in meter order and streamed, never
 * buffered, so memory does not grow with the window.
 *
 * The charts do not come here at all — they read `readings_1m`, below. History
 * stays on raw, because running hours are read off the gaps between actual
 * readings and a minute-resolution source would quietly round them.
 */
export class WarehouseReadingRepository implements ReadingRepository {
  readonly #client: WarehouseClient;
  readonly #target: WarehouseTarget;
  readonly #rowBudget: number;

  constructor(
    client: WarehouseClient,
    target: WarehouseTarget,
    options: WarehouseRepositoryOptions = {},
  ) {
    this.#client = client;
    this.#target = target;
    this.#rowBudget = options.rowBudget ?? DEFAULT_ROW_BUDGET;
  }

  async *readingsInRange(
    meterIds: readonly MeterId[],
    range: TimeRange,
  ): AsyncIterable<Reading> {
    if (meterIds.length === 0) return;

    const sql = readingsSql(this.#target);
    const sorted = [...meterIds].sort();
    const size = metersPerQuery(range, sorted.length, this.#rowBudget);
    for (let start = 0; start < sorted.length; start += size) {
      for await (const row of this.#client.stream<Record<string, unknown>>(sql, {
        meterIds: sorted.slice(start, start + size),
        from: range.from,
        to: range.to,
      })) {
        yield rowToReading(row);
      }
    }
  }
}

/**
 * Rollup rows out of `readings_1m`, for the charts and the fleet strip.
 *
 * **One query for every meter asked for.** The widest thing asked of it is the
 * strip — 55 meters since midnight, at most 79 200 rows — and a chart is at most
 * eight meters across a day, so the single `ORDER BY` is small enough to sort in
 * one slot, and one job instead of several matters here more than anywhere:
 * this is read on a screen that refreshes every ten seconds, and BigQuery bills
 * at least 10 MB per query however few bytes it reads.
 */
export class WarehouseRollupRepository implements RollupRepository {
  readonly #client: WarehouseClient;
  readonly #target: WarehouseTarget;

  constructor(client: WarehouseClient, target: WarehouseTarget) {
    this.#client = client;
    this.#target = target;
  }

  async *bucketsInRange(
    meterIds: readonly MeterId[],
    range: TimeRange,
  ): AsyncIterable<RollupBucket> {
    if (meterIds.length === 0) return;
    for await (const row of this.#client.stream<Record<string, unknown>>(rollupSql(this.#target), {
      meterIds: [...meterIds].sort(),
      from: range.from,
      to: range.to,
    })) {
      yield rowToBucket(row);
    }
  }
}
