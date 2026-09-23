/**
 * The snapshot crosses from one deployable to another through a document, so
 * the round trip is the thing to assert — every reading and every rollup row
 * back exactly — and so is its size, which Firestore caps at 1 MiB.
 */
import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { rollupReadings } from "@power-meter/application";
import { MeterRegistry } from "@power-meter/domain";
import { generateFixtures } from "../fixtures/generate.ts";
import {
  fileDocumentStore,
  fromSnapshotDocument,
  ObserverSnapshotStore,
  toSnapshotDocument,
  type ObserverSnapshot,
} from "./snapshot.ts";

const registry = MeterRegistry.fromWorkbook();

/** An hour of the whole fleet at the spec's rate — the heaviest the document gets. */
function hourSnapshot(intervalMs = 9_000): ObserverSnapshot {
  const to = new Date("2026-09-23T08:00:00Z");
  const from = new Date(to.getTime() - 3_600_000);
  const { readings } = generateFixtures({ registry, from, to, intervalMs });
  const latest = new Map(readings.map((reading) => [reading.meterId, reading]));
  return {
    updatedAt: to,
    publishIntervalMs: intervalMs,
    windowMs: 3_600_000,
    latest: [...latest.values()],
    rollup: rollupReadings(readings),
    health: {
      startedAt: from,
      connected: true,
      connectedSince: from,
      lastBrokerProblem: { at: from, message: "connection closed" },
      messages: 3_600,
      lastMessageAt: to,
      issueCounts: { "missing-field": 1, "malformed-payload": 1 },
      recentIssues: [
        { at: to, topic: "PMeterStation01", kind: "missing-field", meterId: "s01m1", key: "M1P", detail: "M1P is absent" },
        { at: to, topic: "PMeterStation02", kind: "malformed-payload", detail: "not JSON" },
      ],
    },
  };
}

test("a snapshot survives the document and comes back exactly", () => {
  const snapshot = hourSnapshot();
  // Through JSON, which is what Firestore and the file store both amount to.
  const back = fromSnapshotDocument(JSON.parse(JSON.stringify(toSnapshotDocument(snapshot))));
  assert.ok(back);
  assert.deepEqual(back, snapshot);
});

test("an hour of the whole fleet fits in a Firestore document with room to spare", () => {
  const size = JSON.stringify(toSnapshotDocument(hourSnapshot())).length;
  assert.ok(size < 256 * 1024, `${size} bytes`);
});

test("a document from before the health section still reads, without it", () => {
  const { health: _dropped, ...document } = toSnapshotDocument(hourSnapshot());
  const back = fromSnapshotDocument(JSON.parse(JSON.stringify(document)));
  assert.equal(back?.health, undefined);
  assert.equal(back?.latest.length, 55);
});

test("no document is no snapshot, and a malformed one names its field", () => {
  assert.equal(fromSnapshotDocument(undefined), undefined);
  const document = JSON.parse(JSON.stringify(toSnapshotDocument(hourSnapshot())));
  document.series[0].kw[3] = "12.5";
  assert.throws(() => fromSnapshotDocument(document), /series\[0\]\.kw\[3\]/);
});

test("the file store stands in for Firestore, one file per document", async () => {
  const dir = await mkdtemp(join(tmpdir(), "observer-"));
  const store = new ObserverSnapshotStore(fileDocumentStore(dir));
  assert.equal(await store.read(), undefined);
  const snapshot = hourSnapshot(60_000);
  await store.write(snapshot);
  assert.deepEqual(await store.read(), snapshot);
  assert.deepEqual(await readdir(dir), ["observer__latest.json"]);
});
