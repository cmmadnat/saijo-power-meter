import assert from "node:assert/strict";
import { test } from "node:test";
import { MeterRegistry, type Meter, type MeterId } from "@power-meter/domain";
import type { RollupRepository, TimeRange } from "./ports.ts";
import type { RollupBucket } from "./series.ts";
import { fleetTrend } from "./trend.ts";

const DAY = new Date("2025-09-21T17:00:00.000Z"); // 00:00 Asia/Bangkok

function meter(id: string, slot: number, commissioned = true): Meter {
  return {
    meterId: id as MeterId,
    station: 1,
    topic: "PMeterStation01",
    slot,
    keyPrefix: `M${slot}`,
    department: "ผลิต โลหะ",
    machineName: commissioned ? `machine ${slot}` : null,
    standbyPowerKw: 0.1,
    commissioned,
  };
}

const registry = MeterRegistry.of([
  meter("s01m1", 1),
  meter("s01m2", 2),
  meter("s01m3", 3),
  meter("s01m4", 4, false),
]);

function minute(meterId: string, offsetMin: number, kw: number, kwh: number, count = 6): RollupBucket {
  return {
    meterId: meterId as MeterId,
    at: new Date(DAY.getTime() + offsetMin * 60_000),
    readingCount: count,
    activePowerKw: kw,
    energyKwh: kwh,
  };
}

function repo(rows: readonly RollupBucket[]): RollupRepository {
  return {
    async *bucketsInRange(meterIds: readonly MeterId[], range: TimeRange) {
      for (const id of [...meterIds].sort()) {
        for (const row of rows) {
          const at = row.at.getTime();
          if (row.meterId === id && at >= range.from.getTime() && at < range.to.getTime()) yield row;
        }
      }
    },
  };
}

const at = (minutes: number) => new Date(DAY.getTime() + minutes * 60_000);

test("energy today is measured from the counter as the day opened", async () => {
  const trend = await fleetTrend({
    registry,
    repository: repo([
      // The minute before midnight is the baseline, so the first minute counts.
      minute("s01m1", -1, 10, 100),
      minute("s01m1", 0, 10, 101),
      minute("s01m1", 90, 10, 130),
      // No reading before midnight: measured from its first minute instead.
      minute("s01m2", 5, 20, 50),
      minute("s01m2", 100, 20, 80),
      // Yesterday's minutes further back play no part.
      minute("s01m3", -30, 5, 1),
    ]),
    dayStart: DAY,
    to: at(120),
  });
  assert.equal(trend.energyTodayKwh, 30 + 30);
  assert.equal(trend.energyMeters, 2);
});

test("a counter reset today is not negative consumption", async () => {
  const trend = await fleetTrend({
    registry,
    repository: repo([
      minute("s01m1", -1, 10, 900),
      minute("s01m1", 10, 10, 910),
      minute("s01m1", 11, 10, 3),
      minute("s01m1", 20, 10, 8),
    ]),
    dayStart: DAY,
    to: at(30),
  });
  // 10 before the reset, 3 counted as consumption since it, then 5 more.
  assert.equal(trend.energyTodayKwh, 18);
});

test("the load line sums reporting meters per minute and leaves silent minutes as gaps", async () => {
  const trend = await fleetTrend({
    registry,
    repository: repo([
      minute("s01m1", 60, 10, 1),
      minute("s01m2", 60, 32, 1),
      minute("s01m1", 61, 12, 1),
      minute("s01m1", 118, 40, 1),
    ]),
    dayStart: DAY,
    to: at(120),
  });
  assert.equal(trend.spark.length, 60);
  assert.equal(trend.sparkBucketMs, 60_000);
  assert.deepEqual(
    [trend.spark[0]?.activePowerKw, trend.spark[0]?.meters],
    [42, 2],
  );
  assert.equal(trend.spark[1]?.activePowerKw, 12);
  assert.equal(trend.spark[2]?.activePowerKw, null);
  assert.equal(trend.spark[58]?.activePowerKw, 40);
  // The running minute has not been written yet: a gap, not a zero.
  assert.equal(trend.spark[59]?.activePowerKw, null);
});

test("a fleet that said nothing today reads null, not zero", async () => {
  const trend = await fleetTrend({ registry, repository: repo([]), dayStart: DAY, to: at(1) });
  assert.equal(trend.energyTodayKwh, null);
  assert.equal(trend.energyMeters, 0);
  assert.ok(trend.spark.every((p) => p.activePowerKw === null));
});
