import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MeterRegistry,
  type Meter,
  type MeterId,
  type Reading,
} from "@power-meter/domain";
import type { ReadingRepository, TimeRange } from "./ports.ts";
import {
  DEFAULT_MAX_RUN_GAP_MS,
  formatRunningHours,
  historyTable,
} from "./history.ts";

const FROM = new Date("2025-09-21T01:00:00.000Z");
const TO = new Date("2025-09-21T02:00:00.000Z");
const MINUTE = 60_000;

function meter(
  id: string,
  slot: number,
  machineName: string | null,
  department = "ผลิต โลหะ",
): Meter {
  return {
    meterId: id as MeterId,
    station: 1,
    topic: "PMeterStation01",
    slot,
    keyPrefix: `M${slot}`,
    department,
    machineName,
    standbyPowerKw: 0.1,
    commissioned: machineName !== null,
  };
}

const registry = MeterRegistry.of([
  meter("s01m1", 1, "ปั้มเหล็ก 300 Ton : STL003"),
  meter("s01m2", 2, "เครื่องฉีดพลาสติก : 006", "ผลิต พลาสติก"),
  meter("s01m3", 3, null),
]);

function reading(
  meterId: string,
  offsetMinutes: number,
  activePowerKw: number,
  energyKwh: number,
): Reading {
  return {
    meterId: meterId as MeterId,
    at: new Date(FROM.getTime() + offsetMinutes * MINUTE),
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

const range: TimeRange = { from: FROM, to: TO };

test("total energy is the counter's rise, and running time the minutes above standby", async () => {
  // Minute-apart readings: running for the first two gaps, idle for the third,
  // running again for the fourth. Counter climbs 1 kWh per running minute.
  const table = await historyTable({
    registry,
    repository: repository([
      reading("s01m1", 0, 40, 1_000),
      reading("s01m1", 1, 40, 1_001),
      reading("s01m1", 2, 0.05, 1_002),
      reading("s01m1", 3, 0.05, 1_002),
      reading("s01m1", 4, 40, 1_002),
      reading("s01m1", 5, 40, 1_003),
    ]),
    range,
    department: "ผลิต โลหะ",
  });

  const row = table.rows.find((r) => r.meterId === "s01m1");
  assert.ok(row);
  assert.equal(row.totalEnergyKwh, 3); // 1 003 − 1 000, by the same walk the chart plots
  // Gaps 0→1, 1→2 and 4→5 start above standby; 2→3 and 3→4 do not.
  assert.equal(row.runningMs, 3 * MINUTE);
  assert.equal(formatRunningHours(row.runningMs), "0:03");
  assert.equal(row.readingCount, 6);
});

test("a counter reset inside the window does not produce a negative total", async () => {
  const table = await historyTable({
    registry,
    repository: repository([
      reading("s01m1", 0, 40, 9_998),
      reading("s01m1", 1, 40, 9_999),
      // The meter is replaced: its successor starts near zero.
      reading("s01m1", 2, 40, 2),
      reading("s01m1", 3, 40, 4),
    ]),
    range,
  });

  const row = table.rows.find((r) => r.meterId === "s01m1");
  assert.ok(row);
  // 1 before the reset, the new meter's own 2 at the reset, then 2 more.
  assert.equal(row.totalEnergyKwh, 5);
  assert.ok(row.totalEnergyKwh !== null && row.totalEnergyKwh >= 0);
});

test("a meter that reported nothing keeps its row, with no values", async () => {
  const table = await historyTable({
    registry,
    repository: repository([]),
    range,
  });

  assert.equal(table.rows.length, 2); // both commissioned meters, the dead slot excluded
  assert.equal(table.silentCount, 2);
  for (const row of table.rows) {
    assert.equal(row.totalEnergyKwh, null);
    assert.equal(row.runningMs, null);
    assert.equal(row.readingCount, 0);
    assert.equal(formatRunningHours(row.runningMs), "—");
  }
});

test("a single reading is zero consumption and zero running time, not null", async () => {
  const table = await historyTable({
    registry,
    repository: repository([reading("s01m1", 30, 40, 5_000)]),
    range,
  });

  const row = table.rows.find((r) => r.meterId === "s01m1");
  assert.ok(row);
  // One reading says what the counter stood at, and nothing about a rise.
  assert.equal(row.totalEnergyKwh, 0);
  assert.equal(row.runningMs, 0);
  assert.equal(table.silentCount, 1); // the other meter
});

test("a gap longer than the cap contributes no running time", async () => {
  const gapMinutes = DEFAULT_MAX_RUN_GAP_MS / MINUTE + 5;
  const table = await historyTable({
    registry,
    repository: repository([
      reading("s01m1", 0, 40, 100),
      // Silent across the cap while running, then back: the unobserved stretch
      // is not credited, so the row is short rather than invented.
      reading("s01m1", gapMinutes, 40, 140),
      reading("s01m1", gapMinutes + 1, 40, 141),
    ]),
    range,
  });

  const row = table.rows.find((r) => r.meterId === "s01m1");
  assert.ok(row);
  assert.equal(row.runningMs, 1 * MINUTE);
  // The energy the meter accumulated while silent is still real: the counter
  // carries it, so the total includes it even though the time does not.
  assert.equal(row.totalEnergyKwh, 41);
});

test("the department filter picks the rows, and null takes them all", async () => {
  const readings = [reading("s01m1", 0, 40, 1), reading("s01m2", 0, 40, 1)];

  const filtered = await historyTable({
    registry,
    repository: repository(readings),
    range,
    department: "ผลิต พลาสติก",
  });
  assert.deepEqual(
    filtered.rows.map((r) => r.meterId),
    ["s01m2"],
  );
  assert.equal(filtered.department, "ผลิต พลาสติก");

  const all = await historyTable({
    registry,
    repository: repository(readings),
    range,
    department: null,
  });
  assert.deepEqual(
    all.rows.map((r) => r.meterId),
    ["s01m1", "s01m2"],
  );
});

test("the range is half-open: a reading at `to` belongs to the next window", async () => {
  const table = await historyTable({
    registry,
    repository: repository([
      reading("s01m1", 0, 40, 10),
      reading("s01m1", 59, 40, 20),
      reading("s01m1", 60, 40, 99), // exactly `to`
    ]),
    range,
  });

  const row = table.rows.find((r) => r.meterId === "s01m1");
  assert.ok(row);
  assert.equal(row.readingCount, 2);
  assert.equal(row.totalEnergyKwh, 10);
});

test("an empty or inverted range is rejected rather than quietly empty", async () => {
  await assert.rejects(
    () =>
      historyTable({
        registry,
        repository: repository([]),
        range: { from: TO, to: FROM },
      }),
    RangeError,
  );
  await assert.rejects(
    () =>
      historyTable({
        registry,
        repository: repository([]),
        range: { from: FROM, to: FROM },
      }),
    RangeError,
  );
});

test("running hours print as Hr:min, and past 24 hours they keep counting", () => {
  assert.equal(formatRunningHours(0), "0:00");
  assert.equal(formatRunningHours(7 * 3_600_000 + 42 * MINUTE), "7:42");
  assert.equal(formatRunningHours(26 * 3_600_000 + 5 * MINUTE), "26:05");
  assert.equal(formatRunningHours(null), "—");
});
