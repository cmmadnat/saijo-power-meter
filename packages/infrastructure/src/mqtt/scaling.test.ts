import assert from "node:assert/strict";
import { test } from "node:test";
import { SCALES, unconfirmedScales } from "./scaling.ts";

// These tests exist to fail. Two of the nine conversions are guesses, and the
// point of asserting them is that changing one - which is what happens the day
// the customer sends a real payload - is loud rather than silent.

test("voltage is the one documented conversion: 2325 -> 232.5 V", () => {
  assert.equal(SCALES.voltage.divisor, 10);
  assert.equal(2325 / SCALES.voltage.divisor, 232.5);
  assert.equal(SCALES.voltage.confidence, "documented");
});

test("current is raw/10, the only value the physics allows", () => {
  // 3 x 232.1 V x 152.2 A x 0.95 is 100.7 kW, right for a 300-500 t press.
  assert.equal(SCALES.current.divisor, 10);
  assert.equal(1522 / SCALES.current.divisor, 152.2);
  const impliedKw = (3 * 232.1 * (1522 / SCALES.current.divisor) * 0.95) / 1000;
  assert.ok(impliedKw > 90 && impliedKw < 110, `implied ${impliedKw} kW`);
});

test("power factor is raw/100, landing 095 at 0.95", () => {
  assert.equal(SCALES.powerFactor.divisor, 100);
  assert.equal(95 / SCALES.powerFactor.divisor, 0.95);
});

test("active power and energy are still the customer's to answer", () => {
  // If this list ever shrinks without docs/requirements/power-meter-mqtt.md
  // changing too, someone has quietly decided one of the open questions.
  assert.deepEqual([...unconfirmedScales()], ["activePower", "energy"]);
  assert.equal(SCALES.activePower.confidence, "assumed");
  assert.equal(SCALES.energy.confidence, "assumed");
});

test("the assumed divisors are the ones the decoder is currently applying", () => {
  // Stated explicitly so a change to either shows up in a diff as a changed
  // expectation, not only as a changed constant.
  assert.equal(SCALES.activePower.divisor, 10);
  assert.equal(SCALES.energy.divisor, 10);
  assert.equal(SCALES.activePower.unit, "kW");
  assert.equal(SCALES.energy.unit, "kWh");
});

test("every unconfirmed factor says so in its basis", () => {
  for (const field of unconfirmedScales()) {
    assert.match(SCALES[field].basis, /UNANSWERED/);
  }
});
