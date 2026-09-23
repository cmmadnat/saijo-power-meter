/**
 * Live mode: the real-time table from the ingester's hot state, the charts
 * and the strip from the 1-minute rollup, History from raw readings.
 *
 * Which table each screen reads is a decision, and it is written down in
 * docs/architecture/data-modes.md; the short form is here beside the code:
 *
 * - **Real time** — `GET /latest` on the ingester, with an ID token. Free per
 *   read, and the only source as fresh as the screen's ten-second refresh.
 * - **Charts** — `readings_1m`. The rollup exists to make wide windows cheap: a
 *   24-hour chart is 1 440 rows a meter against ~9 600 raw. Moving to it is a
 *   change of table, not arithmetic — `meterSeries` folds a stored minute by
 *   the same rules it folds a reading by — on the condition that the window
 *   starts on a whole minute, which is why the window is aligned here. The
 *   price is that the right-hand edge trails real time by up to a closed
 *   minute plus one ingester flush, ~1¾ minutes; the table above the charts
 *   is live to the second, so nothing on the page pretends otherwise.
 * - **Fleet strip** — the same rollup, same alignment.
 * - **History** — raw `readings`, and the three-minute gap cap back at its
 *   default: the readings are real ones on the real schedule, so the widened
 *   cap demo mode needs has no business here.
 *
 * Rollup reads are cached until the minute turns (`CachedRollupRepository`),
 * and the strip's two windows share one read, because the route re-renders
 * every ten seconds on each open screen and BigQuery bills at least 10 MB for
 * every query, however little it reads. Two queries a minute per instance —
 * the strip and the charts' current selection — is the floor.
 *
 * Nothing in this file, or anything it imports, reaches the fixture generator.
 * `scripts/check-boundaries.mjs` walks this module's import graph and fails the
 * build if it does.
 */
import type { ReadingRepository, RollupRepository } from "@power-meter/application";
import {
  bigQueryClient,
  CachedRollupRepository,
  FileReadingRepository,
  FileRollupRepository,
  IngesterLatestReadingStore,
  isLoopbackUrl,
  metadataIdToken,
  WarehouseReadingRepository,
  WarehouseRollupRepository,
  type WarehouseClient,
} from "@power-meter/infrastructure";
import type { DataSource, SeriesRequest, TrendRequest } from "./data-source.ts";
import type { LiveConfig } from "./data-mode.ts";

const MINUTE_MS = 60_000;

/** The end of a window read off the rollup: the start of the current minute. */
function minuteAligned(now: Date): Date {
  return new Date(Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS);
}

export interface LiveDependencies {
  /** Injected by tests; otherwise the real SDK client is constructed. */
  readonly client?: WarehouseClient;
}

export async function createLiveSource(
  config: LiveConfig,
  dependencies: LiveDependencies = {},
): Promise<DataSource> {
  const hotState = new IngesterLatestReadingStore({
    url: config.ingesterUrl,
    // A loopback ingester is the replay harness and takes no token. Anything
    // else is the private Cloud Run service, and the web service's account
    // holds run.invoker on it.
    ...(isLoopbackUrl(config.ingesterUrl)
      ? {}
      : { token: metadataIdToken(config.ingesterUrl) }),
  });

  let readings: ReadingRepository;
  let rollup: RollupRepository;
  if (config.warehouse === "file") {
    readings = new FileReadingRepository(config.warehouseDir);
    rollup = new FileRollupRepository(config.warehouseDir);
  } else {
    const target = {
      ...(config.projectId === undefined ? {} : { projectId: config.projectId }),
      dataset: config.dataset,
    };
    // The first thing in apps/web to construct a BigQuery client, which is
    // what brings the SDK into the traced standalone output.
    const client =
      dependencies.client ?? (await bigQueryClient({ ...target, location: config.location }));
    readings = new WarehouseReadingRepository(client, target);
    rollup = new WarehouseRollupRepository(client, target);
  }
  const cachedRollup = new CachedRollupRepository(rollup);

  return {
    latest: () => hotState,

    series({ spanMs, now }: SeriesRequest) {
      const to = minuteAligned(now);
      return { range: { from: new Date(to.getTime() - spanMs), to }, repository: cachedRollup };
    },

    history() {
      // No maxRunGapMs: the default three-minute cap applies to real readings.
      return { repository: readings };
    },

    trend({ registry, dayStart, sparkMs, now }: TrendRequest) {
      const to = minuteAligned(now);
      const from = new Date(Math.min(dayStart.getTime() - MINUTE_MS, to.getTime() - sparkMs));
      const range = { from, to };
      // The strip asks for two windows — the day and the last hour — and each
      // query bills at least 10 MB however little it reads. So both are served
      // from one read of the window covering them, all 55 meters, cached for
      // the minute: one query a minute for the strip, not two.
      const meterIds = registry.commissioned().map((meter) => meter.meterId);
      const superset: RollupRepository = {
        async *bucketsInRange(wanted, window) {
          const keep = new Set<string>(wanted);
          for await (const bucket of cachedRollup.bucketsInRange(meterIds, range)) {
            const at = bucket.at.getTime();
            if (keep.has(bucket.meterId) && at >= window.from.getTime() && at < window.to.getTime()) {
              yield bucket;
            }
          }
        },
      };
      return { range, repository: superset };
    },
  };
}
