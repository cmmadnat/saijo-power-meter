import assert from "node:assert/strict";
import { test } from "node:test";
import { MeterRegistry } from "@power-meter/domain";
import { decodeStationPayload, StationDecoder } from "./decoder.ts";
import { parseStationPayload } from "./payload.ts";
import { SCALES } from "./scaling.ts";

const registry = MeterRegistry.fromWorkbook();
const at = new Date("2025-09-21T03:00:00.000Z");

/** The workbook's sample payload: all 8 slots, byte-identical values. */
function samplePayload(): string {
  const slots = [1, 2, 3, 4, 5, 6, 7, 8].map(
    (n) =>
      `"M${n}VL1":2321,"M${n}VL2":2321,"M${n}VL3":2321,` +
      `"M${n}CL1":1522,"M${n}CL2":1522,"M${n}CL3":1522,` +
      `"M${n}P":4995,"M${n}PF":095,"M${n}E":2324`,
  );
  return `{${slots.join(",")}}`;
}

test("decodes the documented conversion: 2321 -> 232.1 V", () => {
  const result = decodeStationPayload("PMeterStation01", samplePayload(), {
    registry,
    at,
  });
  const first = result.readings[0];
  assert.ok(first);
  assert.equal(first.meterId, "s01m1");
  assert.deepEqual(first.voltage, { l1: 232.1, l2: 232.1, l3: 232.1 });
  assert.equal(first.current.l1, 152.2);
  assert.equal(first.powerFactor, 0.95);
  assert.equal(first.at, at);
});

test("drops the slots with no machine behind them", () => {
  // Station 01 publishes 8 slots; 5 are commissioned. The other 3 are not
  // meters reading zero, they are not meters.
  const result = decodeStationPayload("PMeterStation01", samplePayload(), {
    registry,
    at,
  });
  assert.equal(result.readings.length, 5);
  assert.equal(result.droppedUncommissioned, 3);
  assert.deepEqual(result.issues, []);
  for (const reading of result.readings) {
    assert.ok(registry.find(reading.meterId)?.commissioned);
  }
});

test("an unknown topic yields nothing and says so", () => {
  const result = decodeStationPayload("SomeOtherTopic", "{}", { registry, at });
  assert.deepEqual(result.readings, []);
  assert.equal(result.issues[0]?.kind, "unknown-topic");
});

test("a meter missing a field is skipped whole, not emitted half-populated", () => {
  const payload = parseStationPayload(samplePayload()) as Record<string, number>;
  delete payload["M1CL2"];
  const result = decodeStationPayload("PMeterStation01", payload, {
    registry,
    at,
  });
  assert.equal(result.readings.length, 4);
  assert.ok(!result.readings.some((r) => r.meterId === "s01m1"));
  const issue = result.issues.find((i) => i.meterId === "s01m1");
  assert.equal(issue?.kind, "missing-field");
  assert.equal(issue?.key, "M1CL2");
});

test("one bad meter does not cost the station its other readings", () => {
  const payload = parseStationPayload(samplePayload()) as Record<string, number>;
  payload["M1PF"] = 9500; // whatever this is, it is not a power factor
  const result = decodeStationPayload("PMeterStation01", payload, {
    registry,
    at,
  });
  assert.equal(result.readings.length, 4);
  assert.equal(result.issues[0]?.kind, "out-of-range");
});

test("an implausible voltage is reported as a scaling suspicion", () => {
  const payload = parseStationPayload(samplePayload()) as Record<string, number>;
  payload["M1VL1"] = 2_321_000;
  const result = decodeStationPayload("PMeterStation01", payload, {
    registry,
    at,
  });
  const issue = result.issues.find((i) => i.key === "M1VL1");
  assert.equal(issue?.kind, "out-of-range");
  assert.match(issue?.detail ?? "", /scaling/);
});

test("applies the assumed divisors, and a different one changes the answer", () => {
  const base = decodeStationPayload("PMeterStation01", samplePayload(), {
    registry,
    at,
  });
  assert.equal(base.readings[0]?.activePowerKw, 4995 / SCALES.activePower.divisor);
  assert.equal(base.readings[0]?.energyKwh, 2324 / SCALES.energy.divisor);

  const other = decodeStationPayload("PMeterStation01", samplePayload(), {
    registry,
    at,
    scales: {
      ...SCALES,
      activePower: { ...SCALES.activePower, divisor: 100 },
    },
  });
  assert.equal(other.readings[0]?.activePowerKw, 49.95);
});

test("flags a decreasing energy counter instead of accepting it", () => {
  const decoder = new StationDecoder({ registry });
  const first = decoder.decode("PMeterStation01", samplePayload(), at);
  assert.deepEqual(first.issues, []);

  const payload = parseStationPayload(samplePayload()) as Record<string, number>;
  payload["M1E"] = 12; // counter replaced, restarts near zero
  const second = decoder.decode(
    "PMeterStation01",
    payload,
    new Date(at.getTime() + 9_000),
  );

  const issue = second.issues.find((i) => i.kind === "energy-counter-decreased");
  assert.equal(issue?.meterId, "s01m1");
  // The reading is still emitted: a reset is real data the aggregation has to
  // handle, and discarding it would lose the meter entirely.
  assert.equal(second.readings.length, 5);
  assert.equal(second.readings[0]?.energyKwh, 1.2);
});

test("a counter that only climbs raises nothing", () => {
  const decoder = new StationDecoder({ registry });
  decoder.decode("PMeterStation01", samplePayload(), at);
  const payload = parseStationPayload(samplePayload()) as Record<string, number>;
  payload["M1E"] = 2325;
  const next = decoder.decode(
    "PMeterStation01",
    payload,
    new Date(at.getTime() + 9_000),
  );
  assert.deepEqual(next.issues, []);
});

test("every station's payload decodes to its commissioned count", () => {
  // 55 commissioned slots across 9 stations, and the payload always carries 8.
  let total = 0;
  for (const topic of registry.topics()) {
    const result = decodeStationPayload(topic, samplePayload(), { registry, at });
    assert.deepEqual(result.issues, []);
    assert.equal(
      result.readings.length + result.droppedUncommissioned,
      8,
      `${topic} should account for all 8 slots`,
    );
    total += result.readings.length;
  }
  assert.equal(total, 55);
});
