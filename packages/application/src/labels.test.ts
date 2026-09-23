import assert from "node:assert/strict";
import { test } from "node:test";
import { MeterRegistry, type MeterId } from "@power-meter/domain";
import {
  labelledRegistry,
  MAX_LABEL_LENGTH,
  normalizeLabel,
  stationName,
} from "./labels.ts";
import { realtimeTable } from "./realtime.ts";

const workbook = MeterRegistry.fromWorkbook();

test("a labelled registry keeps every meter in its slot", () => {
  const labelled = labelledRegistry(workbook, new Map());
  assert.deepEqual(
    labelled.all().map((m) => [m.meterId, m.topic, m.keyPrefix, m.commissioned]),
    workbook.all().map((m) => [m.meterId, m.topic, m.keyPrefix, m.commissioned]),
  );
});

test("groups by station and drops the workbook's names", () => {
  const labelled = labelledRegistry(workbook, new Map());
  const meter = labelled.find("s08m6" as MeterId);
  assert.equal(meter?.department, "Station 08");
  assert.equal(meter?.machineName, null);
  assert.deepEqual(
    labelled.departments(),
    workbook.topics().map((_, i) => stationName(i + 1)),
  );
});

test("a label becomes the machine name, and a code after it the machine number", async () => {
  const labelled = labelledRegistry(
    workbook,
    new Map([
      ["s08m6" as MeterId, "Press line 2 : STL003"],
      ["s01m1" as MeterId, "Compressor"],
    ]),
  );
  const table = await realtimeTable({
    registry: labelled,
    latest: { latest: async () => new Map() },
    clock: { now: () => new Date("2026-09-23T12:00:00Z") },
  });
  const row = (id: string) => table.rows.find((r) => r.meterId === id);
  assert.deepEqual(
    [row("s08m6")?.machineNumber, row("s08m6")?.machineName, row("s08m6")?.meterNumber],
    ["STL003", "Press line 2", "08-6"],
  );
  assert.deepEqual([row("s01m1")?.machineNumber, row("s01m1")?.machineName], [null, "Compressor"]);
  assert.equal(row("s02m1")?.machineName, null);
});

test("normalizes what was typed", () => {
  assert.equal(normalizeLabel("  Press   line\t2 "), "Press line 2");
  assert.equal(normalizeLabel("a\u0000b"), "a b");
  assert.equal(normalizeLabel("   "), null);
  assert.equal(normalizeLabel(null), null);
  assert.equal(normalizeLabel(undefined), null);
  assert.equal(normalizeLabel("ปั้มเหล็ก 300 Ton"), "ปั้มเหล็ก 300 Ton");
  assert.equal(normalizeLabel("x".repeat(200))?.length, MAX_LABEL_LENGTH);
});
