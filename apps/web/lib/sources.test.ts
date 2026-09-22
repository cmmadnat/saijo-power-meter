/**
 * The four screens' data, run against each adapter set.
 *
 * The same assertions, the same source functions the pages call, and only the
 * `DataSource` changes: the demo set (fixtures generated per request) and the
 * live set (the ingester's `/latest` over HTTP, the warehouse's raw readings
 * and rollup). The live set is exercised here over the replay harness's file
 * warehouse and a loopback `/latest`, which is the same code path as BigQuery
 * down to the repository class; the BigQuery repositories themselves are
 * tested against a fake client in `packages/infrastructure`.
 *
 * What this proves is the plan's "the same four screens render in both modes
 * with no component change": the pages consume these return values and
 * nothing else, so identical shapes and invariants here are identical inputs
 * there.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { historyTable, rollupReadings } from "@power-meter/application";
import { MeterRegistry } from "@power-meter/domain";
import { FileReadingWriter, toLatestDto } from "@power-meter/infrastructure";
import {
  defaultProfiles,
  FixtureReadingRepository,
  generateFixtures,
} from "@power-meter/infrastructure/fixtures";
import { readDataMode, type LiveConfig } from "./data-mode.ts";
import type { DataSource } from "./data-source.ts";
import { createDemoSource } from "./demo-adapters.ts";
import { createLiveSource } from "./live-adapters.ts";
import { historySnapshot, parseRange } from "./history-source.ts";
import { fleetTrendSnapshot, realtimeSnapshot } from "./realtime-source.ts";
import { chartSeries, parseSelection, parseWindow } from "./series-source.ts";

const registry = MeterRegistry.fromWorkbook();
const commissioned = registry.commissioned().length;

/** The last three hours, at the real rate, as the replay would have written them. */
const now = new Date();
const stored = generateFixtures({
  registry,
  from: new Date(now.getTime() - 3 * 60 * 60_000),
  to: now,
  intervalMs: 9_000,
  profiles: defaultProfiles(registry),
});

let dir = "";
let server: Server;
let live: DataSource;

before(async () => {
  dir = await mkdtemp(join(tmpdir(), "live-source-"));
  const writer = new FileReadingWriter(dir);
  await writer.prepare();
  await writer.append({
    readings: stored.readings,
    rollup: rollupReadings(stored.readings),
    ingestedAt: now,
  });

  const latest = new Map<string, (typeof stored.readings)[number]>();
  for (const reading of stored.readings) latest.set(reading.meterId, reading);
  server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ asOf: new Date().toISOString(), readings: [...latest.values()].map(toLatestDto) }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  const config = readDataMode({
    DATA_MODE: "live",
    INGESTER_URL: `http://127.0.0.1:${port}`,
    WAREHOUSE: "file",
    WAREHOUSE_DIR: dir,
  }) as LiveConfig;
  live = await createLiveSource(config);
});

after(async () => {
  server?.close();
  await rm(dir, { recursive: true, force: true });
});

const sets: [string, () => DataSource][] = [
  ["demo", () => createDemoSource()],
  ["live", () => live],
];

for (const [name, source] of sets) {
  describe(`${name} adapter set`, () => {
    test("screen 1: one row per commissioned meter, and the strip agrees with the bands", async () => {
      const table = await realtimeSnapshot(source());
      assert.equal(table.rows.length, commissioned);
      const { live: fresh, stale, offline } = table.counts;
      assert.equal(fresh + stale + offline, commissioned);
      assert.ok(fresh > 0, "some meters are live");
      const bands = table.byDepartment.reduce((sum, d) => sum + d.activePowerKw, 0);
      assert.ok(Math.abs(bands - table.totalActivePowerKw) < 1e-6);
    });

    test("screens 2 and 3: four series in slot order, drawn across the window", async () => {
      const selection = parseSelection(undefined, registry);
      const charts = await chartSeries(registry, selection, parseWindow("1h"), source());
      assert.deepEqual(
        charts.view.series.map((s) => s.meterId),
        selection.filter((id) => id !== null),
      );
      for (const series of charts.view.series) {
        assert.equal(series.points.length, 60);
        const drawn = series.points.filter((p) => p.activePowerKw !== null).length;
        // The rollup's right-hand edge trails by the minute still open; the
        // rest of the hour is drawn.
        assert.ok(drawn >= 55, `${series.meterId}: ${drawn} of 60 minutes drawn`);
        assert.equal(series.points.find((p) => p.energyConsumedKwh !== null)?.energyConsumedKwh, 0);
      }
    });

    test("screen 4: History has a row for every meter and the quantities are sane", async () => {
      const to = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
      const from = new Date(to.getTime() - 2 * 60 * 60_000);
      const history = await historySnapshot({ ...parseRange({}), from, to }, null, source());
      assert.equal(history.rows.length, commissioned);
      const reported = history.rows.filter((row) => row.readingCount > 0);
      assert.ok(reported.length > 0);
      for (const row of reported) {
        assert.ok((row.totalEnergyKwh ?? -1) >= 0);
        assert.ok((row.runningMs ?? -1) >= 0 && (row.runningMs ?? 0) <= 2 * 60 * 60_000);
      }
    });

    test("the strip's windowed tiles: energy today and the last hour of load", async () => {
      const trend = await fleetTrendSnapshot(source());
      assert.equal(trend.spark.length, 60);
      assert.ok(trend.spark.filter((p) => p.activePowerKw !== null).length >= 55);
      assert.ok(trend.energyMeters > 0);
      assert.ok((trend.energyTodayKwh ?? -1) >= 0);
    });
  });
}

test("live History over what was stored is History over the readings themselves", async () => {
  // The step-6 equivalence, now through the web app's own source function:
  // the aggregation moved server-side by being handed a different port.
  const to = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const from = new Date(to.getTime() - 2 * 60 * 60_000);
  const viaLive = await historySnapshot({ ...parseRange({}), from, to }, null, live);
  const direct = await historyTable({
    registry,
    repository: new FixtureReadingRepository(stored.readings),
    range: { from, to },
  });
  assert.deepEqual(viaLive.rows, direct.rows);
});

test("a minute of ten-second refreshes costs the warehouse two queries, not eighteen", async () => {
  // Live mode against a counting stand-in for BigQuery: six renders of the real
  // time route, each asking for the strip's two windows and the charts.
  const statements: string[] = [];
  const client = {
    async query() {
      return [];
    },
    async *stream(sql: string) {
      statements.push(sql);
    },
    async load() {
      return 0;
    },
    async replace() {
      return 0;
    },
  };
  const config = readDataMode({
    DATA_MODE: "live",
    INGESTER_URL: "https://ingester.example",
  }) as LiveConfig;
  const source = await createLiveSource(config, { client });
  const selection = parseSelection(undefined, registry);

  for (let render = 0; render < 6; render += 1) {
    await fleetTrendSnapshot(source);
    await chartSeries(registry, selection, parseWindow("6h"), source);
  }
  // Six renders fall inside one or two wall-clock minutes depending on when
  // the test starts; per minute it is one strip read and one chart read.
  assert.ok(statements.length === 2 || statements.length === 4, `${statements.length} queries`);
  assert.ok(statements.every((sql) => sql.includes("readings_1m")));
  assert.ok(statements.every((sql) => /DATE\(minute\) BETWEEN/.test(sql)));
});
