/**
 * The Incoming view, end to end from the observer's document to the screens'
 * return values — and the one promise it makes that matters most: it shows
 * what the snapshot holds, and nothing else. An empty document is 55 offline
 * rows, never a fallback to fixtures.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { DEFAULT_FRESHNESS, rollupReadings } from "@power-meter/application";
import { MeterRegistry } from "@power-meter/domain";
import {
  fileDocumentStore,
  ObserverSnapshotStore,
  type DocumentStore,
} from "@power-meter/infrastructure";
import { defaultProfiles, generateFixtures } from "@power-meter/infrastructure/fixtures";
import {
  provenanceOf,
  readDataMode,
  readIncoming,
  resolveView,
  viewsOf,
} from "./data-mode.ts";
import type { DataSource } from "./data-source.ts";
import { CACHE_MS, createIncomingSource, type IncomingConfig } from "./incoming-adapters.ts";
import { feedStatus, fleetTrendSnapshot, realtimeSnapshot } from "./realtime-source.ts";
import { chartSeries, parseSelection, parseWindow, windowsFor } from "./series-source.ts";

const registry = MeterRegistry.fromWorkbook();
const commissioned = registry.commissioned().length;
const MINUTE = 60_000;

// The customer's test publisher: once a minute, for the last hour.
const now = new Date();
const fed = generateFixtures({
  registry,
  from: new Date(now.getTime() - 60 * MINUTE),
  to: now,
  intervalMs: MINUTE,
  profiles: defaultProfiles(registry),
});
const newest = new Map(fed.readings.map((reading) => [reading.meterId, reading]));

let dir = "";
let incoming: DataSource;

function config(at: string): IncomingConfig {
  return { store: "file", projectId: undefined, databaseId: "(default)", document: "observer/latest", dir: at };
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "incoming-"));
  await new ObserverSnapshotStore(fileDocumentStore(dir)).write({
    updatedAt: now,
    publishIntervalMs: MINUTE,
    windowMs: 60 * MINUTE,
    latest: [...newest.values()],
    rollup: rollupReadings(fed.readings),
  });
  incoming = await createIncomingSource(config(dir));
});

after(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("the Incoming adapter set", () => {
  test("stores nothing and offers an hour of chart", () => {
    assert.equal(incoming.records, false);
    assert.deepEqual(
      windowsFor(incoming.maxSeriesMs).map((w) => w.id),
      ["1h"],
    );
    // A stale link asking for six hours gets the hour there is.
    assert.equal(parseWindow("6h", windowsFor(incoming.maxSeriesMs)), "1h");
  });

  test("freshness comes from the interval the observer measured", async () => {
    const feed = await feedStatus(incoming);
    assert.equal(feed.publishIntervalMs, MINUTE);
    assert.deepEqual(feed.thresholds, { liveWithinMs: 3 * MINUTE, staleWithinMs: 20 * MINUTE });
    assert.equal(feed.observedAt?.getTime(), now.getTime());
  });

  test("screen 1 shows exactly the snapshot's readings, judged at the feed's own rate", async () => {
    const table = await realtimeSnapshot(incoming);
    assert.equal(table.rows.length, commissioned);
    for (const row of table.rows) {
      const expected = newest.get(row.meterId);
      assert.ok(expected, `${row.meterId} is in the snapshot`);
      assert.deepEqual(row.reading, expected);
    }
    // Every meter whose last reading is within three publishes is live — up
    // to a minute old is on schedule. The fixtures' deliberately silent meters
    // are not; under the specification's 30 s, half the rest would be stale.
    const recent = [...newest.values()].filter(
      (reading) => table.at.getTime() - reading.at.getTime() <= 3 * MINUTE,
    ).length;
    assert.ok(recent > commissioned / 2);
    assert.equal(table.counts.live, recent);
  });

  test("the kW chart draws the hour; the window asked for does not widen it", async () => {
    const selection = parseSelection(undefined, registry);
    const charts = await chartSeries(registry, selection, "6h", incoming);
    assert.equal(charts.view.to.getTime() - charts.view.from.getTime(), 60 * MINUTE);
    for (const series of charts.view.series) {
      const drawn = series.points.filter((p) => p.activePowerKw !== null).length;
      assert.ok(drawn >= 55, `${series.meterId}: ${drawn} minutes drawn`);
    }
  });

  test("the strip's load line comes from the same hour", async () => {
    const trend = await fleetTrendSnapshot(incoming);
    assert.ok(trend.spark.filter((p) => p.activePowerKw !== null).length >= 55);
  });

  test("an observer that has written nothing is 55 offline rows, never fixtures", async () => {
    const empty = await mkdtemp(join(tmpdir(), "incoming-empty-"));
    try {
      const source = await createIncomingSource(config(empty));
      const table = await realtimeSnapshot(source);
      assert.equal(table.rows.length, commissioned);
      assert.equal(table.counts.offline, commissioned);
      assert.ok(table.rows.every((row) => row.reading === null));
      assert.deepEqual((await feedStatus(source)).thresholds, DEFAULT_FRESHNESS);
      const charts = await chartSeries(registry, parseSelection(undefined, registry), "1h", source);
      assert.ok(charts.view.series.every((s) => s.points.every((p) => p.activePowerKw === null)));
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  test("the document is read once per cache period, however many screens ask", async () => {
    let reads = 0;
    const inner = fileDocumentStore(dir);
    const counting: DocumentStore = {
      get: async (path) => {
        reads += 1;
        return inner.get(path);
      },
      set: inner.set,
    };
    let clock = 1_000_000;
    const source = await createIncomingSource(config(dir), { documents: counting, now: () => clock });
    for (let i = 0; i < 5; i += 1) await realtimeSnapshot(source);
    assert.equal(reads, 1);
    clock += CACHE_MS;
    await realtimeSnapshot(source);
    assert.equal(reads, 2);
  });
});

describe("views", () => {
  test("Incoming is offered only when the deployment configures it", () => {
    assert.equal(readIncoming({}), null);
    assert.equal(readIncoming({ INCOMING: "firestore" })?.document, "observer/latest");
    assert.throws(() => readIncoming({ INCOMING: "bigquery" }), /INCOMING must be/);
    const demo = readDataMode({});
    assert.deepEqual(viewsOf(demo, false), ["demo"]);
    assert.deepEqual(viewsOf(demo, true), ["demo", "incoming"]);
  });

  test("the cookie picks among what is offered, and a stale one is ignored", () => {
    assert.equal(resolveView("incoming", ["demo", "incoming"]), "incoming");
    assert.equal(resolveView("incoming", ["demo"]), "demo");
    assert.equal(resolveView("live", ["demo", "incoming"]), "demo");
    assert.equal(resolveView(undefined, ["demo", "incoming"]), "demo");
  });

  test("Incoming is badged, and says the scaling is unconfirmed", () => {
    const { badge, line } = provenanceOf(readDataMode({}), "incoming");
    assert.ok(badge !== null && /incoming/i.test(badge));
    assert.match(line, /unconfirmed/);
    assert.match(line, /nothing stored/);
  });
});
