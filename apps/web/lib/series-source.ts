/**
 * The charts' data, and the selection they are drawn for.
 *
 * Same shape as lib/realtime-source.ts and the same role: the only file that
 * knows the numbers are fixtures today. Step 8 replaces the two adapters built
 * here with the warehouse's repository; the use case above them and the charts
 * above that do not change.
 */
import { meterSeries, type SeriesView } from "@power-meter/application";
import { MeterRegistry, type MeterId } from "@power-meter/domain";
import {
  defaultProfiles,
  FixtureReadingRepository,
  generateFixtures,
} from "@power-meter/infrastructure";

/**
 * The windows the charts offer. Presets rather than a custom range: the
 * specification's real-time pages have no date control at all, and a chart of
 * "now back to some hours ago" is what they show.
 */
export const WINDOWS = [
  { id: "1h", label: "1 hour", ms: 60 * 60_000 },
  { id: "6h", label: "6 hours", ms: 6 * 60 * 60_000 },
  { id: "24h", label: "24 hours", ms: 24 * 60 * 60_000 },
] as const;

export type WindowId = (typeof WINDOWS)[number]["id"];

export const DEFAULT_WINDOW: WindowId = "6h";

/**
 * Eight series, each holding its own slot.
 *
 * The selection is a fixed-length array with holes rather than a list, because
 * a colour belongs to a meter and not to its rank: if removing the second of
 * four series renumbered the rest, the two below it would change colour and the
 * reader would think the data had changed. Deselecting empties a slot and
 * leaves the others where they are.
 */
export const MAX_SERIES = 8;

export type Selection = readonly (MeterId | null)[];

/**
 * Four meters that are actually running, from three departments, so the first
 * look is neither four flat idle lines nor four copies of the same shape.
 */
const DEFAULT_SELECTION = ["s01m1", "s03m4", "s05m1", "s07m5"] as const;

export function parseSelection(
  raw: string | undefined,
  registry: MeterRegistry,
): Selection {
  const source =
    raw === undefined ? DEFAULT_SELECTION.join(",") : raw;
  const slots: (MeterId | null)[] = Array.from({ length: MAX_SERIES }, () => null);

  source
    .split(",")
    .slice(0, MAX_SERIES)
    .forEach((part, index) => {
      const id = part.trim() as MeterId;
      // An id from a URL is an untrusted string: it names a meter only if the
      // registry says so, and a stale link naming a decommissioned slot leaves
      // its slot empty rather than drawing a series with no meter behind it.
      const meter = registry.find(id);
      if (meter?.commissioned) slots[index] = id;
    });

  return slots;
}

/** The parameter form of a selection: slot positions preserved, trailing holes dropped. */
export function formatSelection(selection: Selection): string {
  const slots = [...selection];
  while (slots.length > 0 && slots[slots.length - 1] === null) slots.pop();
  return slots.map((id) => id ?? "").join(",");
}

export function parseWindow(raw: string | undefined): WindowId {
  const found = WINDOWS.find((w) => w.id === raw);
  return found ? found.id : DEFAULT_WINDOW;
}

/** The real publish interval; fixtures are generated no finer than this. */
const PUBLISH_INTERVAL_MS = 9_000;

/**
 * Generating 24 hours at the real 9-second rate would be ~9 600 readings per
 * meter, all of which the use case then averages away into 360 buckets. Coarser
 * generation for a longer window costs nothing visible and keeps a page render
 * from building a hundred thousand objects it immediately discards.
 */
function samplingIntervalMs(spanMs: number): number {
  const target = spanMs / 2_000;
  const steps = Math.max(1, Math.ceil(target / PUBLISH_INTERVAL_MS));
  return steps * PUBLISH_INTERVAL_MS;
}

export interface ChartData {
  readonly view: SeriesView;
  readonly window: WindowId;
  readonly selection: Selection;
}

export async function chartSeries(
  registry: MeterRegistry,
  selection: Selection,
  window: WindowId,
): Promise<ChartData> {
  const spanMs = (WINDOWS.find((w) => w.id === window) ?? WINDOWS[1]).ms;
  const intervalMs = samplingIntervalMs(spanMs);
  const to = new Date(Math.floor(Date.now() / intervalMs) * intervalMs);
  const from = new Date(to.getTime() - spanMs);

  const meterIds = selection.filter((id): id is MeterId => id !== null);
  if (meterIds.length === 0) {
    return {
      view: { from, to, bucketMs: 60_000, series: [] },
      window,
      selection,
    };
  }

  // Only the selected meters are generated: the registry passed to the
  // generator is what decides how much work this is.
  const selected = MeterRegistry.of(
    registry.all().filter((meter) => meterIds.includes(meter.meterId)),
  );
  const fixtures = generateFixtures({
    registry: selected,
    from,
    to,
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

  const view = await meterSeries({
    registry,
    repository: new FixtureReadingRepository(fixtures.readings),
    meterIds,
    range: { from, to },
  });

  return { view, window, selection };
}
