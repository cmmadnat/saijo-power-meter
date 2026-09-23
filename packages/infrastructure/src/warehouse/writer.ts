/**
 * The write side of the ingester: the `ReadingWriter` port.
 *
 * The port is one interface and the implementation is two stores, which is the
 * shape step 8c gave it:
 *
 * - **Raw and the 1-minute rollup** go to BigQuery through the Storage Write
 *   API (`stream.ts`), in the same call, because they are one flush of one
 *   buffer. Writing them separately would allow a crash between the two to
 *   leave a minute present in `readings` and absent from `readings_1m`, which
 *   no reader is built to notice: the chart would fall back to raw and agree,
 *   and the rollup would quietly under-report that minute forever.
 * - **The latest reading per meter** goes to one Firestore document
 *   (`../firestore/latest-store.ts`). It used to be a third BigQuery table,
 *   rewritten whole every 30 s; that is 2 880 table modifications a day against
 *   a cap of 1 500, so it stopped being a table. It was never analytics — it is
 *   restart state, and it never belonged in the warehouse.
 *
 * The split is visible in the constructor rather than hidden behind a flag,
 * because it is the thing about this class worth knowing.
 */
import type { ReadingBatch, ReadingWriter } from "@power-meter/application";
import type { Reading } from "@power-meter/domain";
import type { RowStream } from "./stream.ts";
import {
  bucketToStreamRow,
  readingToStreamRow,
  TABLES,
} from "./schema.ts";

/** The half of `ReadingWriter` that the Firestore store implements. */
export interface LatestWriter {
  replaceLatest(readings: readonly Reading[]): Promise<void>;
}

export class WarehouseReadingWriter implements ReadingWriter {
  readonly #rows: RowStream;
  readonly #latest: LatestWriter;

  constructor(rows: RowStream, latest: LatestWriter) {
    this.#rows = rows;
    this.#latest = latest;
  }

  async append(batch: ReadingBatch): Promise<void> {
    // Both appends are issued before either is awaited, so the gap between the
    // two tables is a few milliseconds of network rather than a round trip.
    // They are still two requests — the API has no way to make them one — so
    // the failure they are guarding against is narrowed, not removed.
    const writes = [
      this.#rows.append(
        TABLES.readings,
        batch.readings.map((reading) => readingToStreamRow(reading, batch.ingestedAt)),
      ),
      this.#rows.append(TABLES.rollup, batch.rollup.map(bucketToStreamRow)),
    ];

    // allSettled, not all: a rejection from the first must not leave the second
    // running unobserved into an unhandled rejection after the flush has
    // already been reported as failed.
    const results = await Promise.allSettled(writes);
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failures.length > 0) {
      throw new Error(
        failures.map((failure) => describe(failure.reason)).join("; "),
      );
    }
  }

  async replaceLatest(readings: readonly Reading[]): Promise<void> {
    // An empty flush is never a truncation. Overwriting with no rows would
    // empty the one document a restarting ingester reads, so a broker that is
    // down at the moment the timer fires would cost the next restart its
    // rehydration as well. The store checks this too; it is cheap, and this is
    // the layer a future second store would be plugged into.
    if (readings.length === 0) return;
    await this.#latest.replaceLatest(readings);
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
