/**
 * The History screen: screen 4 of the specification, as a use case.
 *
 * One row per meter over a chosen window, carrying the two quantities the
 * mock-up asks for — Total Energy (kWh) and ชั่วโมงการทำงาน, running hours as
 * Hr:min — beside the same identity columns as the real-time table.
 *
 * Both quantities are read off the same stream of readings in one pass. The
 * repository's contract is "ordered by meter, then ascending in time", and this
 * depends on it: energy is the counter's rise in order, and running time is the
 * sum of the gaps between consecutive readings. A repository that shuffled its
 * output would produce plausible wrong numbers rather than an error, which is
 * why that ordering is stated as part of the port rather than assumed here.
 *
 * Nothing in this file knows where the readings come from. At step 5 that is
 * the fixture repository; at step 8 it is the warehouse, and the promise that
 * this aggregation moves server-side unchanged is kept by construction.
 */
import type { ReadingRepository, TimeRange } from "./ports.ts";
import { consumptionFrom } from "./series.ts";
import {
  isRunning,
  machineLabel,
  meterNumber,
  type Department,
  type Meter,
  type MeterId,
  type MeterRegistry,
} from "@power-meter/domain";

/** One row of the History table. */
export interface HistoryRow {
  readonly meterId: MeterId;
  /** Station and Power Meter ID, `01-1` — the หมายเลขมิเตอร์ column. */
  readonly meterNumber: string;
  readonly department: Department | null;
  readonly machineNumber: string | null;
  readonly machineName: string | null;
  /**
   * Energy consumed across the window, kWh, counter resets handled.
   *
   * `null` when the meter reported nothing in the window: the screen prints an
   * em dash for it, which says "no data" where a `0` would claim the machine
   * ran and used nothing.
   */
  readonly totalEnergyKwh: number | null;
  /** Time above the meter's standby level, milliseconds. `null` with no readings. */
  readonly runningMs: number | null;
  /** How many readings the window held. Zero is what makes the two nulls above. */
  readonly readingCount: number;
}

export interface HistoryTable {
  readonly from: Date;
  readonly to: Date;
  readonly rows: readonly HistoryRow[];
  /** The department filtered on, or null for every department. */
  readonly department: Department | null;
  /** Meters in the table that reported nothing at all in the window. */
  readonly silentCount: number;
}

export interface HistoryTableInput {
  readonly registry: MeterRegistry;
  readonly repository: ReadingRepository;
  readonly range: TimeRange;
  /** One department, or null/undefined for all of them. */
  readonly department?: Department | null;
  /**
   * The longest gap between two readings that still counts as the machine
   * having run through it. See `DEFAULT_MAX_RUN_GAP_MS`.
   */
  readonly maxRunGapMs?: number;
}

/**
 * A gap longer than this is not running time.
 *
 * Running hours are summed from the gaps between consecutive readings, with
 * each gap attributed to the state at its start: a reading above standby means
 * the machine was running from that moment until the next reading said
 * otherwise. That is the only reading of a sampled signal that does not invent
 * detail it never had.
 *
 * It needs a cap, though, or a meter that falls silent at noon while running
 * and returns at six would be credited with six hours nobody observed. Twenty
 * missed publishes at the 9-second rate is the same three minutes past which
 * the real-time screen calls a meter offline; beyond that the honest answer is
 * that nothing is known, so the gap contributes nothing and the row's total is
 * short rather than invented.
 */
export const DEFAULT_MAX_RUN_GAP_MS = 180_000;

/**
 * Build the table.
 *
 * Every meter matching the filter gets a row, including meters that reported
 * nothing in the window. Dropping them would hide exactly the case someone
 * opens this screen to find — a machine that should have run and did not — and
 * a screen that silently shows 53 of 55 rows is worse than one that prints two
 * em dashes. The specification does not say either way; this is recorded as a
 * decision in docs/requirements/power-meter-ui.md.
 */
export async function historyTable(
  input: HistoryTableInput,
): Promise<HistoryTable> {
  const { from, to } = input.range;
  if (to.getTime() <= from.getTime()) {
    throw new RangeError("history range must have from < to");
  }

  const department = input.department ?? null;
  const maxGapMs = input.maxRunGapMs ?? DEFAULT_MAX_RUN_GAP_MS;

  const meters = input.registry
    .commissioned()
    .filter((meter) => department === null || meter.department === department);

  // One accumulator per meter, in registry order, so the rows come back in the
  // order the table wants regardless of how the repository interleaves meters.
  const accumulators = new Map<MeterId, Accumulator>(
    meters.map((meter) => [meter.meterId, newAccumulator(meter)]),
  );

  for await (const reading of input.repository.readingsInRange(
    meters.map((meter) => meter.meterId),
    input.range,
  )) {
    const accumulator = accumulators.get(reading.meterId);
    if (accumulator === undefined) continue;

    const previous = accumulator.previous;
    if (previous !== null) {
      const gapMs = reading.at.getTime() - previous.at.getTime();
      // A gap is credited to the state at its start, and only while the meter
      // was still reporting on something like schedule.
      if (gapMs > 0 && gapMs <= maxGapMs && previous.running) {
        accumulator.runningMs += gapMs;
      }
    }

    accumulator.counters.push(reading.energyKwh);
    accumulator.previous = {
      at: reading.at,
      running: isRunning(accumulator.meter, reading.activePowerKw),
    };
    accumulator.count += 1;
  }

  const rows = meters.map((meter): HistoryRow => {
    const accumulator = accumulators.get(meter.meterId);
    const label = machineLabel(meter);
    const count = accumulator?.count ?? 0;
    // The last value of the same walk the energy chart plots — one definition
    // of "consumption across a window", reset rule included, not two.
    const consumed = consumptionFrom(accumulator?.counters ?? []);

    return {
      meterId: meter.meterId,
      meterNumber: meterNumber(meter),
      department: meter.department,
      machineNumber: label.number,
      machineName: label.name,
      totalEnergyKwh: count === 0 ? null : (consumed[consumed.length - 1] ?? 0),
      runningMs: count === 0 ? null : (accumulator?.runningMs ?? 0),
      readingCount: count,
    };
  });

  return {
    from,
    to,
    rows,
    department,
    silentCount: rows.filter((row) => row.readingCount === 0).length,
  };
}

interface Accumulator {
  readonly meter: Meter;
  readonly counters: number[];
  runningMs: number;
  previous: { at: Date; running: boolean } | null;
  count: number;
}

function newAccumulator(meter: Meter): Accumulator {
  return { meter, counters: [], runningMs: 0, previous: null, count: 0 };
}

/**
 * Running time as the specification prints it: `Hr:min`, minutes zero-padded,
 * hours not. A window can exceed 24 hours, so hours are not wrapped.
 */
export function formatRunningHours(runningMs: number | null): string {
  if (runningMs === null) return "—";
  const totalMinutes = Math.floor(runningMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}:${String(totalMinutes % 60).padStart(2, "0")}`;
}
