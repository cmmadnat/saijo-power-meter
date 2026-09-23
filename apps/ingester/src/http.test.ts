/**
 * The HTTP surface, routed without a socket.
 *
 * `handle` is separated from the server for this reason: the interesting part
 * is which status a route returns and what shape the body has, and neither
 * needs a port bound. The one case worth stating twice is that `/healthz` stays
 * 200 while the broker is down — a liveness probe that fails during an outage
 * would have Cloud Run restart the container and throw away the buffer and the
 * hot state on top of it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReadingBatch, ReadingWriter } from "@power-meter/application";
import { MeterRegistry, type Reading } from "@power-meter/domain";
import { generateFixtures, toStationPayload } from "@power-meter/infrastructure/fixtures";
import { handle, type LatestResponse, type RecentResponse } from "./http.ts";
import { Ingester } from "./ingester.ts";

const REGISTRY = MeterRegistry.fromWorkbook();

class NullWriter implements ReadingWriter {
  async append(_batch: ReadingBatch): Promise<void> {}
  async replaceLatest(_readings: readonly Reading[]): Promise<void> {}
}

const FROM = new Date("2026-09-22T03:00:00Z");

function populated(): Ingester {
  const ingester = new Ingester({
    writer: new NullWriter(),
    registry: REGISTRY,
    // A minute after the fixtures, so the rolling window has them in it.
    clock: { now: () => new Date(FROM.getTime() + 60_000) },
  });
  const from = FROM;
  const fixtures = generateFixtures({
    registry: REGISTRY,
    from,
    to: new Date(from.getTime() + 9_000),
    intervalMs: 9_000,
  });
  for (const topic of REGISTRY.topics()) {
    const meters = new Set(
      REGISTRY.forTopic(topic).map((meter) => meter.meterId as string),
    );
    const readings = fixtures.readings.filter((reading) =>
      meters.has(reading.meterId),
    );
    if (readings.length === 0) continue;
    ingester.accept({
      topic,
      payload: new TextEncoder().encode(
        JSON.stringify(toStationPayload(readings, { registry: REGISTRY })),
      ),
      at: from,
    });
  }
  return ingester;
}

const up = { ready: () => true, detail: () => ({ connected: true }) };
const down = { ready: () => false, detail: () => ({ connected: false }) };

describe("the http surface", () => {
  it("serves the whole fleet's newest readings from memory", () => {
    const { status, body } = handle("/latest", populated(), up);
    assert.equal(status, 200);
    const response = body as LatestResponse;
    assert.equal(response.readings.length, 55, "all 55 commissioned meters");
    const [first] = response.readings;
    assert.ok(first);
    assert.match(first.at, /^\d{4}-\d{2}-\d{2}T/, "timestamps cross as ISO strings");
    assert.equal(typeof first.activePowerKw, "number");
    assert.equal(typeof first.voltage.l1, "number");
  });

  it("is not ready until the broker is connected", () => {
    assert.equal(handle("/readyz", populated(), down).status, 503);
    assert.equal(handle("/readyz", populated(), up).status, 200);
  });

  it("stays alive through a broker outage", () => {
    // The process is fine. Restarting it would lose the buffer and the hot
    // state, which is strictly worse than being disconnected.
    assert.equal(handle("/healthz", populated(), down).status, 200);
  });

  it("reports what it has ingested", () => {
    const { status, body } = handle("/stats", populated(), up);
    assert.equal(status, 200);
    const stats = body as { messages: number; readings: number; metersSeen: number };
    assert.equal(stats.messages, 9, "nine stations");
    assert.equal(stats.readings, 55);
    assert.equal(stats.metersSeen, 55);
  });

  it("404s anything else", () => {
    assert.equal(handle("/", populated(), up).status, 404);
    assert.equal(handle("/readings", populated(), up).status, 404);
  });

  it("ignores a query string", () => {
    assert.equal(handle("/latest?since=now", populated(), up).status, 200);
  });

  it("says whether it records and how often the feed publishes", () => {
    const response = handle("/latest", populated(), up).body as LatestResponse;
    assert.equal(response.recording, true);
    // One message per station so far: no interval to report yet.
    assert.equal(response.publishIntervalMs, null);
    const observing = new Ingester({ writer: null, registry: REGISTRY });
    assert.equal((handle("/latest", observing, up).body as LatestResponse).recording, false);
  });

  it("serves the rolling window, narrowed by meter", () => {
    const ingester = populated();
    const all = handle("/recent", ingester, up);
    assert.equal(all.status, 200);
    const body = all.body as RecentResponse;
    assert.equal(body.windowMs, 3_600_000);
    const [first, second] = REGISTRY.commissioned();
    assert.ok(first && second);
    const narrowed = handle(
      `/recent?meters=${first.meterId},${second.meterId}&minutes=5`,
      ingester,
      up,
    ).body as RecentResponse;
    assert.equal(narrowed.windowMs, 300_000);
    assert.equal(narrowed.readings.length, 2, "one publish each, for two meters");
    assert.equal(body.readings.length, 55);
    assert.ok(
      narrowed.readings.every(
        (r) => r.meterId === first.meterId || r.meterId === second.meterId,
      ),
    );
    assert.equal(handle("/recent?minutes=0", ingester, up).status, 400);
    assert.equal(handle("/recent?minutes=soon", ingester, up).status, 400);
  });
});
