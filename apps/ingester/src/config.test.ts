/**
 * The gate, mostly.
 *
 * `assertSafeToStart` is the only thing standing between an unanswered
 * customer question and fourteen days of silently mis-scaled readings, so what
 * it refuses and what it lets through are both worth asserting by name. If a
 * later change makes one of these pass where it used to fail, that is the
 * change to look at.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { unconfirmedScales } from "@power-meter/infrastructure";
import {
  assertSafeToStart,
  isLoopbackBroker,
  readConfig,
  type Config,
} from "./config.ts";

function config(overrides: Partial<Config> = {}): Config {
  return {
    brokerUrl: "mqtts://broker.example.com:8883",
    username: "u",
    password: "p",
    clientId: "power-meter-ingester",
    protocolVersion: 5,
    flushIntervalMs: 45_000,
    latestFlushIntervalMs: 30_000,
    warehouse: "bigquery",
    warehouseDir: ".ingester",
    projectId: "saijo-power-meter",
    dataset: "power_meter",
    location: "asia-southeast1",
    port: 8080,
    ...overrides,
  };
}

describe("the startup gate", () => {
  it("has something to refuse: two divisors are still assumed", () => {
    assert.deepEqual([...unconfirmedScales()].sort(), ["activePower", "energy"]);
  });

  it("refuses a real broker while a divisor is a guess, naming the fields", () => {
    assert.throws(
      () => assertSafeToStart(config()),
      (error: Error) => {
        assert.match(error.message, /activePower/);
        assert.match(error.message, /energy/);
        assert.match(error.message, /Refusing to start/);
        return true;
      },
    );
  });

  it("refuses a loopback broker that writes to BigQuery", () => {
    // The thing being protected is the warehouse, not the broker. A replay
    // pointed at the real dataset would leave mis-scaled rows in it.
    assert.throws(() =>
      assertSafeToStart(config({ brokerUrl: "mqtt://localhost:1883" })),
    );
  });

  it("refuses a real broker even with WAREHOUSE=memory", () => {
    assert.throws(() => assertSafeToStart(config({ warehouse: "memory" })));
  });

  it("allows the local replay: loopback broker, no warehouse behind it", () => {
    assertSafeToStart(
      config({ brokerUrl: "mqtt://127.0.0.1:1883", warehouse: "memory" }),
    );
    assertSafeToStart(
      config({ brokerUrl: "mqtt://127.0.0.1:1883", warehouse: "file" }),
    );
  });

  it("does not take a hostname's word for being local", () => {
    assert.equal(isLoopbackBroker("mqtt://localhost.example.com:1883"), false);
    assert.equal(isLoopbackBroker("mqtt://127.0.0.1:1883"), true);
    assert.equal(isLoopbackBroker("mqtt://localhost:1883"), true);
    assert.equal(isLoopbackBroker("not a url"), false);
  });
});

describe("reading the configuration", () => {
  it("needs a broker url and nothing else", () => {
    const parsed = readConfig({ MQTT_URL: "mqtt://localhost:1883" });
    assert.equal(parsed.clientId, "power-meter-ingester");
    assert.equal(parsed.warehouse, "bigquery");
    assert.equal(parsed.dataset, "power_meter");
    assert.equal(parsed.flushIntervalMs, 45_000);
    assert.equal(parsed.latestFlushIntervalMs, 30_000);
    assert.equal(parsed.port, 8080);
    assert.equal(parsed.protocolVersion, 5);
  });

  it("fails without one rather than connecting to nothing", () => {
    assert.throws(() => readConfig({}), /MQTT_URL is required/);
  });

  it("rejects a warehouse mode it does not have", () => {
    assert.throws(
      () => readConfig({ MQTT_URL: "mqtt://localhost:1883", WAREHOUSE: "postgres" }),
      /WAREHOUSE must be/,
    );
  });

  it("rejects an interval that is not a positive number", () => {
    assert.throws(
      () => readConfig({ MQTT_URL: "mqtt://localhost:1883", FLUSH_INTERVAL_MS: "0" }),
      /positive number/,
    );
  });
});
