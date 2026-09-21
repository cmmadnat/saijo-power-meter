import assert from "node:assert/strict";
import { test } from "node:test";
import { MeterRegistry, type Meter, type MeterId, type Reading } from "@power-meter/domain";
import type { Clock, LatestReadingStore } from "./ports.ts";
import { DEFAULT_FRESHNESS, realtimeTable, statusFor } from "./realtime.ts";

const NOW = new Date("2025-09-21T10:00:00.000Z");
const clock: Clock = { now: () => NOW };

function meter(
  overrides: Omit<Partial<Meter>, "meterId"> & { meterId: string },
): Meter {
  return {
    station: 1,
    topic: "PMeterStation01",
    slot: 1,
    keyPrefix: "M1",
    department: "ผลิต โลหะ",
    machineName: "ปั้มเหล็ก 300 Ton : STL003",
    standbyPowerKw: 0.1,
    commissioned: true,
    ...overrides,
    meterId: overrides.meterId as MeterId,
  };
}

function reading(meterId: string, at: Date, activePowerKw: number): Reading {
  return {
    meterId: meterId as MeterId,
    at,
    voltage: { l1: 230.1, l2: 229.8, l3: 230.4 },
    current: { l1: 12.2, l2: 12.1, l3: 12.3 },
    activePowerKw,
    powerFactor: 0.94,
    energyKwh: 1234.5,
  };
}

function store(readings: readonly Reading[]): LatestReadingStore {
  const map = new Map(readings.map((r) => [r.meterId, r]));
  return { latest: async () => map };
}

function ago(ms: number): Date {
  return new Date(NOW.getTime() - ms);
}

test("freshness follows the publish rate", () => {
  assert.equal(statusFor(0), "live");
  assert.equal(statusFor(DEFAULT_FRESHNESS.liveWithinMs), "live");
  assert.equal(statusFor(DEFAULT_FRESHNESS.liveWithinMs + 1), "stale");
  assert.equal(statusFor(DEFAULT_FRESHNESS.staleWithinMs), "stale");
  assert.equal(statusFor(DEFAULT_FRESHNESS.staleWithinMs + 1), "offline");
  assert.equal(statusFor(null), "offline", "never seen is offline, not blank");
});

test("one row per commissioned meter, uncommissioned slots dropped", async () => {
  const registry = MeterRegistry.of([
    meter({ meterId: "s01m1", slot: 1, keyPrefix: "M1" }),
    meter({
      meterId: "s01m2",
      slot: 2,
      keyPrefix: "M2",
      machineName: null,
      department: null,
      commissioned: false,
    }),
  ]);

  const table = await realtimeTable({
    registry,
    latest: store([reading("s01m1", ago(5_000), 42)]),
    clock,
  });

  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0]?.meterId, "s01m1");
  assert.equal(table.at.getTime(), NOW.getTime());
});

test("carries the specification's label columns", async () => {
  const registry = MeterRegistry.of([meter({ meterId: "s01m1" })]);
  const table = await realtimeTable({
    registry,
    latest: store([reading("s01m1", ago(1_000), 42)]),
    clock,
  });

  const row = table.rows[0];
  assert.equal(row?.meterNumber, "01-1");
  assert.equal(row?.department, "ผลิต โลหะ");
  assert.equal(row?.machineNumber, "STL003");
  assert.equal(row?.machineName, "ปั้มเหล็ก 300 Ton");
});

test("a meter that has stopped reporting keeps its numbers and loses its status", async () => {
  const registry = MeterRegistry.of([
    meter({ meterId: "s01m1", slot: 1, keyPrefix: "M1" }),
    meter({ meterId: "s01m2", slot: 2, keyPrefix: "M2" }),
    meter({ meterId: "s01m3", slot: 3, keyPrefix: "M3" }),
    meter({ meterId: "s01m4", slot: 4, keyPrefix: "M4" }),
  ]);

  const table = await realtimeTable({
    registry,
    latest: store([
      reading("s01m1", ago(5_000), 42),
      reading("s01m2", ago(60_000), 42),
      reading("s01m3", ago(3_600_000), 42),
      // s01m4 has never reported at all.
    ]),
    clock,
  });

  const [live, stale, offline, never] = table.rows;
  assert.equal(live?.status, "live");
  assert.equal(stale?.status, "stale");
  assert.equal(offline?.status, "offline");
  assert.equal(offline?.reading?.activePowerKw, 42, "the last reading is still shown");
  assert.equal(never?.status, "offline");
  assert.equal(never?.reading, null);
  assert.equal(never?.ageMs, null);
  assert.deepEqual(table.counts, {
    live: 1,
    stale: 1,
    offline: 2,
    running: 3,
    reporting: 2,
  });
});

test("running is the domain's standby rule, not a hard-coded threshold", async () => {
  const registry = MeterRegistry.of([
    meter({ meterId: "s01m1", slot: 1, keyPrefix: "M1", standbyPowerKw: 0.1 }),
    meter({ meterId: "s01m2", slot: 2, keyPrefix: "M2", standbyPowerKw: 0.1 }),
    meter({ meterId: "s01m3", slot: 3, keyPrefix: "M3", standbyPowerKw: 25 }),
  ]);

  const table = await realtimeTable({
    registry,
    latest: store([
      reading("s01m1", ago(1_000), 0.1),
      reading("s01m2", ago(1_000), 0.2),
      reading("s01m3", ago(1_000), 20),
    ]),
    clock,
  });

  assert.equal(table.rows[0]?.running, false, "at the level is idle, not running");
  assert.equal(table.rows[1]?.running, true);
  assert.equal(table.rows[2]?.running, false, "its own level, not the common 0.1");
});

test("a reading stamped ahead of the clock reads as current, not negative", async () => {
  const registry = MeterRegistry.of([meter({ meterId: "s01m1" })]);
  const table = await realtimeTable({
    registry,
    latest: store([reading("s01m1", new Date(NOW.getTime() + 5_000), 42)]),
    clock,
  });

  assert.equal(table.rows[0]?.ageMs, 0);
  assert.equal(table.rows[0]?.status, "live");
});

test("offers the departments present, sorted and deduplicated", async () => {
  const registry = MeterRegistry.of([
    meter({ meterId: "s01m1", slot: 1, keyPrefix: "M1", department: "ส่วนกลาง" }),
    meter({ meterId: "s01m2", slot: 2, keyPrefix: "M2", department: "ผลิต โลหะ" }),
    meter({ meterId: "s01m3", slot: 3, keyPrefix: "M3", department: "ผลิต โลหะ" }),
  ]);

  const table = await realtimeTable({ registry, latest: store([]), clock });
  assert.deepEqual(table.departments, ["ผลิต โลหะ", "ส่วนกลาง"]);
});

test("the real registry yields all 55 rows", async () => {
  const table = await realtimeTable({
    registry: MeterRegistry.fromWorkbook(),
    latest: store([]),
    clock,
  });
  assert.equal(table.rows.length, 55);
  assert.equal(table.departments.length, 5);
  assert.equal(table.counts.offline, 55);
});

test("total load counts the meters that are still reporting, not the offline ones", async () => {
  const registry = MeterRegistry.of([
    meter({ meterId: "s01m1", slot: 1, keyPrefix: "M1" }),
    meter({ meterId: "s01m2", slot: 2, keyPrefix: "M2" }),
    meter({ meterId: "s01m3", slot: 3, keyPrefix: "M3" }),
  ]);

  const table = await realtimeTable({
    registry,
    latest: store([
      reading("s01m1", new Date(NOW.getTime() - 5_000), 40), // live
      reading("s01m2", new Date(NOW.getTime() - 60_000), 30), // stale
      // Silent for an hour, still drawing 90 kW the last time anyone heard.
      reading("s01m3", new Date(NOW.getTime() - 3_600_000), 90),
    ]),
    clock,
  });

  assert.equal(table.counts.reporting, 2);
  assert.equal(table.counts.offline, 1);
  // The offline meter's 90 kW is history: adding it would overstate "now" by
  // exactly the meter that stopped saying what it was doing.
  assert.equal(table.totalActivePowerKw, 70);
});

test("department loads carry their own census and sum to the fleet total", async () => {
  const registry = MeterRegistry.of([
    meter({ meterId: "s01m1", slot: 1, keyPrefix: "M1", department: "ผลิต โลหะ" }),
    meter({ meterId: "s01m2", slot: 2, keyPrefix: "M2", department: "ผลิต โลหะ" }),
    meter({ meterId: "s01m3", slot: 3, keyPrefix: "M3", department: "ส่วนกลาง" }),
  ]);

  const table = await realtimeTable({
    registry,
    latest: store([
      reading("s01m1", new Date(NOW.getTime() - 5_000), 40),
      reading("s01m2", new Date(NOW.getTime() - 5_000), 0.05), // idle, below standby
      reading("s01m3", new Date(NOW.getTime() - 5_000), 12),
    ]),
    clock,
  });

  assert.deepEqual(table.byDepartment, [
    {
      department: "ผลิต โลหะ",
      meters: 2,
      reporting: 2,
      running: 1,
      activePowerKw: 40.05,
    },
    {
      department: "ส่วนกลาง",
      meters: 1,
      reporting: 1,
      running: 1,
      activePowerKw: 12,
    },
  ]);

  const summed = table.byDepartment.reduce((s, d) => s + d.activePowerKw, 0);
  assert.equal(summed, table.totalActivePowerKw);
});

test("a fleet with nothing reporting is zero load, not an empty summary", async () => {
  const table = await realtimeTable({
    registry: MeterRegistry.fromWorkbook(),
    latest: store([]),
    clock,
  });

  assert.equal(table.totalActivePowerKw, 0);
  assert.equal(table.counts.reporting, 0);
  assert.equal(table.byDepartment.length, 5);
  assert.equal(
    table.byDepartment.reduce((s, d) => s + d.meters, 0),
    55,
  );
});
