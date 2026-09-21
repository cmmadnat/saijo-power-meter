import assert from "node:assert/strict";
import { test } from "node:test";
import { MeterRegistry } from "./registry.ts";
import { machineLabel, meterNumber, type Meter, type MeterId } from "./meter.ts";

const registry = MeterRegistry.fromWorkbook();

function meter(machineName: string | null): Meter {
  return {
    meterId: "s01m1" as MeterId,
    station: 1,
    topic: "PMeterStation01",
    slot: 1,
    keyPrefix: "M1",
    department: "ผลิต โลหะ",
    machineName,
    standbyPowerKw: 0.1,
    commissioned: machineName !== null,
  };
}

test("splits a code off the end of the machine name", () => {
  assert.deepEqual(machineLabel(meter("ปั้มเหล็ก 300 Ton : STL003")), {
    number: "STL003",
    name: "ปั้มเหล็ก 300 Ton",
  });
  assert.deepEqual(machineLabel(meter("เครื่องฉีดพลาสติก : 014")), {
    number: "014",
    name: "เครื่องฉีดพลาสติก",
  });
});

test("leaves a name with no code intact", () => {
  assert.deepEqual(machineLabel(meter("ไลน์พ่นสี")), {
    number: null,
    name: "ไลน์พ่นสี",
  });
  assert.deepEqual(machineLabel(meter("Leak Test Helium")), {
    number: null,
    name: "Leak Test Helium",
  });
});

test("a department after the colon is not a machine number", () => {
  // Three MDB panels carry `ตู้ไฟฟ้า MDB3 : แผนกจัดส่ง`. Splitting on the colon
  // alone would file a department name as a machine code.
  assert.deepEqual(machineLabel(meter("ตู้ไฟฟ้า MDB3 : แผนกจัดส่ง")), {
    number: null,
    name: "ตู้ไฟฟ้า MDB3 : แผนกจัดส่ง",
  });
});

test("an uncommissioned slot has neither", () => {
  assert.deepEqual(machineLabel(meter(null)), { number: null, name: null });
});

test("every commissioned meter yields a name, and most yield a number", () => {
  const labels = registry.commissioned().map(machineLabel);
  assert.ok(labels.every((l) => l.name !== null && l.name.length > 0));
  // 27 of 55 today: 25 names carry no colon at all and three MDB panels carry
  // a department after theirs. Asserted exactly so a workbook revision that
  // changes the naming convention is visible rather than silently reshaping a
  // column.
  assert.equal(labels.filter((l) => l.number !== null).length, 27);
});

test("meter number is the workbook's station and meter id", () => {
  assert.equal(meterNumber(meter("x")), "01-1");
  const last = registry.all().at(-1) as Meter;
  assert.equal(meterNumber(last), "09-8");
});
