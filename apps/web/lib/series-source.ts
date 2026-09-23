/**
 * The charts' data, and the selection they are drawn for.
 *
 * One of the three source files. It parses the selection and the window off
 * the URL, asks `data-mode.ts` for a port covering that window, and hands it to
 * `meterSeries`. In demo mode the port is generated readings; in live mode it
 * is the warehouse's 1-minute rollup, with the window aligned to the minute so
 * that a stored minute lands in exactly one bucket. Which of the two it got is
 * not this file's business — the use case folds either by the same rules.
 */
import { meterSeries, type SeriesView } from "@power-meter/application";
import { type MeterId, type MeterRegistry } from "@power-meter/domain";
import { dataSource } from "./data-mode.ts";
import type { DataSource } from "./data-source.ts";

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

export interface ChartData {
  readonly view: SeriesView;
  readonly window: WindowId;
  readonly selection: Selection;
}

export async function chartSeries(
  registry: MeterRegistry,
  selection: Selection,
  window: WindowId,
  source: DataSource | Promise<DataSource> = dataSource(),
): Promise<ChartData> {
  const spanMs = (WINDOWS.find((w) => w.id === window) ?? WINDOWS[1]).ms;
  const meterIds = selection.filter((id): id is MeterId => id !== null);
  const { range, repository } = (await source).series({
    registry,
    meterIds,
    spanMs,
    now: new Date(),
  });

  if (meterIds.length === 0) {
    return {
      view: { ...range, bucketMs: 60_000, series: [] },
      window,
      selection,
    };
  }

  const view = await meterSeries({ registry, repository, meterIds, range });
  return { view, window, selection };
}
