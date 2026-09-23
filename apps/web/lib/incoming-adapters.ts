/**
 * Incoming: the customer's feed as the observer sees it, stored nowhere.
 *
 * Step 10's third adapter set, beside demo and live — not a weaker live mode.
 * Everything comes from one document the observer overwrites every ~30 s
 * (`ObserverSnapshotStore`, `observer/latest`), which is why the web app needs
 * no network path to the observer at all: both sides hold a role on the same
 * Firestore database, and that is the whole integration.
 *
 * - **Real time** — the snapshot's newest reading per meter, with freshness
 *   thresholds derived from the interval the observer measured. The test
 *   publisher sends once a minute; the specification's thresholds assume ~9 s
 *   and would show every meter flickering live → stale each minute.
 * - **kW chart and the strip's load line** — the snapshot's last hour, as the
 *   same 1-minute rollup rows `readings_1m` holds, read through a
 *   `RollupRepository` so `meterSeries` folds them by the rules it already
 *   uses. An hour is all there is, so the widest window offered is an hour.
 * - **History, the kWh chart, energy today** — not recorded, and said so.
 *   `records: false`; the screens print "not recorded yet" and never fall back
 *   to fixtures to fill the space.
 *
 * - **Labels** — what the viewers call each meter, in a second document
 *   (`labels/meters`) that the Meters page edits. The feed names a meter by
 *   topic and slot and nothing else, so this view names it by label, or by id.
 *
 * The document is read at most once per `CACHE_MS` per instance, however many
 * screens are open: a read is a Firestore document read, 50 000 of which a day
 * are free, and six a minute is 8 640.
 *
 * Nothing here reaches the fixture generator; `scripts/check-boundaries.mjs`
 * walks this module's import graph with the rest of the live path.
 */
import {
  freshnessForInterval,
  type LatestReadingStore,
  type MeterLabelStore,
  type ReadingRepository,
  type RollupBucket,
  type RollupRepository,
} from "@power-meter/application";
import type { MeterId, Reading } from "@power-meter/domain";
import {
  DEFAULT_LABELS_DOCUMENT,
  DocumentMeterLabelStore,
  fileDocumentStore,
  firestoreDocumentStore,
  ObserverSnapshotStore,
  type DocumentStore,
  type ObserverSnapshot,
} from "@power-meter/infrastructure";
import type { DataSource, SeriesRequest, TrendRequest } from "./data-source.ts";

export interface IncomingConfig {
  /** `firestore` in any deployment; `file` for the local replay. */
  readonly store: "firestore" | "file";
  readonly projectId: string | undefined;
  readonly databaseId: string;
  readonly document: string;
  /** The labels document, `labels/meters` unless overridden. */
  readonly labelsDocument?: string;
  /** Where `file` reads, the observer's WAREHOUSE_DIR. */
  readonly dir: string;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
/** How long one read of the document serves every request on this instance. */
export const CACHE_MS = 10_000;
/**
 * How long one read of the labels serves this instance. Longer than the
 * snapshot's, because labels change when a person edits them and not with the
 * feed; a write on this instance forgets it at once, and another instance sees
 * it within this long. 2 880 reads a day at most, beside the snapshot's 8 640.
 */
export const LABELS_CACHE_MS = 30_000;

export interface IncomingDependencies {
  /** Injected by tests; otherwise Firestore or the file store is constructed. */
  readonly documents?: DocumentStore;
  readonly now?: () => number;
}

export async function createIncomingSource(
  config: IncomingConfig,
  dependencies: IncomingDependencies = {},
): Promise<DataSource> {
  const documents =
    dependencies.documents ??
    (config.store === "file"
      ? fileDocumentStore(config.dir)
      : await firestoreDocumentStore({
          ...(config.projectId === undefined ? {} : { projectId: config.projectId }),
          databaseId: config.databaseId,
        }));
  const store = new ObserverSnapshotStore(documents, config.document);
  const now = dependencies.now ?? Date.now;

  let cached: { at: number; snapshot: Promise<ObserverSnapshot | undefined> } | undefined;
  const snapshot = (): Promise<ObserverSnapshot | undefined> => {
    const at = now();
    if (cached === undefined || at - cached.at >= CACHE_MS) {
      const read = store.read();
      cached = { at, snapshot: read };
      // A failed read is not cached: the next request tries again.
      read.catch(() => {
        if (cached?.snapshot === read) cached = undefined;
      });
    }
    return cached.snapshot;
  };

  const labelDocument = new DocumentMeterLabelStore(
    documents,
    config.labelsDocument ?? DEFAULT_LABELS_DOCUMENT,
  );
  let cachedLabels:
    | { at: number; labels: Promise<ReadonlyMap<MeterId, string>> }
    | undefined;
  const labels: MeterLabelStore = {
    labels() {
      const at = now();
      if (cachedLabels === undefined || at - cachedLabels.at >= LABELS_CACHE_MS) {
        const read = labelDocument.labels();
        cachedLabels = { at, labels: read };
        read.catch(() => {
          if (cachedLabels?.labels === read) cachedLabels = undefined;
        });
      }
      return cachedLabels.labels;
    },
    async setLabels(changes) {
      cachedLabels = undefined;
      await labelDocument.setLabels(changes);
      cachedLabels = undefined;
    },
  };

  const latest: LatestReadingStore = {
    async latest() {
      const found = await snapshot();
      return new Map<MeterId, Reading>(
        (found?.latest ?? []).map((reading) => [reading.meterId, reading]),
      );
    },
  };

  const rollup: RollupRepository = {
    async *bucketsInRange(meterIds, range) {
      const wanted = new Set<string>(meterIds);
      const rows: RollupBucket[] = ((await snapshot())?.rollup ?? []).filter(
        (row) =>
          wanted.has(row.meterId) &&
          row.at.getTime() >= range.from.getTime() &&
          row.at.getTime() < range.to.getTime(),
      );
      // The port's contract: by meter, then ascending in time.
      rows.sort((a, b) =>
        a.meterId === b.meterId
          ? a.at.getTime() - b.at.getTime()
          : a.meterId < b.meterId
            ? -1
            : 1,
      );
      yield* rows;
    },
  };

  /** Up to and including the running minute: the snapshot rolls it up too. */
  const windowEnding = (at: Date, spanMs: number) => {
    const to = new Date(Math.floor(at.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS);
    return { from: new Date(to.getTime() - Math.min(spanMs, HOUR_MS)), to };
  };

  const nothing: ReadingRepository = {
    async *readingsInRange() {
      return;
    },
  };

  return {
    records: false,
    maxSeriesMs: HOUR_MS,
    labels,

    async feed() {
      const found = await snapshot();
      const publishIntervalMs = found?.publishIntervalMs ?? null;
      return {
        publishIntervalMs,
        observedAt: found?.updatedAt ?? null,
        thresholds: freshnessForInterval(publishIntervalMs),
        ...(found?.health === undefined ? {} : { health: found.health }),
      };
    },

    latest: () => latest,

    series({ spanMs, now: at }: SeriesRequest) {
      return { range: windowEnding(at, spanMs), repository: rollup };
    },

    history() {
      // Never read: `records: false` tells the screen to say so instead.
      return { repository: nothing };
    },

    trend({ sparkMs, now: at }: TrendRequest) {
      // Only the load line is drawn from this; energy since 00:00 is not
      // recorded, and the strip prints that rather than an hour's worth.
      return { range: windowEnding(at, sparkMs), repository: rollup };
    },
  };
}
