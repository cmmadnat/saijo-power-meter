import assert from "node:assert/strict";
import { test } from "node:test";
import { MeterRegistry, type MeterId } from "@power-meter/domain";
import {
  labelledRegistry,
  MAX_LABEL_LENGTH,
  MAX_MACHINE_NUMBER_LENGTH,
  normalizeLabel,
  normalizeMeterLabel,
  type MeterLabel,
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

test("groups by topic, verbatim, and drops the workbook's names", () => {
  const labelled = labelledRegistry(workbook, new Map());
  const meter = labelled.find("s08m6" as MeterId);
  assert.equal(meter?.department, "PMeterStation08");
  assert.equal(meter?.machineName, null);
  assert.deepEqual(labelled.departments(), workbook.topics());
});

test("a label is printed whole, and the meter by its key prefix", async () => {
  const labelled = labelledRegistry(
    workbook,
    new Map<MeterId, MeterLabel>([
      ["s08m6" as MeterId, { name: "Press line 2 : STL003", department: null, machineNumber: null }],
      ["s01m1" as MeterId, { name: "Compressor", department: null, machineNumber: null }],
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
    [null, "Press line 2 : STL003", "M6"],
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

test("department and machine number are first-class, and the name stays whole", async () => {
  const labelled = labelledRegistry(
    workbook,
    new Map<MeterId, MeterLabel>([
      // The name contains a colon-code of its own; the typed number wins and the name is not split.
      ["s08m6" as MeterId, { name: "Press : STL003", department: "แผนกปั๊ม", machineNumber: "STL777" }],
      // Department only: the name is empty, the number empty.
      ["s01m1" as MeterId, { name: null, department: "แผนกจัดส่ง", machineNumber: null }],
      // Number only: department falls back to the topic.
      ["s02m1" as MeterId, { name: "Fan", department: null, machineNumber: "F-1" }],
    ]),
  );
  const table = await realtimeTable({
    registry: labelled,
    latest: { latest: async () => new Map() },
    clock: { now: () => new Date("2026-09-23T12:00:00Z") },
  });
  const row = (id: string) => table.rows.find((r) => r.meterId === id);
  assert.deepEqual(
    [row("s08m6")?.department, row("s08m6")?.machineNumber, row("s08m6")?.machineName],
    ["แผนกปั๊ม", "STL777", "Press : STL003"],
  );
  assert.deepEqual(
    [row("s01m1")?.department, row("s01m1")?.machineNumber, row("s01m1")?.machineName],
    ["แผนกจัดส่ง", null, null],
  );
  assert.deepEqual(
    [row("s02m1")?.department, row("s02m1")?.machineNumber],
    ["PMeterStation02", "F-1"],
  );
  // Unlabelled meters still group by topic with no number.
  assert.deepEqual([row("s03m1")?.department, row("s03m1")?.machineNumber], ["PMeterStation03", null]);
});

test("the workbook's own colon-split is unchanged where no number was typed", () => {
  const meter = workbook.all().find((m) => m.machineName?.includes(" : STL003"));
  assert.ok(meter);
  assert.equal(meter.machineNumber, undefined);
});

test("normalizes a whole label field by field", () => {
  assert.equal(normalizeMeterLabel("Compressor")?.name, "Compressor");
  assert.equal(normalizeMeterLabel("Compressor")?.department, null);
  assert.equal(normalizeMeterLabel({ name: " ", department: "", machineNumber: null }), null);
  assert.equal(normalizeMeterLabel(null), null);
  const label = normalizeMeterLabel({ name: "x", machineNumber: "N".repeat(100) });
  assert.equal(label?.machineNumber?.length, MAX_MACHINE_NUMBER_LENGTH);
  assert.equal(normalizeMeterLabel({ department: "  แผนก   ปั๊ม " })?.department, "แผนก ปั๊ม");
});
