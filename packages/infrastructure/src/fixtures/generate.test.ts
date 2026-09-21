import assert from "node:assert/strict";
import { test } from "node:test";
import { MeterRegistry, isRunning, type MeterId, type Reading } from "@power-meter/domain";
import { generateFixtures, toStationPayload } from "./generate.ts";
import { FixtureLatestReadingStore, FixtureReadingRepository } from "./repository.ts";
import { decodeStationPayload } from "../mqtt/decoder.ts";

const registry = MeterRegistry.fromWorkbook();
const from = new Date("2025-09-21T00:00:00.000Z");
const to = new Date("2025-09-21T06:00:00.000Z");

const fixtures = generateFixtures({ registry, from, to });

function readingsFor(meterId: MeterId) {
  return fixtures.readings.filter((r) => r.meterId === meterId);
}

test("covers every commissioned meter and nothing else", () => {
  const seen = new Set(fixtures.readings.map((r) => r.meterId));
  assert.equal(seen.size, 55);
  for (const meterId of seen) {
    assert.ok(registry.find(meterId)?.commissioned, `${meterId} is not commissioned`);
  }
});

test("is deterministic: same seed and window, same readings", () => {
  const again = generateFixtures({ registry, from, to });
  assert.equal(again.readings.length, fixtures.readings.length);
  assert.deepEqual(again.readings[100], fixtures.readings[100]);

  const different = generateFixtures({ registry, from, to, seed: 7 });
  assert.notDeepEqual(different.readings[100], fixtures.readings[100]);
});

test("publishes at the real rate and stays inside the window", () => {
  const running = [...fixtures.profiles].find(([, p]) => p === "running");
  assert.ok(running);
  const series = readingsFor(running[0]);
  assert.equal(series.length, (6 * 3_600_000) / 9_000);
  assert.equal(series[0]?.at.getTime(), from.getTime());
  assert.ok((series.at(-1)?.at.getTime() ?? 0) < to.getTime());
  assert.equal(
    (series[1]?.at.getTime() ?? 0) - (series[0]?.at.getTime() ?? 0),
    9_000,
  );
});

test("carries all four behaviours the screens have to handle", () => {
  const kinds = new Set(fixtures.profiles.values());
  assert.ok(kinds.has("running"));
  assert.ok(kinds.has("cycling"));
  assert.ok(kinds.has("idle"));
  assert.ok(kinds.has("offline"));
});

test("an idle meter never counts as running; a running one always does", () => {
  const pick = (want: string): MeterId => {
    const found = [...fixtures.profiles].find(([, p]) => p === want);
    assert.ok(found, `no ${want} meter in the fixtures`);
    return found[0];
  };

  const idle = pick("idle");
  const idleMeter = registry.find(idle);
  assert.ok(idleMeter);
  assert.ok(
    readingsFor(idle).every((r) => !isRunning(idleMeter, r.activePowerKw)),
  );

  const running = pick("running");
  const runningMeter = registry.find(running);
  assert.ok(runningMeter);
  assert.ok(
    readingsFor(running).every((r) => isRunning(runningMeter, r.activePowerKw)),
  );
});

test("a cycling meter crosses the standby level in both directions", () => {
  const found = [...fixtures.profiles].find(([, p]) => p === "cycling");
  assert.ok(found);
  const meter = registry.find(found[0]);
  assert.ok(meter);
  const states = readingsFor(found[0]).map((r) => isRunning(meter, r.activePowerKw));
  assert.ok(states.includes(true), "never runs");
  assert.ok(states.includes(false), "never stops");
});

test("an offline meter stops reporting partway through", () => {
  const found = [...fixtures.profiles].find(([, p]) => p === "offline");
  assert.ok(found);
  const series = readingsFor(found[0]);
  assert.ok(series.length > 0, "should report before it goes quiet");
  const last = series.at(-1)?.at.getTime() ?? 0;
  assert.ok(last < to.getTime() - 3_600_000, "should be silent for the last hour");
});

test("energy only climbs, except at the one reset", () => {
  const resetFor = fixtures.energyResetFor;
  assert.ok(resetFor);

  for (const [meterId] of fixtures.profiles) {
    const series = readingsFor(meterId);
    const drops = series.filter(
      (r, i) => i > 0 && r.energyKwh < (series[i - 1]?.energyKwh ?? 0),
    );
    if (meterId === resetFor) {
      assert.equal(drops.length, 1, "the reset meter resets exactly once");
    } else {
      assert.equal(drops.length, 0, `${meterId} energy went backwards`);
    }
  }
});

test("a fixture window can be generated without a reset", () => {
  const clean = generateFixtures({ registry, from, to, energyResetFor: null });
  assert.equal(clean.energyResetFor, null);
  const series = clean.readings.filter((r) => r.meterId === fixtures.energyResetFor);
  assert.ok(
    series.every((r, i) => i === 0 || r.energyKwh >= (series[i - 1]?.energyKwh ?? 0)),
  );
});

test("current agrees with the power and voltage beside it", () => {
  // The realtime table shows all three at once; independently invented numbers
  // would look wrong to anyone who checks.
  const reading = fixtures.readings.find((r) => r.activePowerKw > 5);
  assert.ok(reading);
  const implied =
    (3 * reading.voltage.l1 * reading.current.l1 * reading.powerFactor) / 1000;
  assert.ok(
    Math.abs(implied - reading.activePowerKw) < 0.5,
    `implied ${implied} kW vs stated ${reading.activePowerKw} kW`,
  );
});

test("a rejected window fails loudly", () => {
  assert.throws(() => generateFixtures({ registry, from: to, to: from }), RangeError);
  assert.throws(
    () => generateFixtures({ registry, from, to, intervalMs: 0 }),
    RangeError,
  );
});

test("round-trips through the wire format the decoder reads", () => {
  // The fixture encoder and the decoder are inverses at the decoder's own
  // resolution. This is also how step 7's local broker replay gets its data.
  const station = registry.forTopic("PMeterStation03").filter((m) => m.commissioned);
  const first = station.map((m) => {
    const reading = readingsFor(m.meterId)[0];
    assert.ok(reading, `${m.meterId} has no readings`);
    return reading;
  });

  const payload = toStationPayload(first, { registry });
  for (const value of Object.values(payload)) {
    assert.ok(Number.isInteger(value), "the wire format carries integers only");
  }

  const decoded = decodeStationPayload("PMeterStation03", payload, {
    registry,
    at: first[0]!.at,
  });
  assert.deepEqual(decoded.issues, []);
  assert.deepEqual(decoded.readings, first);
});

test("the repository yields a half-open range, meter-major and in time order", () => {
  const repository = new FixtureReadingRepository(fixtures.readings);
  const meterId = [...fixtures.profiles].find(([, p]) => p === "running")![0];
  const range = {
    from: new Date(from.getTime() + 3_600_000),
    to: new Date(from.getTime() + 7_200_000),
  };

  return (async () => {
    const got: Reading[] = [];
    for await (const reading of repository.readingsInRange([meterId], range)) {
      got.push(reading);
    }
    assert.equal(got.length, 3_600_000 / 9_000);
    assert.equal(got[0]?.at.getTime(), range.from.getTime());
    assert.ok((got.at(-1)?.at.getTime() ?? 0) < range.to.getTime());
    assert.ok(got.every((r, i) => i === 0 || r.at >= got[i - 1]!.at));
  })();
});

test("an empty range yields nothing rather than everything", async () => {
  const repository = new FixtureReadingRepository(fixtures.readings);
  const meterId = fixtures.readings[0]!.meterId;
  const got: Reading[] = [];
  for await (const reading of repository.readingsInRange([meterId], {
    from,
    to: from,
  })) {
    got.push(reading);
  }
  assert.deepEqual(got, []);
});

test("the latest store keeps an offline meter's last reading, stale and all", async () => {
  const store = new FixtureLatestReadingStore(fixtures.readings);
  const latest = await store.latest();
  assert.equal(latest.size, 55);

  const offline = [...fixtures.profiles].find(([, p]) => p === "offline")![0];
  const last = readingsFor(offline).at(-1);
  assert.deepEqual(latest.get(offline), last);
  // Staleness is the reading's age; the screen decides what to do about it.
  assert.ok((latest.get(offline)?.at.getTime() ?? 0) < to.getTime() - 3_600_000);
});
