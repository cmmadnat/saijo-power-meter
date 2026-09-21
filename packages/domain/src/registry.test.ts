import assert from "node:assert/strict";
import { test } from "node:test";
import { MeterRegistry } from "./registry.ts";
import { isRunning, meterId, type Meter } from "./meter.ts";

const registry = MeterRegistry.fromWorkbook();

test("carries every slot the protocol publishes", () => {
  // 9 stations x 8 slots. Payloads always carry all 8, so the registry has to
  // know about the empty ones in order to drop them.
  assert.equal(registry.all().length, 72);
  assert.equal(registry.topics().length, 9);
});

test("distinguishes commissioned slots from empty ones", () => {
  assert.equal(registry.commissioned().length, 55);
  assert.equal(registry.all().length - registry.commissioned().length, 17);
  for (const meter of registry.commissioned()) {
    assert.ok(meter.machineName, `${meter.meterId} is commissioned but unnamed`);
  }
});

test("every meter id is unique and derivable from topic and slot", () => {
  const ids = new Set(registry.all().map((m) => m.meterId));
  assert.equal(ids.size, 72);
  for (const meter of registry.all()) {
    assert.equal(meter.meterId, meterId(meter.station, meter.slot));
    assert.equal(meter.keyPrefix, `M${meter.slot}`);
  }
});

test("groups meters by the topic they arrive on", () => {
  const first = registry.forTopic("PMeterStation01");
  assert.equal(first.length, 8);
  assert.deepEqual(
    first.map((m) => m.slot),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.deepEqual(registry.forTopic("NoSuchStation"), []);
});

test("an unknown topic yields nothing rather than throwing", () => {
  assert.deepEqual(registry.forTopic(""), []);
});

test("exposes the five departments the History filter offers", () => {
  assert.equal(registry.departments().length, 5);
  assert.ok(registry.departments().includes("ผลิต โลหะ"));
});

test("every commissioned meter carries a standby level", () => {
  for (const meter of registry.commissioned()) {
    assert.equal(meter.standbyPowerKw, 0.1);
  }
});

test("running is decided strictly above the standby level", () => {
  const meter = registry.commissioned()[0] as Meter;
  assert.equal(isRunning(meter, 0.05), false);
  assert.equal(isRunning(meter, 0.1), false, "at the level is idle, not running");
  assert.equal(isRunning(meter, 0.11), true);
});

test("meterId rejects values the protocol cannot produce", () => {
  assert.throws(() => meterId(0, 1), RangeError);
  assert.throws(() => meterId(1, 9), RangeError);
  assert.throws(() => meterId(1.5, 1), RangeError);
});
