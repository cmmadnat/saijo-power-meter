/**
 * What these tests are actually for.
 *
 * The ingester's failure modes are all silent ones: a minute rolled up twice,
 * a reading written twice, a buffer that grows without bound, a hot state that
 * keeps a stale reading because a queued message arrived late. None of them
 * raises anything, and none of them is visible on a screen until a total looks
 * wrong weeks later. So each one has a test that asserts the *number*, not that
 * the code ran.
 *
 * Everything is driven through `toStationPayload`, the decoder's exact inverse,
 * so what goes in is byte-shaped like a station message and what comes out is
 * checked against the fixtures that produced it.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  Clock,
  ReadingBatch,
  ReadingWriter,
  LatestReadingStore,
} from "@power-meter/application";
import { MeterRegistry, type MeterId, type Reading } from "@power-meter/domain";
import { generateFixtures, toStationPayload } from "@power-meter/infrastructure";
import type { BrokerMessage } from "./broker.ts";
import { Ingester } from "./ingester.ts";

const REGISTRY = MeterRegistry.fromWorkbook();
const TOPIC = "PMeterStation01";

class FakeWriter implements ReadingWriter {
  readonly batches: ReadingBatch[] = [];
  latest: readonly Reading[] = [];
  failNext = 0;

  async append(batch: ReadingBatch): Promise<void> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error("warehouse unavailable");
    }
    this.batches.push(batch);
  }

  async replaceLatest(readings: readonly Reading[]): Promise<void> {
    this.latest = readings;
  }

  get readings(): Reading[] {
    return this.batches.flatMap((batch) => [...batch.readings]);
  }

  get rollup(): ReadingBatch["rollup"][number][] {
    return this.batches.flatMap((batch) => [...batch.rollup]);
  }
}

class FixedClock implements Clock {
  #at: Date;
  constructor(at: Date) {
    this.#at = at;
  }
  now(): Date {
    return this.#at;
  }
  set(at: Date): void {
    this.#at = at;
  }
}

/**
 * Station messages for one topic across a window, the way the broker delivers
 * them: one message per publish instant, carrying every slot on the station.
 */
function stationMessages(from: Date, to: Date, intervalMs = 9_000): BrokerMessage[] {
  const meters = REGISTRY.forTopic(TOPIC).filter((meter) => meter.commissioned);
  const fixtures = generateFixtures({
    registry: REGISTRY,
    from,
    to,
    intervalMs,
    // The fixture set is generated for the whole fleet, so this station's
    // meters keep the profiles they would have had in a full run.
    energyResetFor: null,
  });

  const byInstant = new Map<number, Reading[]>();
  for (const reading of fixtures.readings) {
    if (!meters.some((meter) => meter.meterId === reading.meterId)) continue;
    const at = reading.at.getTime();
    const bucket = byInstant.get(at);
    if (bucket === undefined) byInstant.set(at, [reading]);
    else bucket.push(reading);
  }

  return [...byInstant.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([at, readings]) => ({
      topic: TOPIC,
      payload: new TextEncoder().encode(
        JSON.stringify(toStationPayload(readings, { registry: REGISTRY })),
      ),
      at: new Date(at),
    }));
}

/** The distinct (meter, minute) pairs a set of readings covers. */
function minutePairs(readings: readonly Reading[]): Set<string> {
  return new Set(
    readings.map(
      (reading) =>
        `${reading.meterId}@${Math.floor(reading.at.getTime() / 60_000) * 60_000}`,
    ),
  );
}

const COMMISSIONED_ON_STATION_01 = REGISTRY.forTopic(TOPIC).filter(
  (meter) => meter.commissioned,
).length;

describe("the ingester", () => {
  it("decodes a station message into one reading per commissioned slot", () => {
    const writer = new FakeWriter();
    const ingester = new Ingester({ writer, registry: REGISTRY });
    const at = new Date("2026-09-22T03:00:00Z");
    const [message] = stationMessages(at, new Date(at.getTime() + 9_000));
    assert.ok(message);

    ingester.accept(message);

    const stats = ingester.stats();
    assert.equal(stats.readings, COMMISSIONED_ON_STATION_01);
    assert.equal(stats.readings, 5, "station 01 has 5 of its 8 slots commissioned");
    assert.equal(stats.droppedUncommissioned, 3);
    assert.deepEqual(stats.issues, {});
  });

  it("writes raw readings and the rollup in the same batch", async () => {
    const writer = new FakeWriter();
    const clock = new FixedClock(new Date("2026-09-22T03:05:00Z"));
    const ingester = new Ingester({ writer, registry: REGISTRY, clock });

    for (const message of stationMessages(
      new Date("2026-09-22T03:00:00Z"),
      new Date("2026-09-22T03:05:00Z"),
    )) {
      ingester.accept(message);
    }
    await ingester.flush();

    assert.equal(writer.batches.length, 1, "one flush, one batch");
    const [batch] = writer.batches;
    assert.ok(batch);
    assert.ok(batch.readings.length > 0);
    assert.ok(batch.rollup.length > 0);
    // One row per (meter, minute) the batch's own readings cover — computed
    // rather than 5 x 5, because one of this station's meters is an `offline`
    // fixture and stops reporting partway through.
    assert.equal(batch.rollup.length, minutePairs(batch.readings).size);
  });

  it("rolls up only minutes that have closed", async () => {
    const writer = new FakeWriter();
    // 03:02:30 — the minute 03:02 is still running.
    const clock = new FixedClock(new Date("2026-09-22T03:02:30Z"));
    const ingester = new Ingester({ writer, registry: REGISTRY, clock });

    for (const message of stationMessages(
      new Date("2026-09-22T03:00:00Z"),
      new Date("2026-09-22T03:02:30Z"),
    )) {
      ingester.accept(message);
    }
    await ingester.flush();

    const minutes = new Set(writer.rollup.map((row) => row.at.toISOString()));
    assert.deepEqual(
      [...minutes].sort(),
      ["2026-09-22T03:00:00.000Z", "2026-09-22T03:01:00.000Z"],
      "the open minute is held back",
    );
    // Its raw readings went out all the same: raw has no per-minute identity.
    assert.ok(
      writer.readings.some((reading) => reading.at.getTime() >= Date.parse("2026-09-22T03:02:00Z")),
    );
  });

  it("never writes a minute twice, even when a flush falls inside one", async () => {
    const writer = new FakeWriter();
    const clock = new FixedClock(new Date("2026-09-22T03:00:30Z"));
    const ingester = new Ingester({ writer, registry: REGISTRY, clock });

    const messages = stationMessages(
      new Date("2026-09-22T03:00:00Z"),
      new Date("2026-09-22T03:02:00Z"),
    );
    const half = messages.filter(
      (message) => message.at.getTime() < Date.parse("2026-09-22T03:00:30Z"),
    );
    for (const message of half) ingester.accept(message);
    await ingester.flush();

    clock.set(new Date("2026-09-22T03:02:00Z"));
    for (const message of messages.slice(half.length)) ingester.accept(message);
    await ingester.flush();

    const keys = writer.rollup.map((row) => `${row.meterId}@${row.at.getTime()}`);
    assert.equal(
      new Set(keys).size,
      keys.length,
      "a (meter, minute) pair appears at most once across flushes",
    );
    assert.equal(
      keys.length,
      minutePairs(writer.readings).size,
      "and every minute the readings cover has exactly one row",
    );
  });

  it("reconciles the rollup against the raw readings behind it", async () => {
    const writer = new FakeWriter();
    const clock = new FixedClock(new Date("2026-09-22T03:10:00Z"));
    const ingester = new Ingester({ writer, registry: REGISTRY, clock });

    for (const message of stationMessages(
      new Date("2026-09-22T03:00:00Z"),
      new Date("2026-09-22T03:10:00Z"),
    )) {
      ingester.accept(message);
    }
    await ingester.flush();

    const rawByKey = new Map<string, Reading[]>();
    for (const reading of writer.readings) {
      const minute = Math.floor(reading.at.getTime() / 60_000) * 60_000;
      const key = `${reading.meterId}@${minute}`;
      const bucket = rawByKey.get(key);
      if (bucket === undefined) rawByKey.set(key, [reading]);
      else bucket.push(reading);
    }

    assert.equal(
      writer.rollup.reduce((total, row) => total + row.readingCount, 0),
      writer.readings.length,
      "every raw reading is counted in exactly one bucket",
    );

    for (const row of writer.rollup) {
      const raw = rawByKey.get(`${row.meterId}@${row.at.getTime()}`);
      assert.ok(raw, `no raw readings behind ${row.meterId} at ${row.at.toISOString()}`);
      const mean = raw.reduce((sum, r) => sum + r.activePowerKw, 0) / raw.length;
      assert.ok(Math.abs(row.activePowerKw - mean) < 1e-9, "mean power");
      assert.equal(
        row.energyKwh,
        raw[raw.length - 1]?.energyKwh,
        "the bucket's last counter, not a mean of counters",
      );
    }
  });

  it("holds one entry per meter however many messages arrive", () => {
    const writer = new FakeWriter();
    const ingester = new Ingester({ writer, registry: REGISTRY });

    const messages = stationMessages(
      new Date("2026-09-22T03:00:00Z"),
      new Date("2026-09-22T03:30:00Z"),
    );
    for (const message of messages) ingester.accept(message);

    assert.ok(messages.length > 190, "half an hour at 9 s is ~200 messages");
    assert.equal(ingester.snapshot().length, COMMISSIONED_ON_STATION_01);
    assert.equal(ingester.stats().metersSeen, COMMISSIONED_ON_STATION_01);
  });

  it("keeps the newest reading when a queued message arrives late", () => {
    const writer = new FakeWriter();
    const ingester = new Ingester({ writer, registry: REGISTRY });
    const messages = stationMessages(
      new Date("2026-09-22T03:00:00Z"),
      new Date("2026-09-22T03:00:27Z"),
    );
    assert.equal(messages.length, 3);

    // Delivered newest first, which is what draining a broker queue after a
    // reconnect can look like.
    for (const message of [...messages].reverse()) ingester.accept(message);

    // Only the meters the newest message actually carried: one slot on this
    // station is an `offline` fixture and may not appear in all three.
    const newest = new Ingester({ writer: new FakeWriter(), registry: REGISTRY });
    newest.accept(messages[2] as BrokerMessage);
    for (const reading of newest.snapshot()) {
      const held = ingester.snapshot().find((r) => r.meterId === reading.meterId);
      assert.equal(
        held?.at.toISOString(),
        reading.at.toISOString(),
        "the hot state holds the newest reading, not the last delivered",
      );
    }
  });

  it("holds a failed batch and writes it with the next one", async () => {
    const writer = new FakeWriter();
    const clock = new FixedClock(new Date("2026-09-22T03:02:00Z"));
    const ingester = new Ingester({ writer, registry: REGISTRY, clock });

    const first = stationMessages(
      new Date("2026-09-22T03:00:00Z"),
      new Date("2026-09-22T03:02:00Z"),
    );
    for (const message of first) ingester.accept(message);

    writer.failNext = 1;
    await ingester.flush();
    assert.equal(writer.batches.length, 0);
    assert.equal(ingester.stats().failedFlushes, 1);

    clock.set(new Date("2026-09-22T03:04:00Z"));
    for (const message of stationMessages(
      new Date("2026-09-22T03:02:00Z"),
      new Date("2026-09-22T03:04:00Z"),
    )) {
      ingester.accept(message);
    }
    await ingester.flush();

    assert.equal(writer.batches.length, 1);
    const keys = writer.rollup.map((row) => `${row.meterId}@${row.at.getTime()}`);
    assert.equal(new Set(keys).size, keys.length, "the retry did not duplicate a minute");
    assert.equal(
      keys.length,
      minutePairs(writer.readings).size,
      "every minute across both batches is present exactly once",
    );
    assert.equal(
      writer.readings.length,
      ingester.stats().readings,
      "every reading the ingester accepted was eventually written",
    );
    assert.equal(ingester.stats().droppedReadings, 0);
  });

  it("drops the oldest unwritten readings rather than growing without bound", async () => {
    const writer = new FakeWriter();
    const clock = new FixedClock(new Date("2026-09-22T03:10:00Z"));
    const ingester = new Ingester({
      writer,
      registry: REGISTRY,
      clock,
      maxBufferedReadings: 100,
    });

    writer.failNext = 100;
    for (const message of stationMessages(
      new Date("2026-09-22T03:00:00Z"),
      new Date("2026-09-22T03:10:00Z"),
    )) {
      ingester.accept(message);
    }
    await ingester.flush();

    const stats = ingester.stats();
    assert.ok(stats.bufferedReadings <= 100, "the buffer is capped");
    assert.ok(stats.droppedReadings > 0, "and the drops are counted, not silent");
    assert.equal(stats.metersSeen, COMMISSIONED_ON_STATION_01, "the hot state is unaffected");
  });

  it("rehydrates the hot state from the latest table", async () => {
    const writer = new FakeWriter();
    const stored = new Map<MeterId, Reading>();
    const [message] = stationMessages(
      new Date("2026-09-22T02:00:00Z"),
      new Date("2026-09-22T02:00:09Z"),
    );
    assert.ok(message);

    const seeder = new Ingester({ writer, registry: REGISTRY });
    seeder.accept(message);
    for (const reading of seeder.snapshot()) stored.set(reading.meterId, reading);

    const latestStore: LatestReadingStore = {
      latest: async () => stored,
    };
    const restarted = new Ingester({ writer, registry: REGISTRY, latestStore });
    const count = await restarted.rehydrate();

    assert.equal(count, COMMISSIONED_ON_STATION_01);
    assert.deepEqual(
      restarted.snapshot().map((r) => r.meterId),
      seeder.snapshot().map((r) => r.meterId),
    );
    assert.equal(restarted.stats().rehydratedMeters, COMMISSIONED_ON_STATION_01);
  });

  it("starts blind rather than refusing to start when the latest table cannot be read", async () => {
    const writer = new FakeWriter();
    const latestStore: LatestReadingStore = {
      latest: async () => {
        throw new Error("permission denied");
      },
    };
    const ingester = new Ingester({ writer, registry: REGISTRY, latestStore });
    assert.equal(await ingester.rehydrate(), 0);
    assert.equal(ingester.snapshot().length, 0);
  });

  it("flushes once more on stop", async () => {
    const writer = new FakeWriter();
    const clock = new FixedClock(new Date("2026-09-22T03:02:00Z"));
    const ingester = new Ingester({ writer, registry: REGISTRY, clock });
    for (const message of stationMessages(
      new Date("2026-09-22T03:00:00Z"),
      new Date("2026-09-22T03:02:00Z"),
    )) {
      ingester.accept(message);
    }

    await ingester.stop();

    assert.equal(writer.batches.length, 1, "the buffer was written before exit");
    assert.equal(writer.latest.length, COMMISSIONED_ON_STATION_01);
  });

  it("subscribes to every station topic the registry knows", () => {
    const ingester = new Ingester({ writer: new FakeWriter(), registry: REGISTRY });
    assert.equal(ingester.topics().length, 9);
    assert.ok(ingester.topics().includes("PMeterStation01"));
    assert.ok(ingester.topics().includes("PMeterStation09"));
  });
});
