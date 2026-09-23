/**
 * Write the restart state to Firestore and read it back.
 *
 * Step 8c moved the hot state's durable copy out of BigQuery and into one
 * Firestore document. Everything about that mapping is unit-tested, and none of
 * it proves the part that matters on a real project: that the document is
 * accepted, that it comes back with all 55 meters in it, and that it is
 * nowhere near the 1 MiB document limit. This is that check, and — like
 * `capture.ts` — it is a tool rather than the ingester: no broker, no decoder,
 * no gate to talk past, and fixture readings rather than meter ones.
 *
 *     npm run hotstate -w @power-meter/ingester -- \
 *       --project saijo-power-meter --database power-meter-scratch
 *
 * `--database` is required and has no default, for the same reason the soak
 * refuses `power_meter` by name: the deployed ingester's database is
 * `(default)`, a Pulumi resource with real restart state in it, and a tool that
 * wrote there by default would eventually write there by accident. Pass a named
 * scratch database instead — named databases get no free quota, so it is billed
 * from the first write, which at one document is a fraction of a cent. Delete it
 * afterwards.
 */
import process from "node:process";
import {
  DEFAULT_LATEST_DOCUMENT,
  FirestoreLatestStore,
  firestoreDocumentStore,
  toLatestDocument,
} from "@power-meter/infrastructure";
import { generateFixtures } from "@power-meter/infrastructure/fixtures";
import { MeterRegistry } from "@power-meter/domain";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

const projectId = flag("project") ?? process.env["GOOGLE_PROJECT"];
const databaseId = flag("database");
const path = flag("document") ?? DEFAULT_LATEST_DOCUMENT;

if (databaseId === undefined || databaseId === "") {
  process.stderr.write(
    "--database is required: name the scratch Firestore database to write to.\n",
  );
  process.exit(1);
}

const registry = MeterRegistry.fromWorkbook();
const to = new Date();
// One minute at a one-minute interval: the newest reading per meter is all this
// writes, and that is one per commissioned meter.
const fixtures = generateFixtures({
  from: new Date(to.getTime() - 60_000),
  to,
  intervalMs: 60_000,
  registry,
});

const newest = new Map<string, (typeof fixtures.readings)[number]>();
for (const reading of fixtures.readings) {
  const current = newest.get(reading.meterId);
  if (current === undefined || reading.at.getTime() >= current.at.getTime()) {
    newest.set(reading.meterId, reading);
  }
}
const readings = [...newest.values()];

const store = new FirestoreLatestStore(
  await firestoreDocumentStore({
    ...(projectId === undefined ? {} : { projectId }),
    databaseId,
  }),
  path,
);

const bytes = Buffer.byteLength(JSON.stringify(toLatestDocument(readings, to)));
process.stdout.write(
  `writing ${readings.length} meter(s), ${bytes} bytes, to ${databaseId}/${path}\n`,
);

await store.replaceLatest(readings);
const read = await store.latest();

process.stdout.write(`read back ${read.size} meter(s)\n`);

const missing = readings.filter((reading) => !read.has(reading.meterId));
const commissioned = registry.commissioned().length;
const drift = [...read.entries()].filter(([meterId, reading]) => {
  const written = newest.get(meterId);
  return (
    written === undefined ||
    written.at.getTime() !== reading.at.getTime() ||
    written.energyKwh !== reading.energyKwh ||
    written.activePowerKw !== reading.activePowerKw
  );
});

if (missing.length > 0 || drift.length > 0 || read.size !== commissioned) {
  process.stdout.write(
    `FAILED: ${missing.length} missing, ${drift.length} changed, ` +
      `${read.size} of ${commissioned} commissioned meter(s)\n`,
  );
  process.exit(1);
}

process.stdout.write(
  `OK: all ${commissioned} commissioned meters survived the round trip, ` +
    `${bytes} bytes against Firestore's 1 MiB document limit\n`,
);
