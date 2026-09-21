/**
 * Where the real-time screen's numbers come from, today.
 *
 * Today that is the fixture generator: the store and the ingester do not exist
 * yet, and the screens are deliberately built and reviewed before they do. This
 * module is the only place that knows it — the page calls a use case, the use
 * case calls a port, and at step 8 the two adapters constructed here are
 * replaced by the ingester's HTTP hot state without the screen changing.
 *
 * Server-only. It reaches into the meter registry and generates a window of
 * readings per request, neither of which belongs in the client bundle.
 */
import {
  realtimeTable,
  systemClock,
  type RealtimeTable,
} from "@power-meter/application";
import { MeterRegistry } from "@power-meter/domain";
import {
  FixtureLatestReadingStore,
  generateFixtures,
} from "@power-meter/infrastructure";

/**
 * How much history the fixture window covers.
 *
 * Only the tail of it reaches this screen, but the window has to be long enough
 * for the generator's offline meters — which fall silent 20–40% of the way in —
 * to read as genuinely offline rather than merely stale. Forty-five minutes puts
 * them 27–36 minutes behind, well past the offline threshold.
 */
const WINDOW_MS = 45 * 60_000;

/** The real publish interval: 60 messages/minute across 9 stations. */
const INTERVAL_MS = 9_000;

/**
 * Build the table as of now.
 *
 * The window is aligned to the publish interval rather than to the wall clock,
 * so successive refreshes land on the same sample grid and the numbers drift
 * the way a meter's do instead of being re-rolled from scratch each time.
 */
export async function realtimeSnapshot(): Promise<RealtimeTable> {
  const registry = MeterRegistry.fromWorkbook();
  const to = new Date(Math.floor(Date.now() / INTERVAL_MS) * INTERVAL_MS);
  const from = new Date(to.getTime() - WINDOW_MS);

  const fixtures = generateFixtures({
    registry,
    from,
    to,
    intervalMs: INTERVAL_MS,
  });

  return realtimeTable({
    registry,
    latest: new FixtureLatestReadingStore(fixtures.readings),
    clock: systemClock,
  });
}
