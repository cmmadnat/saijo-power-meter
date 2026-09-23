/**
 * Where the real-time screen's numbers come from: the table, and the fleet
 * strip's two windowed tiles.
 *
 * One of the three source files, and like the other two it does not know which
 * data mode it is in. It asks `data-mode.ts` for the ports and hands them to
 * the use cases in `packages/application`; in demo mode those ports are the
 * fixture generator, in live mode the ingester's hot state and the warehouse's
 * rollup. The screen above this file is the same in both.
 *
 * Server-only. It reaches into the meter registry, and in live mode holds the
 * token that reads the ingester, neither of which belongs in the client bundle.
 */
import {
  DEFAULT_FRESHNESS,
  fleetTrend,
  realtimeTable,
  systemClock,
  type FleetTrend,
  type RealtimeTable,
} from "@power-meter/application";
import { MeterRegistry } from "@power-meter/domain";
import { dataSource } from "./data-mode.ts";
import type { DataSource, FeedStatus } from "./data-source.ts";
import { startOfDay } from "./format.ts";

/**
 * How the source's feed behaves: its measured rate, when it was last heard
 * from, and the freshness thresholds that follow. A source that says nothing
 * is on the specification's schedule.
 */
export async function feedStatus(
  source: DataSource | Promise<DataSource> = dataSource(),
): Promise<FeedStatus> {
  const resolved = await source;
  return resolved.feed
    ? resolved.feed()
    : { publishIntervalMs: null, observedAt: null, thresholds: DEFAULT_FRESHNESS };
}

/** Build the table as of now, judged against the source's own feed rate. */
export async function realtimeSnapshot(
  source: DataSource | Promise<DataSource> = dataSource(),
): Promise<RealtimeTable> {
  const registry = MeterRegistry.fromWorkbook();
  const now = systemClock.now();
  const { thresholds } = await feedStatus(source);
  return realtimeTable({
    registry,
    latest: (await source).latest(registry, now),
    clock: systemClock,
    thresholds,
  });
}

/** How far back the strip's load line reaches. */
const SPARK_MS = 60 * 60_000;

/**
 * Energy since 00:00 Bangkok and the last hour of total load, for the strip.
 *
 * "Since the shift started" in the plan; the specification defines no shifts,
 * so the day is the shift — the same boundary History opens on by default,
 * which means the tile and History's default footer answer the same question.
 */
export async function fleetTrendSnapshot(
  source: DataSource | Promise<DataSource> = dataSource(),
): Promise<FleetTrend> {
  const registry = MeterRegistry.fromWorkbook();
  const now = systemClock.now();
  const dayStart = startOfDay(now);
  const { range, repository } = (await source).trend({ registry, dayStart, sparkMs: SPARK_MS, now });
  return fleetTrend({ registry, repository, dayStart, to: range.to, sparkMs: SPARK_MS });
}
