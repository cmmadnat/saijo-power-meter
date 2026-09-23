/**
 * `warehouse cost`: what the live screens cost to read, measured.
 *
 * Three reads matter, and each is run through the adapter and the use case the
 * web app runs — not a hand-written query — so the timing is what a page sees:
 *
 * - **the strip** — one rollup read, all meters, 00:00 Bangkok (less a minute)
 *   to now. Behind a screen that refreshes every ten seconds, which is why the
 *   web app caches it for the minute.
 * - **a chart** — one rollup read, four meters, the widest window (24 h).
 * - **History** — raw readings for every meter since 00:00, batched by the
 *   repository's row budget — one query for a day.
 *
 * For each: the bytes BigQuery says it processes (a dry run, free), what that
 * bills at on-demand pricing — rounded up to the MB with a 10 MB minimum — and
 * p50 / p95 over `runs` executions. Then the monthly figure for the refresh
 * rate the live adapters actually produce.
 */
import {
  fleetTrend,
  historyTable,
  meterSeries,
} from "@power-meter/application";
import { MeterRegistry, type MeterId } from "@power-meter/domain";
import type { QueryParams, WarehouseClient } from "./client.ts";
import {
  DEFAULT_ROW_BUDGET,
  metersPerQuery,
  readingsSql,
  rollupSql,
  WarehouseReadingRepository,
  WarehouseRollupRepository,
} from "./repository.ts";
import type { WarehouseTarget } from "./schema.ts";

const MB = 1024 * 1024;
const MINIMUM_BILLED = 10 * MB;

export function billedBytes(processed: number): number {
  return Math.max(MINIMUM_BILLED, Math.ceil(processed / MB) * MB);
}

export function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? Number.NaN;
}

export interface CostOptions {
  readonly client: WarehouseClient;
  readonly target: WarehouseTarget;
  readonly dryRun: (sql: string, params: QueryParams) => Promise<number>;
  readonly runs: number;
  readonly log: (message: string) => void;
  readonly now?: Date;
}

export async function measureCost(options: CostOptions): Promise<void> {
  const { client, target, log } = options;
  const registry = MeterRegistry.fromWorkbook();
  const meterIds = registry.commissioned().map((m) => m.meterId);
  const now = options.now ?? new Date();
  const to = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const dayStart = bangkokMidnight(now);
  const stripFrom = new Date(Math.min(dayStart.getTime() - 60_000, to.getTime() - 3_600_000));
  const chartMeters = ["s01m1", "s03m4", "s05m1", "s07m5"] as MeterId[];
  const chartFrom = new Date(to.getTime() - 24 * 3_600_000);

  const rollup = new WarehouseRollupRepository(client, target);
  const historyBatch = metersPerQuery({ from: dayStart, to }, meterIds.length, DEFAULT_ROW_BUDGET);
  const raw = new WarehouseReadingRepository(client, target);

  const cases = [
    {
      name: "strip (55 meters, since 00:00)",
      bytes: () => options.dryRun(rollupSql(target), { meterIds: [...meterIds].sort(), from: stripFrom, to }),
      queries: 1,
      run: () =>
        fleetTrend({ registry, repository: rollup, dayStart, to }),
    },
    {
      name: "chart (4 meters, 24 h)",
      bytes: () => options.dryRun(rollupSql(target), { meterIds: [...chartMeters].sort(), from: chartFrom, to }),
      queries: 1,
      run: () =>
        meterSeries({ registry, repository: rollup, meterIds: chartMeters, range: { from: chartFrom, to } }),
    },
    {
      name: "History (55 meters, raw, since 00:00)",
      // The first batch, dry-run; for a day's window it is the only one.
      bytes: () =>
        options.dryRun(readingsSql(target), {
          meterIds: [...meterIds].sort().slice(0, historyBatch),
          from: dayStart,
          to,
        }),
      queries: Math.ceil(meterIds.length / historyBatch),
      run: () => historyTable({ registry, repository: raw, range: { from: dayStart, to } }),
    },
  ];

  const billed: Record<string, number> = {};
  for (const c of cases) {
    const processed = await c.bytes();
    const perView = billedBytes(processed) * c.queries;
    billed[c.name] = perView;
    const timings: number[] = [];
    for (let i = 0; i < options.runs; i += 1) {
      const started = performance.now();
      await c.run();
      timings.push(performance.now() - started);
    }
    log(
      `${c.name}: processes ${(processed / MB).toFixed(2)} MB per query, ` +
        `bills ${(perView / MB).toFixed(0)} MB per view (${c.queries} quer${c.queries === 1 ? "y" : "ies"}); ` +
        `p50 ${percentile(timings, 50).toFixed(0)} ms, p95 ${percentile(timings, 95).toFixed(0)} ms over ${options.runs}`,
    );
  }

  // The live adapters read the strip once a minute and the charts once a
  // minute per distinct selection, per instance, however many screens are open.
  const perMinute = (billed["strip (55 meters, since 00:00)"] ?? 0) + (billed["chart (4 meters, 24 h)"] ?? 0);
  const monthTiB = (perMinute * 60 * 24 * 30) / (1024 * MB * 1024);
  log(
    `real-time route, cached per minute: ${(perMinute / MB).toFixed(0)} MB a minute per instance ` +
      `-> ${monthTiB.toFixed(2)} TiB a month per instance kept warm`,
  );
  const uncached = (perMinute * 6 * 60 * 24 * 30) / (1024 * MB * 1024);
  log(`the same route uncached, at one render per 10 s: ${uncached.toFixed(2)} TiB a month per open screen`);
}

function bangkokMidnight(at: Date): Date {
  const day = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(at);
  return new Date(`${day}T00:00:00+07:00`);
}
