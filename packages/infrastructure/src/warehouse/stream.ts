/**
 * Appending rows to BigQuery without a load job.
 *
 * This is step 8c, and it is a correctness fix rather than a cost one. A load
 * job counts as a **table modification**, and BigQuery caps those per table per
 * day — 1 500 for a standard table, which cannot be raised, and failures count.
 * The ingester flushes every 45 s, so at two tables a flush it spends 1 920
 * modifications a day on each. `readings` and `readings_1m` are day-partitioned
 * and a partitioned table's own limit is higher (30 000 partition modifications
 * a day for a column-partitioned one), so those two were probably inside it;
 * `latest` was a standard table rewritten every 30 s, which is 2 880 against
 * 1 500 and is not arguable. The quotas page states both figures, and the load
 * section states a third — "Load jobs per table per day: 1 500" — without
 * saying which of the two governs a partitioned destination. Writing the
 * ingester's steady state against a limit whose reading is a judgement call is
 * the actual defect, and the Storage Write API removes the question: streaming
 * is excluded from table-modification counting altogether, at any rate.
 *
 * `docs/architecture/warehouse.md` carries the figures and their sources.
 *
 * What this file is: the narrow surface the writer needs, and an implementation
 * of it over the `managedwriter` default stream. Narrow for the same reason
 * `client.ts` is — everything above it is then testable against a fake on a
 * machine with no credentials, which is every machine this code is written on.
 *
 * Two properties of the default stream are worth stating rather than
 * discovering:
 *
 * - **At-least-once.** A request that fails after BigQuery accepted it is
 *   retried by the caller — the ingester holds the batch and tries again on the
 *   next flush — and the rows can land twice. That is what the load-job path
 *   did too, so nothing here is worse; exactly-once needs a committed stream
 *   with offsets, which is a bigger change than step 8c asks for and is
 *   recorded in the plan rather than hidden here.
 * - **One long-lived connection per table.** The connection is created on the
 *   first append and kept, because the quota counts concurrent connections and
 *   the docs ask for lifetimes of minutes rather than seconds. An ingester that
 *   opened one per flush would be the discouraged pattern exactly.
 */
import type { StreamRow } from "./schema.ts";

/**
 * Where a flush's rows go. One method, because that is all the writer does.
 *
 * `append` takes a whole table's worth of rows for one flush: the caller
 * batches, this does not. 55 meters at one reading every 9 s is ~300 rows per
 * 45 s flush, a few tens of kilobytes against the API's 20 MB request limit.
 */
export interface RowStream {
  append(table: string, rows: readonly StreamRow[]): Promise<void>;
  /** Release the connections. A process that is exiting need not wait on it. */
  close(): Promise<void>;
}

export interface StorageWriteOptions {
  /**
   * Required, unlike everywhere else in this package: a write stream is named
   * by a full `projects/.../datasets/.../tables/...` path, and the managed
   * writer has no public way to ask what the default project is. The Cloud Run
   * service passes it as `GOOGLE_PROJECT`.
   */
  readonly projectId: string;
  readonly dataset: string;
}

/**
 * The real implementation.
 *
 * The SDK is imported dynamically for the reason `client.ts` gives: importing
 * this module must not drag the gRPC stack into a bundle that never writes a
 * row. Only the ingester ever calls this.
 */
export async function storageWriteStream(
  options: StorageWriteOptions,
): Promise<RowStream> {
  const { adapt, managedwriter, protos } = await import("@google-cloud/bigquery-storage");
  const { JSONWriter, WriterClient } = managedwriter;

  const client = new WriterClient({ projectId: options.projectId });
  const writers = new Map<string, InstanceType<typeof JSONWriter>>();

  async function writerFor(table: string): Promise<InstanceType<typeof JSONWriter>> {
    const existing = writers.get(table);
    if (existing !== undefined) return existing;

    // The default stream is a name, not a resource: nothing creates it, and
    // using it is what keeps this off the CreateWriteStream quota entirely.
    const destinationTable = `projects/${options.projectId}/datasets/${options.dataset}/tables/${table}`;
    const streamId = `${destinationTable}/streams/_default`;
    // FULL, because the descriptor is built from the table's own schema: the
    // rows are encoded into protobuf against it, so a column the table does not
    // have fails here rather than silently going nowhere.
    const stream = await client.getWriteStream({
      streamId,
      view: protos.google.cloud.bigquery.storage.v1.WriteStreamView.FULL,
    });
    const protoDescriptor = adapt.convertStorageSchemaToProto2Descriptor(
      stream.tableSchema ?? {},
      "root",
    );
    const connection = await client.createStreamConnection({ streamId });
    const writer = new JSONWriter({ connection, protoDescriptor });
    writers.set(table, writer);
    return writer;
  }

  return {
    async append(table, rows) {
      if (rows.length === 0) return;
      const writer = await writerFor(table);
      const pending = writer.appendRows(rows as Parameters<typeof writer.appendRows>[0]);
      const response = await pending.getResult();
      // `getResult` rejects on a request-level failure but resolves on a
      // per-row one, and a resolved promise carrying rejected rows is exactly
      // the quiet success this service must not have.
      if (response.error !== null && response.error !== undefined) {
        throw new Error(
          `${table}: the write API rejected the request: ${response.error.message ?? "no message"}`,
        );
      }
      const rowErrors = response.rowErrors ?? [];
      if (rowErrors.length > 0) {
        throw new Error(
          `${table}: ${rowErrors.length} row(s) rejected: ${rowErrors[0]?.message ?? "no message"}`,
        );
      }
    },

    async close() {
      for (const writer of writers.values()) writer.close();
      writers.clear();
      client.close();
    },
  };
}
