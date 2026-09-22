/**
 * The write side of the warehouse: the `ReadingWriter` port, backed by load
 * jobs.
 *
 * Raw and the 1-minute rollup are written from one call, because they are one
 * flush of one buffer. Writing them separately would allow a crash between the
 * two to leave a minute present in `readings` and absent from `readings_1m`,
 * which no reader is built to notice: the chart would fall back to raw and
 * agree, and the rollup would quietly under-report that minute forever.
 *
 * `latest` is replaced rather than appended, which is the one place a load job's
 * `WRITE_TRUNCATE` is the right disposition: 55 rows, rewritten every half
 * minute, read only by an ingester rehydrating after a restart.
 *
 * Rows go through load jobs rather than the streaming insert API for the reason
 * `client.ts` gives: load jobs are free where streaming is billed per megabyte,
 * and rows land immediately instead of sitting in a buffer DML cannot see.
 */
import type { ReadingBatch, ReadingWriter } from "@power-meter/application";
import type { Reading } from "@power-meter/domain";
import type { WarehouseClient } from "./client.ts";
import {
  bucketToRow,
  latestToRow,
  readingToRow,
  TABLES,
  type WarehouseTarget,
} from "./schema.ts";

export class WarehouseReadingWriter implements ReadingWriter {
  readonly #client: WarehouseClient;
  readonly #target: WarehouseTarget;

  constructor(client: WarehouseClient, target: WarehouseTarget) {
    this.#client = client;
    this.#target = target;
  }

  /** The target, exposed so a caller can log where it is writing. */
  get target(): WarehouseTarget {
    return this.#target;
  }

  async append(batch: ReadingBatch): Promise<void> {
    if (batch.readings.length > 0) {
      await this.#client.load(
        TABLES.readings,
        iterate(
          batch.readings.map((reading) => readingToRow(reading, batch.ingestedAt)),
        ),
      );
    }
    if (batch.rollup.length > 0) {
      await this.#client.load(TABLES.rollup, iterate(batch.rollup.map(bucketToRow)));
    }
  }

  async replaceLatest(readings: readonly Reading[]): Promise<void> {
    // An empty flush is never a truncation. A `WRITE_TRUNCATE` with no rows
    // would empty the one table a restarting ingester reads, so a broker that
    // is down at the moment the timer fires would cost the next restart its
    // rehydration as well.
    if (readings.length === 0) return;
    const updatedAt = new Date();
    await this.#client.replace(
      TABLES.latest,
      iterate(readings.map((reading) => latestToRow(reading, updatedAt))),
    );
  }
}

async function* iterate<T>(items: Iterable<T>): AsyncIterable<T> {
  for (const item of items) yield item;
}
