/**
 * The two ports, backed by the warehouse.
 *
 * This is the swap the plan has been building toward since step 2: the same
 * `ReadingRepository` and `LatestReadingStore` the fixtures implement, so the
 * History and chart aggregations move server-side by being handed a different
 * object rather than by being rewritten. There is deliberately no SQL here that
 * sums energy or running hours. Those rules — the counter-reset walk and the
 * three-minute gap cap — have one implementation, in `packages/application`,
 * and a second one in SQL would be free to disagree with it in exactly the
 * cases nobody checks.
 */
import type {
  LatestReadingStore,
  ReadingRepository,
  TimeRange,
} from "@power-meter/application";
import type { MeterId, Reading } from "@power-meter/domain";
import type { WarehouseClient } from "./client.ts";
import {
  READING_COLUMNS,
  rowToReading,
  TABLES,
  tableRef,
  type WarehouseTarget,
} from "./schema.ts";

export interface WarehouseRepositoryOptions {
  /** How many meters to read per query. See the note on `readingsInRange`. */
  readonly meterBatchSize?: number;
}

/**
 * Readings out of `readings`, honouring the port's ordering contract.
 *
 * **One query per meter, not one for the window.** The contract is "ordered by
 * meter, then ascending in time", and a single `ORDER BY meter_id, at` over a
 * fortnight of 55 meters is ~9.7 M rows through one sort — which BigQuery will
 * refuse rather than merely take its time over. Per meter it is ~176 k rows,
 * which sorts inside one slot, and the queries run against the same clustered
 * partitions so each is cheap. The cost is 55 round trips on the widest window
 * the screen offers.
 *
 * That is a step-8 tuning question and it is written down as one: the 1-minute
 * rollup exists precisely to make the wide windows cheap, and pointing the
 * chart path at it is a change of table, not of arithmetic. History stays on
 * raw, because running hours are read off the gaps between actual readings and
 * a minute-resolution source would quietly round them.
 *
 * Every query carries an explicit `DATE(at)` bound as well as the instant
 * bound. The table is `require_partition_filter`, so a query without it is
 * rejected — which is the setting doing its job, but only if the caller never
 * has to remember.
 */
export class WarehouseReadingRepository implements ReadingRepository {
  readonly #client: WarehouseClient;
  readonly #target: WarehouseTarget;

  constructor(client: WarehouseClient, target: WarehouseTarget) {
    this.#client = client;
    this.#target = target;
  }

  async *readingsInRange(
    meterIds: readonly MeterId[],
    range: TimeRange,
  ): AsyncIterable<Reading> {
    if (meterIds.length === 0) return;

    const sql = `SELECT ${READING_COLUMNS.join(", ")}
FROM ${tableRef(this.#target, TABLES.readings)}
WHERE meter_id = @meterId
  AND at >= @from AND at < @to
  AND DATE(at) BETWEEN DATE(@from) AND DATE(@to)
ORDER BY at`;

    for (const meterId of [...meterIds].sort()) {
      for await (const row of this.#client.stream<Record<string, unknown>>(sql, {
        meterId,
        from: range.from,
        to: range.to,
      })) {
        yield rowToReading(row);
      }
    }
  }
}

/**
 * The newest reading per meter, from the durable copy.
 *
 * Reading the real-time screen off this table is the fallback, not the design:
 * the ingester holds the 55 rows in memory and serves them, and this is what it
 * rehydrates from after a restart. 55 rows, unpartitioned, so the query is a
 * full scan of a few kilobytes.
 */
export class WarehouseLatestReadingStore implements LatestReadingStore {
  readonly #client: WarehouseClient;
  readonly #target: WarehouseTarget;

  constructor(client: WarehouseClient, target: WarehouseTarget) {
    this.#client = client;
    this.#target = target;
  }

  async latest(): Promise<ReadonlyMap<MeterId, Reading>> {
    const rows = await this.#client.query<Record<string, unknown>>(
      `SELECT ${READING_COLUMNS.join(", ")} FROM ${tableRef(this.#target, TABLES.latest)}`,
    );
    return new Map(
      rows.map((row) => {
        const reading = rowToReading(row);
        return [reading.meterId, reading] as const;
      }),
    );
  }
}
