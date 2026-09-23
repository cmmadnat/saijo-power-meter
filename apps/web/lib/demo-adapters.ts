/**
 * Demo mode: every port backed by the fixture generator.
 *
 * This is what the screens ran on from step 3 to step 7, moved here unchanged
 * from the three source files so that it survives step 8 as a shipped mode
 * rather than as test scaffolding. It needs no broker, no BigQuery and no
 * credentials, which is what makes a preview deploy and a plain `npm run dev`
 * work — and every screen it renders carries the demo badge, because nothing
 * it produces is a measurement.
 *
 * Loaded only by `data-mode.ts`, only in demo mode, and only by dynamic import.
 * It is the one module in the web app that may import
 * `@power-meter/infrastructure/fixtures`; `scripts/check-boundaries.mjs` fails
 * the build if the live path reaches it.
 */
import type { TimeRange } from "@power-meter/application";
import { DEFAULT_MAX_RUN_GAP_MS } from "@power-meter/application";
import { MeterRegistry } from "@power-meter/domain";
import {
  defaultProfiles,
  FixtureLatestReadingStore,
  FixtureReadingRepository,
  generateFixtures,
} from "@power-meter/infrastructure/fixtures";
import type { DataSource, SeriesRequest, TrendRequest } from "./data-source.ts";

/** The real publish interval: 60 messages/minute across 9 stations. */
const PUBLISH_INTERVAL_MS = 9_000;

/**
 * How much history the real-time table's fixture window covers.
 *
 * Only the tail of it reaches the screen, but the window has to be long enough
 * for the generator's offline meters — which fall silent 20–40% of the way in —
 * to read as genuinely offline rather than merely stale. Forty-five minutes puts
 * them 27–36 minutes behind, well past the offline threshold.
 */
const TABLE_WINDOW_MS = 45 * 60_000;

/**
 * Generating 24 hours at the real 9-second rate would be ~9 600 readings per
 * meter, all of which a use case then averages away into a few hundred
 * buckets. Coarser generation for a longer window costs nothing visible and
 * keeps a page render from building a hundred thousand objects it immediately
 * discards.
 */
function samplingIntervalMs(spanMs: number): number {
  const target = spanMs / 2_000;
  const steps = Math.max(1, Math.ceil(target / PUBLISH_INTERVAL_MS));
  return steps * PUBLISH_INTERVAL_MS;
}

function latest(registry: MeterRegistry, now: Date) {
  // Aligned to the publish interval rather than to the wall clock, so
  // successive refreshes land on the same sample grid and the numbers drift
  // the way a meter's do instead of being re-rolled from scratch each time.
  const to = new Date(Math.floor(now.getTime() / PUBLISH_INTERVAL_MS) * PUBLISH_INTERVAL_MS);
  const from = new Date(to.getTime() - TABLE_WINDOW_MS);
  const fixtures = generateFixtures({ registry, from, to, intervalMs: PUBLISH_INTERVAL_MS });
  return new FixtureLatestReadingStore(fixtures.readings);
}

function series({ registry, meterIds, spanMs, now }: SeriesRequest) {
  const intervalMs = samplingIntervalMs(spanMs);
  const to = new Date(Math.floor(now.getTime() / intervalMs) * intervalMs);
  const range = { from: new Date(to.getTime() - spanMs), to };

  // Only the selected meters are generated: the registry passed to the
  // generator is what decides how much work this is.
  const selected = MeterRegistry.of(
    registry.all().filter((meter) => meterIds.includes(meter.meterId)),
  );
  const fixtures = generateFixtures({
    registry: selected,
    ...range,
    intervalMs,
    // Profiles come from the whole fleet, not from this handful: without it a
    // meter the table shows running could be drawn idle here, purely because
    // the chart generated four meters instead of 55.
    profiles: defaultProfiles(registry),
    // The counter reset belongs to the table's fixture set, where it is one
    // meter among 55. Here it would be a step down in whichever meter happened
    // to sort first, for reasons no reader could see.
    energyResetFor: null,
  });

  return { range, repository: new FixtureReadingRepository(fixtures.readings) };
}

function history(registry: MeterRegistry, range: TimeRange) {
  const spanMs = range.to.getTime() - range.from.getTime();
  const intervalMs = samplingIntervalMs(spanMs);
  const fixtures = generateFixtures({
    registry,
    ...range,
    intervalMs,
    profiles: defaultProfiles(registry),
  });
  return {
    repository: new FixtureReadingRepository(fixtures.readings),
    // History caps a gap at three minutes so an unobserved stretch is not
    // counted as running. That cap assumes readings on the real 9-second
    // schedule; here a long window is sampled coarsely, and a week's 5-minute
    // sampling would otherwise make every gap uncountable and every machine
    // read as never running. The cap travels with the sampling rate — which is
    // why it is widened here, in demo, and left at its default in live.
    maxRunGapMs: Math.max(DEFAULT_MAX_RUN_GAP_MS, intervalMs * 2),
  };
}

/**
 * The strip's windows, generated once a minute rather than once a render.
 *
 * Fixture load is a function of absolute time, so the same minute is the same
 * readings whoever asks; a render every ten seconds on each open screen would
 * otherwise generate a day of 55 meters six times a minute to draw one number
 * and a line that cannot have moved.
 */
let trendMemo: { key: number; repository: FixtureReadingRepository } | undefined;

function trend({ registry, dayStart, sparkMs, now }: TrendRequest) {
  // One reading per meter per minute, on the minute: the sparkline's buckets
  // are minutes, and the day's energy needs counters, not detail.
  const intervalMs = 60_000;
  const to = new Date(Math.floor(now.getTime() / intervalMs) * intervalMs);
  const from = new Date(Math.min(dayStart.getTime() - intervalMs, to.getTime() - sparkMs));
  const range = { from, to };

  if (trendMemo?.key !== to.getTime()) {
    const fixtures = generateFixtures({
      registry,
      ...range,
      intervalMs,
      profiles: defaultProfiles(registry),
      energyResetFor: null,
    });
    trendMemo = { key: to.getTime(), repository: new FixtureReadingRepository(fixtures.readings) };
  }
  return { range, repository: trendMemo.repository };
}

export function createDemoSource(): DataSource {
  return { records: true, latest, series, history, trend };
}
