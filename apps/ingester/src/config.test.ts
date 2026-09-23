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
  GO_LIVE_CLIENT_ID,
  isLoopbackBroker,
  OBSERVE_CLIENT_ID,
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
    firestoreDatabase: "(default)",
    latestDocument: "ingester/latest",
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

  it("lets observe mode face the real broker: there is no writer behind it", () => {
    assertSafeToStart(config({ warehouse: "none", clientId: OBSERVE_CLIENT_ID }));
  });

  it("refuses observe mode on the writing ingester's client id", () => {
    // It would evict the writer, which exits by design, and the factory would
    // stop being recorded with only an observer left running.
    assert.throws(
      () => assertSafeToStart(config({ warehouse: "none", clientId: GO_LIVE_CLIENT_ID })),
      /WAREHOUSE=none with MQTT_CLIENT_ID=power-meter-ingester/,
    );
  });

  it("refuses a writer on the observer's client id", () => {
    assert.throws(
      () =>
        assertSafeToStart(
          config({ brokerUrl: "mqtt://127.0.0.1:1883", clientId: OBSERVE_CLIENT_ID }),
        ),
      /reserved for observe mode/,
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

  it("gives observe mode its own client id by default", () => {
    const parsed = readConfig({ MQTT_URL: "mqtts://broker.example.com", WAREHOUSE: "none" });
    assert.equal(parsed.warehouse, "none");
    assert.equal(parsed.clientId, "power-meter-observer");
    assert.notEqual(OBSERVE_CLIENT_ID, GO_LIVE_CLIENT_ID);
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
