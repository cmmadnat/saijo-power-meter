/**
 * The ingester itself: messages in, hot state and warehouse batches out.
 *
 * It owns three pieces of state and nothing else — the decoder's last-counter
 * map, the buffer waiting to be written, and the latest reading per meter. The
 * broker, the clock and the writer are all injected, so everything below can be
 * driven at whatever speed a test wants without a socket or a project.
 *
 * ## What is written, and when
 *
 * Raw readings and their 1-minute rollup go out **in the same batch**, on a
 * timer of ~45 s. The rollup is `rollupReadings()` from the application layer,
 * never a SQL `GROUP BY`: the charts bucket with the same three rules, and a
 * second definition of "a minute" would be free to drift from the one the
 * screen draws.
 *
 * That timer does not divide the minute, which is the subtlety here. A flush at
 * 12:00:45 holds part of the minute 12:00 and a flush at 12:01:30 holds the
 * rest, and rolling up each would write two rows for `(meter, 12:00)` — the
 * rollup's identity is the pair, so the second is a duplicate that no reader
 * would catch: the chart would simply show that minute twice as heavily. So
 * **only closed minutes are rolled up.** Readings in the minute still running
 * stay behind for the next flush. Their raw rows go out immediately either way,
 * because raw has no such identity.
 *
 * ## The hot state
 *
 * The newest reading per commissioned meter, held in memory and served over
 * HTTP — that is the real-time screen's source, and the reason this service is
 * always on. It is a map keyed by meter, so it is 55 entries whatever the
 * message rate, which is what makes a soak's memory line flat.
 *
 * It is mirrored to the durable copy every ~30 s, not on every reading: that
 * copy exists so a restart does not begin blind, and paying per write for a
 * value obsolete a second later would cost more per month than all the history.
 * Since step 8c the copy is one Firestore document rather than a BigQuery
 * table — nothing here knows which, because it goes out through `ReadingWriter`
 * like everything else.
 */
import {
  rollupReadings,
  systemClock,
  type Clock,
  type ReadingBatch,
  type ReadingWriter,
  type LatestReadingStore,
} from "@power-meter/application";
import { MeterRegistry, type MeterId, type Reading } from "@power-meter/domain";
import { StationDecoder, type DecodeIssueKind } from "@power-meter/infrastructure";
import type { BrokerMessage } from "./broker.ts";

export interface IngesterOptions {
  readonly writer: ReadingWriter;
  /** Where a restart reads its hot state back from. Omitted means start blind. */
  readonly latestStore?: LatestReadingStore | undefined;
  readonly registry?: MeterRegistry;
  readonly clock?: Clock;
  readonly flushIntervalMs?: number;
  readonly latestFlushIntervalMs?: number;
  readonly log?: (message: string) => void;
  /**
   * The ceiling on unwritten readings. Reached only when the warehouse has been
   * refusing writes for the best part of an hour; past it the oldest are
   * dropped, because an ingester that dies of memory exhaustion also stops
   * serving the live screen, which is the part nothing else can do.
   */
  readonly maxBufferedReadings?: number;
}

export interface IngesterStats {
  readonly messages: number;
  readonly readings: number;
  readonly droppedUncommissioned: number;
  readonly issues: Readonly<Record<string, number>>;
  readonly bufferedReadings: number;
  readonly pendingRollupReadings: number;
  readonly metersSeen: number;
  readonly flushes: number;
  readonly failedFlushes: number;
  readonly droppedReadings: number;
  readonly rowsWritten: number;
  readonly rollupRowsWritten: number;
  readonly latestFlushes: number;
  readonly lastMessageAt: string | null;
  readonly lastFlushAt: string | null;
  readonly rehydratedMeters: number;
}

const MINUTE_MS = 60_000;

export class Ingester {
  readonly #registry: MeterRegistry;
  readonly #decoder: StationDecoder;
  readonly #writer: ReadingWriter;
  readonly #latestStore: LatestReadingStore | undefined;
  readonly #clock: Clock;
  readonly #log: (message: string) => void;
  readonly #flushIntervalMs: number;
  readonly #latestFlushIntervalMs: number;
  readonly #maxBufferedReadings: number;

  /** Raw readings not yet written. Cleared on a successful flush. */
  #buffered: Reading[] = [];
  /** Readings whose minute has not closed yet, held back from the rollup only. */
  #pendingRollup: Reading[] = [];
  /** Rollup rows built but not yet accepted by the warehouse. */
  #pendingRollupRows: ReadingBatch["rollup"][number][] = [];
  readonly #hot = new Map<MeterId, Reading>();

  #timer: ReturnType<typeof setInterval> | undefined;
  #latestTimer: ReturnType<typeof setInterval> | undefined;
  #flushing: Promise<void> = Promise.resolve();

  #messages = 0;
  #readings = 0;
  #droppedUncommissioned = 0;
  #issues = new Map<DecodeIssueKind, number>();
  #flushes = 0;
  #failedFlushes = 0;
  #droppedReadings = 0;
  #rowsWritten = 0;
  #rollupRowsWritten = 0;
  #latestFlushes = 0;
  #rehydratedMeters = 0;
  #lastMessageAt: Date | null = null;
  #lastFlushAt: Date | null = null;

  constructor(options: IngesterOptions) {
    this.#registry = options.registry ?? MeterRegistry.fromWorkbook();
    this.#decoder = new StationDecoder({ registry: this.#registry });
    this.#writer = options.writer;
    this.#latestStore = options.latestStore;
    this.#clock = options.clock ?? systemClock;
    this.#log = options.log ?? (() => {});
    this.#flushIntervalMs = options.flushIntervalMs ?? 45_000;
    this.#latestFlushIntervalMs = options.latestFlushIntervalMs ?? 30_000;
    this.#maxBufferedReadings = options.maxBufferedReadings ?? 20_000;
  }

  /** The topics this ingester must be subscribed to, from the registry. */
  topics(): readonly string[] {
    return this.#registry.topics();
  }

  /**
   * Read the hot state back from the durable copy.
   *
   * A failure here is logged and not thrown. Starting with an empty hot state
   * means the real-time screen shows nothing for the few seconds until the
   * first message of each station arrives; refusing to start because the copy
   * could not be read means it shows nothing at all.
   */
  async rehydrate(): Promise<number> {
    if (this.#latestStore === undefined) return 0;
    try {
      const latest = await this.#latestStore.latest();
      for (const [meterId, reading] of latest) {
        if (this.#registry.find(meterId)?.commissioned !== true) continue;
        this.#hot.set(meterId, reading);
      }
      this.#rehydratedMeters = this.#hot.size;
      this.#log(`rehydrated ${this.#hot.size} meter(s) from the restart state`);
      return this.#hot.size;
    } catch (error) {
      this.#log(
        `could not rehydrate from the restart state, starting blind: ${describe(error)}`,
      );
      return 0;
    }
  }

  /** Decode one station message and take everything it carries. */
  accept(message: BrokerMessage): void {
    this.#messages += 1;
    this.#lastMessageAt = message.at;

    const result = this.#decoder.decode(message.topic, message.payload, message.at);
    this.#droppedUncommissioned += result.droppedUncommissioned;
    for (const issue of result.issues) {
      this.#issues.set(issue.kind, (this.#issues.get(issue.kind) ?? 0) + 1);
    }

    for (const reading of result.readings) {
      this.#readings += 1;
      this.#buffered.push(reading);
      this.#pendingRollup.push(reading);
      const current = this.#hot.get(reading.meterId);
      // Out-of-order delivery is possible after a reconnect drains a queue, and
      // the hot state is "newest", not "last seen".
      if (current === undefined || reading.at.getTime() >= current.at.getTime()) {
        this.#hot.set(reading.meterId, reading);
      }
    }

    this.#trimBuffer();
  }

  /** The newest reading per meter, for the HTTP hot-state endpoint. */
  snapshot(): readonly Reading[] {
    return [...this.#hot.values()].sort((a, b) =>
      a.meterId < b.meterId ? -1 : a.meterId > b.meterId ? 1 : 0,
    );
  }

  start(): void {
    this.#timer ??= setInterval(() => {
      void this.flush();
    }, this.#flushIntervalMs);
    this.#latestTimer ??= setInterval(() => {
      void this.flushLatest();
    }, this.#latestFlushIntervalMs);
    this.#timer.unref?.();
    this.#latestTimer.unref?.();
  }

  /**
   * Write everything that is ready.
   *
   * Serialised against itself: the flush is a load job and a slow one must not
   * overlap the next tick, which would write the same buffer twice.
   */
  flush(): Promise<void> {
    this.#flushing = this.#flushing.then(() => this.#flushOnce());
    return this.#flushing;
  }

  async #flushOnce(): Promise<void> {
    const now = this.#clock.now();
    const closedBefore = Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS;

    const closed: Reading[] = [];
    const open: Reading[] = [];
    for (const reading of this.#pendingRollup) {
      (reading.at.getTime() < closedBefore ? closed : open).push(reading);
    }

    const rollup = [...this.#pendingRollupRows, ...rollupReadings(closed)];
    const readings = this.#buffered;
    if (readings.length === 0 && rollup.length === 0) {
      this.#pendingRollup = open;
      return;
    }

    // Taken off the instance before the await, so messages arriving during the
    // write go into the next batch rather than being written twice or lost on a
    // failure.
    this.#buffered = [];
    this.#pendingRollup = open;
    this.#pendingRollupRows = [];

    try {
      await this.#writer.append({ readings, rollup, ingestedAt: now });
      this.#flushes += 1;
      this.#lastFlushAt = now;
      this.#rowsWritten += readings.length;
      this.#rollupRowsWritten += rollup.length;
      this.#log(
        `flushed ${readings.length} reading(s) and ${rollup.length} rollup row(s)`,
      );
    } catch (error) {
      this.#failedFlushes += 1;
      // Put it back, in front of whatever arrived while the write was in
      // flight, and try again on the next tick. The rollup rows go back as
      // rows: re-deriving them later would re-close minutes that have already
      // been aggregated.
      this.#buffered = [...readings, ...this.#buffered];
      this.#pendingRollupRows = [...rollup, ...this.#pendingRollupRows];
      this.#trimBuffer();
      this.#log(`flush failed, ${this.#buffered.length} reading(s) held: ${describe(error)}`);
    }
  }

  /** Mirror the hot state to the durable copy a restart reads. */
  async flushLatest(): Promise<void> {
    if (this.#hot.size === 0) return;
    try {
      await this.#writer.replaceLatest(this.snapshot());
      this.#latestFlushes += 1;
    } catch (error) {
      this.#log(`could not write the restart state: ${describe(error)}`);
    }
  }

  /**
   * Flush once more and stop the timers.
   *
   * On a Cloud Run deploy this is the difference between losing the buffer and
   * losing nothing: SIGTERM arrives, the final flush writes, and the readings
   * received in the last few seconds are in the warehouse rather than in a
   * process that is gone.
   */
  async stop(): Promise<void> {
    if (this.#timer !== undefined) clearInterval(this.#timer);
    if (this.#latestTimer !== undefined) clearInterval(this.#latestTimer);
    this.#timer = undefined;
    this.#latestTimer = undefined;
    await this.flush();
    await this.flushLatest();
  }

  stats(): IngesterStats {
    return {
      messages: this.#messages,
      readings: this.#readings,
      droppedUncommissioned: this.#droppedUncommissioned,
      issues: Object.fromEntries(this.#issues),
      bufferedReadings: this.#buffered.length,
      pendingRollupReadings: this.#pendingRollup.length,
      metersSeen: this.#hot.size,
      flushes: this.#flushes,
      failedFlushes: this.#failedFlushes,
      droppedReadings: this.#droppedReadings,
      rowsWritten: this.#rowsWritten,
      rollupRowsWritten: this.#rollupRowsWritten,
      latestFlushes: this.#latestFlushes,
      lastMessageAt: this.#lastMessageAt?.toISOString() ?? null,
      lastFlushAt: this.#lastFlushAt?.toISOString() ?? null,
      rehydratedMeters: this.#rehydratedMeters,
    };
  }

  #trimBuffer(): void {
    const excess = this.#buffered.length - this.#maxBufferedReadings;
    if (excess <= 0) return;
    this.#buffered.splice(0, excess);
    this.#droppedReadings += excess;
    this.#log(
      `buffer full: dropped ${excess} of the oldest unwritten reading(s). ` +
        "The warehouse has been unreachable for a long time.",
    );
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
