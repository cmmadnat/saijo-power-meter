/**
 * A rollup read, remembered until the minute turns.
 *
 * The real-time route re-renders every ten seconds per open screen, and every
 * render reads the rollup twice for the strip and once for the charts. The
 * rollup cannot change faster than the ingester flushes (~45 s), and only whole
 * closed minutes are ever written to it — so a read keyed on a minute-aligned
 * window is the same answer for the rest of that minute, and asking BigQuery
 * again is paying 10 MB (the per-query minimum) for nothing.
 *
 * Keyed on the meters and the exact window. Because the live source aligns
 * `to` to the minute, the key changes once a minute by itself, and the TTL is
 * only the backstop that stops an entry outliving the minute it answered for.
 * Per process: a Cloud Run instance that scales out carries its own, which
 * multiplies the query rate by the instance count and nothing worse.
 */
import type { RollupBucket, RollupRepository, TimeRange } from "@power-meter/application";
import type { MeterId } from "@power-meter/domain";

export interface CacheOptions {
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  readonly now?: () => number;
}

export class CachedRollupRepository implements RollupRepository {
  readonly #inner: RollupRepository;
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #now: () => number;
  readonly #entries = new Map<string, { expiresAtMs: number; rows: Promise<RollupBucket[]> }>();
  #misses = 0;
  #hits = 0;

  constructor(inner: RollupRepository, options: CacheOptions = {}) {
    this.#inner = inner;
    this.#ttlMs = options.ttlMs ?? 60_000;
    this.#maxEntries = options.maxEntries ?? 64;
    this.#now = options.now ?? Date.now;
  }

  async *bucketsInRange(
    meterIds: readonly MeterId[],
    range: TimeRange,
  ): AsyncIterable<RollupBucket> {
    const key = `${[...meterIds].sort().join(",")}|${range.from.toISOString()}|${range.to.toISOString()}`;
    const now = this.#now();
    let entry = this.#entries.get(key);
    if (entry === undefined || entry.expiresAtMs <= now) {
      this.#misses += 1;
      // The promise is cached, not the rows, so two renders arriving together
      // share one query rather than racing to issue two.
      const rows = collect(this.#inner.bucketsInRange(meterIds, range));
      entry = { expiresAtMs: now + this.#ttlMs, rows };
      this.#entries.set(key, entry);
      // A failed read is not remembered: the next render asks again.
      rows.catch(() => this.#entries.delete(key));
      this.#evict(now);
    } else {
      this.#hits += 1;
    }
    yield* await entry.rows;
  }

  /** Reads answered from memory against reads that went through. */
  stats(): { hits: number; misses: number } {
    return { hits: this.#hits, misses: this.#misses };
  }

  #evict(now: number): void {
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAtMs <= now) this.#entries.delete(key);
    }
    // Oldest first: a Map iterates in insertion order.
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }
}

async function collect(rows: AsyncIterable<RollupBucket>): Promise<RollupBucket[]> {
  const out: RollupBucket[] = [];
  for await (const row of rows) out.push(row);
  return out;
}
