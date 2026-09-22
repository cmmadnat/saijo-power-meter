import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { historyTable, meterSeries, rollupReadings } from "@power-meter/application";
import { MeterRegistry, type MeterId } from "@power-meter/domain";
import { generateFixtures } from "../fixtures/generate.ts";
import { FixtureReadingRepository } from "../fixtures/repository.ts";
import {
  FileLatestReadingStore,
  FileReadingRepository,
  FileReadingWriter,
  FileRollupRepository,
} from "./file-store.ts";

const registry = MeterRegistry.fromWorkbook();
const window = {
  from: new Date("2025-09-21T01:00:00Z"),
  to: new Date("2025-09-21T01:30:00Z"),
};

test("what the ingester writes to files, the web app reads back unchanged", async () => {
  const dir = await mkdtemp(join(tmpdir(), "file-store-"));
  try {
    const fixtures = generateFixtures({ registry, ...window, intervalMs: 9_000 });
    const writer = new FileReadingWriter(dir);
    await writer.prepare();
    // Two flushes, the way the ingester appends.
    const half = Math.floor(fixtures.readings.length / 2);
    for (const part of [fixtures.readings.slice(0, half), fixtures.readings.slice(half)]) {
      await writer.append({ readings: part, rollup: rollupReadings(part), ingestedAt: new Date() });
    }
    await writer.replaceLatest(fixtures.readings.slice(-55));

    const history = await historyTable({
      registry,
      repository: new FileReadingRepository(dir),
      range: window,
    });
    const expected = await historyTable({
      registry,
      repository: new FixtureReadingRepository(fixtures.readings),
      range: window,
    });
    assert.deepEqual(history.rows, expected.rows);

    const meterIds = ["s01m1", "s03m4"] as MeterId[];
    const fromRollup = await meterSeries({
      registry,
      repository: new FileRollupRepository(dir),
      meterIds,
      range: window,
    });
    assert.equal(fromRollup.series.length, 2);
    assert.ok(fromRollup.series.every((s) => s.points.some((p) => p.activePowerKw !== null)));

    const latest = await new FileLatestReadingStore(dir).latest();
    assert.ok(latest.size > 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an empty directory reads as no data, not as an error", async () => {
  const dir = await mkdtemp(join(tmpdir(), "file-store-"));
  try {
    for await (const _ of new FileReadingRepository(dir).readingsInRange(["s01m1"] as MeterId[], window)) {
      assert.fail("yielded a reading");
    }
    for await (const _ of new FileRollupRepository(dir).bucketsInRange(["s01m1"] as MeterId[], window)) {
      assert.fail("yielded a bucket");
    }
    assert.equal((await new FileLatestReadingStore(dir).latest()).size, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
