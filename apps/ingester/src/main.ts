/**
 * Composition: read the configuration, refuse to start if it is not safe to,
 * and hand the real broker and the real warehouse to `startService`.
 *
 * Everything with a decision in it is in `service.ts`, which is why this file
 * is short. What is left here is the two things only a process can do: refuse
 * to start, and exit.
 */
import process from "node:process";
import {
  FileLatestReadingStore,
  FileReadingWriter,
  FirestoreLatestStore,
  firestoreDocumentStore,
  storageWriteStream,
  WarehouseReadingWriter,
} from "@power-meter/infrastructure";
import type {
  LatestReadingStore,
  ReadingBatch,
  ReadingWriter,
} from "@power-meter/application";
import { MeterRegistry, type Reading } from "@power-meter/domain";
import { MqttBroker } from "./broker.ts";
import { assertSafeToStart, readConfig, type Config } from "./config.ts";
import { startService } from "./service.ts";

function log(message: string): void {
  // One line, unstructured, to stdout: Cloud Logging picks it up as-is and
  // `/logs` prints one line per entry. Nothing here is worth a JSON envelope.
  process.stdout.write(`${new Date().toISOString()} ${message}\n`);
}

/**
 * The writer used when `WAREHOUSE=memory`: it accepts everything and keeps
 * nothing.
 *
 * This is the local replay's other half. `assertSafeToStart` lets the
 * unconfirmed scale factors through only when the broker is on loopback *and*
 * the writer is this one, so the harness exercises decode, buffering, rollup
 * closing, the hot state and HTTP without a single row reaching a real table.
 */
class MemoryWriter implements ReadingWriter {
  async append(_batch: ReadingBatch): Promise<void> {}
  async replaceLatest(_readings: readonly Reading[]): Promise<void> {}
}

interface WritePath {
  readonly writer: ReadingWriter;
  readonly latest: LatestReadingStore | undefined;
  /** Release whatever the write path holds open. Called once, on the way out. */
  close(): Promise<void>;
}

async function warehouse(config: Config): Promise<WritePath> {
  if (config.warehouse === "memory") {
    log("WAREHOUSE=memory — nothing is written and nothing is read back.");
    return { writer: new MemoryWriter(), latest: undefined, close: async () => {} };
  }
  if (config.warehouse === "file") {
    // The replay harness. Same rows, written to a directory instead of to
    // BigQuery, so a restart can rehydrate and the rollup can be reconciled
    // against raw without a project.
    log(`WAREHOUSE=file — rows are written under ${config.warehouseDir}.`);
    const writer = new FileReadingWriter(config.warehouseDir);
    await writer.prepare();
    return {
      writer,
      latest: new FileLatestReadingStore(config.warehouseDir),
      close: async () => {},
    };
  }

  // The deployment path, and since step 8c it is two stores rather than one.
  // Raw and rollup stream into BigQuery; the restart state is one Firestore
  // document. Both are per-flush writes that used to be load jobs, which
  // BigQuery caps per table per day — see docs/architecture/warehouse.md.
  if (config.projectId === undefined) {
    throw new Error(
      "GOOGLE_PROJECT is required with WAREHOUSE=bigquery: a write stream is named " +
        "by a full projects/.../datasets/.../tables/... path, so there is no default " +
        "to fall back on. The Cloud Run service sets it; see infra/index.ts.",
    );
  }
  const rows = await storageWriteStream({
    projectId: config.projectId,
    dataset: config.dataset,
  });
  const latest = new FirestoreLatestStore(
    await firestoreDocumentStore({
      projectId: config.projectId,
      databaseId: config.firestoreDatabase,
    }),
    config.latestDocument,
  );
  log(
    `writing ${config.projectId}:${config.dataset} through the storage write API, ` +
      `restart state in firestore ${config.firestoreDatabase}/${config.latestDocument}`,
  );
  return { writer: new WarehouseReadingWriter(rows, latest), latest, close: () => rows.close() };
}

const config = readConfig();
assertSafeToStart(config);

const { writer, latest, close } = await warehouse(config);
const service = await startService({
  config,
  writer,
  latestStore: latest,
  log,
  broker: new MqttBroker({
    url: config.brokerUrl,
    clientId: config.clientId,
    username: config.username,
    password: config.password,
    protocolVersion: config.protocolVersion,
    // The nine station topics, from the registry the workbook generated. The
    // ingester drops anything that arrives on a topic it does not know, so
    // subscribing from the same source is what keeps the two in step.
    topics: MeterRegistry.fromWorkbook().topics(),
  }),
});

/** Stop, write what is buffered, then let go of the connections. In that order. */
async function shutdown(reason: string): Promise<never> {
  await service.stop(reason);
  await close();
  process.exit(0);
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    void shutdown(`received ${signal}`);
  });
}

// A takeover is the service shutting itself down, and the process goes with it:
// staying up would leave a container serving a hot state nothing is feeding,
// which a readiness probe would report as healthy for as long as it ran. The
// service has already flushed by the time this resolves; only the connections
// are left to release.
void service.stopped.then(async () => {
  await close();
  process.exit(0);
});
