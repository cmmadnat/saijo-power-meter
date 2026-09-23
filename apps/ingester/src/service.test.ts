/**
 * The service's reactions, driven by a fake broker.
 *
 * The one that matters is the takeover. The plan asks for duplicate ingestion
 * to be *impossible rather than unlikely*, and the argument has three parts:
 * Cloud Run pins the service to one instance, the client id is fixed so a
 * broker evicts the older session, and — asserted here — an evicted instance
 * shuts down instead of reconnecting and evicting its rival back. Without the
 * third the other two produce a pair of ingesters flapping every few seconds,
 * both writing, which is what the local harness shows when it runs on a broker
 * too old to say why it disconnected anyone.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReadingBatch, ReadingWriter } from "@power-meter/application";
import { MeterRegistry, type Reading } from "@power-meter/domain";
import { generateFixtures, toStationPayload } from "@power-meter/infrastructure/fixtures";
import { subscribeOptions, type Broker, type BrokerHandlers } from "./broker.ts";
import type { Config } from "./config.ts";
import { startService } from "./service.ts";

const REGISTRY = MeterRegistry.fromWorkbook();

class FakeBroker implements Broker {
  handlers: BrokerHandlers | undefined;
  closed = false;

  connect(handlers: BrokerHandlers): void {
    this.handlers = handlers;
    handlers.onConnect({ sessionPresent: false });
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  deliver(topic: string, at: Date): void {
    const fixtures = generateFixtures({
      registry: REGISTRY,
      from: at,
      to: new Date(at.getTime() + 9_000),
      intervalMs: 9_000,
    });
    const meters = new Set(
      REGISTRY.forTopic(topic).map((meter) => meter.meterId as string),
    );
    const readings = fixtures.readings.filter((reading) => meters.has(reading.meterId));
    this.handlers?.onMessage({
      topic,
      payload: new TextEncoder().encode(
        JSON.stringify(toStationPayload(readings, { registry: REGISTRY })),
      ),
      at,
    });
  }
}

class CountingWriter implements ReadingWriter {
  appended = 0;
  latestWrites = 0;

  async append(batch: ReadingBatch): Promise<void> {
    this.appended += batch.readings.length;
  }

  async replaceLatest(_readings: readonly Reading[]): Promise<void> {
    this.latestWrites += 1;
  }
}

const config: Config = {
  brokerUrl: "mqtt://127.0.0.1:1883",
  username: undefined,
  password: undefined,
  clientId: "power-meter-ingester",
  protocolVersion: 5,
  // Long enough that no timer fires during a test: every flush here is asked
  // for explicitly, so what is asserted is the rule and not the schedule.
  flushIntervalMs: 3_600_000,
  latestFlushIntervalMs: 3_600_000,
  warehouse: "memory",
  warehouseDir: ".ingester",
  projectId: undefined,
  dataset: "power_meter",
  location: "asia-southeast1",
  port: 0,
};

async function service(broker: FakeBroker, writer: ReadingWriter) {
  return startService({ config, broker, writer, serve: false });
}

describe("the service", () => {
  it("shuts down when the broker says the session was taken over", async () => {
    const broker = new FakeBroker();
    const writer = new CountingWriter();
    const started = await service(broker, writer);

    broker.deliver("PMeterStation01", new Date("2026-09-22T03:00:00Z"));
    assert.equal(started.ready(), true);

    broker.handlers?.onTakeover("another client connected with the id");
    const reason = await started.stopped;

    assert.match(reason, /taken over|another client/i);
    assert.equal(broker.closed, true, "the connection is dropped, not retried");
    assert.equal(started.ready(), false);
    assert.equal(writer.appended, 5, "and the buffer is written on the way out");
  });

  it("keeps ingesting across a reconnect, buffer intact", async () => {
    const broker = new FakeBroker();
    const writer = new CountingWriter();
    const started = await service(broker, writer);

    broker.deliver("PMeterStation01", new Date("2026-09-22T03:00:00Z"));
    broker.handlers?.onDisconnect("connection closed");
    assert.equal(started.ready(), false, "not ready while disconnected");

    // Nothing was flushed in between: the readings taken before the drop are
    // still in the buffer and go out with the ones taken after it.
    broker.connect(broker.handlers as BrokerHandlers);
    broker.deliver("PMeterStation02", new Date("2026-09-22T03:00:09Z"));
    assert.equal(started.ready(), true);

    await started.stop("test over");
    assert.equal(writer.appended, 10, "five meters on each of two stations");
  });

  it("writes the last buffer and the latest table on shutdown", async () => {
    const broker = new FakeBroker();
    const writer = new CountingWriter();
    const started = await service(broker, writer);

    broker.deliver("PMeterStation03", new Date("2026-09-22T03:00:00Z"));
    await started.stop("SIGTERM");

    assert.equal(writer.appended, 8, "station 03 is fully commissioned");
    assert.equal(writer.latestWrites, 1);
  });

  it("stops only once however many reasons arrive", async () => {
    const broker = new FakeBroker();
    const writer = new CountingWriter();
    const started = await service(broker, writer);

    broker.deliver("PMeterStation01", new Date("2026-09-22T03:00:00Z"));
    await Promise.all([
      started.stop("SIGTERM"),
      started.stop("SIGINT"),
      started.stop("takeover"),
    ]);

    assert.equal(writer.latestWrites, 1, "one final flush, not three");
    assert.equal(writer.appended, 5);
  });
});

describe("subscribing", () => {
  it("does not let the broker replay retained messages at subscribe time", () => {
    // The 2026-09-22 capture arrived as nine retained frames within 193 ms of
    // subscribing. Replayed after an outage they would be written as readings
    // taken now — the ingester stamps reception time, because the protocol
    // carries none — so the minute they land in would count fifty-five
    // readings that are not observations.
    assert.deepEqual(subscribeOptions(5), { qos: 1, rh: 2 });
  });

  it("asks for nothing MQTT 3.1.1 cannot give", () => {
    // Retain handling is an MQTT 5 subscription option. The replay harness runs
    // on 3.1.1 and publishes nothing retained, so there is nothing to suppress.
    assert.deepEqual(subscribeOptions(4), { qos: 1 });
  });
});
