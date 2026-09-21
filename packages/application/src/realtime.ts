/**
 * The real-time table: screen 1 of the specification, as a use case.
 *
 * It takes the latest reading per meter from a port and turns it into one row
 * per commissioned meter, in the columns the specification asks for. The web
 * app renders the result and sorts it; it does not decide what a row is, which
 * is what lets the same rows be served from the ingester's in-memory hot state
 * at step 8 by passing a different store.
 *
 * The one judgement here that the specification does not make is freshness.
 * The mock-up has no "last seen" column and the payloads carry no timestamp, so
 * a table built straight off the latest reading shows a meter that died an hour
 * ago exactly as it shows one reporting now. That is the failure worth
 * preventing on a factory wall, so each row carries the reading's age and a
 * status derived from it. See docs/requirements/power-meter-ui.md, which records
 * it as an addition to the spec rather than something the customer asked for.
 */
import type { Clock, LatestReadingStore } from "./ports.ts";
import {
  isRunning,
  machineLabel,
  meterNumber,
  type Department,
  type MeterId,
  type MeterRegistry,
  type Reading,
} from "@power-meter/domain";

/**
 * How fresh a meter's latest reading is.
 *
 * - `live`    — reporting on schedule.
 * - `stale`   — has missed publishes but not enough to call it dead.
 * - `offline` — silent long enough that the numbers on screen are history, or
 *               never seen at all.
 */
export type MeterStatus = "live" | "stale" | "offline";

/**
 * Derived from the publish rate: 60 messages/minute across 9 stations is one
 * payload per station every ~9 s, so every meter gets a reading every ~9 s.
 * Three missed publishes is a wobble; twenty is a station that has stopped.
 */
export interface FreshnessThresholds {
  /** At or below this age, `live`. */
  readonly liveWithinMs: number;
  /** At or below this age, `stale`; beyond it, `offline`. */
  readonly staleWithinMs: number;
}

export const DEFAULT_FRESHNESS: FreshnessThresholds = {
  liveWithinMs: 30_000,
  staleWithinMs: 180_000,
};

/** One row of the table. Values are already in engineering units. */
export interface RealtimeRow {
  readonly meterId: MeterId;
  /** Station and Power Meter ID, `01-1` — the หมายเลขมิเตอร์ column. */
  readonly meterNumber: string;
  readonly department: Department | null;
  /** หมายเลขเครื่องจักร, when the registry name carries one. */
  readonly machineNumber: string | null;
  readonly machineName: string | null;
  /** Null for a meter that has never reported. */
  readonly reading: Reading | null;
  /** Age of that reading at the moment the table was built. Null with no reading. */
  readonly ageMs: number | null;
  readonly status: MeterStatus;
  /** Above its own standby level. False when there is no reading. */
  readonly running: boolean;
}

/**
 * What one department is drawing right now.
 *
 * Derived here rather than in the table component because it is an aggregate of
 * the data, not a decision about how to draw it: the same numbers head the
 * department bands and the fleet strip, and a second summation written in the
 * component would be free to disagree with this one.
 */
export interface DepartmentLoad {
  readonly department: Department;
  /** Commissioned meters in the department. */
  readonly meters: number;
  /** Of those, the ones whose latest reading is live or stale. */
  readonly reporting: number;
  readonly running: number;
  /** Sum of active power across the reporting meters, kW. */
  readonly activePowerKw: number;
}

export interface RealtimeTable {
  /** When the table was built — what the screen's "as of" shows. */
  readonly at: Date;
  /** One row per commissioned meter, ordered by station then slot. */
  readonly rows: readonly RealtimeRow[];
  /** The departments present, for the filter. Sorted, as the History screen's are. */
  readonly departments: readonly Department[];
  readonly counts: {
    readonly live: number;
    readonly stale: number;
    readonly offline: number;
    readonly running: number;
    /** live + stale: the meters whose numbers on screen are current. */
    readonly reporting: number;
  };
  /**
   * Total active power across the reporting meters, kW.
   *
   * Offline meters are excluded deliberately. Their last reading stays on
   * screen — that is the point of showing it — but it is history, and adding an
   * hour-old 90 kW into a figure labelled "now" would overstate the factory's
   * load by exactly the meters that have stopped telling anyone what they are
   * doing. The strip prints the offline count beside it so the gap is visible
   * rather than silently absorbed.
   */
  readonly totalActivePowerKw: number;
  /** Per department, in the same order as `departments`. */
  readonly byDepartment: readonly DepartmentLoad[];
}

export interface RealtimeTableInput {
  readonly registry: MeterRegistry;
  readonly latest: LatestReadingStore;
  readonly clock: Clock;
  readonly thresholds?: FreshnessThresholds;
}

export function statusFor(
  ageMs: number | null,
  thresholds: FreshnessThresholds = DEFAULT_FRESHNESS,
): MeterStatus {
  if (ageMs === null) return "offline";
  if (ageMs <= thresholds.liveWithinMs) return "live";
  if (ageMs <= thresholds.staleWithinMs) return "stale";
  return "offline";
}

export async function realtimeTable(
  input: RealtimeTableInput,
): Promise<RealtimeTable> {
  const thresholds = input.thresholds ?? DEFAULT_FRESHNESS;
  const latest = await input.latest.latest();
  const at = input.clock.now();

  const rows = input.registry.commissioned().map((meter): RealtimeRow => {
    const reading = latest.get(meter.meterId) ?? null;
    // Clamped at zero: a reading stamped slightly ahead of the clock is the two
    // machines disagreeing, not information about freshness, and an age that
    // went negative would sort and format as though it meant something.
    const ageMs =
      reading === null ? null : Math.max(0, at.getTime() - reading.at.getTime());
    const label = machineLabel(meter);

    return {
      meterId: meter.meterId,
      meterNumber: meterNumber(meter),
      department: meter.department,
      machineNumber: label.number,
      machineName: label.name,
      reading,
      ageMs,
      status: statusFor(ageMs, thresholds),
      running: reading !== null && isRunning(meter, reading.activePowerKw),
    };
  });

  const departments = [
    ...new Set(
      rows
        .map((row) => row.department)
        .filter((d): d is Department => d !== null),
    ),
  ].sort();

  const reporting = (row: RealtimeRow): boolean => row.status !== "offline";
  const load = (row: RealtimeRow): number =>
    reporting(row) ? (row.reading?.activePowerKw ?? 0) : 0;

  const live = rows.filter((r) => r.status === "live").length;
  const stale = rows.filter((r) => r.status === "stale").length;

  const byDepartment = departments.map((department): DepartmentLoad => {
    const own = rows.filter((row) => row.department === department);
    return {
      department,
      meters: own.length,
      reporting: own.filter(reporting).length,
      running: own.filter((row) => row.running).length,
      activePowerKw: own.reduce((sum, row) => sum + load(row), 0),
    };
  });

  return {
    at,
    rows,
    departments,
    counts: {
      live,
      stale,
      offline: rows.filter((r) => r.status === "offline").length,
      running: rows.filter((r) => r.running).length,
      reporting: live + stale,
    },
    totalActivePowerKw: rows.reduce((sum, row) => sum + load(row), 0),
    byDepartment,
  };
}
