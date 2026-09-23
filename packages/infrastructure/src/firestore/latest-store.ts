/**
 * The restart state: the newest reading per meter, in one Firestore document.
 *
 * This is the other half of step 8c. It used to be a BigQuery table called
 * `latest`, 55 rows rewritten every 30 s — which is 2 880 table modifications a
 * day against a standard table's cap of 1 500 a day, a limit that cannot be
 * raised and that failed writes also count against. The ingester would have
 * stopped mirroring its hot state at about half past twelve every afternoon,
 * and the only visible symptom would have been a restart rehydrating from
 * yesterday.
 *
 * Two decisions are worth stating, because both look arbitrary and neither is:
 *
 * - **One document, not 55.** The whole fleet goes in a single document, ~15 KB
 *   against Firestore's 1 MiB limit, overwritten whole. A document per meter
 *   would be 55 writes every 30 s — about 158 000 a day, and real money for a
 *   value that is obsolete a second later. One document
 *   is 2 880 writes a day, inside the free allowance of 20 000 — which applies
 *   to the project's default database only — and well inside the
 *   single-document sustained write limit of one per second.
 * - **It is not the real-time screen's source.** The ingester serves that from
 *   memory over HTTP, as it always did. This document exists so that a deploy
 *   or a crash does not leave the screen blank for the few seconds until every
 *   station has published once. Nothing else reads it — in particular the web
 *   app has no Firestore access at all.
 *
 * The mapping is pure and the store is written against a two-method port, so
 * everything here is exercised without credentials. The SDK appears only in
 * `firestoreDocumentStore`, which is dynamically imported for the reason
 * `warehouse/client.ts` gives.
 */
import type { LatestReadingStore } from "@power-meter/application";
import type { MeterId, Reading } from "@power-meter/domain";

/** The document, as it is stored. Timestamps are ISO strings, as in the file store. */
export interface LatestDocument {
  /** When the ingester last mirrored its hot state. Diagnostic; nothing reads it back. */
  readonly updated_at: string;
  readonly readings: readonly StoredLatestReading[];
}

export interface StoredLatestReading {
  readonly meterId: string;
  readonly at: string;
  readonly voltage: { readonly l1: number; readonly l2: number; readonly l3: number };
  readonly current: { readonly l1: number; readonly l2: number; readonly l3: number };
  readonly activePowerKw: number;
  readonly powerFactor: number;
  readonly energyKwh: number;
}

/**
 * The narrow surface this needs from Firestore: read a document, overwrite a
 * document. No queries, no collections, no transactions — one document is the
 * whole design, and a port this small is a port a fake cannot lie about.
 */
export interface DocumentStore {
  get(path: string): Promise<Record<string, unknown> | undefined>;
  set(path: string, data: Record<string, unknown>): Promise<void>;
}

/** `<collection>/<document>`. One document; the collection holds nothing else. */
export const DEFAULT_LATEST_DOCUMENT = "ingester/latest";

export function toLatestDocument(
  readings: readonly Reading[],
  updatedAt: Date,
): LatestDocument {
  return {
    updated_at: updatedAt.toISOString(),
    readings: readings.map((reading) => ({
      meterId: reading.meterId,
      at: reading.at.toISOString(),
      voltage: reading.voltage,
      current: reading.current,
      activePowerKw: reading.activePowerKw,
      powerFactor: reading.powerFactor,
      energyKwh: reading.energyKwh,
    })),
  };
}

/**
 * Readings back out of a document.
 *
 * Tolerant of an absent or empty document, because both are ordinary: a project
 * whose ingester has never run has neither. They are the same case as the empty
 * `latest` table before it, and are handled the same way — an empty map, and a
 * service that starts blind rather than not at all.
 */
export function fromLatestDocument(
  document: Record<string, unknown> | undefined,
): ReadonlyMap<MeterId, Reading> {
  const rows = (document?.["readings"] ?? []) as readonly StoredLatestReading[];
  if (!Array.isArray(rows)) return new Map();
  return new Map(
    rows.map((row) => {
      const reading: Reading = {
        meterId: row.meterId as MeterId,
        at: new Date(row.at),
        voltage: row.voltage,
        current: row.current,
        activePowerKw: row.activePowerKw,
        powerFactor: row.powerFactor,
        energyKwh: row.energyKwh,
      };
      return [reading.meterId, reading] as const;
    }),
  );
}

/**
 * The `LatestReadingStore` port, plus the write half the ingester's writer
 * delegates to.
 *
 * Both halves in one class because they are one document: a reader that had to
 * be composed separately from the writer would be two places to get the path
 * right.
 */
export class FirestoreLatestStore implements LatestReadingStore {
  readonly #documents: DocumentStore;
  readonly #path: string;

  constructor(documents: DocumentStore, path: string = DEFAULT_LATEST_DOCUMENT) {
    this.#documents = documents;
    this.#path = path;
  }

  async latest(): Promise<ReadonlyMap<MeterId, Reading>> {
    return fromLatestDocument(await this.#documents.get(this.#path));
  }

  /**
   * Overwrite the document with exactly these readings.
   *
   * An empty list is never written, for the reason the BigQuery version had the
   * same guard: a broker that happens to be down when the timer fires would
   * otherwise blank the one thing the next restart reads, turning a short
   * outage into a blind start after it.
   */
  async replaceLatest(readings: readonly Reading[]): Promise<void> {
    if (readings.length === 0) return;
    await this.#documents.set(
      this.#path,
      toLatestDocument(readings, new Date()) as unknown as Record<string, unknown>,
    );
  }
}

export interface FirestoreOptions {
  readonly projectId?: string;
  /**
   * Which database. The deployment passes `(default)`, because Firestore's free
   * quota covers exactly one database per project and that is the one; a
   * scratch database for a test is named, and billed from its first write.
   */
  readonly databaseId: string;
}

/** The real document store. The SDK is loaded here and nowhere else. */
export async function firestoreDocumentStore(
  options: FirestoreOptions,
): Promise<DocumentStore> {
  const { Firestore } = await import("@google-cloud/firestore");
  const firestore = new Firestore({
    ...(options.projectId === undefined ? {} : { projectId: options.projectId }),
    databaseId: options.databaseId,
  });

  return {
    async get(path) {
      const snapshot = await firestore.doc(path).get();
      if (!snapshot.exists) return undefined;
      return snapshot.data() as Record<string, unknown>;
    },
    async set(path, data) {
      await firestore.doc(path).set(data);
    },
  };
}
