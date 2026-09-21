import assert from "node:assert/strict";
import { test } from "node:test";
import { MeterRegistry, type Meter, type MeterId, type Reading } from "@power-meter/domain";
import type { ReadingRepository, TimeRange } from "./ports.ts";
import {
  bucketWidthMs,
  consumptionFrom,
  meterSeries,
  MIN_BUCKET_MS,
} from "./series.ts";

const FROM = new Date("2025-09-21T00:00:00.000Z");

function meter(id: string, slot: number, machineName: string | null): Meter {
  return {
    meterId: id as MeterId,
    station: 1,
    topic: "PMeterStation01",
    slot,
    keyPrefix: `M${slot}`,
    department: "ผลิต โลหะ",
    machineName,
    standbyPowerKw: 0.1,
    commissioned: machineName !== null,
  };
}

const registry = MeterRegistry.of([
  meter("s01m1", 1, "ปั้มเหล็ก 300 Ton : STL003"),
  meter("s01m2", 2, "ไลน์พ่นสี"),
]);

function reading(
  meterId: string,
  offsetMs: number,
  activePowerKw: number,
  energyKwh: number,
): Reading {
  return {
    meterId: meterId as MeterId,
    at: new Date(FROM.getTime() + offsetMs),
    voltage: { l1: 230, l2: 230, l3: 230 },
    current: { l1: 10, l2: 10, l3: 10 },
    activePowerKw,
    powerFactor: 0.9,
    energyKwh,
  };
}

/** Honours the port's contract: meter-major, ascending in time, half-open range. */
function repository(readings: readonly Reading[]): ReadingRepository {
  return {
    async *readingsInRange(meterIds: readonly MeterId[], range: TimeRange) {
      for (const meterId of [...meterIds].sort()) {
        const own = readings
          .filter((r) => r.meterId === meterId)
          .sort((a, b) => a.at.getTime() - b.at.getTime());
        for (const r of own) {
          const at = r.at.getTime();
          if (at >= range.from.getTime() && at < range.to.getTime()) yield r;
        }
      }
    },
  };
}

function range(minutes: number): TimeRange {
  return { from: FROM, to: new Date(FROM.getTime() + minutes * 60_000) };
}

test("a bucket is at least a minute and a whole number of minutes", () => {
  assert.equal(bucketWidthMs(60 * 60_000, 360), MIN_BUCKET_MS);
  // 24 h across 360 buckets needs 4 minutes, and gets exactly that.
  assert.equal(bucketWidthMs(24 * 60 * 60_000, 360), 4 * MIN_BUCKET_MS);
  // A window short enough to need less than a minute still gets a minute.
  assert.equal(bucketWidthMs(10 * 60_000, 360), MIN_BUCKET_MS);
});

test("power is averaged across the bucket and energy takes its last value", async () => {
  const view = await meterSeries({
    registry,
    repository: repository([
      reading("s01m1", 0, 10, 100),
      reading("s01m1", 20_000, 20, 101),
      reading("s01m1", 40_000, 30, 102),
      reading("s01m1", 60_000, 50, 103),
    ]),
    meterIds: ["s01m1" as MeterId],
    range: range(2),
  });

  assert.equal(view.bucketMs, MIN_BUCKET_MS);
  const points = view.series[0]?.points ?? [];
  assert.equal(points.length, 2);
  assert.equal(points[0]?.activePowerKw, 20, "mean of 10, 20 and 30");
  assert.equal(points[0]?.energyKwh, 102, "the counter as it last stood");
  assert.equal(points[1]?.activePowerKw, 50);
  assert.equal(points[1]?.energyKwh, 103);
});

test("a bucket with no readings is a gap, not a zero", async () => {
  // A meter that stops reporting has not started consuming nothing, and a line
  // drawn down to zero would say it had.
  const view = await meterSeries({
    registry,
    repository: repository([
      reading("s01m1", 0, 12, 100),
      reading("s01m1", 3 * 60_000, 14, 101),
    ]),
    meterIds: ["s01m1" as MeterId],
    range: range(4),
  });

  const points = view.series[0]?.points ?? [];
  assert.deepEqual(
    points.map((p) => p.activePowerKw),
    [12, null, null, 14],
  );
  assert.deepEqual(
    points.map((p) => p.energyKwh),
    [100, null, null, 101],
  );
});

test("energy is the counter itself, so a meter reset steps down rather than being smoothed away", async () => {
  const view = await meterSeries({
    registry,
    repository: repository([
      reading("s01m1", 0, 10, 900),
      reading("s01m1", 60_000, 10, 901),
      reading("s01m1", 120_000, 10, 2),
    ]),
    meterIds: ["s01m1" as MeterId],
    range: range(3),
  });

  assert.deepEqual(
    (view.series[0]?.points ?? []).map((p) => p.energyKwh),
    [900, 901, 2],
  );
});

test("series come back in the order asked for, with a meter that never reported kept", async () => {
  const view = await meterSeries({
    registry,
    repository: repository([reading("s01m2", 0, 5, 10)]),
    meterIds: ["s01m2" as MeterId, "s01m1" as MeterId],
    range: range(2),
  });

  assert.deepEqual(
    view.series.map((s) => s.meterId),
    ["s01m2", "s01m1"],
    "order is the caller's, so a colour stays with its meter",
  );
  const empty = view.series[1]?.points ?? [];
  assert.equal(empty.length, 2);
  assert.ok(empty.every((p) => p.activePowerKw === null && p.energyKwh === null));
});

test("carries the label columns, so the legend names machines rather than ids", async () => {
  const view = await meterSeries({
    registry,
    repository: repository([]),
    meterIds: ["s01m1" as MeterId],
    range: range(2),
  });

  const first = view.series[0];
  assert.equal(first?.meterNumber, "01-1");
  assert.equal(first?.machineNumber, "STL003");
  assert.equal(first?.machineName, "ปั้มเหล็ก 300 Ton");
});

test("a reading outside the window cannot write past the end of the series", async () => {
  // The port's contract is half-open [from, to); this asserts the use case does
  // not corrupt itself if an adapter is loose with it.
  const loose: ReadingRepository = {
    async *readingsInRange() {
      yield reading("s01m1", -60_000, 99, 1);
      yield reading("s01m1", 10 * 60_000, 99, 2);
      yield reading("s01m1", 30_000, 7, 3);
    },
  };

  const view = await meterSeries({
    registry,
    repository: loose,
    meterIds: ["s01m1" as MeterId],
    range: range(2),
  });

  assert.deepEqual(
    (view.series[0]?.points ?? []).map((p) => p.activePowerKw),
    [7, null],
  );
});

test("an empty or inverted range is refused rather than silently drawn", async () => {
  await assert.rejects(
    () =>
      meterSeries({
        registry,
        repository: repository([]),
        meterIds: [],
        range: { from: FROM, to: FROM },
      }),
    RangeError,
  );
});

test("24 hours of real-rate readings collapses to a drawable number of points", async () => {
  const readings: Reading[] = [];
  for (let t = 0; t < 24 * 60 * 60_000; t += 9_000) {
    readings.push(reading("s01m1", t, 40, 1000 + t / 3_600_000));
  }

  const view = await meterSeries({
    registry,
    repository: repository(readings),
    meterIds: ["s01m1" as MeterId],
    range: range(24 * 60),
  });

  assert.equal(view.bucketMs, 4 * MIN_BUCKET_MS);
  assert.equal(view.series[0]?.points.length, 360);
  assert.ok((view.series[0]?.points ?? []).every((p) => p.activePowerKw === 40));
});

test("consumption is the counter's rise, and a reset is not negative consumption", () => {
  assert.deepEqual(consumptionFrom([100, 101, 104, 110]), [0, 1, 4, 10]);
  // The counter is replaced mid-window and restarts near zero. What the old
  // meter used between its last report and its removal cannot be recovered;
  // what the new one has counted since is the honest remainder.
  assert.deepEqual(consumptionFrom([900, 902, 3, 5]), [0, 2, 5, 7]);
  assert.ok(consumptionFrom([900, 902, 3, 5]).every((v) => (v ?? 0) >= 0));
});

test("consumption holds flat across a gap and is null before the first reading", () => {
  assert.deepEqual(consumptionFrom([null, null, 50, 52, null, 55]), [
    null,
    null,
    0,
    2,
    2,
    5,
  ]);
  assert.deepEqual(consumptionFrom([null, null]), [null, null]);
  assert.deepEqual(consumptionFrom([]), []);
});

test("each series carries consumption alongside the counter", async () => {
  const view = await meterSeries({
    registry,
    repository: repository([
      reading("s01m1", 0, 10, 1000),
      reading("s01m1", 60_000, 10, 1001.5),
      reading("s01m1", 120_000, 10, 1003),
    ]),
    meterIds: ["s01m1" as MeterId],
    range: range(3),
  });

  const points = view.series[0]?.points ?? [];
  assert.deepEqual(
    points.map((p) => p.energyKwh),
    [1000, 1001.5, 1003],
  );
  assert.deepEqual(
    points.map((p) => p.energyConsumedKwh),
    [0, 1.5, 3],
    "the same window, read as the rise rather than as the counter",
  );
});
