/**
 * The observer's snapshot: what the Incoming view reads, in one document.
 *
 * Step 10's question was how the web app reaches an observer running on a
 * private VM in another region. The answer is that it does not: the observer
 * writes this document every ~30 s and the web app reads it. No network path
 * between the two, no port opened, no token — two principals and one
 * Firestore document they both have a role on.
 *
 * **It is not the warehouse and not the restart state.** Observe mode's rule is
 * that nothing a guessed divisor produces may outlive the process as history.
 * This document is overwritten whole every time, holds one hour at most, and
 * lives at `observer/latest` — a different path from the writing ingester's
 * `ingester/latest`, which the gate in `apps/ingester/src/config.ts` refuses to
 * share. Nothing accumulates, so step 11 has nothing to undo.
 *
 * It carries three things:
 *
 * - **The newest reading per meter**, for the table.
 * - **The last hour as 1-minute rollup rows**, built by `rollupReadings()` —
 *   the same buckets the warehouse's `readings_1m` holds, so the charts read it
 *   through a `RollupRepository` and fold it by the rules they already use.
 *   Stored as parallel number arrays per meter: ~3 300 rows as objects would be
 *   ~300 KB against Firestore's 1 MiB document limit; as columns, ~70 KB.
 * - **The publish interval the observer measured**, which is what the
 *   Incoming view's freshness thresholds are derived from.
 */
import { readFile, rename, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RollupBucket } from "@power-meter/application";
import type { MeterId, Reading } from "@power-meter/domain";
import type { DocumentStore } from "../firestore/latest-store.ts";

/** Never `ingester/latest`: that is the writing ingester's restart state. */
export const DEFAULT_OBSERVER_DOCUMENT = "observer/latest";

/** One thing that went wrong with one message, as the observer saw it. */
export interface FeedIssue {
  readonly at: Date;
  readonly topic: string;
  /** A decoder issue kind, or `malformed-payload` for one that is not JSON at all. */
  readonly kind: string;
  readonly meterId?: string;
  readonly key?: string;
  readonly detail: string;
}

/**
 * How the feed itself is doing, so the Incoming view can show a failure as a
 * failure — a broker it cannot reach, a feed gone quiet, payloads it cannot
 * read — rather than as 55 meters that happen to be offline.
 */
export interface FeedHealth {
  /** When this observer process started. */
  readonly startedAt: Date;
  readonly connected: boolean;
  /** When the current connection was made; null while disconnected. */
  readonly connectedSince: Date | null;
  /** The last thing the broker connection reported going wrong, if anything. */
  readonly lastBrokerProblem: { readonly at: Date; readonly message: string } | null;
  /** Messages received since `startedAt`, on any of the nine topics. */
  readonly messages: number;
  readonly lastMessageAt: Date | null;
  /** Issues by kind since `startedAt`. */
  readonly issueCounts: Readonly<Record<string, number>>;
  /** The most recent issues, newest last. A few, not a log. */
  readonly recentIssues: readonly FeedIssue[];
}

export interface ObserverSnapshot {
  /** When the observer wrote it. The Incoming view's "as of". */
  readonly updatedAt: Date;
  /** The median gap between messages on one topic; null before one is seen. */
  readonly publishIntervalMs: number | null;
  /** How far back `rollup` reaches from `updatedAt`. */
  readonly windowMs: number;
  readonly latest: readonly Reading[];
  readonly rollup: readonly RollupBucket[];
  /** Absent from a document written before the observer reported its health. */
  readonly health?: FeedHealth;
}

interface StoredHealth {
  readonly started_at: string;
  readonly connected: boolean;
  readonly connected_since: string | null;
  readonly last_broker_problem: { readonly at: string; readonly message: string } | null;
  readonly messages: number;
  readonly last_message_at: string | null;
  readonly issue_counts: Readonly<Record<string, number>>;
  readonly recent_issues: readonly {
    readonly at: string;
    readonly topic: string;
    readonly kind: string;
    readonly meterId?: string;
    readonly key?: string;
    readonly detail: string;
  }[];
}

interface StoredReading {
  readonly meterId: string;
  readonly at: string;
  readonly voltage: { readonly l1: number; readonly l2: number; readonly l3: number };
  readonly current: { readonly l1: number; readonly l2: number; readonly l3: number };
  readonly activePowerKw: number;
  readonly powerFactor: number;
  readonly energyKwh: number;
}

/** One meter's rollup, as columns. Firestore allows arrays, not arrays of arrays. */
interface StoredSeries {
  readonly meterId: string;
  /** Minute starts, epoch milliseconds. */
  readonly at: readonly number[];
  readonly count: readonly number[];
  readonly kw: readonly number[];
  readonly kwh: readonly number[];
}

export interface SnapshotDocument {
  readonly updated_at: string;
  readonly publish_interval_ms: number | null;
  readonly window_ms: number;
  readonly latest: readonly StoredReading[];
  readonly series: readonly StoredSeries[];
  readonly health?: StoredHealth;
}

export function toSnapshotDocument(snapshot: ObserverSnapshot): SnapshotDocument {
  const byMeter = new Map<string, { at: number[]; count: number[]; kw: number[]; kwh: number[] }>();
  for (const bucket of snapshot.rollup) {
    let columns = byMeter.get(bucket.meterId);
    if (columns === undefined) {
      columns = { at: [], count: [], kw: [], kwh: [] };
      byMeter.set(bucket.meterId, columns);
    }
    columns.at.push(bucket.at.getTime());
    columns.count.push(bucket.readingCount);
    columns.kw.push(bucket.activePowerKw);
    columns.kwh.push(bucket.energyKwh);
  }
  return {
    updated_at: snapshot.updatedAt.toISOString(),
    publish_interval_ms: snapshot.publishIntervalMs,
    window_ms: snapshot.windowMs,
    latest: snapshot.latest.map((reading) => ({
      meterId: reading.meterId,
      at: reading.at.toISOString(),
      voltage: reading.voltage,
      current: reading.current,
      activePowerKw: reading.activePowerKw,
      powerFactor: reading.powerFactor,
      energyKwh: reading.energyKwh,
    })),
    series: [...byMeter.entries()].map(([meterId, columns]) => ({ meterId, ...columns })),
    ...(snapshot.health === undefined ? {} : { health: toStoredHealth(snapshot.health) }),
  };
}

function toStoredHealth(health: FeedHealth): StoredHealth {
  return {
    started_at: health.startedAt.toISOString(),
    connected: health.connected,
    connected_since: health.connectedSince?.toISOString() ?? null,
    last_broker_problem:
      health.lastBrokerProblem === null
        ? null
        : { at: health.lastBrokerProblem.at.toISOString(), message: health.lastBrokerProblem.message },
    messages: health.messages,
    last_message_at: health.lastMessageAt?.toISOString() ?? null,
    issue_counts: { ...health.issueCounts },
    // Firestore rejects `undefined`, so optional fields are left out, not nulled.
    recent_issues: health.recentIssues.map((issue) => ({
      at: issue.at.toISOString(),
      topic: issue.topic,
      kind: issue.kind,
      ...(issue.meterId === undefined ? {} : { meterId: issue.meterId }),
      ...(issue.key === undefined ? {} : { key: issue.key }),
      detail: issue.detail,
    })),
  };
}

/** Health back out of a document; undefined when the observer did not write any. */
function fromStoredHealth(raw: unknown): FeedHealth | undefined {
  if (raw === undefined || raw === null) return undefined;
  const stored = raw as StoredHealth;
  const when = (value: unknown, where: string): Date => {
    const at = new Date(String(value));
    if (Number.isNaN(at.getTime())) throw new TypeError(`observer snapshot: health.${where} is not a timestamp`);
    return at;
  };
  const counts: Record<string, number> = {};
  for (const [kind, count] of Object.entries(stored.issue_counts ?? {})) {
    counts[kind] = finite(count, `health.issue_counts.${kind}`);
  }
  return {
    startedAt: when(stored.started_at, "started_at"),
    connected: stored.connected === true,
    connectedSince: stored.connected_since ? when(stored.connected_since, "connected_since") : null,
    lastBrokerProblem: stored.last_broker_problem
      ? {
          at: when(stored.last_broker_problem.at, "last_broker_problem.at"),
          message: String(stored.last_broker_problem.message),
        }
      : null,
    messages: finite(stored.messages, "health.messages"),
    lastMessageAt: stored.last_message_at ? when(stored.last_message_at, "last_message_at") : null,
    issueCounts: counts,
    recentIssues: (Array.isArray(stored.recent_issues) ? stored.recent_issues : []).map((issue, index) => ({
      at: when(issue.at, `recent_issues[${index}].at`),
      topic: String(issue.topic),
      kind: String(issue.kind),
      ...(typeof issue.meterId === "string" ? { meterId: issue.meterId } : {}),
      ...(typeof issue.key === "string" ? { key: issue.key } : {}),
      detail: String(issue.detail),
    })),
  };
}

/**
 * The snapshot back out of a document, or undefined when there is none.
 *
 * Checked rather than cast, as `readingsFromLatest` is: this crosses from one
 * deployable to another, and a document from an observer a version ahead
 * should fail here with the field named rather than draw a chart of `NaN`.
 */
export function fromSnapshotDocument(
  document: Record<string, unknown> | undefined,
): ObserverSnapshot | undefined {
  if (document === undefined) return undefined;
  const updatedAt = new Date(String(document["updated_at"]));
  if (Number.isNaN(updatedAt.getTime())) {
    throw new TypeError("observer snapshot: updated_at is not a timestamp");
  }
  const interval = document["publish_interval_ms"];
  const windowMs = document["window_ms"];
  const latest = document["latest"];
  const series = document["series"];
  if (!Array.isArray(latest) || !Array.isArray(series)) {
    throw new TypeError("observer snapshot: latest and series must be arrays");
  }

  const rollup: RollupBucket[] = [];
  for (const [index, raw] of (series as StoredSeries[]).entries()) {
    const where = `series[${index}]`;
    const { meterId, at, count, kw, kwh } = raw;
    if (typeof meterId !== "string") throw new TypeError(`${where}.meterId is not a string`);
    if (![at, count, kw, kwh].every((column) => Array.isArray(column) && column.length === at.length)) {
      throw new TypeError(`${where}: columns must be arrays of equal length`);
    }
    for (let i = 0; i < at.length; i += 1) {
      rollup.push({
        meterId: meterId as MeterId,
        at: new Date(finite(at[i], `${where}.at[${i}]`)),
        readingCount: finite(count[i], `${where}.count[${i}]`),
        activePowerKw: finite(kw[i], `${where}.kw[${i}]`),
        energyKwh: finite(kwh[i], `${where}.kwh[${i}]`),
      });
    }
  }

  const health = fromStoredHealth(document["health"]);
  return {
    ...(health === undefined ? {} : { health }),
    updatedAt,
    publishIntervalMs: typeof interval === "number" && interval > 0 ? interval : null,
    windowMs: typeof windowMs === "number" && windowMs > 0 ? windowMs : 60 * 60_000,
    latest: (latest as StoredReading[]).map((row, index) => {
      const where = `latest[${index}]`;
      const at = new Date(String(row.at));
      if (typeof row.meterId !== "string") throw new TypeError(`${where}.meterId is not a string`);
      if (Number.isNaN(at.getTime())) throw new TypeError(`${where}.at is not a timestamp`);
      return {
        meterId: row.meterId as MeterId,
        at,
        voltage: phases(row.voltage, `${where}.voltage`),
        current: phases(row.current, `${where}.current`),
        activePowerKw: finite(row.activePowerKw, `${where}.activePowerKw`),
        powerFactor: finite(row.powerFactor, `${where}.powerFactor`),
        energyKwh: finite(row.energyKwh, `${where}.energyKwh`),
      };
    }),
    rollup,
  };
}

function finite(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${where} is not a number: ${JSON.stringify(value)}`);
  }
  return value;
}

function phases(value: unknown, where: string): { l1: number; l2: number; l3: number } {
  const v = (value ?? {}) as Record<string, unknown>;
  return {
    l1: finite(v["l1"], `${where}.l1`),
    l2: finite(v["l2"], `${where}.l2`),
    l3: finite(v["l3"], `${where}.l3`),
  };
}

/** Both halves of the document, over the same two-method port the restart state uses. */
export class ObserverSnapshotStore {
  readonly #documents: DocumentStore;
  readonly #path: string;

  constructor(documents: DocumentStore, path: string = DEFAULT_OBSERVER_DOCUMENT) {
    this.#documents = documents;
    this.#path = path;
  }

  async write(snapshot: ObserverSnapshot): Promise<void> {
    await this.#documents.set(
      this.#path,
      toSnapshotDocument(snapshot) as unknown as Record<string, unknown>,
    );
  }

  async read(): Promise<ObserverSnapshot | undefined> {
    return fromSnapshotDocument(await this.#documents.get(this.#path));
  }
}

/**
 * A `DocumentStore` backed by JSON files, one per document path. The local
 * replay's stand-in for Firestore, so the Incoming view can be exercised end to
 * end without a project: `observer/latest` becomes `<dir>/observer__latest.json`.
 *
 * Written to a temporary name and renamed, so a reader never sees half a file.
 */
export function fileDocumentStore(dir: string): DocumentStore {
  const fileFor = (path: string) =>
    join(/* turbopackIgnore: true */ dir, `${path.replaceAll("/", "__")}.json`);
  return {
    async get(path) {
      try {
        return JSON.parse(await readFile(fileFor(path), "utf8")) as Record<string, unknown>;
      } catch {
        return undefined;
      }
    },
    async set(path, data) {
      await mkdir(/* turbopackIgnore: true */ dir, { recursive: true });
      const file = fileFor(path);
      await writeFile(`${file}.tmp`, JSON.stringify(data));
      await rename(`${file}.tmp`, file);
    },
  };
}
