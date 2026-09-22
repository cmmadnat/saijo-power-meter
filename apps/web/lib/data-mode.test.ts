import assert from "node:assert/strict";
import { test } from "node:test";
import { unconfirmedScales } from "@power-meter/infrastructure";
import { assertSafeToServe, provenanceOf, readDataMode } from "./data-mode.ts";

const LIVE = { DATA_MODE: "live", INGESTER_URL: "https://power-meter-ingester-x.a.run.app" };

test("DATA_MODE unset is demo, and so is empty", () => {
  assert.deepEqual(readDataMode({}), { mode: "demo" });
  assert.deepEqual(readDataMode({ DATA_MODE: "" }), { mode: "demo" });
  assert.deepEqual(readDataMode({ DATA_MODE: "demo" }), { mode: "demo" });
});

test("a value that is neither mode is refused rather than guessed at", () => {
  assert.throws(() => readDataMode({ DATA_MODE: "Live" }), /"live" or "demo"/);
  assert.throws(() => readDataMode({ DATA_MODE: "production" }), /"live" or "demo"/);
});

test("live mode needs the ingester's address", () => {
  assert.throws(() => readDataMode({ DATA_MODE: "live" }), /INGESTER_URL/);
});

test("live mode with the two assumed scales refuses to start, naming both", () => {
  // The real table, not a stand-in: this is the state the repository is in.
  assert.deepEqual([...unconfirmedScales()].sort(), ["activePower", "energy"]);
  const config = readDataMode(LIVE);
  assert.throws(() => assertSafeToServe(config), (error: Error) => {
    assert.match(error.message, /activePower/);
    assert.match(error.message, /energy/);
    assert.match(error.message, /DATA_MODE=live/);
    return true;
  });
});

test("the exemption is the replay harness, and needs both halves", () => {
  const harness = readDataMode({ DATA_MODE: "live", INGESTER_URL: "http://127.0.0.1:8099", WAREHOUSE: "file" });
  assert.equal(harness.mode === "live" && harness.replay, true);
  assert.doesNotThrow(() => assertSafeToServe(harness));

  // A loopback ingester in front of BigQuery is refused: the warehouse is what
  // would show a real, wrongly-scaled number.
  const loopbackBigQuery = readDataMode({ DATA_MODE: "live", INGESTER_URL: "http://127.0.0.1:8099" });
  assert.throws(() => assertSafeToServe(loopbackBigQuery), /activePower, energy/);

  // And a file warehouse behind a real ingester is refused too.
  const remoteFile = readDataMode({ ...LIVE, WAREHOUSE: "file" });
  assert.throws(() => assertSafeToServe(remoteFile), /activePower, energy/);
});

test("once the divisors are confirmed, live mode starts", () => {
  assert.doesNotThrow(() => assertSafeToServe(readDataMode(LIVE), []));
});

test("demo and replay carry a badge; live carries none", () => {
  assert.equal(provenanceOf({ mode: "demo" }).badge, "Demo data");
  const harness = readDataMode({ DATA_MODE: "live", INGESTER_URL: "http://localhost:8099", WAREHOUSE: "file" });
  assert.equal(provenanceOf(harness).badge, "Local replay");
  assert.equal(provenanceOf(readDataMode(LIVE)).badge, null);
});
